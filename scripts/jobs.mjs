#!/usr/bin/env node
// SMEAI — estado en cadena de los trabajos ERC-8183 que hemos financiado.
//
// Por que existe: contratar deja un rastro que nadie recoge. El kernel guarda
// cada trabajo, pero el jobId solo vive en la respuesta HTTP de la contratacion
// y se pierde. Sin esto no podemos responder a la pregunta que decide si un
// marketplace sirve: de lo que se pago, cuanto se entrego.
//
// La respuesta medida hoy es cero, y ese es el hallazgo. Los agentes aceptan el
// trabajo, el dinero queda en escrow y nadie entrega. Se ve desde el lado del
// comprador y sobre agentes que no controlamos.
//
// Salida: data/jobs.json — lo consume la web, lo versiona GitHub Actions.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { BNB_TESTNET, ERC8183_ADDRESSES, getErc8183Job } from '@altananetwork/sdk';
import { createPublicClient, http, parseAbi } from 'viem';
import { bscTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CHAIN_ID = 97;
const ADDR = ERC8183_ADDRESSES[CHAIN_ID];
const OUT = 'data/jobs.json';

// Cuantos ids mirar hacia atras desde el contador global buscando trabajos
// nuestros que aun no conozcamos. Los que ya conocemos se releen siempre, asi
// que la ventana solo tiene que cubrir lo creado desde la ultima pasada.
const SCAN_WINDOW = BigInt(process.env.JOBS_SCAN_WINDOW ?? 300);
const CONCURRENCY = 6;

const log = (...a) => console.log(...a);

/**
 * Direccion del comprador, por orden de preferencia.
 *
 * Este script solo LEE la cadena, asi que nunca necesita capacidad de firma. La
 * clave privada aparece aqui unicamente porque de ella se deriva la direccion, y
 * meter una clave de tesoreria en CI para calcular un dato publico seria un
 * riesgo gratuito. Por eso, en cuanto existe un jobs.json, la direccion se toma
 * de ahi: la primera generacion es local y las siguientes no necesitan secreto
 * alguno.
 */
function treasury(prev) {
  const explicit = process.env.ALTANA_TREASURY_ADDRESS?.trim();
  if (explicit && /^0x[0-9a-fA-F]{40}$/.test(explicit)) return explicit;

  const k = process.env.ALTANA_ADMIN_KEY?.trim();
  if (k) return privateKeyToAccount(k.startsWith('0x') ? k : `0x${k}`).address;

  return prev?.treasury ?? null;
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        try {
          const r = await fn(item);
          if (r) out.push(r);
        } catch {
          // Un id ilegible no invalida la pasada: puede ser un hueco del
          // kernel o un fallo puntual del RPC publico.
        }
      }
    }),
  );
  return out;
}

async function previous() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const prev = await previous();
  const me = treasury(prev);

  // Sin clave no se puede saber que trabajos son nuestros. Se conserva lo que
  // ya hubiera: perder el historial por una variable ausente seria peor que no
  // actualizarlo.
  if (!me) {
    log(`sin direccion de tesoreria (ALTANA_TREASURY_ADDRESS, ALTANA_ADMIN_KEY o un ${OUT} previo) — no se toca nada`);
    return;
  }

  const pub = createPublicClient({ chain: bscTestnet, transport: http() });
  const counter = await pub.readContract({
    address: ADDR.commerce,
    abi: parseAbi(['function jobCounter() view returns (uint256)']),
    functionName: 'jobCounter',
  });

  const from = counter > SCAN_WINDOW ? counter - SCAN_WINDOW : 1n;
  const ids = new Set();
  for (let id = from; id <= counter; id++) ids.add(String(id));
  // Los ya conocidos se releen aunque hayan quedado fuera de la ventana: su
  // estado cambia cuando el vendedor entrega o cuando reclamamos el escrow.
  for (const j of prev?.jobs ?? []) ids.add(j.id);

  log(`contador ${counter} · ventana ${from}..${counter} · conocidos ${prev?.jobs?.length ?? 0}`);

  const mine = me.toLowerCase();
  const found = await pool([...ids], CONCURRENCY, async (id) => {
    const j = await getErc8183Job(BNB_TESTNET, BigInt(id));
    if (j.client.toLowerCase() !== mine) return null;
    return {
      id: String(j.id),
      provider: j.provider,
      description: j.description.slice(0, 300),
      budget: j.budget.toString(),
      status: j.statusName,
      expired_at: Number(j.expiredAt),
      submitted_at: Number(j.submittedAt),
      /** 32 bytes a cero mientras el vendedor no entregue. */
      delivered: !/^0x0{64}$/.test(j.deliverable),
    };
  });

  found.sort((a, b) => Number(b.id) - Number(a.id));

  const now = Math.floor(Date.now() / 1000);
  const by = (s) => found.filter((j) => j.status === s).length;
  const sum = (list) => list.reduce((t, j) => t + BigInt(j.budget), 0n).toString();
  const escrowed = found.filter((j) => j.status === 'FUNDED' || j.status === 'SUBMITTED');
  const reclaimable = found.filter(
    (j) => j.status === 'FUNDED' && !j.delivered && j.expired_at < now,
  );

  const out = {
    generated_at: new Date().toISOString(),
    chain_id: CHAIN_ID,
    treasury: me,
    commerce: ADDR.commerce,
    payment_token: ADDR.paymentToken,
    explorer: BNB_TESTNET.explorer,
    counter: String(counter),
    totals: {
      jobs: found.length,
      funded: by('FUNDED'),
      submitted: by('SUBMITTED'),
      completed: by('COMPLETED'),
      rejected: by('REJECTED'),
      expired: by('EXPIRED'),
      /** Trabajos con entrega del vendedor. Es la cifra que importa. */
      delivered: found.filter((j) => j.delivered).length,
      reclaimable: reclaimable.length,
      escrowed_raw: sum(escrowed),
      paid_raw: sum(found),
    },
    jobs: found,
  };

  // Si una pasada no encuentra nada y antes habia trabajos, es un fallo de RPC
  // y no que el kernel los haya olvidado. Mismo criterio que en la ingesta: no
  // se publica una version degradada sobre una buena.
  if (!found.length && prev?.jobs?.length) {
    log(`0 trabajos leidos pero habia ${prev.jobs.length} — se conserva el anterior`);
    process.exitCode = 1;
    return;
  }

  await mkdir('data', { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  log(
    `${found.length} trabajos · ${out.totals.delivered} entregados · ` +
      `${out.totals.reclaimable} reclamables · ${Number(out.totals.escrowed_raw) / 1e18} $U en escrow`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
