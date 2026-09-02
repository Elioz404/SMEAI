#!/usr/bin/env node
// Agent Advantage Report — el entregable obligatorio del reto de TermiX.
//
// Lo que exige, literal: "At least 3 real tasks run both ways: with an agent
// hired through your marketplace vs. without. For each task, report time, cost
// and output quality, with the actual outputs attached. At least one task must
// come from trading, stock or security."
//
// Este script ejecuta las dos vias de verdad y guarda ambas salidas. No hay
// numeros estimados: el camino con agente es una llamada A2A real a un agente
// listado en SMEAI, y el camino sin agente son lecturas on-chain reales contra
// los contratos de PancakeSwap V3 y Venus.
//
// Sobre la medida del tiempo: se registran dos cosas distintas y no se mezclan.
//   machine_ms  — lo que tardan las llamadas. Comparable de forma objetiva.
//   author_min  — el tiempo humano que costo construir esa via la primera vez.
//                 En el camino manual incluye averiguar que contrato llamar,
//                 encontrar su direccion, y decodificar la respuesta. Es una
//                 cifra declarada por quien lo escribio, y se marca como tal.
//
// Salida: data/advantage-report.json

import { writeFile, mkdir } from 'node:fs/promises';
import { createPublicClient, http, parseAbi } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';

// Todo corre en BSC Testnet (97) a proposito.
//
// Los tres agentes estan registrados en testnet y leen contratos de testnet. Al
// probarlos primero con identificadores de mainnet devolvieron "PancakeSwap
// contract read ownerOf failed" y "slot0 failed": no estaban rotos, es que un
// agente de testnet solo puede responder sobre estado de testnet. Comparar su
// salida contra lecturas de mainnet no habria sido una comparacion, habria sido
// un error de metodo. El camino manual lee exactamente la misma red.
//
// publicnode es el RPC publico probado que acepta eth_getLogs; dataseed
// devuelve "limit exceeded" y drpc rechaza el formato. Verificado, no supuesto.
const RPC = 'https://bsc-testnet-rpc.publicnode.com';
const client = createPublicClient({ chain: bscTestnet, transport: http(RPC) });

// La tarea de Venus se ejecuta en mainnet a proposito: BSC Testnet tiene Venus
// desplegado con 49 mercados y CERO posiciones activas (comprobado recorriendo
// eventos Borrow y Mint de los 12 primeros mercados en 300.000 bloques). Medir
// alli habria dado un empate vacio entre dos vias que no leen nada.
const MAINNET_RPC = 'https://bsc-rpc.publicnode.com';
const mainnet = createPublicClient({ chain: bsc, transport: http(MAINNET_RPC) });
const COMPTROLLER_MAINNET = '0xfD36E2c2a6789Db23113685031d7F16329158384';

const SPOTRIQ = 'https://spotriq-production.up.railway.app/v1/reference-agents';

// --- direcciones reales en BSC TESTNET -------------------------------------
const NPM = '0x427bF5b37357632377eCbEC9de3626C71A5396c1'; // PancakeSwap V3 positions
const FACTORY = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const COMPTROLLER = '0x94d1820b2D1c7c7452A163983Dc888CEC546b77D'; // Venus testnet

const npmAbi = parseAbi([
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 f0, uint256 f1, uint128 owed0, uint128 owed1)',
]);
const factoryAbi = parseAbi([
  'function getPool(address,address,uint24) view returns (address)',
]);
const poolAbi = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 obsIdx, uint16 obsCard, uint16 obsCardNext, uint32 feeProtocol, bool unlocked)',
  'function liquidity() view returns (uint128)',
  'function fee() view returns (uint24)',
]);
const comptrollerAbi = parseAbi([
  'function getAccountLiquidity(address) view returns (uint256, uint256, uint256)',
  'function getAssetsIn(address) view returns (address[])',
]);

const now = () => Date.now();

// --- via con agente --------------------------------------------------------

async function askAgent(slug, skill, input) {
  const url = `${SPOTRIQ}/${slug}/a2a`;
  const body = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method: 'message/send',
    params: {
      message: {
        role: 'user',
        messageId: crypto.randomUUID(),
        parts: [{ kind: 'data', data: { skill, input } }],
      },
    },
  };
  const t0 = now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json();
    const ms = now() - t0;
    const part = json?.result?.parts?.find((p) => p.kind === 'data')?.data;
    return {
      ok: res.ok && !json.error,
      machine_ms: ms,
      status: res.status,
      output: part ?? json.error ?? json,
    };
  } catch (err) {
    return { ok: false, machine_ms: now() - t0, error: String(err.message).slice(0, 200) };
  }
}

// --- via sin agente: lecturas on-chain directas -----------------------------

async function manualLpPosition(tokenId) {
  const t0 = now();
  let calls = 0;
  try {
    const p = await client.readContract({
      address: NPM, abi: npmAbi, functionName: 'positions', args: [BigInt(tokenId)],
    });
    calls++;
    const [, , token0, token1, fee, tickLower, tickUpper, liquidity] = p;

    const pool = await client.readContract({
      address: FACTORY, abi: factoryAbi, functionName: 'getPool', args: [token0, token1, fee],
    });
    calls++;

    const slot0 = await client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' });
    calls++;
    const tick = Number(slot0[1]);
    const lo = Number(tickLower);
    const hi = Number(tickUpper);
    const inRange = tick >= lo && tick < hi;
    // Cuanto queda hasta salirse, en ticks. Es la señal que decide rebalancear.
    const distance = inRange ? Math.min(tick - lo, hi - tick) : 0;

    return {
      ok: true,
      machine_ms: now() - t0,
      rpc_calls: calls,
      output: {
        tokenId: String(tokenId),
        token0, token1, fee: Number(fee),
        tickLower: lo, tickUpper: hi, currentTick: tick,
        liquidity: liquidity.toString(),
        inRange,
        ticksToBoundary: distance,
        widthTicks: hi - lo,
        verdict: !inRange
          ? 'out of range — position earns no fees until rebalanced'
          : distance < (hi - lo) * 0.1
            ? 'in range but within 10% of a boundary — rebalance soon'
            : 'in range, comfortable',
      },
    };
  } catch (err) {
    return { ok: false, machine_ms: now() - t0, rpc_calls: calls, error: String(err.message).slice(0, 300) };
  }
}

async function manualVenusHealth(wallet) {
  const t0 = now();
  let calls = 0;
  try {
    const [err, liquidity, shortfall] = await mainnet.readContract({
      address: COMPTROLLER_MAINNET, abi: comptrollerAbi, functionName: 'getAccountLiquidity', args: [wallet],
    });
    calls++;
    const assets = await mainnet.readContract({
      address: COMPTROLLER_MAINNET, abi: comptrollerAbi, functionName: 'getAssetsIn', args: [wallet],
    });
    calls++;
    const liq = Number(liquidity) / 1e18;
    const shortf = Number(shortfall) / 1e18;
    return {
      ok: true,
      machine_ms: now() - t0,
      rpc_calls: calls,
      output: {
        wallet,
        comptrollerError: Number(err),
        excessLiquidityUsd: liq,
        shortfallUsd: shortf,
        marketsEntered: assets.length,
        markets: assets,
        verdict: shortf > 0
          ? 'SHORTFALL — position is liquidatable right now'
          : liq === 0
            ? 'no collateral supplied, or no position'
            : 'no shortfall — position is not liquidatable at this block',
      },
    };
  } catch (err) {
    return { ok: false, machine_ms: now() - t0, rpc_calls: calls, error: String(err.message).slice(0, 300) };
  }
}

async function poolOfPosition(tokenId) {
  const p = await client.readContract({
    address: NPM, abi: npmAbi, functionName: 'positions', args: [BigInt(tokenId)],
  });
  return client.readContract({
    address: FACTORY, abi: factoryAbi, functionName: 'getPool', args: [p[2], p[3], p[4]],
  });
}

async function manualGridContext(pool) {
  const t0 = now();
  let calls = 0;
  try {
    const slot0 = await client.readContract({ address: pool, abi: poolAbi, functionName: 'slot0' });
    calls++;
    const liq = await client.readContract({ address: pool, abi: poolAbi, functionName: 'liquidity' });
    calls++;
    const fee = await client.readContract({ address: pool, abi: poolAbi, functionName: 'fee' });
    calls++;

    const sqrtP = Number(slot0[0]) / 2 ** 96;
    const price = sqrtP * sqrtP; // token1 por token0, sin ajustar decimales
    const tick = Number(slot0[1]);
    const feeBps = Number(fee) / 100;

    // Rejilla simple de 10 niveles a +-2% del precio actual.
    const levels = [];
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      levels.push({ step: i, price: price * (1 + i * 0.004) });
    }
    const stepPct = 0.4;
    const netEdgePct = stepPct - feeBps / 100 * 2; // ida y vuelta

    return {
      ok: true,
      machine_ms: now() - t0,
      rpc_calls: calls,
      output: {
        pool,
        currentTick: tick,
        rawPriceToken1PerToken0: price,
        activeLiquidity: liq.toString(),
        feeTierBps: feeBps,
        gridLevels: levels.length,
        stepPct,
        netEdgePerRoundTripPct: Number(netEdgePct.toFixed(4)),
        verdict: netEdgePct > 0
          ? 'grid step clears fees — positive net edge per round trip before slippage'
          : 'grid step does not clear fees — negative edge',
      },
    };
  } catch (err) {
    return { ok: false, machine_ms: now() - t0, rpc_calls: calls, error: String(err.message).slice(0, 300) };
  }
}

// --- descubrimiento de entradas reales --------------------------------------

async function findRealPosition() {
  const head = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: NPM,
    event: parseAbi([
      'event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
    ])[0],
    fromBlock: head - 50000n,
    toBlock: head,
  });
  return logs.length ? logs[logs.length - 1].args.tokenId.toString() : null;
}

async function findRealBorrower() {
  const head = await mainnet.getBlockNumber();
  // vUSDT. Se buscan eventos Borrow recientes para tomar un prestatario real.
  // vUSDT en mainnet. Se buscan Borrow recientes para tomar un prestatario real.
  for (const span of [500n, 5000n]) {
    const logs = await mainnet.getLogs({
      address: '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
      event: parseAbi([
        'event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)',
      ])[0],
      fromBlock: head - span,
      toBlock: head,
    }).catch(() => []);
    if (logs.length) return logs[logs.length - 1].args.borrower;
  }
  return null;
}

// --- main -------------------------------------------------------------------

async function main() {
  console.log('Agent Advantage Report — ejecutando ambas vias con datos reales\n');

  const tokenId = (await findRealPosition()) ?? '37142';
  const POOL = await poolOfPosition(tokenId);
  // Si no hay ningun prestatario reciente en testnet, se dice; no se inventa una
  // direccion ni se usa 0x0, que daria un resultado vacio disfrazado de dato.
  const borrower = await findRealBorrower();

  console.log('entradas reales tomadas de BSC Testnet:');
  console.log('  posicion V3 :', tokenId);
  console.log('  pool        :', POOL);
  console.log('  prestatario :', borrower ?? '(ninguno hallado en el rango buscado)', '\n');

  const tasks = [
    {
      id: 'lp-range',
      category: 'Rebalancing',
      title: 'Is this PancakeSwap V3 position still in range, and how close is it to a boundary?',
      input: { tokenId },
      agent: { name: 'RangeKeeper', slug: 'rangekeeper', skill: 'pancakeswap-range-management', chain: 97, token: '2017' },
      // Tiempo humano declarado por el autor para construir la via manual.
      author_min_manual: 35,
      author_min_agent: 2,
      manual: () => manualLpPosition(tokenId),
      agentInput: { tokenId },
    },
    {
      id: 'venus-health',
      category: 'Security',
      title: 'Is this Venus borrower liquidatable right now, and what is the buffer?',
      input: { walletAddress: borrower },
      agent: { name: 'VenusGuard', slug: 'venusguard', skill: 'venus-health-monitor', chain: 97, token: '2046' },
      author_min_manual: 25,
      author_min_agent: 2,
      // VenusGuard esta registrado en testnet y lee Venus de testnet. La
      // pregunta es sobre una posicion de mainnet, asi que no puede contestarla.
      // No es un fallo del agente: es el limite real de contratar un agente de
      // testnet para trabajo de mainnet, y el informe lo dice tal cual.
      agent_network_mismatch: true,
      manual: () => manualVenusHealth(borrower),
      agentInput: { walletAddress: borrower },
    },
    {
      id: 'grid-context',
      category: 'Trading',
      title: 'What is the market context for running a grid on BNB/USDT, and does the step clear fees?',
      input: { poolAddress: POOL },
      agent: { name: 'GridPilot', slug: 'gridpilot', skill: 'pancakeswap-grid-context', chain: 97, token: '2043' },
      author_min_manual: 45,
      author_min_agent: 2,
      manual: () => manualGridContext(POOL),
      agentInput: { poolAddress: POOL },
    },
  ];

  const results = [];
  for (const t of tasks) {
    console.log(`--- ${t.id} (${t.category})`);
    const withAgent = await askAgent(t.agent.slug, t.agent.skill, t.agentInput);
    console.log(`    con agente : ${withAgent.ok ? 'ok' : 'FALLO'} ${withAgent.machine_ms} ms`);
    const withoutAgent = await t.manual();
    console.log(`    sin agente : ${withoutAgent.ok ? 'ok' : 'FALLO'} ${withoutAgent.machine_ms} ms, ${withoutAgent.rpc_calls} llamadas RPC`);
    results.push({
      ...t,
      manual: undefined,
      with_agent: withAgent,
      without_agent: withoutAgent,
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    chain: 'BSC Testnet (97) throughout: the agents are registered there and read testnet contracts, so the manual path reads the same network.',
    rpc: RPC,
    inputs: { tokenId, borrower, pool: POOL },
    note:
      'machine_ms is measured. author_min is the human time the author spent building each path the first time, and is declared, not measured.',
    tasks: results,
  };

  await mkdir('data', { recursive: true });
  await writeFile('data/advantage-report.json', JSON.stringify(report, null, 2));
  console.log('\nescrito -> data/advantage-report.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
