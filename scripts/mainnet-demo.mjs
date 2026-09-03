#!/usr/bin/env node
// SMEAI — demostracion en BSC MAINNET, ejecutada a mano y una sola vez.
//
// POR QUE ESTO ES UN SCRIPT Y NO UNA RUTA DE LA WEB
//
// `src/lib/altana.ts` fija `CHAIN_ID = 97` como constante, sin variable de
// entorno que lo cambie. Eso no es un descuido: es la garantia de que la web
// publica no puede gastar fondos reales. Si el flujo de contratar en mainnet
// estuviera detras de un boton, cada visitante que probara un agente distinto
// costaria la tarifa de registro del Keystore mas el $U del trabajo, y durante
// las dos semanas de evaluacion eso es un gasto abierto y sin techo.
//
// Asi que mainnet se toca desde aqui, a mano, con --confirm, y el resultado se
// guarda en data/mainnet-demo.json para que la web MUESTRE los hashes sin
// poder volver a ejecutarlos. Una transaccion en cadena es permanente: hecha
// una vez, sigue siendo verificable durante el judging y despues.
//
// Uso:
//   node scripts/mainnet-demo.mjs            # solo comprueba, no gasta
//   node scripts/mainnet-demo.mjs --confirm  # ejecuta y gasta de verdad

import { writeFile, mkdir } from 'node:fs/promises';
import {
  BNB,
  ERC8183_ADDRESSES,
  buildHireCalls,
  createClient,
  getErc8183Job,
  signerFromPrivateKey,
} from '@altananetwork/sdk';
import {
  concatHex,
  createPublicClient,
  http,
  keccak256,
  parseAbi,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const CHAIN_ID = 56;
const ADDR = ERC8183_ADDRESSES[CHAIN_ID];
const OUT = 'data/mainnet-demo.json';
const CONFIRM = process.argv.includes('--confirm');

// El agente al que se contrata. Es de terceros y cotiza por ERC-8183: se
// comprobo que su `negotiate` acepta y devuelve 0.10 $U.
const PROVIDER = '0x73809f69916fcf7ddc5bb1315fbdf96a569a5963';
const AGENT_ID = 'mainnet-demo:brainonbnb';
const TASK = 'Report the current state of the position or market you cover, and recommend an action.';

const SESSION_TTL_SECONDS = 60 * 60;
const HIRES_PER_SESSION = 5n;
const NATIVE_FEE_CAP = 5_000_000_000_000_000n; // 0.005 BNB

const log = (...a) => console.log(...a);
const bnb = (v) => `${(Number(v) / 1e18).toFixed(9)} BNB`;

function adminKey() {
  const k = process.env.ALTANA_ADMIN_KEY?.trim();
  if (!k) throw new Error('ALTANA_ADMIN_KEY no esta definida');
  return k.startsWith('0x') ? k : `0x${k}`;
}

/** Clave propia del agente, derivada de la madre. Igual que en testnet. */
function agentKey(id) {
  return keccak256(concatHex([adminKey(), toHex(`smeai:agent:${id}`)]));
}

function sessionPolicy(budget) {
  return {
    calls: [
      { to: ADDR.commerce, signature: '' },
      { to: ADDR.router, signature: '' },
      { to: ADDR.policy, signature: '' },
      { to: ADDR.paymentToken, signature: '' },
    ],
    spend: [
      { limit: budget * HIRES_PER_SESSION, period: 'day', token: ADDR.paymentToken },
      { limit: NATIVE_FEE_CAP, period: 'day' },
    ],
  };
}

const pub = createPublicClient({ chain: bsc, transport: http(BNB.publicRpcUrl) });

async function main() {
  const me = privateKeyToAccount(adminKey()).address;
  log(`tesoro   : ${me}`);
  log(`cadena   : BSC Mainnet (56)\n`);

  // --- Comprobaciones antes de gastar nada -------------------------------
  const [balance, fee, u, whitelisted] = await Promise.all([
    pub.getBalance({ address: me }),
    pub.readContract({
      address: BNB.keyStoreController,
      abi: parseAbi(['function getRegistrationFeeInWei() view returns (uint256)']),
      functionName: 'getRegistrationFeeInWei',
    }),
    pub.readContract({
      address: ADDR.paymentToken,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [me],
    }),
    pub.readContract({
      address: ADDR.router,
      abi: parseAbi(['function policyWhitelist(address) view returns (bool)']),
      functionName: 'policyWhitelist',
      args: [ADDR.policy],
    }),
  ]);

  log(`saldo BNB          : ${bnb(balance)}`);
  log(`tarifa de registro : ${bnb(fee)}`);
  log(`saldo $U           : ${Number(u) / 1e18}`);
  log(`policy whitelisted : ${whitelisted}`);

  if (!whitelisted) throw new Error('la policy del SDK no esta whitelisted en el router de mainnet');

  // Margen: la tarifa mas holgura para el gas de conceder y revocar.
  const needed = fee + 200_000_000_000_000n;
  if (balance < needed) {
    throw new Error(`saldo insuficiente: hacen falta ~${bnb(needed)} y hay ${bnb(balance)}`);
  }

  // El trabajo solo se financia si hay $U. Sin el, la demo se queda en la
  // sesion — que ya es un artefacto real en el Keystore de mainnet — y se dice
  // asi, en vez de fingir un ciclo que no ocurrio.
  const price = 100_000_000_000_000_000n; // 0.10 $U, lo que cotiza el agente
  const canHire = u >= price;
  log(canHire
    ? `\nhay $U: la demo incluira un trabajo ERC-8183 financiado`
    : `\nsin $U: la demo se queda en conceder y revocar sesion`);

  if (!CONFIRM) {
    log('\n--- SIMULACION. Nada se ha gastado. Anade --confirm para ejecutar. ---');
    return;
  }

  // --- Ejecucion ----------------------------------------------------------
  const client = createClient({ chains: [BNB] });
  const signer = signerFromPrivateKey(adminKey());
  const wallet = await client.createWallet({ signer });
  const sessionSigner = signerFromPrivateKey(agentKey(AGENT_ID));
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const permissions = sessionPolicy(price);

  const result = {
    generated_at: new Date().toISOString(),
    chain_id: CHAIN_ID,
    explorer: BNB.explorer,
    treasury: me,
    keystore: BNB.keyStore,
    commerce: ADDR.commerce,
    provider: PROVIDER,
    policy: { allowlist: permissions.calls.map((c) => c.to), expiry },
    steps: [],
  };

  log('\n1. concediendo sesion acotada...');
  let session;
  try {
    session = await client.grantSession({ wallet, signer, sessionSigner, permissions, expiry, register: true });
  } catch (err) {
    // Misma tolerancia que en testnet: la clave es determinista, asi que en una
    // segunda ejecucion ya esta registrada y re-registrarla revierte.
    if (!/already registered/i.test(String(err?.message ?? ''))) throw err;
    log('   (la clave ya estaba en el Keystore; se concede sin re-registrar)');
    session = await client.grantSession({ wallet, signer, sessionSigner, permissions, expiry, register: false });
  }
  log(`   tx: ${session.transactionHash}`);
  result.steps.push({ step: 'grant', tx: session.transactionHash, publicKey: session.publicKey });

  if (canHire) {
    log('\n2. financiando trabajo ERC-8183...');
    const counter = await pub.readContract({
      address: ADDR.commerce,
      abi: parseAbi(['function jobCounter() view returns (uint256)']),
      functionName: 'jobCounter',
    });
    const jobId = counter + 1n;

    // La caducidad se DERIVA de la politica, no se fija a ojo.
    //
    // En testnet la ventana de disputa son 900s y un `ahora + 7200` valia. En
    // mainnet son 604.800s — SIETE DIAS — y ese mismo 7200 habria creado un
    // trabajo cuya caducidad cae dentro de la ventana, es decir, uno que no
    // puede completarse nunca. Es la clase de trabajo roto que se ve a miles
    // en el kernel de mainnet, y se evita leyendo el contrato en vez de
    // copiar una constante que funcionaba en otra red.
    const disputeWindow = await pub.readContract({
      address: ADDR.policy,
      abi: parseAbi(['function disputeWindow() view returns (uint64)']),
      functionName: 'disputeWindow',
    });
    const expiredAt = BigInt(Math.floor(Date.now() / 1000)) + BigInt(disputeWindow) + 1800n;
    log(`   ventana de disputa: ${disputeWindow}s · caduca en ${new Date(Number(expiredAt) * 1000).toISOString()}`);

    const calls = buildHireCalls({
      addresses: ADDR,
      jobId,
      provider: PROVIDER,
      description: TASK,
      budget: price,
      expiredAt,
    });
    const hire = await client.execute({ session, calls, chainId: CHAIN_ID });
    log(`   job ${jobId} · tx: ${hire.transactionHash}`);
    result.steps.push({ step: 'hire', jobId: String(jobId), tx: hire.transactionHash, expired_at: Number(expiredAt), dispute_window: Number(disputeWindow) });

    const job = await getErc8183Job(BNB, jobId).catch(() => null);
    if (job) log(`   estado en cadena: ${job.statusName}`);
    if (job) result.steps.at(-1).status = job.statusName;
  }

  log('\n3. revocando la sesion...');
  const rev = await client.revokeSession({ wallet, signer, session: session.publicKey });
  log(`   tx: ${rev.transactionHash}`);
  result.steps.push({ step: 'revoke', tx: rev.transactionHash });

  const after = await pub.getBalance({ address: me });
  result.spent_wei = String(balance - after);
  log(`\ngastado: ${bnb(balance - after)}`);

  await mkdir('data', { recursive: true });
  await writeFile(OUT, JSON.stringify(result, null, 2));
  log(`escrito -> ${OUT}`);
}

main().catch((err) => {
  console.error('\nFALLO:', err.message);
  process.exit(1);
});
