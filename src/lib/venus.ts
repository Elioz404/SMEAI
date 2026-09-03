// Health factor real de una posicion en Venus, calculado desde la cadena.
//
// SOLO SERVIDOR. Lo usa el agente de referencia que publicamos en /api/a2a.
//
// Venus expone `getAccountLiquidity`, que devuelve el exceso de liquidez y el
// deficit en dolares. Es util pero NO es un health factor: no dice a que
// distancia de la liquidacion esta la posicion en terminos relativos, que es lo
// que un prestatario necesita para decidir. Asi que se calcula el de verdad:
//
//   health factor = colateral ponderado por su collateral factor / deuda
//
// Eso obliga a recorrer los mercados en los que la cuenta ha entrado y a leer
// el oraculo. Son mas llamadas, y es la diferencia entre responder algo cierto
// y responder algo que suena bien.

import "server-only";
import { createPublicClient, fallback, http, parseAbi, type Address } from "viem";
import { bsc } from "viem/chains";

/** Comptroller de Venus en BSC mainnet. */
const COMPTROLLER: Address = "0xfD36E2c2a6789Db23113685031d7F16329158384";

const comptrollerAbi = parseAbi([
  "function getAssetsIn(address) view returns (address[])",
  "function getAccountLiquidity(address) view returns (uint256, uint256, uint256)",
  "function markets(address) view returns (bool, uint256, bool)",
  "function oracle() view returns (address)",
]);

const vTokenAbi = parseAbi([
  "function getAccountSnapshot(address) view returns (uint256, uint256, uint256, uint256)",
  "function symbol() view returns (string)",
]);

const oracleAbi = parseAbi([
  "function getUnderlyingPrice(address) view returns (uint256)",
]);

/**
 * RPCs por orden de preferencia.
 *
 * El transporte por defecto de viem apunta a un nodo que nos devolvio 429 al
 * leer una posicion con varios mercados: son cuatro llamadas por mercado y las
 * hace en paralelo. Un agente publico no puede caerse porque un proveedor le
 * estrangule, asi que `fallback` pasa al siguiente cuando uno falla.
 */
const RPCS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-rpc.publicnode.com",
];

const client = createPublicClient({
  chain: bsc,
  transport: fallback(RPCS.map((url) => http(url)), { rank: false }),
});

export type VenusMarket = {
  symbol: string;
  /** Valor suministrado en dolares, ya a precio de oraculo. */
  suppliedUsd: number;
  /** Valor prestado en dolares. */
  borrowedUsd: number;
  /** Fraccion del colateral que Venus cuenta como respaldo (0–1). */
  collateralFactor: number;
};

export type VenusHealth = {
  wallet: string;
  block: string;
  /** Colateral ya ponderado por el collateral factor de cada mercado. */
  weightedCollateralUsd: number;
  totalBorrowedUsd: number;
  /** null cuando no hay deuda: dividir por cero no es "infinito seguro". */
  healthFactor: number | null;
  /** Cuanto puede caer el colateral antes de tocar 1.0, en porcentaje. */
  bufferPct: number | null;
  liquidatable: boolean;
  markets: VenusMarket[];
  verdict: string;
};

/**
 * Lee la posicion de una cuenta y calcula su health factor.
 *
 * Todas las llamadas van al mismo bloque, tomado al principio: una posicion
 * leida a caballo entre dos bloques puede dar un ratio que nunca existio.
 */
export async function venusHealth(wallet: Address): Promise<VenusHealth> {
  const block = await client.getBlockNumber();
  const at = { blockNumber: block } as const;

  const [assets, oracle] = await Promise.all([
    client.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName: "getAssetsIn", args: [wallet], ...at }),
    client.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName: "oracle", ...at }),
  ]);

  const markets: VenusMarket[] = [];
  let weighted = 0;
  let borrowed = 0;

  for (const vToken of assets) {
    const [snap, market, price, symbol] = await Promise.all([
      client.readContract({ address: vToken, abi: vTokenAbi, functionName: "getAccountSnapshot", args: [wallet], ...at }),
      client.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName: "markets", args: [vToken], ...at }),
      client.readContract({ address: oracle, abi: oracleAbi, functionName: "getUnderlyingPrice", args: [vToken], ...at }),
      client.readContract({ address: vToken, abi: vTokenAbi, functionName: "symbol", ...at }).catch(() => "?"),
    ]);

    const [, vBalance, borrowBalance, exchangeRate] = snap;
    const [, collateralFactorMantissa] = market;

    // El precio del oraculo de Venus ya viene escalado para que
    // (cantidad * precio) / 1e36 sea dolares, independientemente de los
    // decimales del subyacente. Por eso no hay que normalizar por token.
    const suppliedUnderlying = (vBalance * exchangeRate) / 10n ** 18n;
    const suppliedUsd = Number((suppliedUnderlying * price) / 10n ** 18n) / 1e18;
    const borrowedUsd = Number((borrowBalance * price) / 10n ** 18n) / 1e18;
    const cf = Number(collateralFactorMantissa) / 1e18;

    weighted += suppliedUsd * cf;
    borrowed += borrowedUsd;
    if (suppliedUsd > 0 || borrowedUsd > 0) {
      markets.push({ symbol, suppliedUsd, borrowedUsd, collateralFactor: cf });
    }
  }

  const healthFactor = borrowed > 0 ? weighted / borrowed : null;
  const bufferPct =
    healthFactor !== null && healthFactor > 0
      ? Math.max(0, (1 - 1 / healthFactor) * 100)
      : null;

  return {
    wallet,
    block: String(block),
    weightedCollateralUsd: weighted,
    totalBorrowedUsd: borrowed,
    healthFactor,
    bufferPct,
    liquidatable: healthFactor !== null && healthFactor < 1,
    markets,
    verdict:
      borrowed === 0
        ? markets.length === 0
          ? "This account has no Venus position on BSC mainnet."
          : "Collateral supplied, nothing borrowed — nothing to liquidate."
        : healthFactor !== null && healthFactor < 1
          ? `Health factor ${healthFactor.toFixed(3)} — below 1.0, this position is liquidatable at this block.`
          : `Health factor ${healthFactor?.toFixed(3)} — collateral can fall ${bufferPct?.toFixed(1)}% before liquidation.`,
  };
}
