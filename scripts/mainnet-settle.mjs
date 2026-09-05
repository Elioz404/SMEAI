#!/usr/bin/env node
// Cierra un trabajo ERC-8183 de BSC MAINNET: liquida o recupera, segun toque.
//
// POR QUE ESTE SCRIPT DECIDE Y NO EL OPERADOR
//
// Un trabajo se cierra de dos maneras OPUESTAS y ejecutar la equivocada es
// caro de explicar:
//
//   - el vendedor entrego  -> `settle` libera el escrow HACIA EL. Reclamar
//                             aqui seria quedarse con un trabajo hecho.
//   - el vendedor callo    -> `claim refund` devuelve el dinero al comprador,
//                             y solo despues de `expiredAt`.
//
// Asi que el estado se lee de la cadena y la accion se deriva de el. No se
// elige a mano. Sin --confirm no se escribe nada.
//
// QUE CUENTA COMO ENTREGA
//
// Que `deliverable` no sea 32 bytes de ceros solo prueba que alguien escribio
// 32 bytes. El hash es un compromiso con un texto concreto, asi que la entrega
// se comprueba de verdad: se localiza la URL del manifiesto en el evento del
// submit, se descarga y se rehashea. Si no cuadra, no se liquida. Pagar contra
// un hash inventado seria exactamente el fallo que este proyecto documenta en
// los demas.
//
// Uso:
//   node scripts/mainnet-settle.mjs 56693            # diagnostica, no gasta
//   node scripts/mainnet-settle.mjs 56693 --confirm  # ejecuta lo que toque

import {
  BNB,
  buildClaimRefundCall,
  createClient,
  getErc8183DeliverableUrl,
  getErc8183Job,
  settleErc8183Job,
  signerFromPrivateKey,
  verifyErc8183ManifestText,
} from '@altananetwork/sdk';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import { checkUrl, readCapped } from '../src/lib/net-guard.mjs';

const CHAIN_ID = 56;
const CONFIRM = process.argv.includes('--confirm');
const JOB_ID = process.argv.slice(2).find((a) => /^\d+$/.test(a));

// Un manifiesto es JSON pequeno. El tope existe porque la URL la elige el
// VENDEDOR: sin el, un cuerpo de gigabytes tumba el script desde fuera.
const MAX_MANIFEST_BYTES = 65536;

const log = (...a) => console.log(...a);

function adminKey() {
  const k = process.env.ALTANA_ADMIN_KEY?.trim();
  if (!k) throw new Error('ALTANA_ADMIN_KEY no esta definida');
  return k.startsWith('0x') ? k : `0x${k}`;
}

/**
 * Comprueba que la entrega registrada existe y corresponde al hash.
 *
 * Nunca lanza: un vendedor que no publica nada, o que publica basura, no es un
 * error del script — es justamente el resultado que hay que reportar.
 */
async function inspectDelivery(jobId, deliverable) {
  let url;
  try {
    // Rastrea el evento del policy en ventanas acotadas; puede tardar.
    url = await getErc8183DeliverableUrl(BNB, jobId);
  } catch (err) {
    return { verified: false, why: 'fallo al rastrear el evento: ' + String(err.message).slice(0, 120) };
  }
  if (!url) return { verified: false, why: 'el submit no publico ninguna URL de manifiesto' };

  // La URL viene de un tercero: mismas defensas que en la ingesta.
  const safe = await checkUrl(url);
  if (!safe.ok) return { verified: false, url, why: 'URL no alcanzable de forma segura: ' + safe.reason };

  let res;
  try {
    res = await fetch(safe.url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  } catch (err) {
    return { verified: false, url, why: 'no se pudo descargar: ' + String(err.message).slice(0, 120) };
  }
  if (!res.ok) return { verified: false, url, why: 'el manifiesto devolvio HTTP ' + res.status };

  const text = await readCapped(res, MAX_MANIFEST_BYTES + 1);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > MAX_MANIFEST_BYTES) {
    return { verified: false, url, bytes, why: 'el manifiesto supera ' + MAX_MANIFEST_BYTES + ' bytes' };
  }

  // Se hashea el texto CRUDO, sin recanonicalizar: la cadena se comprometio con
  // unos bytes exactos, no con un JSON equivalente.
  const verified = verifyErc8183ManifestText(text, deliverable);
  return {
    verified,
    url,
    bytes,
    why: verified
      ? 'el manifiesto cuadra con el hash comprometido'
      : 'el manifiesto NO cuadra con el hash comprometido',
  };
}

async function main() {
  if (!JOB_ID) throw new Error('falta el jobId. Uso: node scripts/mainnet-settle.mjs 56693 [--confirm]');

  const jobId = BigInt(JOB_ID);
  const me = privateKeyToAccount(adminKey()).address;
  const pub = createPublicClient({ chain: bsc, transport: http(BNB.publicRpcUrl) });
  const job = await getErc8183Job(BNB, jobId);

  // Que el trabajo sea NUESTRO, antes que ninguna otra cosa. Sin esto, un id
  // mal tecleado apunta al trabajo de un desconocido: la cadena lo rechazaria,
  // pero el script no deberia llegar a proponerlo.
  if (job.client.toLowerCase() !== me.toLowerCase()) {
    throw new Error(
      `el job #${JOB_ID} no es nuestro — su cliente es ${job.client}, no ${me}. No se toca.`,
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const expiredAt = Number(job.expiredAt);
  const expired = expiredAt < now;
  // `submittedAt` es lo que el propio SDK usa para saber si hubo submit; el
  // hash solo dice que se escribieron 32 bytes.
  const submitted = job.submittedAt !== 0n;

  log(`job #${JOB_ID} en BSC Mainnet`);
  log(`  estado    : ${job.statusName}`);
  log(`  importe   : ${Number(job.budget) / 1e18} $U`);
  log(`  proveedor : ${job.provider}`);
  log(
    `  submit    : ${
      submitted
        ? new Date(Number(job.submittedAt) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
        : 'no'
    }`,
  );
  log(
    `  caduca    : ${new Date(expiredAt * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` +
      ` (${expired ? 'ya vencio' : `faltan ${((expiredAt - now) / 3600).toFixed(1)} h`})`,
  );

  // La accion se DERIVA del estado; no se elige. Los seis estados del kernel
  // estan cubiertos, y el `default` existe porque el enum puede crecer sin que
  // este script se entere: ante un estado desconocido no se actua.
  let action = null;
  let why = '';

  switch (job.statusName) {
    case 'COMPLETED':
      why = 'ya esta liquidado: el vendedor cobro. No hay nada que hacer.';
      break;

    case 'EXPIRED':
      why = 'ya esta cerrado y el escrow devuelto. No hay nada que hacer.';
      break;

    case 'REJECTED':
      // Un rechazado conserva su `deliverable`, asi que mirar solo el hash
      // llevaria a proponer `settle` sobre un trabajo que el evaluador ya
      // tumbo. Es el caso que este script tiene que reconocer y NO tocar.
      why =
        'el evaluador RECHAZO la entrega. Liquidar pagaria un trabajo rechazado, ' +
        'y que hacer con el escrow no es una decision que este script deba tomar solo. ' +
        'Se para aqui y se revisa a mano.';
      break;

    case 'OPEN':
      why = 'el trabajo existe pero no llego a financiarse: no hay escrow que reclamar.';
      break;

    case 'SUBMITTED': {
      log('\n  hay una entrega registrada; verificandola...');
      const d = await inspectDelivery(jobId, job.deliverable);
      log(`  manifiesto: ${d.url ?? '(sin URL)'}`);
      log(`  resultado : ${d.why}${d.bytes !== undefined ? ` (${d.bytes} bytes)` : ''}`);
      if (d.verified) {
        action = 'settle';
        why = 'la entrega existe y cuadra con el hash: corresponde LIQUIDAR y que cobre.';
      } else {
        why =
          'hay submit pero la entrega NO se ha podido verificar. No se liquida a ciegas. ' +
          (expired
            ? 'El plazo ya vencio, pero reclamar sobre un submit registrado tampoco es automatico: revisar a mano.'
            : 'Aun queda plazo.');
      }
      break;
    }

    case 'FUNDED':
      if (!expired) {
        why = `sigue en plazo y sin entrega. Reclamar antes de ${new Date(expiredAt * 1000).toISOString()} revertiria.`;
      } else {
        action = 'reclaim';
        why = 'vencio sin entrega: corresponde RECUPERAR el escrow.';
      }
      break;

    default:
      why = `estado no reconocido (${job.statusName}). No se actua sobre lo que no se entiende.`;
  }

  log(`\n  -> ${why}`);

  if (!action) return;
  if (!CONFIRM) {
    log(`\n--- SIMULACION. Nada escrito. Repite con --confirm para ejecutar "${action}". ---`);
    return;
  }

  const client = createClient({ chains: [BNB] });
  const signer = signerFromPrivateKey(adminKey());
  const wallet = await client.createWallet({ signer });
  const before = await pub.getBalance({ address: me });

  let tx;
  if (action === 'settle') {
    const res = await settleErc8183Job(wallet, signer, { jobId, action: 'approve' }, { network: BNB });
    tx = res.transactionHash;
  } else {
    // Igual que en testnet, la recuperacion va por la via admin: es un acto del
    // comprador sobre su propio dinero, no autoridad delegada al vendedor.
    const res = await client.execute({
      wallet,
      signer,
      calls: [buildClaimRefundCall(CHAIN_ID, jobId)],
      chainId: CHAIN_ID,
    });
    tx = res.transactionHash;
  }
  log(`\n  ${action} enviado · tx ${tx}`);

  // El estado se relee con reintentos: un nodo publico puede ir un bloque por
  // detras justo despues del recibo y hacer creer que no paso nada.
  let after = null;
  let changed = false;
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    after = await getErc8183Job(BNB, jobId).catch(() => null);
    if (after && after.statusName !== job.statusName) {
      changed = true;
      break;
    }
  }
  log(
    changed
      ? `  estado ahora: ${after.statusName} (era ${job.statusName})`
      : `  estado ahora: sigue en ${after?.statusName ?? '(no releido)'} tras 18s — reconsulta en un minuto`,
  );
  const spent = before - (await pub.getBalance({ address: me }));
  log(`  gastado: ${Number(spent) / 1e18} BNB`);
}

main().catch((err) => {
  console.error('\nFALLO:', err.message);
  // `exitCode` y no `exit()`: cortar el proceso con peticiones RPC en vuelo
  // hace que libuv aborte con una asercion en Windows, y el dia que este
  // script importe de verdad no conviene que su fallo salga acompanado de un
  // volcado que parece otro problema distinto.
  process.exitCode = 1;
});
