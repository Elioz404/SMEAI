#!/usr/bin/env node
// Devolver al registro ERC-8004 lo que hemos medido de el.
//
// POR QUE ESCRIBIR Y NO SOLO LEER
//
// El registro de BSC no esta corto de agentes: esta corto de senal. De 310.000
// identidades, 8004scan marca seis con endpoint verificado. Nosotros llevamos
// cincuenta y tres pasadas llamando a estos endpoints y guardando el resultado,
// y esa medicion vive solo en nuestro sitio. El Reputation Registry existe
// precisamente para que no tenga que ser asi.
//
// QUE SE PUBLICA, Y QUE NO
//
// Solo lo que funciona. Un registro de feedback es permanente: dejar escrito
// que el agente de otra persona estaba caido un martes es un dano que no se
// corrige cuando lo arregla, y nuestro propio sitio ya muestra los fallos con
// su contexto y su fecha, donde la siguiente pasada los actualiza. Aqui va la
// senal positiva, que es la que el registro no tiene y nadie mas esta poniendo.
//
// UN REGISTRO POR BACKEND, NO POR IDENTIDAD
//
// De los 41 agentes que cumplen el criterio, 39 son identidades clonadas: se
// reducen a cuatro backends. Publicar 41 registros seria hacer exactamente lo
// que este proyecto denuncia — llenar el registro de entradas redundantes que
// aparentan mas de lo que hay. Se escribe uno por backend, con la identidad
// representante elegida de forma determinista (el token_id mas bajo), y el
// documento dice cuantas identidades comparten ese backend.
//
// LO QUE NO MEDIMOS BIEN, NO SE PUBLICA
//
// Hasta hoy sondeabamos MCP con un GET, asi que los servidores MCP acumularon
// cincuenta pasadas marcadas como caidas por un fallo NUESTRO. Ese historial no
// se publica: convertir nuestro error en la reputacion permanente de otro seria
// la peor version de esta herramienta. El criterio de 100% los excluye solo,
// pero se comprueba explicitamente para que siga siendo cierto si el criterio
// cambia.
//
// Uso:
//   node --env-file=.env.local scripts/publish-feedback.mjs
//       muestra a quien se escribiria y por que. No toca nada.
//
//   node --env-file=.env.local scripts/publish-feedback.mjs --prepare
//       escribe los documentos en public/feedback/ y anota los hashes.
//       Hay que subirlos ANTES de la fase siguiente.
//
//   node --env-file=.env.local scripts/publish-feedback.mjs --confirm
//       comprueba que cada documento se sirve y cuadra, y escribe en cadena.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  toBytes,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const CHAIN_ID = 56;
const RPC = 'https://bsc-dataseed.binance.org';

/**
 * Reputation Registry de ERC-8004 en BSC mainnet.
 *
 * No se copio de un blog. El propio contrato responde `getIdentityRegistry()`
 * con 0x8004A169…a432, que es el registro de identidad que este proyecto ya
 * lee: los dos estan enlazados en cadena, y eso es lo que prueba que es el
 * correcto. El SDK de Altana no cubre reputacion, asi que se llama directo.
 */
const REPUTATION = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';
const IDENTITY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

const BASE = (process.env.SMEAI_PUBLIC_URL || 'https://smeai-dev.vercel.app').replace(/\/$/, '');
const OUT = 'data/feedback.json';
const DOC_DIR = 'public/feedback';

/** Minimo de pasadas observadas para que la afirmacion signifique algo. */
const MIN_CHECKS = 20;

const PREPARE = process.argv.includes('--prepare');
const CONFIRM = process.argv.includes('--confirm');

const log = (...a) => console.log(...a);

const ABI = parseAbi([
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
]);

function adminKey() {
  const k = process.env.ALTANA_ADMIN_KEY?.trim();
  if (!k) throw new Error('ALTANA_ADMIN_KEY no esta definida (usa --env-file=.env.local)');
  return k.startsWith('0x') ? k : `0x${k}`;
}

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

/** Cuantas pasadas se observo al agente y en cuantas estuvo contratable. */
function record(history, agentId) {
  const marks = (history.agents[agentId] ?? '').split('');
  // `-` es "no estaba en el catalogo" y `?` es "no pudimos medir". Contar
  // cualquiera de los dos como caida convertiria un fallo del indexador en
  // reputacion de un tercero.
  const observed = marks.filter((m) => m !== '-' && m !== '?').length;
  const hireable = marks.filter((m) => m === 'h').length;
  return { observed, hireable };
}

/**
 * A quien se le escribe. Un agente entra solo si se cumple TODO:
 * es de un tercero, esta en mainnet, respondio en cada una de las pasadas en
 * que lo miramos, y lo miramos suficientes veces.
 */
function selectBackends(snapshot, history) {
  const eligible = snapshot.agents.filter((a) => {
    if (a.is_ours || a.chain_id !== CHAIN_ID || !a.hireable) return false;
    const { observed, hireable } = record(history, a.agent_id);
    return observed >= MIN_CHECKS && hireable === observed;
  });

  // Un backend, un registro. La representante es la de token_id mas bajo:
  // deterministico, asi que dos ejecuciones eligen a la misma y no se duplica.
  const byBackend = new Map();
  for (const a of eligible) {
    const key = a.service?.url ?? `sin-servicio:${a.agent_id}`;
    if (!byBackend.has(key)) byBackend.set(key, []);
    byBackend.get(key).push(a);
  }

  const out = [];
  for (const [endpoint, group] of byBackend) {
    group.sort((x, y) => Number(x.token_id) - Number(y.token_id));
    const rep = group[0];
    const { observed, hireable } = record(history, rep.agent_id);
    out.push({
      agent: rep,
      endpoint,
      identities: group.length,
      observed,
      hireable,
      uptime: hireable / observed,
    });
  }
  out.sort((a, b) => Number(a.agent.token_id) - Number(b.agent.token_id));
  return out;
}

/** El documento al que apunta el hash. Se sirve tal cual, byte a byte. */
function buildDocument(entry, history) {
  const a = entry.agent;
  const checks = history.checks ?? [];
  return {
    schema: 'smeai/agent-uptime-feedback@1',
    issuer: {
      name: 'SMEAI',
      site: BASE,
      agent_page: `${BASE}/agent/${a.chain_id}/${a.token_id}`,
    },
    subject: {
      chain_id: a.chain_id,
      agent_id: String(a.token_id),
      name: a.name,
      endpoint: entry.endpoint,
      protocol: a.service?.protocol ?? 'a2a',
    },
    measurement: {
      claim: 'reachability',
      checks_observed: entry.observed,
      checks_reachable: entry.hireable,
      uptime_ratio: Number(entry.uptime.toFixed(4)),
      first_check: checks[0] ?? null,
      last_check: checks[checks.length - 1] ?? null,
      method:
        'Each run fetches the agent card declared on-chain, then calls the service behind it — ' +
        'JSON-RPC for A2A, an initialize/tools-list handshake for MCP — and records the status, ' +
        'latency and body. A run counts as reachable only when both answer.',
    },
    // Sin esto el documento seria una nota de prensa. Un registro de reputacion
    // que no dice como puede equivocarse no es una medicion, es una opinion con
    // formato de dato.
    known_defects: [
      'Point-in-time only: an agent that answered on every run so far can be down now.',
      'Reachability is not correctness. We verify that the service answers and, where it offers ' +
        'one, that it quotes a price. We do not grade the content of its answers.',
      `Identity, not operator: ${entry.identities > 1 ? `${entry.identities} registered identities share this backend, and this record measures the backend through the lowest-numbered one` : 'this backend serves one registered identity'}.`,
      'Runs are not evenly spaced. GitHub throttles scheduled workflows on public repositories, ' +
        'so the interval between checks varies from minutes to hours.',
      'Self-reported: SMEAI both measures and publishes this. The full history is on the agent page ' +
        'and the raw snapshot is versioned in git, so the claim can be audited rather than trusted.',
    ],
    identities_sharing_backend: entry.identities,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Bytes canonicos del documento.
 *
 * Se serializa UNA vez y ese texto es a la vez lo que se hashea y lo que se
 * sirve. Volver a serializar el objeto al guardarlo podria producir otros bytes
 * —orden de claves, espaciado— y el hash dejaria de cuadrar sin que nada
 * pareciera roto, que es el fallo que ya documentamos en las entregas.
 */
const canonical = (doc) => JSON.stringify(doc, null, 2) + '\n';

async function main() {
  const [snapshot, history] = await Promise.all([
    readJson('data/snapshot.json'),
    readJson('data/history.json'),
  ]);

  const account = privateKeyToAccount(adminKey());
  const pub = createPublicClient({ chain: bsc, transport: http(RPC) });

  // Que el contrato es el que decimos no se asume: se le pregunta, y tiene que
  // apuntar al mismo registro de identidad que ya leemos.
  const linked = await pub.readContract({
    address: REPUTATION,
    abi: parseAbi(['function getIdentityRegistry() view returns (address)']),
    functionName: 'getIdentityRegistry',
  });
  if (linked.toLowerCase() !== IDENTITY.toLowerCase()) {
    throw new Error(`el registro de reputacion apunta a ${linked}, no al de identidad conocido`);
  }

  const selected = selectBackends(snapshot, history);
  log(`emisor    : ${account.address}`);
  log(`registro  : ${REPUTATION} (enlazado a ${linked})`);
  log(`criterio  : mainnet · de terceros · contratable en las ${MIN_CHECKS}+ pasadas observadas\n`);

  if (!selected.length) {
    log('ningun agente cumple el criterio. No se escribe nada.');
    return;
  }

  const total = snapshot.agents.filter(
    (a) => !a.is_ours && a.chain_id === CHAIN_ID && a.hireable,
  ).length;
  const collapsed = selected.reduce((n, e) => n + e.identities, 0);
  log(`${collapsed} identidades cumplen el criterio y son ${selected.length} backends distintos.`);
  log(`Se escribe uno por backend. (${total} contratables en mainnet en total.)\n`);

  for (const e of selected) {
    log(
      `  #${String(e.agent.token_id).padEnd(7)} ${String(Math.round(e.uptime * 100)).padStart(3)}% ` +
        `de ${e.observed} pasadas · ${e.identities} identidad(es) · ${e.agent.name.slice(0, 40)}`,
    );
  }

  // ---------------- fase 1: documentos --------------------------------------
  if (PREPARE) {
    await mkdir(DOC_DIR, { recursive: true });
    const planned = [];
    for (const e of selected) {
      const text = canonical(buildDocument(e, history));
      const path = `${DOC_DIR}/${e.agent.token_id}.json`;
      await writeFile(path, text);
      planned.push({
        agent_id: String(e.agent.token_id),
        name: e.agent.name,
        endpoint: e.endpoint,
        category: e.agent.categories?.[0] ?? 'agent',
        identities: e.identities,
        observed: e.observed,
        uptime_ratio: Number(e.uptime.toFixed(4)),
        // int128 con dos decimales: 100.00% -> 10000.
        value: Math.round(e.uptime * 10000),
        value_decimals: 2,
        uri: `${BASE}/feedback/${e.agent.token_id}.json`,
        hash: keccak256(toBytes(text)),
        bytes: Buffer.byteLength(text),
        tx: null,
      });
      log(`  escrito ${path}`);
    }
    await writeFile(
      OUT,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          chain_id: CHAIN_ID,
          registry: REPUTATION,
          issuer: account.address,
          explorer: 'https://bscscan.com',
          min_checks: MIN_CHECKS,
          records: planned,
        },
        null,
        2,
      ) + '\n',
    );
    log(`\n  escrito ${OUT}`);
    log('\nAhora hay que SUBIR estos ficheros. La URI tiene que resolver antes de');
    log('que el hash entre en cadena: un puntero permanente a un 404 es peor que');
    log('no publicar nada. Despues:  --confirm');
    return;
  }

  if (!CONFIRM) {
    log('\n--- SIMULACION. Nada escrito. Usa --prepare y luego --confirm. ---');
    return;
  }

  // ---------------- fase 2: cadena ------------------------------------------
  const state = await readJson(OUT).catch(() => null);
  if (!state?.records?.length) {
    throw new Error(`no hay nada preparado en ${OUT}. Ejecuta --prepare primero.`);
  }

  const wallet = createWalletClient({ account, chain: bsc, transport: http(RPC) });
  const gasPrice = await pub.getGasPrice();
  log('');

  for (const r of state.records) {
    if (r.tx) {
      log(`  #${r.agent_id} ya publicado (${r.tx.slice(0, 14)}…), se salta`);
      continue;
    }

    // Se comprueba que lo servido reproduce el hash ANTES de comprometerlo.
    // Firmar un puntero a algo que no hemos visto seria pedirle a quien lo lea
    // la confianza que este proyecto existe para no tener que pedir.
    const res = await fetch(r.uri, { signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!res?.ok) {
      log(`  #${r.agent_id} SALTADO: ${r.uri} devolvio ${res?.status ?? 'sin respuesta'}`);
      continue;
    }
    const served = await res.text();
    if (keccak256(toBytes(served)) !== r.hash) {
      log(`  #${r.agent_id} SALTADO: lo servido no reproduce el hash preparado`);
      continue;
    }

    const args = [
      BigInt(r.agent_id),
      BigInt(r.value),
      r.value_decimals,
      'uptime',
      r.category,
      r.endpoint,
      r.uri,
      r.hash,
    ];
    const { request } = await pub.simulateContract({
      address: REPUTATION,
      abi: ABI,
      functionName: 'giveFeedback',
      args,
      account,
    });
    const tx = await wallet.writeContract(request);
    const receipt = await pub.waitForTransactionReceipt({ hash: tx, timeout: 120000 });
    r.tx = tx;
    r.block = Number(receipt.blockNumber);
    r.gas_used = Number(receipt.gasUsed);
    log(`  #${r.agent_id} publicado · ${receipt.status} · tx ${tx}`);
    await writeFile(OUT, JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2) + '\n');
  }

  const done = state.records.filter((r) => r.tx).length;
  const spent = state.records.reduce((n, r) => n + (r.gas_used ?? 0), 0);
  log(`\n${done}/${state.records.length} registros en cadena · ${Number(BigInt(spent) * gasPrice) / 1e18} BNB en gas`);
}

main().catch((err) => {
  console.error('\nFALLO:', err.message);
  process.exitCode = 1;
});
