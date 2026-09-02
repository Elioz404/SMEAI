#!/usr/bin/env node
// Historial de disponibilidad por agente.
//
// Cada pasada del ingest deja una marca por agente. Con eso, una ficha deja de
// decir "responde ahora" y pasa a decir "respondio 38 de las ultimas 40
// comprobaciones, y se cayo ayer a las 15:00" — que es la diferencia entre un
// conteo y una decision informada.
//
// El formato es una cadena por agente, un caracter por comprobacion:
//
//   h  contratable   (card valida + servicio que responde)
//   c  solo card     (sirve agent-card pero el servicio no)
//   d  caido         (declara endpoint publico y no contesta)
//   b  inalcanzable  (loopback o red privada: nunca fue contratable)
//   -  ausente       (no estaba en el catalogo en esa pasada)
//
// Una cadena de 500 caracteres son 500 bytes por agente. Para 113 agentes y una
// semana de historial a 48 pasadas diarias, el fichero entero pesa menos que
// una sola foto de un agente.
//
// Uso:
//   node scripts/history.mjs           anade la pasada actual al historial
//   node scripts/history.mjs --backfill  reconstruye desde el historial de git

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const FILE = 'data/history.json';
const SNAPSHOT = 'data/snapshot.json';
/** Tope de comprobaciones guardadas. A 48/dia son ~10 dias. */
export const MAX_CHECKS = 500;

/** Marca de un agente en una pasada concreta. */
export function markOf(agent) {
  if (agent.hireable) return 'h';
  if (agent.live) return 'c';
  if (agent.probes?.every((p) => p.blocked)) return 'b';
  return 'd';
}

async function load() {
  return readFile(FILE, 'utf8')
    .then((t) => JSON.parse(t))
    .catch(() => ({ checks: [], agents: {} }));
}

/**
 * Anade un snapshot al historial. Los agentes que no aparecen en esa pasada
 * reciben '-', para que todas las cadenas queden alineadas y el caracter N de
 * cualquier agente corresponda siempre a la comprobacion N.
 */
export function append(history, snapshot) {
  const at = snapshot.finished_at ?? snapshot.generated_at;
  if (history.checks.includes(at)) return history; // ya registrada

  history.checks.push(at);
  const n = history.checks.length;
  const present = new Set();

  for (const a of snapshot.agents) {
    present.add(a.agent_id);
    const prev = history.agents[a.agent_id] ?? '';
    // Rellena con '-' los huecos de las pasadas en que no estuvo.
    history.agents[a.agent_id] = prev.padEnd(n - 1, '-') + markOf(a);
  }
  for (const id of Object.keys(history.agents)) {
    if (!present.has(id)) history.agents[id] = history.agents[id].padEnd(n, '-');
  }

  // Poda por el principio cuando se pasa del tope.
  if (history.checks.length > MAX_CHECKS) {
    const drop = history.checks.length - MAX_CHECKS;
    history.checks = history.checks.slice(drop);
    for (const id of Object.keys(history.agents)) {
      history.agents[id] = history.agents[id].slice(drop);
    }
  }
  return history;
}

async function backfill() {
  // Los snapshots ya commiteados son historial real que seria absurdo tirar.
  const log = execFileSync(
    'git',
    ['log', '--reverse', '--format=%H', '--', SNAPSHOT],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);

  console.log(`reconstruyendo desde ${log.length} commits de ${SNAPSHOT}`);
  let history = { checks: [], agents: {} };
  for (const sha of log) {
    let snap;
    try {
      snap = JSON.parse(
        execFileSync('git', ['show', `${sha}:${SNAPSHOT}`], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        }),
      );
    } catch {
      continue;
    }
    if (!snap?.agents?.length) continue;
    const before = history.checks.length;
    history = append(history, snap);
    if (history.checks.length > before) {
      console.log(`  ${snap.finished_at ?? snap.generated_at}  ${snap.agents.length} agentes`);
    }
  }
  return history;
}

async function main() {
  const history = process.argv.includes('--backfill')
    ? await backfill()
    : append(await load(), JSON.parse(await readFile(SNAPSHOT, 'utf8')));

  await writeFile(FILE, JSON.stringify(history));

  const strings = Object.values(history.agents);
  const chars = strings.reduce((n, s) => n + s.length, 0);
  console.log(`\ncomprobaciones registradas: ${history.checks.length}`);
  console.log(`agentes con historial      : ${strings.length}`);
  console.log(`tamano                     : ${Math.round(chars / 1024)} KB de marcas`);
  console.log(`escrito -> ${FILE}`);
}

// pathToFileURL en vez de construir la URL a mano: en Windows argv[1] llega
// como C:\... y la comparacion textual no coincidia nunca, asi que el script
// terminaba sin hacer nada y sin decirlo.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
