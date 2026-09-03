// Estado real de una posicion de liquidez en PancakeSwap V3, leido de la cadena.
//
// SOLO SERVIDOR. Lo usa el agente de referencia que publicamos en /api/a2a/lp.
//
// Lo que le importa a quien provee liquidez en V3 no es cuanto deposito, sino si
// su rango sigue conteniendo el precio: fuera de rango la posicion deja de
// cobrar comisiones y queda entera en uno de los dos activos. Esto responde eso
// y, sobre todo, a QUE DISTANCIA esta de salirse — que es la parte accionable.
//
// La distancia se mide en ticks y se convierte a porcentaje de precio, porque un
// tick es un paso multiplicativo fijo (1,0001) y "te quedan 400 ticks" no le
// dice nada a nadie.

import "server-only";
import { createPublicClient, fallback, http, parseAbi } from "viem";
import { bsc } from "viem/chains";

/**
 * PancakeSwap V3 en BSC MAINNET.
 *
 * Ojo con el NonfungiblePositionManager: 0x427bF5b3... es el de TESTNET, y en
 * mainnet esa direccion tiene otro contrato — no revierte, responde otra cosa.
 * Comprobado leyendo `name()` en ambas redes antes de fijar esta.
 */
const NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

const npmAbi = parseAbi([
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function ownerOf(uint256) view returns (address)",
]);
const factoryAbi = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
]);
const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 obsIdx, uint16 obsCard, uint16 obsCardNext, uint32 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

// Mismo criterio que en venus.ts: el RPC por defecto de viem nos estrangulo con
// 429 al encadenar lecturas, asi que se listan varios y se pasa al siguiente.
const client = createPublicClient({
  chain: bsc,
  transport: fallback(
    [
      "https://bsc-dataseed.binance.org",
      "https://bsc-dataseed1.defibit.io",
      "https://bsc-rpc.publicnode.com",
    ].map((u) => http(u)),
    { rank: false },
  ),
});

export type LpPosition = {
  tokenId: string;
  block: string;
  owner: string;
  pair: string;
  /** Comision del pool en porcentaje: 0.01, 0.05, 0.25 o 1. */
  feeTier: number;
  pool: string;
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  inRange: boolean;
  /** Liquidez cero significa una posicion cerrada, no una fuera de rango. */
  closed: boolean;
  /** Cuanto puede subir el precio antes de salirse por arriba, en %. */
  roomUpPct: number | null;
  /** Cuanto puede bajar antes de salirse por abajo, en %. */
  roomDownPct: number | null;
  /** Comisiones acumuladas sin reclamar, en unidades crudas de cada token. */
  uncollected: { token0: string; token1: string };
  verdict: string;
};

/** Un tick es un paso de 1,0001 en precio; esto lo pasa a porcentaje. */
function ticksToPct(ticks: number): number {
  return (Math.pow(1.0001, ticks) - 1) * 100;
}

export async function lpPosition(tokenId: bigint): Promise<LpPosition> {
  const block = await client.getBlockNumber();
  const at = { blockNumber: block } as const;

  const [pos, owner] = await Promise.all([
    client.readContract({ address: NPM, abi: npmAbi, functionName: "positions", args: [tokenId], ...at }),
    client.readContract({ address: NPM, abi: npmAbi, functionName: "ownerOf", args: [tokenId], ...at }).catch(() => "0x"),
  ]);

  const [, , token0, token1, fee, tickLower, tickUpper, liquidity, , , owed0, owed1] = pos;

  const pool = await client.readContract({
    address: FACTORY, abi: factoryAbi, functionName: "getPool", args: [token0, token1, fee], ...at,
  });

  const [slot0, sym0, sym1] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: "slot0", ...at }),
    client.readContract({ address: token0, abi: erc20Abi, functionName: "symbol", ...at }).catch(() => "?"),
    client.readContract({ address: token1, abi: erc20Abi, functionName: "symbol", ...at }).catch(() => "?"),
  ]);

  const tick = Number(slot0[1]);
  const lo = Number(tickLower);
  const hi = Number(tickUpper);
  const closed = liquidity === 0n;
  const inRange = tick >= lo && tick < hi;

  // Solo tiene sentido hablar de margen si la posicion sigue viva y dentro.
  const roomUpPct = !closed && inRange ? ticksToPct(hi - tick) : null;
  const roomDownPct = !closed && inRange ? -ticksToPct(lo - tick) : null;

  let verdict: string;
  if (closed) {
    verdict = "This position holds no liquidity — it has been closed or fully withdrawn.";
  } else if (!inRange) {
    const side = tick < lo ? "below" : "above";
    const away = Math.abs(ticksToPct(tick < lo ? lo - tick : tick - hi));
    verdict =
      `Out of range: the pool price sits ${side} the position, ${away.toFixed(2)}% from the near bound. ` +
      "It is earning no fees and is held entirely in one of the two tokens.";
  } else {
    verdict =
      `In range and earning. Price can rise ${roomUpPct!.toFixed(2)}% or fall ${roomDownPct!.toFixed(2)}% ` +
      "before this position stops collecting fees.";
  }

  return {
    tokenId: String(tokenId),
    block: String(block),
    owner: String(owner),
    pair: `${sym0}/${sym1}`,
    feeTier: Number(fee) / 10_000,
    pool,
    tickLower: lo,
    tickUpper: hi,
    currentTick: tick,
    inRange,
    closed,
    roomUpPct,
    roomDownPct,
    uncollected: { token0: owed0.toString(), token1: owed1.toString() },
    verdict,
  };
}
