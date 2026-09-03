// Viabilidad de un grid sobre un pool de PancakeSwap V3, leida de la cadena.
//
// SOLO SERVIDOR. Lo usa el agente de referencia que publicamos en /api/a2a/grid.
//
// Un grid compra abajo y vende arriba, una y otra vez. Cada ciclo completo paga
// la comision del pool DOS veces — una al comprar y otra al vender — asi que un
// paso mas estrecho que el doble de la comision pierde dinero en cada vuelta,
// por muy bien que se elija el rango. Eso es aritmetica, no opinion, y es lo
// primero que deberia comprobar cualquiera antes de montar uno.
//
// Lo que NO hace: predecir si el precio se movera. Nadie puede, y un agente que
// finja lo contrario es exactamente lo que este proyecto existe para no listar.

import "server-only";
import { createPublicClient, fallback, http, parseAbi, type Address } from "viem";
import { bsc } from "viem/chains";

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 obsIdx, uint16 obsCard, uint16 obsCardNext, uint32 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function fee() view returns (uint24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

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

export type GridCheck = {
  pool: string;
  block: string;
  pair: string;
  /** Comision del pool en porcentaje por operacion. */
  feePct: number;
  /** Precio de token0 expresado en token1. */
  price: number;
  /** Liquidez activa en el tick actual, en unidades crudas. */
  activeLiquidity: string;
  /** Coste de un ciclo completo: comprar y vender. */
  roundTripCostPct: number;
  /** Paso minimo que deja el ciclo en cero. Por debajo, cada vuelta pierde. */
  breakEvenStepPct: number;
  /** El paso propuesto, si se pidio uno. */
  proposedStepPct: number | null;
  /** Margen que deja el paso propuesto sobre el coste, en puntos porcentuales. */
  marginPct: number | null;
  viable: boolean | null;
  verdict: string;
};

/**
 * Comprueba si un paso de grid cubre sus costes en un pool concreto.
 *
 * `stepPct` es opcional: sin el se devuelve el punto de equilibrio, que es la
 * cifra que hay que conocer antes de elegir nada.
 */
export async function gridCheck(
  pool: Address,
  stepPct: number | null = null,
): Promise<GridCheck> {
  const block = await client.getBlockNumber();
  const at = { blockNumber: block } as const;

  const [slot0, liquidity, fee, token0, token1] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: "slot0", ...at }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "liquidity", ...at }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "fee", ...at }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "token0", ...at }),
    client.readContract({ address: pool, abi: poolAbi, functionName: "token1", ...at }),
  ]);

  const [sym0, sym1, dec0, dec1] = await Promise.all([
    client.readContract({ address: token0, abi: erc20Abi, functionName: "symbol", ...at }).catch(() => "?"),
    client.readContract({ address: token1, abi: erc20Abi, functionName: "symbol", ...at }).catch(() => "?"),
    client.readContract({ address: token0, abi: erc20Abi, functionName: "decimals", ...at }).catch(() => 18),
    client.readContract({ address: token1, abi: erc20Abi, functionName: "decimals", ...at }).catch(() => 18),
  ]);

  // price = (sqrtPriceX96 / 2^96)^2, ajustado por los decimales de cada token.
  // Se eleva al cuadrado en BigInt: el sqrt llega a 2^160 y en coma flotante
  // el cuadrado desborda mucho antes de eso.
  const sqrt = slot0[0];
  const scaled = (sqrt * sqrt * 10n ** 18n) / 2n ** 192n;
  const price = (Number(scaled) / 1e18) * 10 ** (Number(dec0) - Number(dec1));

  const feePct = Number(fee) / 10_000;
  const roundTrip = feePct * 2;
  const proposed = stepPct !== null && Number.isFinite(stepPct) ? stepPct : null;
  const margin = proposed !== null ? proposed - roundTrip : null;
  const viable = margin !== null ? margin > 0 : null;

  const base =
    `${sym0}/${sym1} at ${feePct}% per swap, so a full grid cycle costs ` +
    `${roundTrip.toFixed(3)}% before any price move.`;

  return {
    pool,
    block: String(block),
    pair: `${sym0}/${sym1}`,
    feePct,
    price,
    activeLiquidity: liquidity.toString(),
    roundTripCostPct: roundTrip,
    breakEvenStepPct: roundTrip,
    proposedStepPct: proposed,
    marginPct: margin,
    viable,
    verdict:
      liquidity === 0n
        ? `${base} There is no active liquidity at the current tick, so orders here would not fill.`
        : proposed === null
          ? `${base} Any step below that loses money on every cycle.`
          : viable
            ? `${base} A ${proposed}% step clears it by ${margin!.toFixed(3)} points — each completed cycle keeps that much, before slippage.`
            : `${base} A ${proposed}% step does not clear it: every completed cycle loses ${Math.abs(margin!).toFixed(3)} points.`,
  };
}
