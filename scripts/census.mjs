#!/usr/bin/env node
// SMEAI — censo de la poblacion que declara protocolo en BSC.
//
// Por que existe, y por que es SEPARADO del catalogo:
//
// El catalogo verifica en profundidad los agentes de las cuatro categorias del
// brief, cada 30 minutos. Eso deja sin responder una pregunta legitima: y los
// otros 25.000 que declaran A2A en mainnet, que son?
//
// Responderla del todo no se puede. 8004scan no pagina fiablemente mas alla de
// unos pocos miles de offset — devuelve 500 o se queda colgada — asi que una
// enumeracion completa no es posible por esa via, y no vamos a fingir que si.
// Lo que si se puede es MUESTREAR de forma estratificada y decir exactamente
// cuanto se ha mirado.
//
// Todo lo que este script publica lleva su tamano de muestra al lado. Un censo
// que no dice cuanto ha contado es una opinion con decimales.
//
// Salida: data/census.json

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { checkUrl, readCapped, sanitizeText } from '../src/lib/net-guard.mjs';

const API = 'https://api.8004scan.io/api/v1';
const KEY = process.env.SCAN_API_KEY || '';
const OUT = 'data/census.json';

const CHAINS = [
  { id: 56, name: 'BSC Mainnet' },
  { id: 97, name: 'BSC Testnet' },
];

// Estratos de muestreo, como FRACCIONES de la poblacion y no como offsets fijos.
//
// Con offsets fijos la muestra se sesga sola: en una poblacion de 25.000 los
// numeros altos caen en la cola y en una de 772 ni existen, asi que la misma
// lista describia mainnet a medias y testnet casi solo por su primera pagina.
// Peor aun, al muestrear offset 0 y offset 24.000 aparecen operadores DISTINTOS
// — si el estrato profundo falla, el censo concluye que hay un solo backend
// cuando no es cierto.
const STRATA_FRACTIONS = [0, 0.02, 0.06, 0.12, 0.2, 0.32, 0.44, 0.6, 0.76, 0.95];
const PER_STRATUM = 20;

/** Offsets reales para una poblacion dada, sin duplicados ni desbordamiento. */
function strataFor(population) {
  if (!population || population <= PER_STRATUM) return [0];
  const max = Math.max(0, population - PER_STRATUM);
  return [...new Set(STRATA_FRACTIONS.map((f) => Math.min(max, Math.floor(population * f))))];
}

const MIN_GAP_MS = KEY ? 130 : 2100;
const PROBE_TIMEOUT_MS = 8000;

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastCall = 0;

/** Llamada a 8004scan con reintentos. Devuelve null si no se pudo. */
async function scan(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await fetch(url, {
        headers: KEY ? { 'X-API-Key': KEY } : {},
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return res.json();
      if (res.status === 429) { await sleep(2000); continue; }
      // 500 en offsets profundos es el modo de fallo habitual de esta API.
      if (attempt === 2) return null;
      await sleep(600 * (attempt + 1));
    } catch {
      if (attempt === 2) return null;
      await sleep(600 * (attempt + 1));
    }
  }
  return null;
}

/**
 * Una URL de endpoint con un `{marcador}` sin sustituir es un registro roto:
 * quien la lea tal cual no llega al agente. Se detecta de forma generica, no
 * buscando el nombre de ningun proveedor.
 */
const PLACEHOLDER = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

/** Sustituye el unico marcador por el token del agente y devuelve la URL. */
function resolveTemplate(url, tokenId) {
  return url.replace(PLACEHOLDER, tokenId);
}

/** GET que devuelve status y cuerpo acotado, con la guarda SSRF de siempre. */
async function get(url) {
  const safe = await checkUrl(url);
  if (!safe.ok) return { ok: false, blocked: true, reason: safe.reason };
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const text = await readCapped(res, 8000);
    let json = null;
    try { json = JSON.parse(text); } catch { /* no es JSON */ }
    return { ok: res.ok, status: res.status, json, text };
  } catch (err) {
    return { ok: false, error: err.name === 'TimeoutError' ? 'timeout' : String(err.message).slice(0, 90) };
  }
}

async function censusFor(chain) {
  // Poblacion exacta: la API la da en `total` con una sola llamada por filtro.
  // Esto NO es muestreo — es el tamano real de la poblacion.
  const totals = {};
  for (const [label, params] of [
    ['registered', {}],
    ['declares_a2a', { has_a2a: true }],
    ['declares_mcp', { has_mcp: true }],
  ]) {
    const r = await scan('/agents', { chain_id: chain.id, limit: 1, ...params });
    totals[label] = r?.total ?? null;
  }
  log(`  ${chain.name}: ${totals.registered} registrados · ${totals.declares_a2a} declaran A2A · ${totals.declares_mcp} MCP`);

  // Muestra estratificada sobre los que declaran A2A.
  const sample = [];
  const strataUsed = [];
  const strataFailed = [];
  const planned = strataFor(totals.declares_a2a);
  for (const offset of planned) {
    const r = await scan('/agents', {
      chain_id: chain.id, has_a2a: true, limit: PER_STRATUM, offset,
    });
    // Un estrato que no responde se ANOTA. Omitirlo en silencio fue el error
    // que casi publica "un solo backend" a partir de una muestra a la que le
    // faltaba justo el tramo donde vive el segundo operador.
    if (!r?.items?.length) { strataFailed.push(offset); continue; }
    strataUsed.push(offset);
    for (const a of r.items) sample.push(a);
  }
  log(
    `    muestra: ${sample.length} agentes · ${strataUsed.length}/${planned.length} estratos` +
      (strataFailed.length ? ` · fallaron ${strataFailed.join(', ')}` : ''),
  );

  const hosts = new Map();
  const statuses = new Map();
  let withEndpoint = 0;
  let templated = 0;
  let templateResolves = 0;
  const examples = [];

  for (const a of sample) {
    const d = await scan(`/agents/${chain.id}/${a.token_id}`);
    const s = d?.services ?? {};
    const raw = s.a2a?.endpoint ?? s.mcp?.endpoint ?? s.web?.endpoint ?? null;
    if (!raw) continue;
    withEndpoint++;

    let host = null;
    try { host = new URL(raw).hostname; } catch { /* url invalida */ }
    if (host) hosts.set(host, (hosts.get(host) ?? 0) + 1);

    if (!PLACEHOLDER.test(raw)) continue;
    templated++;

    // El registro esta roto. Se comprueba doblemente: la URL tal como esta
    // registrada, y la misma con el marcador sustituido por el token. Si la
    // primera falla y la segunda responde, el agente existe y lo que esta mal
    // es el dato en cadena — que es una conclusion muy distinta de "caido".
    const asRegistered = await get(raw);
    const fixed = resolveTemplate(raw, a.token_id);
    const corrected = await get(fixed);
    if (corrected.ok) {
      templateResolves++;
      const j = corrected.json;
      // Muchas plataformas publican el estado operativo del agente en su propia
      // respuesta. Si lo hacen, es mejor fuente que nuestra inferencia.
      const st = j && typeof j === 'object'
        ? `${j.status ?? '?'}/${j.presence ?? '?'}/endpoint:${j.endpoint ? 'si' : 'no'}/skills:${(j.skills ?? []).length}`
        : 'respuesta no estructurada';
      statuses.set(st, (statuses.get(st) ?? 0) + 1);
    }
    if (examples.length < 3) {
      examples.push({
        token_id: a.token_id,
        registered_url: sanitizeText(raw, 160),
        registered_status: asRegistered.status ?? asRegistered.error ?? 'sin respuesta',
        corrected_status: corrected.status ?? corrected.error ?? 'sin respuesta',
      });
    }
  }

  return {
    chain_id: chain.id,
    chain_name: chain.name,
    /** Poblacion exacta leida de la API, no muestreada. */
    population: totals,
    sample: {
      size: sample.length,
      strata: strataUsed,
      strata_planned: planned.length,
      /** Estratos que la API no sirvio. Su ausencia sesga lo de abajo. */
      strata_failed: strataFailed,
      /**
       * Hasta donde llega realmente la muestra. Medido: el indice tarda 19s en
       * el offset 20.000 y expira a partir de ~22.000, asi que la cola de la
       * poblacion queda sin mirar. Publicarlo es la diferencia entre una
       * limitacion declarada y una cifra enganosa.
       */
      deepest_offset: strataUsed.length ? Math.max(...strataUsed) : null,
      covers_fraction:
        strataUsed.length && totals.declares_a2a
          ? Number(((Math.max(...strataUsed) + PER_STRATUM) / totals.declares_a2a).toFixed(3))
          : null,
      per_stratum: PER_STRATUM,
      with_endpoint: withEndpoint,
      /** Registros cuya URL trae un marcador sin sustituir. */
      broken_template: templated,
      /** De esos, cuantos responden al sustituir el marcador por el token. */
      template_resolves: templateResolves,
      distinct_hosts: hosts.size,
      hosts: [...hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([host, count]) => ({ host, count })),
      platform_status: [...statuses.entries()].sort((a, b) => b[1] - a[1])
        .map(([status, count]) => ({ status, count })),
    },
    examples,
  };
}

/**
 * Cadencia. El censo describe una poblacion que cambia despacio, asi que se
 * rehace una vez al dia y no en cada pasada del catalogo.
 *
 * Se decide por el `generated_at` del propio JSON y NO por la fecha del
 * fichero: git no guarda mtimes, asi que `actions/checkout` los reescribe con
 * la hora del momento y cualquier comprobacion sobre el fichero concluiria que
 * el censo es recien hecho — en cada ejecucion, para siempre.
 */
const MAX_AGE_HOURS = Number(process.env.CENSUS_MAX_AGE_HOURS ?? 20);

async function isFresh() {
  if (process.env.CENSUS_FORCE === '1') return false;
  const prev = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => null);
  if (!prev?.generated_at) return false;
  const ageH = (Date.now() - Date.parse(prev.generated_at)) / 3_600_000;
  if (!Number.isFinite(ageH) || ageH >= MAX_AGE_HOURS) return false;
  log(`el censo tiene ${ageH.toFixed(1)} h (limite ${MAX_AGE_HOURS}) — no toca`);
  return true;
}

async function main() {
  if (await isFresh()) return;

  const out = {
    generated_at: new Date().toISOString(),
    method:
      'Population figures are exact, read from the registry index. Everything ' +
      'else is a stratified sample: the index does not paginate reliably past a ' +
      'few thousand offsets, so a full enumeration is not available by this route. ' +
      'Every sampled figure carries its sample size.',
    chains: [],
  };

  for (const chain of CHAINS) out.chains.push(await censusFor(chain));

  // Misma disciplina que la ingesta: no publicar una pasada degradada sobre una
  // buena. Si la muestra sale vacia, es que la API fallaba, no que el ecosistema
  // se haya vaciado.
  const got = out.chains.reduce((n, c) => n + c.sample.size, 0);
  if (!got) {
    const prev = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => null);
    if (prev) {
      log('muestra vacia — se conserva el censo anterior');
      process.exitCode = 1;
      return;
    }
  }

  await mkdir('data', { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  log(`\nescrito -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
