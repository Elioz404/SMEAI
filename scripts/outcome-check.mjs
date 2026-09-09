#!/usr/bin/env node
// ¿La respuesta del agente es CORRECTA? No si contesta: si acierta.
//
// POR QUE ESTO NO EXISTIA HASTA HOY
//
// La pagina de metodo lo decia sin rodeos: calificar la correccion exige tener
// la respuesta, y los agentes que cotizan no la entregan. Se financiaron once
// escrows en las dos redes y ninguno produjo un entregable, asi que no habia un
// corpus que calificar. Era una medicion que el ecosistema no soportaba.
//
// Lo que cambio no fue el ecosistema: fue que empezamos a hablar MCP. Un
// servidor MCP contesta EN EL ACTO y sin cobrar. De golpe hay respuestas que
// calificar, y la pregunta que este proyecto no podia responder pasa a poder
// responderse para la parte del catalogo que habla ese protocolo.
//
// COMO SE CALIFICA
//
// Cada comprobacion enfrenta la respuesta del agente contra el mismo dato leido
// por nosotros del contrato. No hay opinion: o coincide con la cadena o no.
//
// LO QUE NOS ENSENO LA PRIMERA MEDICION, Y POR QUE HAY VARIAS MUESTRAS
//
// La primera comparacion dio 623.59 frente a 643.13 en cadena: un 3% de error.
// Con una sola muestra habriamos publicado que el agente se equivoca. Repitiendo
// tres veces con veinte segundos de separacion, la tercera coincidio AL CENTIMO.
// El agente no estaba equivocado: servia cache.
//
// "Desactualizado" y "equivocado" son cosas distintas y solo se distinguen
// mirando mas de una vez. Publicar la primera como si fuera la segunda seria
// exactamente el fallo de medicion que este proyecto documenta en los demas, esta
// vez cometido por nosotros. Por eso los numericos se muestrean varias veces y
// un acierto en cualquiera de ellas basta para descartar que este equivocado.
//
// SOLO LECTURA, SIEMPRE
//
// Los MCP de Venus y Aave exponen `borrow`, `repay` y `mintToken`. Aqui no se
// llama a ninguna: la lista de comprobaciones es fija, esta escrita a mano, y
// cada herramienta que aparece es una lectura. No se descubren herramientas y se
// llaman a ver que pasa, porque "a ver que pasa" contra un contrato de prestamos
// es como se pierde el dinero de otro.
//
// Uso:
//   node scripts/outcome-check.mjs          # califica y escribe data/outcomes.json
//   node scripts/outcome-check.mjs --dry    # califica y solo lo imprime

import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';

const OUT = 'data/outcomes.json';
const DRY = process.argv.includes('--dry');
const RPC = 'https://bsc-dataseed.binance.org';

/** Cuantas veces se pregunta un valor que puede venir de cache, y cada cuanto. */
const SAMPLES = 3;
const SAMPLE_GAP_MS = 15000;

/** Por debajo de esto, agente y cadena dicen lo mismo. */
const TOLERANCE = 0.005; // 0,5%

const VENUS_COMPTROLLER = '0xfD36E2c2a6789Db23113685031d7F16329158384';
const AAVE_POOL = '0x6807dc923806fE8Fd134338EABCA509979a7e0cB';

/** Un prestatario real de Venus. El mismo del Agent Advantage Report. */
const BORROWER = '0x0949251a1c62157c9dcC24fA8FF6b373959dea69';

const log = (...a) => console.log(...a);
const pub = createPublicClient({ chain: bsc, transport: http(RPC) });

// --------------------------------------------------------------- transporte MCP

const MCP_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

async function mcp(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: MCP_HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (text.includes('data:')) {
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('data:')) return JSON.parse(line.slice(5).trim());
    }
  }
  return JSON.parse(text);
}

async function callTool(url, name, args) {
  await mcp(url, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'smeai-outcome', version: '1' },
    },
  });
  const t0 = Date.now();
  const res = await mcp(url, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return {
    latency_ms: Date.now() - t0,
    structured: res.result?.structuredContent ?? null,
    text: res.result?.content?.[0]?.text ?? null,
    error: res.error?.message ?? null,
  };
}

// -------------------------------------------------------------- comprobaciones
//
// Cada una dice: a quien se pregunta, que se le pregunta, y como se averigua la
// respuesta correcta sin preguntarle a el.

const CHECKS = [
  {
    id: 'venus-account-liquidity',
    agent: { chain_id: 56, token_id: '43129', name: 'Venus powered by HeyAnon' },
    endpoint: 'https://erc8004.heyanon.ai/mcp/venus',
    tool: 'getAccountLiquidity',
    args: { chainNames: ['bsc'], pool: 'CORE', userAddress: BORROWER },
    question: `Venus CORE borrow limit for ${BORROWER}`,
    kind: 'numeric',
    // La verdad sale del Comptroller de Venus, que es de donde saldria la del
    // agente si la leyera en el momento.
    async truth() {
      const [, liquidity] = await pub.readContract({
        address: VENUS_COMPTROLLER,
        abi: parseAbi(['function getAccountLiquidity(address) view returns (uint256,uint256,uint256)']),
        functionName: 'getAccountLiquidity',
        args: [BORROWER],
      });
      return Number(liquidity) / 1e18;
    },
    answer(res) {
      const v = res.structured?.data?.[0]?.borrowLimit;
      return v === undefined ? null : Number(v);
    },
    source: `${VENUS_COMPTROLLER} getAccountLiquidity()`,
  },
  {
    id: 'aave-reserves-list',
    agent: { chain_id: 56, token_id: '45381', name: 'Aave powered by HeyAnon' },
    endpoint: 'https://erc8004.heyanon.ai/mcp/aave',
    tool: 'getReservesList',
    args: { chainName: 'bsc' },
    question: 'Assets listed in the Aave V3 pool on BSC',
    // Determinista: no depende de precios, asi que una sola muestra basta y una
    // diferencia aqui no puede excusarse con la cache.
    kind: 'set',
    async truth() {
      const list = await pub.readContract({
        address: AAVE_POOL,
        abi: parseAbi(['function getReservesList() view returns (address[])']),
        functionName: 'getReservesList',
      });
      return list.map((a) => a.toLowerCase()).sort();
    },
    answer(res) {
      const blob = res.text ?? JSON.stringify(res.structured ?? {});
      const found = blob.match(/0x[a-fA-F0-9]{40}/g);
      return found ? [...new Set(found.map((a) => a.toLowerCase()))].sort() : null;
    },
    source: `${AAVE_POOL} getReservesList()`,
  },
];

// ------------------------------------------------------------------ veredictos

/**
 * Califica sobre TODAS las observaciones acumuladas, no solo las de esta pasada.
 *
 * Hace falta porque el veredicto se movia con la suerte del momento. La primera
 * medicion a mano cogio una muestra que coincidia al centimo; la primera pasada
 * del script, veinte minutos despues, cogio tres seguidas un 3% por debajo. El
 * agente es el mismo: sirve cache y refresca cada tanto.
 *
 * Publicar "divergente" por una pasada desafortunada seria acusar de equivocarse
 * a quien ya vimos acertar exacto. Una sola observacion buena basta para
 * descartar que este equivocado —acertar al centimo por casualidad no ocurre— y
 * lo que queda por decir es cuanto puede retrasarse, que es justo lo que
 * necesita saber quien vaya a fiarse de esa respuesta.
 */
function gradeNumeric(observations) {
  const deltas = observations.map((o) => o.delta).filter((d) => typeof d === 'number');
  if (!deltas.length) return { verdict: 'unreadable', detail: 'no answer to compare' };

  const best = Math.min(...deltas);
  const worst = Math.max(...deltas);
  const pct = (d) => `${(d * 100).toFixed(2)}%`;

  if (best > TOLERANCE) {
    return {
      verdict: 'divergent',
      detail: `never came within ${(TOLERANCE * 100).toFixed(1)}% of the chain in ${deltas.length} observations; closest was ${pct(best)}`,
    };
  }
  const missed = deltas.filter((d) => d > TOLERANCE).length;
  if (!missed) {
    return {
      verdict: 'match',
      detail: `agreed with the chain in all ${deltas.length} observations`,
    };
  }
  return {
    verdict: 'stale',
    detail:
      `matched the chain exactly in ${deltas.length - missed} of ${deltas.length} observations, ` +
      `so the arithmetic is right; the rest served a cached value up to ${pct(worst)} behind`,
  };
}

function gradeSet(answer, truth) {
  if (!answer) return { verdict: 'unreadable', detail: 'no answer to compare' };
  const missing = truth.filter((a) => !answer.includes(a));
  const extra = answer.filter((a) => !truth.includes(a));
  if (!missing.length && !extra.length) {
    return { verdict: 'match', detail: `returned exactly the ${truth.length} assets the pool lists` };
  }
  return {
    verdict: 'divergent',
    detail: `${missing.length} missing, ${extra.length} not in the pool`,
  };
}

// ------------------------------------------------------------------------ main

/** Cuantas observaciones se conservan por comprobacion. */
const MAX_OBSERVATIONS = 60;

async function main() {
  log(`comprobaciones: ${CHECKS.length} · tolerancia ${TOLERANCE * 100}% · ${SAMPLES} muestras en las numericas\n`);

  // El historial anterior se conserva: el veredicto se calcula sobre todo lo
  // observado, no sobre la ultima pasada. Ver `gradeNumeric`.
  const previous = await readFile(OUT, 'utf8')
    .then((t) => JSON.parse(t))
    .catch(() => null);
  const priorOf = (id) => previous?.results?.find((r) => r.id === id)?.observations ?? [];

  const results = [];

  for (const c of CHECKS) {
    log(`— ${c.agent.name} · ${c.tool}`);
    log(`  pregunta: ${c.question}`);

    const answers = [];
    const truths = [];
    const latencies = [];
    let failure = null;
    const rounds = c.kind === 'numeric' ? SAMPLES : 1;

    for (let i = 0; i < rounds; i++) {
      try {
        // A la vez a proposito: comparar contra una verdad leida despues
        // introduce una diferencia que no es del agente.
        const [res, truth] = await Promise.all([
          callTool(c.endpoint, c.tool, c.args),
          c.truth(),
        ]);
        answers.push(c.answer(res));
        truths.push(truth);
        latencies.push(res.latency_ms);
        if (res.error) failure = res.error;
      } catch (err) {
        failure = String(err.message).slice(0, 120);
        answers.push(null);
        truths.push(null);
      }
      if (i < rounds - 1) await new Promise((r) => setTimeout(r, SAMPLE_GAP_MS));
    }

    const at = new Date().toISOString();
    const fresh = answers
      .map((a, i) => {
        if (a === null || truths[i] === null || truths[i] === undefined) return null;
        if (c.kind === 'numeric') {
          return { at, delta: Math.abs(a - truths[i]) / truths[i], latency_ms: latencies[i] ?? null };
        }
        const missing = truths[i].filter((x) => !a.includes(x)).length;
        const extra = a.filter((x) => !truths[i].includes(x)).length;
        return { at, delta: missing + extra === 0 ? 0 : 1, latency_ms: latencies[i] ?? null };
      })
      .filter(Boolean);

    const observations = [...priorOf(c.id), ...fresh].slice(-MAX_OBSERVATIONS);
    const graded =
      c.kind === 'numeric' ? gradeNumeric(observations) : gradeSet(answers[0], truths[0]);

    const show = (v) => (Array.isArray(v) ? `${v.length} assets` : v === null ? 'sin respuesta' : v);
    log(`  agente  : ${answers.map(show).join(' · ')}`);
    log(`  cadena  : ${truths.map(show).join(' · ')}`);
    log(`  veredicto: ${graded.verdict.toUpperCase()} — ${graded.detail}`);
    log(`  observaciones acumuladas: ${observations.length}`);
    if (failure) log(`  aviso   : ${failure}`);
    log('');

    results.push({
      id: c.id,
      agent: c.agent,
      endpoint: c.endpoint,
      tool: c.tool,
      question: c.question,
      kind: c.kind,
      truth_source: c.source,
      last_run: answers.map((a, i) => ({
        answer: Array.isArray(a) ? a.length : a,
        truth: Array.isArray(truths[i]) ? truths[i].length : truths[i],
        latency_ms: latencies[i] ?? null,
      })),
      observations,
      verdict: graded.verdict,
      detail: graded.detail,
      error: failure,
    });
  }

  const by = (v) => results.filter((r) => r.verdict === v).length;
  log(`resumen: ${by('match')} exactas · ${by('stale')} correctas pero cacheadas · ${by('divergent')} divergentes · ${by('unreadable')} sin respuesta`);

  if (DRY) {
    log('\n--- --dry: no se escribe nada. ---');
    return;
  }
  await writeFile(
    OUT,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        chain_id: 56,
        tolerance: TOLERANCE,
        samples: SAMPLES,
        sample_gap_ms: SAMPLE_GAP_MS,
        results,
      },
      null,
      2,
    ) + '\n',
  );
  log(`\nescrito ${OUT}`);
}

main().catch((err) => {
  console.error('\nFALLO:', err.message);
  process.exitCode = 1;
});
