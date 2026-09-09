#!/usr/bin/env node
// SMEAI — el ciclo ERC-8183 COMPLETO, de punta a punta, en BSC Testnet.
//
// QUE PRUEBA ESTO Y POR QUE HACIA FALTA
//
// De los diez trabajos que hemos financiado a vendedores de terceros, ninguno
// recibio entrega. Ese hallazgo se queda: es la medida honesta de un ecosistema
// en el que se puede pagar y casi nadie entrega. Pero deja una pregunta abierta
// que un catalogo no puede responder solo mirando:
//
//   ¿el riel falla, o fallan los vendedores?
//
// La unica forma de separarlo es poner un vendedor que SI aparezca y recorrer
// el ciclo entero: financiado -> entregado -> ventana de disputa -> liquidado ->
// vendedor cobrado. Si eso funciona, entonces el escrow, la policy, el router y
// la liquidacion estan bien, y lo que falta en el mercado son vendedores.
//
// COMO SE RESPETA EL PRINCIPIO DE NO AUTOABASTECERSE
//
// `src/app/api/a2a/route.ts` lo dice sin rodeos: un agente propio dentro del
// flujo de pago seria inventario nuestro, que es justo lo que le criticamos a
// quien llena su marketplace consigo mismo. Ese principio NO se toca, y por eso
// el vendedor de esta demostracion:
//
//   1. NO esta registrado en ERC-8004. No es que se filtre del catalogo: es que
//      `ingest.mjs` lee el registro, y lo que no esta en el registro no puede
//      aparecer aunque alguien se equivoque al filtrar. Imposible por
//      construccion, no por disciplina.
//   2. NO se puede contratar desde la web. Vive aqui, se ejecuta a mano y con
//      --confirm, igual que `mainnet-demo.mjs`.
//   3. NO entra en ninguna estadistica: no es oferta del mercado, es un banco
//      de pruebas del riel.
//
// Los dos lados de este trabajo son nuestros y la pagina lo dice con esas
// palabras. Prueba el riel, no el mercado.
//
// EL TRABAJO ES REAL, NO UN PLACEHOLDER
//
// El deliverable es la respuesta que produce de verdad nuestro monitor de
// health factor sobre `0x0949251a…`, un prestatario real de Venus. Es el mismo
// caso del Agent Advantage Report donde un agente de terceros contesto
// `"positions": []` — la respuesta que hace que te liquiden — mientras la
// lectura directa encontraba 498 $ de liquidez sobrante. Aqui esa respuesta
// correcta se entrega bajo escrow y se cobra por ella.
//
// El dato se lee de MAINNET (56) y el escrow se liquida en TESTNET (97). Se
// dice en el manifiesto, porque no decirlo seria exactamente el fallo que este
// proyecto documenta en los demas.
//
// Uso:
//   node --env-file=.env.local scripts/lifecycle-demo.mjs
//       diagnostica y no gasta nada
//
//   node --env-file=.env.local scripts/lifecycle-demo.mjs --confirm
//       fase 1: financia el trabajo y entrega. Escribe el manifiesto.
//
//   node --env-file=.env.local scripts/lifecycle-demo.mjs --settle <jobId> --confirm
//       fase 2, pasada la ventana: verifica lo servido y liquida.

import { mkdir, writeFile } from 'node:fs/promises';
import {
  BNB_TESTNET,
  ERC8183_ADDRESSES,
  buildHireCalls,
  createClient,
  getErc8183Job,
  settleErc8183Job,
  signerFromPrivateKey,
  submitErc8183Deliverable,
  verifyErc8183ManifestText,
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
import { bscTestnet } from 'viem/chains';

const CHAIN_ID = 97;
const ADDR = ERC8183_ADDRESSES[CHAIN_ID];
const BASE = (process.env.SMEAI_PUBLIC_URL || 'https://smeai-dev.vercel.app').replace(/\/$/, '');

const CONFIRM = process.argv.includes('--confirm');
const SETTLE_AT = process.argv.indexOf('--settle');
const SETTLE_ID = SETTLE_AT === -1 ? null : process.argv[SETTLE_AT + 1];

/**
 * El vendedor. Su clave se deriva igual que la de cualquier agente del
 * producto — misma funcion, misma clave madre — asi que "cada agente tiene su
 * propia clave" sigue siendo cierto tambien del lado que entrega, no solo del
 * que paga.
 *
 * El identificador lleva `lifecycle:` a proposito: nombra lo que es, un banco
 * de pruebas del ciclo, y no se confunde con los agentes del catalogo.
 */
const SELLER_ID = 'lifecycle:seller:health';

/** El prestatario real de Venus sobre el que se hace el trabajo. */
const SUBJECT = '0x0949251a1c62157c9dcC24fA8FF6b373959dea69';

const TASK =
  `Report the Venus health factor for ${SUBJECT} on BSC mainnet: weighted collateral, ` +
  `debt, health factor, and how far collateral can fall before liquidation.`;

/** 0.10 $U — el precio tipico al que cotizan los vendedores reales de esta red. */
const PRICE = 100_000_000_000_000_000n;

/**
 * Lo que se le manda al vendedor para que pueda operar.
 *
 * No es un capricho: el PRIMER `execute` de una wallet registra su clave en el
 * Keystore y esa tarifa se paga en nativo (medida hoy: 0.000666 tBNB). Una
 * wallet a cero no puede entregar, y el error que devuelve no dice eso.
 */
const SELLER_FUNDING = 10_000_000_000_000_000n; // 0.01 tBNB
const SELLER_MIN = 3_000_000_000_000_000n; // 0.003 tBNB

const log = (...a) => console.log(...a);
const bnb = (v) => `${(Number(v) / 1e18).toFixed(9)} tBNB`;
const u = (v) => `${Number(v) / 1e18} $U`;

/** Una sola definicion: las dos fases tienen que mirar exactamente la misma URL. */
const deliverableUrlFor = (jobId) => `${BASE}/deliverable/${jobId}.json`;

function adminKey() {
  const k = process.env.ALTANA_ADMIN_KEY?.trim();
  if (!k) throw new Error('ALTANA_ADMIN_KEY no esta definida (usa --env-file=.env.local)');
  return k.startsWith('0x') ? k : `0x${k}`;
}

/** Misma derivacion que `src/lib/altana.ts`. Determinista: no hay estado que perder. */
function agentKey(id) {
  return keccak256(concatHex([adminKey(), toHex(`smeai:agent:${id}`)]));
}

const pub = createPublicClient({ chain: bscTestnet, transport: http(BNB_TESTNET.publicRpcUrl) });

const uBalance = (address) =>
  pub.readContract({
    address: ADDR.paymentToken,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [address],
  });

/**
 * Pide al agente su respuesta REAL, contra el despliegue publico.
 *
 * Se llama al endpoint desplegado y no a `venusHealth()` en proceso a
 * proposito: lo que se entrega tiene que ser lo que cualquiera obtiene
 * llamando al agente, no lo que sale de una funcion que solo corre aqui.
 */
async function askAgent() {
  const endpoint = `${BASE}/api/a2a`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `lifecycle-${Date.now()}`,
      method: 'message/send',
      params: { message: { parts: [{ kind: 'data', data: { skill: 'health_factor', wallet: SUBJECT } }] } },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json();
  if (body.error) throw new Error(`el agente devolvio error: ${body.error.message}`);

  const parts = body.result?.parts ?? [];
  const verdict = parts.find((p) => p.kind === 'text')?.text;
  const data = parts.find((p) => p.kind === 'data')?.data?.response;
  if (!verdict || !data) throw new Error('el agente contesto con una forma inesperada');

  return { endpoint, verdict, data };
}

// ---------------------------------------------------------------------------
// Fase 2: verificar lo servido y liquidar.
// ---------------------------------------------------------------------------

async function settlePhase() {
  const jobId = BigInt(SETTLE_ID);
  const me = privateKeyToAccount(adminKey()).address;
  const job = await getErc8183Job(BNB_TESTNET, jobId);

  log(`job #${jobId} en BSC Testnet`);
  log(`  estado    : ${job.statusName}`);
  log(`  cliente   : ${job.client}`);
  log(`  proveedor : ${job.provider}`);
  log(`  importe   : ${u(job.budget)}`);

  if (job.client.toLowerCase() !== me.toLowerCase()) {
    throw new Error(`el job #${jobId} no es nuestro — su cliente es ${job.client}`);
  }
  if (job.statusName === 'COMPLETED') {
    log('\n  ya esta liquidado y el vendedor cobro. Nada que hacer.');
    return;
  }
  if (job.statusName !== 'SUBMITTED') {
    throw new Error(`el job esta en ${job.statusName}, no en SUBMITTED. No se liquida a ciegas.`);
  }

  // La ventana se lee de la cadena; contarla a ojo desde el reloj local es
  // como se crean los trabajos que no pueden completarse nunca.
  const disputeWindow = await pub.readContract({
    address: ADDR.policy,
    abi: parseAbi(['function disputeWindow() view returns (uint64)']),
    functionName: 'disputeWindow',
  });
  const opensAt = Number(job.submittedAt) + Number(disputeWindow);
  const now = Math.floor(Date.now() / 1000);
  log(`  entregado : ${new Date(Number(job.submittedAt) * 1000).toISOString()}`);
  log(`  ventana   : ${disputeWindow}s · liquidable desde ${new Date(opensAt * 1000).toISOString()}`);
  if (now < opensAt) {
    log(`\n  aun dentro de la ventana de disputa: faltan ${opensAt - now}s. Liquidar ahora revertiria.`);
    return;
  }

  // Verificar ANTES de pagar. Que el hash no sea cero solo prueba que alguien
  // escribio 32 bytes; que el texto servido los reproduzca prueba la entrega.
  const url = deliverableUrlFor(jobId);
  log(`\n  verificando el manifiesto servido en ${url} ...`);
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`el manifiesto devolvio HTTP ${res.status} — no se liquida sin poder verificar`);
  const text = await res.text();
  const ok = verifyErc8183ManifestText(text, job.deliverable);
  log(`  ${ok ? 'CUADRA' : 'NO CUADRA'} con el hash comprometido en cadena (${job.deliverable.slice(0, 18)}…)`);
  if (!ok) throw new Error('el texto servido no reproduce el hash. No se paga contra un hash inventado.');

  if (!CONFIRM) {
    log('\n--- SIMULACION. Nada escrito. Repite con --confirm para liquidar. ---');
    return;
  }

  const before = await uBalance(job.provider);
  const client = createClient({ chains: [BNB_TESTNET] });
  const signer = signerFromPrivateKey(adminKey());
  const wallet = await client.createWallet({ signer });

  log('\n  liquidando...');
  const settled = await settleErc8183Job(
    wallet,
    signer,
    { jobId, action: 'approve' },
    { network: BNB_TESTNET },
  );
  log(`  tx: ${settled.transactionHash}`);

  // Se relee con reintentos: un nodo publico puede ir un bloque por detras
  // justo despues del recibo y hacer creer que no paso nada.
  let after = null;
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    after = await getErc8183Job(BNB_TESTNET, jobId).catch(() => null);
    if (after && after.statusName === 'COMPLETED') break;
  }
  const paid = (await uBalance(job.provider)) - before;
  log(`\n  estado ahora : ${after?.statusName ?? '(no releido)'}`);
  log(`  cobrado por el vendedor: ${u(paid)}`);

  await persist({
    settle: { tx: settled.transactionHash, status: after?.statusName, paid_raw: paid.toString() },
  });
}

/** Mezcla campos en data/lifecycle-demo.json sin perder lo ya escrito. */
async function persist(patch) {
  const path = 'data/lifecycle-demo.json';
  let current = {};
  try {
    const { readFile } = await import('node:fs/promises');
    current = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // primera ejecucion
  }
  const next = { ...current, ...patch, updated_at: new Date().toISOString() };
  await writeFile(path, JSON.stringify(next, null, 2) + '\n');
  log(`  escrito ${path}`);
}

// ---------------------------------------------------------------------------
// Fase 1: contratar y entregar.
// ---------------------------------------------------------------------------

async function runPhase() {
  const me = privateKeyToAccount(adminKey()).address;
  const sellerSigner = signerFromPrivateKey(agentKey(SELLER_ID));
  const seller = privateKeyToAccount(agentKey(SELLER_ID)).address;

  log(`comprador (tesoreria) : ${me}`);
  log(`vendedor  (agente)    : ${seller}`);
  log(`cadena                : BSC Testnet (97)\n`);

  if (seller.toLowerCase() === me.toLowerCase()) {
    throw new Error('el vendedor y el comprador son la misma direccion; el ciclo no probaria nada');
  }

  const [bal, sellerBal, uBal, whitelisted, disputeWindow] = await Promise.all([
    pub.getBalance({ address: me }),
    pub.getBalance({ address: seller }),
    uBalance(me),
    pub.readContract({
      address: ADDR.router,
      abi: parseAbi(['function policyWhitelist(address) view returns (bool)']),
      functionName: 'policyWhitelist',
      args: [ADDR.policy],
    }),
    pub.readContract({
      address: ADDR.policy,
      abi: parseAbi(['function disputeWindow() view returns (uint64)']),
      functionName: 'disputeWindow',
    }),
  ]);

  log(`saldo comprador   : ${bnb(bal)} · ${u(uBal)}`);
  log(`saldo vendedor    : ${bnb(sellerBal)}`);
  log(`policy whitelisted: ${whitelisted}`);
  log(`ventana de disputa: ${disputeWindow}s (${Number(disputeWindow) / 60} min)`);

  if (!whitelisted) throw new Error('la policy no esta whitelisted en el router; financiar revertiria');
  if (uBal < PRICE) throw new Error(`sin $U suficiente: hacen falta ${u(PRICE)} y hay ${u(uBal)}`);

  log('\npreguntando al agente por su respuesta real...');
  const answer = await askAgent();
  log(`  veredicto: ${answer.verdict.slice(0, 140)}`);

  if (!CONFIRM) {
    log('\n--- SIMULACION. Nada se ha gastado. Anade --confirm para ejecutar. ---');
    return;
  }

  const client = createClient({ chains: [BNB_TESTNET] });
  const signer = signerFromPrivateKey(adminKey());
  const wallet = await client.createWallet({ signer });

  // --- 0. el vendedor necesita nativo para poder entregar --------------------
  if (sellerBal < SELLER_MIN) {
    log(`\n0. el vendedor no tiene nativo para operar; enviando ${bnb(SELLER_FUNDING)}...`);
    const funded = await client.execute({
      wallet,
      signer,
      chainId: CHAIN_ID,
      calls: [{ to: seller, value: SELLER_FUNDING, data: '0x' }],
    });
    log(`   tx: ${funded.transactionHash}`);
  }

  // --- 1. el comprador financia el trabajo ----------------------------------
  log('\n1. financiando el trabajo...');
  const counter = await pub.readContract({
    address: ADDR.commerce,
    abi: parseAbi(['function jobCounter() view returns (uint256)']),
    functionName: 'jobCounter',
  });
  const jobId = counter + 1n;

  // Debe superar ahora + ventana, con margen para el despliegue del manifiesto
  // y para liquidar sin carreras.
  const expiredAt = BigInt(Math.floor(Date.now() / 1000)) + BigInt(disputeWindow) + 5400n;
  const hire = await client.execute({
    wallet,
    signer,
    chainId: CHAIN_ID,
    calls: buildHireCalls({
      addresses: ADDR,
      jobId,
      provider: seller,
      description: TASK,
      budget: PRICE,
      expiredAt,
    }),
  });
  log(`   job #${jobId} financiado · tx ${hire.transactionHash}`);
  log(`   caduca ${new Date(Number(expiredAt) * 1000).toISOString()}`);

  // --- 2. el vendedor entrega ------------------------------------------------
  log('\n2. el vendedor entrega...');
  const deliverableUrl = deliverableUrlFor(jobId);
  const manifest = {
    version: 1,
    job_id: Number(jobId),
    chain_id: CHAIN_ID,
    contracts: { commerce: ADDR.commerce, router: ADDR.router, policy: ADDR.policy },
    response: {
      content: JSON.stringify({ verdict: answer.verdict, health: answer.data }),
      content_type: 'application/json',
    },
    metadata: {
      agent: 'SMEAI Reference Health Factor Monitor',
      endpoint: answer.endpoint,
      task: TASK,
      subject_wallet: SUBJECT,
      // Se dice donde se leyo el dato y donde se liquida el dinero. Un agente
      // que contesta sobre una red distinta de la que dice es exactamente el
      // fallo que medimos en otros; no se documenta callandolo.
      subject_chain_id: 56,
      settlement_chain_id: CHAIN_ID,
      measured_at: new Date().toISOString(),
      disclosure:
        'Both sides of this job are SMEAI: the buyer is the SMEAI treasury and the seller is an ' +
        'SMEAI-operated key. It is not registered in ERC-8004, cannot be hired from the site, and ' +
        'is excluded from every statistic. It exists to prove the ERC-8183 rail completes ' +
        'end to end, not to add supply to the marketplace.',
    },
  };

  // El vendedor firma con SU PROPIA clave: el kernel exige que quien entrega
  // sea el proveedor del trabajo, asi que esto no puede hacerlo la tesoreria.
  const sellerWallet = await client.createWallet({ signer: sellerSigner });
  const submitted = await submitErc8183Deliverable(
    sellerWallet,
    sellerSigner,
    { jobId, manifest, deliverableUrl },
    { network: BNB_TESTNET },
  );
  log(`   entregado · tx ${submitted.transactionHash}`);
  log(`   hash del deliverable: ${submitted.deliverable}`);

  // Los BYTES EXACTOS que se sirven. Re-serializar rompe la verificacion, asi
  // que se guarda el texto tal cual lo devolvio el SDK y se sirve verbatim.
  //
  // Va en `public/` y no detras de una ruta: un fichero estatico se entrega tal
  // cual esta en disco, sin pasar por codigo que pudiera reformatearlo, y sin
  // depender de que el bundler decida incluir un fichero de datos que nadie
  // importa. La verificacion compara bytes; el camino mas corto entre el disco
  // y el comprador es el que menos puede romperla.
  await mkdir('public/deliverable', { recursive: true });
  await writeFile(`public/deliverable/${jobId}.json`, submitted.manifestText);
  log(`   escrito public/deliverable/${jobId}.json (${Buffer.byteLength(submitted.manifestText)} bytes)`);

  const job = await getErc8183Job(BNB_TESTNET, jobId).catch(() => null);
  log(`   estado en cadena: ${job?.statusName ?? '(no leido)'}`);

  await persist({
    generated_at: new Date().toISOString(),
    chain_id: CHAIN_ID,
    explorer: BNB_TESTNET.explorer,
    buyer: me,
    seller,
    commerce: ADDR.commerce,
    job_id: String(jobId),
    price_raw: PRICE.toString(),
    task: TASK,
    subject_wallet: SUBJECT,
    deliverable: submitted.deliverable,
    deliverable_url: deliverableUrl,
    dispute_window_seconds: Number(disputeWindow),
    expired_at: Number(expiredAt),
    hire: { tx: hire.transactionHash },
    submit: { tx: submitted.transactionHash, at: new Date().toISOString() },
    settle: null,
  });

  const openAt = new Date((Math.floor(Date.now() / 1000) + Number(disputeWindow)) * 1000);
  log(`\nHECHO. El trabajo esta SUBMITTED.`);
  log(`Ahora: commit + push para que ${deliverableUrl} sirva el manifiesto,`);
  log(`y pasada la ventana (${openAt.toISOString()}) ejecuta:`);
  log(`  node --env-file=.env.local scripts/lifecycle-demo.mjs --settle ${jobId} --confirm`);
}

const main = SETTLE_ID ? settlePhase : runPhase;
main().catch((err) => {
  console.error('\nFALLO:', err.message);
  process.exitCode = 1;
});
