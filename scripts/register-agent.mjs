#!/usr/bin/env node
// Registra en ERC-8004 el agente de referencia que publicamos nosotros.
//
// QUE ES ESTE AGENTE Y POR QUE SE REGISTRA
//
// Health Factor es la categoria mas delgada del ecosistema y su suministro
// cuelga de un unico agente de terceros estable. La evaluacion dura dos
// semanas sin que podamos intervenir: si ese agente cae, la categoria se queda
// sin nada que activar. Este es el suelo.
//
// Se registra en la MAINNET porque lee posiciones de Venus en mainnet. Un
// agente registrado en testnet que responde sobre mainnet es exactamente la
// confusion contra la que avisa nuestra propia pagina de scope.
//
// Y no entra en ninguna cifra: `scripts/ingest.mjs` marca `is_ours` por DUEÑO
// y lo excluye de totales, categorias y embudo. Se ve, se etiqueta, no suma.
//
// Uso:
//   node scripts/register-agent.mjs            # comprueba, no gasta
//   node scripts/register-agent.mjs --confirm  # registra de verdad

import {
  BNB,
  createClient,
  encodeErc8004AgentUri,
  registerErc8004Agent,
  setErc8004AgentUri,
  signerFromPrivateKey,
  withErc8004Registration,
} from '@altananetwork/sdk';
import { ERC8183_ADDRESSES } from '@altananetwork/sdk';
import { createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const CHAIN_ID = 56;
const CONFIRM = process.argv.includes('--confirm');

// La URL publica del agente. Se pasa por entorno para no fijar un despliegue
// concreto en el codigo: lo que se escribe en la cadena es permanente y
// apuntar al sitio equivocado no se corrige, se vuelve a registrar.
const BASE = process.env.SMEAI_PUBLIC_URL || 'https://smeai-dev.vercel.app';
const ENDPOINT = `${BASE.replace(/\/$/, '')}/api/a2a`;

const log = (...a) => console.log(...a);

function adminKey() {
  const k = process.env.ALTANA_ADMIN_KEY?.trim();
  if (!k) throw new Error('ALTANA_ADMIN_KEY no esta definida');
  return k.startsWith('0x') ? k : `0x${k}`;
}

/** El registro que se publica. Sin `registrations` todavia: el id lo asigna el mint. */
function record() {
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'SMEAI Reference Health Factor Monitor',
    description:
      "Reads a wallet's Venus position on BSC mainnet and returns its real health factor — weighted collateral over debt, priced by the Venus oracle. Published by SMEAI as a free reference implementation so the health-factor category always has something that answers. Excluded from every statistic SMEAI publishes.",
    services: [{ name: 'A2A', endpoint: ENDPOINT, version: '0.2.0' }],
    registrations: [],
  };
}

async function main() {
  const me = privateKeyToAccount(adminKey()).address;
  const pub = createPublicClient({ chain: bsc, transport: http(BNB.publicRpcUrl) });
  const balance = await pub.getBalance({ address: me });

  log(`cuenta   : ${me}`);
  log(`cadena   : BSC Mainnet (56)`);
  log(`registro : ${ERC8183_ADDRESSES[CHAIN_ID].registry}`);
  log(`endpoint : ${ENDPOINT}`);
  log(`saldo    : ${Number(balance) / 1e18} BNB\n`);

  // El endpoint tiene que responder ANTES de escribirlo en la cadena. Un
  // registro que apunta a una URL muerta es exactamente lo que este proyecto
  // documenta como el defecto mas comun del registro.
  const probe = await fetch(ENDPOINT, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  const card = probe?.ok ? await probe.json().catch(() => null) : null;
  if (!card?.name) {
    throw new Error(
      `el endpoint no sirve una agent card valida (${probe?.status ?? 'sin respuesta'}). ` +
        'Despliega antes de registrar, o ajusta SMEAI_PUBLIC_URL.',
    );
  }
  log(`la card responde: "${card.name}" con skills [${(card.skills ?? []).map((s) => s.id).join(', ')}]`);

  // Dos transacciones: el mint y el parcheo del id en la URI. Se pide margen
  // para las dos, medido en la demo de mainnet (~0.00056 BNB por operacion).
  const needed = 1_400_000_000_000_000n;
  if (balance < needed) {
    throw new Error(
      `saldo insuficiente: hacen falta ~${Number(needed) / 1e18} BNB para dos transacciones y hay ${Number(balance) / 1e18}`,
    );
  }

  if (!CONFIRM) {
    log('\n--- SIMULACION. Nada escrito en la cadena. Anade --confirm para registrar. ---');
    return;
  }

  const client = createClient({ chains: [BNB] });
  const signer = signerFromPrivateKey(adminKey());
  const wallet = await client.createWallet({ signer });
  // `ExecuteOptions` pide la NetworkConfig resuelta, no un chainId: el atajo de
  // pasar `{ chainId }` funciona en los metodos del cliente pero no en estas
  // funciones sueltas, que no tienen cliente que lo resuelva por ellas.
  const opts = { network: BNB };

  log('\n1. acunando la identidad...');
  const minted = await registerErc8004Agent(
    wallet,
    signer,
    { agentUri: encodeErc8004AgentUri(record()) },
    opts,
  );
  log(`   agentId ${minted.agentId} · tx ${minted.transactionHash}`);

  // Fase 2: el registro se vuelve auto-verificable cuando contiene su propio
  // id y el contrato que lo emitio. Sin esto, cualquiera podria publicar un
  // registro que dice ser otro agente.
  log('\n2. parcheando el id en el registro...');
  const complete = withErc8004Registration(record(), minted.agentId, CHAIN_ID);
  const patched = await setErc8004AgentUri(
    wallet,
    signer,
    { agentId: minted.agentId, agentUri: encodeErc8004AgentUri(complete) },
    opts,
  );
  log(`   tx ${patched.transactionHash}`);

  const after = await pub.getBalance({ address: me });
  log(`\ngastado: ${Number(balance - after) / 1e18} BNB`);
  log(`\nAgente registrado. Añade a la ingesta:`);
  log(`  SMEAI_OWNER_ADDRESS=${me}`);
  log('para que quede marcado como nuestro y excluido de todas las cifras.');
}

main().catch((err) => {
  console.error('\nFALLO:', err.message);
  process.exit(1);
});
