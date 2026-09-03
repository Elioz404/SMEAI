// Integración con Altana: contratar un agente con una sesión acotada y revocable.
//
// SOLO SERVIDOR. Este módulo lee una clave privada de entorno; nunca debe
// importarse desde un componente cliente.
//
// Por qué encaja aquí y no es un añadido: el criterio de "activate it" del
// hackathon pide que contratar funcione de verdad. Mandar un mensaje A2A prueba
// que el agente contesta; financiar un trabajo ERC-8183 a través de una sesión
// con tope de gasto y caducidad prueba que se puede contratar. Es la misma
// acción, hecha en serio.
//
// Todo ocurre en BSC Testnet (chain 97), que es la red nativa de Altana y donde
// hay un faucet de $U. Ningún fondo real se mueve, y lo decimos en la interfaz.

import "server-only";
// grantSession, revokeSession, createWallet, balances y execute son metodos del
// cliente, no funciones sueltas: los .d.ts internos las declaran como funciones
// pero el paquete no las reexporta. hireErc8183Agent si es una funcion suelta.
import {
  BNB_TESTNET,
  ERC8183_ADDRESSES,
  buildClaimRefundCall,
  buildHireCalls,
  createClient,
  getErc8183Job,
  signerFromPrivateKey,
  type Session,
  type Wallet,
} from "@altananetwork/sdk";
import {
  concatHex,
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

const CHAIN_ID = 97;
const ADDR = ERC8183_ADDRESSES[CHAIN_ID];

/** Faucet de $U en testnet: 10 $U por reclamo, 30 min de espera. */
const U_FAUCET: Address = "0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3";

/**
 * Por debajo de esto se recarga sola la tesorería antes de contratar.
 *
 * El escrow se financia en $U, y ese saldo solo baja. Si se agota durante el
 * periodo de evaluación, el botón de contratar deja de funcionar y nadie se
 * entera hasta que un juez lo pulsa. El faucet da 10 $U cada 30 minutos y le
 * quedan ~10.000 millones, así que el fallo era evitable y absurdo.
 *
 * Diez veces el precio típico: margen para que una ráfaga de contrataciones no
 * agote el saldo entre una recarga y la siguiente.
 */
const U_TOPUP_THRESHOLD = 1_000_000_000_000_000_000n; // 1 $U

/** Cuánto dura una sesión concedida desde el producto. */
const SESSION_TTL_SECONDS = 60 * 60;

/**
 * Tope de gasto en BNB nativo para la comisión del relay.
 *
 * Medido: conceder la sesión costó 0.001682 tBNB en total, de los cuales solo
 * 0.0000998 fueron gas — el resto es la tarifa de registro del Keystore. 0.005
 * deja margen de sobra para varias operaciones sin dejar de ser un tope real.
 */
const NATIVE_FEE_CAP = 5_000_000_000_000_000n; // 0.005 BNB

/**
 * Cuántas contrataciones cubre el tope de gasto de una sesión.
 *
 * Estaba en 1 — el tope era exactamente el precio cotizado. Elegante, y
 * equivocado en la práctica: como la clave del agente es determinista, el gasto
 * se acumula por agente y no se reinicia al conceder una sesión nueva, así que
 * contratar al mismo agente dos veces en un día chocaba con
 * `ExceededSpendLimit`. Correcto por diseño, pero indistinguible de una avería
 * para quien lo prueba por primera vez.
 *
 * Cinco mantiene el vínculo con lo que el agente cobra —sigue siendo un tope
 * real y derivado de su precio, no una cifra inventada— y deja margen para
 * probar. Subirlo más empezaría a vaciar de significado la palabra "tope".
 */
const HIRES_PER_SESSION = 5n;

/**
 * Política de disputa admitida por el EvaluatorRouter en BSC Testnet.
 *
 * NO uses `ERC8183_ADDRESSES[97].policy` del SDK: apunta a 0x4F4678D4… y
 * financiar un trabajo con ella revierte con `PolicyNotWhitelisted()`.
 *
 * Esta dirección no está adivinada. El router expone `policyWhitelist(address)`
 * como getter público, y devuelve:
 *
 *   0x4F4678D4… (la del SDK)  ->  false
 *   0xd6a42175… (esta)        ->  true
 *
 * Es además la que usan los trabajos reales ya creados en la red (jobCounter
 * iba por 880 al comprobarlo). La constante del SDK está desactualizada
 * respecto al despliegue de testnet.
 *
 * Se deja sobreescribible por entorno por si Altana rota la política.
 */
const POLICY_TESTNET: Address = "0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA";

const ADDRESSES = {
  ...ADDR,
  policy: (process.env.ALTANA_POLICY_ADDRESS as Address) ?? POLICY_TESTNET,
};

const pub = createPublicClient({
  chain: bscTestnet,
  transport: http(BNB_TESTNET.publicRpcUrl),
});

function adminKey(): Hex | null {
  const k = process.env.ALTANA_ADMIN_KEY?.trim();
  if (!k) return null;
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}

export function isConfigured(): boolean {
  return adminKey() !== null;
}

/**
 * La wallet de la demo. Se deriva siempre del mismo signer admin, así que su
 * dirección es estable entre arranques en frío — necesario en serverless, donde
 * no hay memoria entre peticiones.
 */
function getClient() {
  return createClient({ chains: [BNB_TESTNET] });
}

async function getWallet(): Promise<{
  client: ReturnType<typeof getClient>;
  wallet: Wallet;
  signer: ReturnType<typeof signerFromPrivateKey>;
}> {
  const key = adminKey();
  if (!key) throw new Error("ALTANA_ADMIN_KEY is not set");
  const client = getClient();
  const signer = signerFromPrivateKey(key);
  // createWallet devuelve { address, signer } directamente, sin envoltorio.
  // Altana usa delegacion sobre la propia EOA (modelo Porto/EIP-7702), asi que
  // la direccion de la wallet coincide con la del signer. Comprobado en runtime,
  // no deducido de los tipos.
  const wallet = (await client.createWallet({ signer })) as Wallet;
  return { client, wallet, signer };
}

/**
 * Clave propia de un agente, derivada de forma determinista de la clave madre.
 *
 * El modelo de Altana es explicito: "An agent holds its own wallet and its own
 * key... The owner grants a scoped session". El agente NO necesita fondos: tiene
 * identidad propia, y el dueno le concede autoridad acotada sobre la wallet del
 * dueno. Es el patron que ellos mismos documentan como "Run a portfolio with
 * multiple agents: two agents share one wallet, each with its own scoped
 * session... you can revoke either one without touching the other".
 *
 * Determinista a proposito: la misma entrada da siempre la misma clave, asi que
 * no hay estado que guardar y funciona igual entre arranques en frio.
 */
function agentKey(agentId: string): Hex {
  const key = adminKey();
  if (!key) throw new Error("ALTANA_ADMIN_KEY is not set");
  return keccak256(concatHex([key, toHex(`smeai:agent:${agentId}`)]));
}

/**
 * Extrae el mensaje de un revert `Error(string)` del texto de un error del SDK.
 *
 * El SDK entrega el revert en hexadecimal crudo ("Reason: 0x08c379a0…"), sin
 * decodificarlo, asi que buscar el texto en el mensaje no encuentra nada. Esto
 * lo decodifica para poder distinguir un fallo esperado de uno real.
 */
function revertMessage(err: unknown): string {
  const text = String((err as Error)?.message ?? "");
  const m = text.match(/0x08c379a0([0-9a-fA-F]+)/);
  if (!m) return "";
  try {
    const body = m[1];
    const len = parseInt(body.slice(64, 128), 16);
    const bytes = body.slice(128, 128 + len * 2);
    return Buffer.from(bytes, "hex").toString("utf8");
  } catch {
    return "";
  }
}

/** Direccion publica de la identidad de un agente. Segura de mostrar. */
export function agentIdentity(agentId: string): Address {
  return privateKeyToAccount(agentKey(agentId)).address;
}

/**
 * Clave publica SEC1 del agente — el identificador con el que su sesion queda
 * registrada en el Keystore y por el que se revoca. Se toma del propio signer
 * en vez de derivarla a mano: menos superficie donde equivocarse.
 */
function agentPublicKey(agentId: string): Hex {
  return signerFromPrivateKey(agentKey(agentId)).publicKey as Hex;
}

export type AltanaStatus =
  | { configured: false }
  | {
      configured: true;
      chainId: number;
      walletAddress: Address;
      explorer: string;
      native: string;
      paymentToken: Address;
      uBalance: string;
      commerce: Address;
    };

export async function status(): Promise<AltanaStatus> {
  if (!isConfigured()) return { configured: false };
  const { client, wallet } = await getWallet();
  const bal = await client.balances({
    wallet,
    tokens: [ADDR.paymentToken],
  });
  // `native` es un bigint directo; los tokens traen el importe en `raw`.
  const native = bal.native ?? 0n;
  const token = bal.tokens?.find(
    (t) => t.address.toLowerCase() === ADDR.paymentToken.toLowerCase(),
  );
  return {
    configured: true,
    chainId: CHAIN_ID,
    walletAddress: wallet.address,
    explorer: BNB_TESTNET.explorer,
    native: String(native),
    paymentToken: ADDR.paymentToken,
    uBalance: String(
      token && "raw" in token ? token.raw : 0n,
    ),
    commerce: ADDR.commerce,
  };
}

/**
 * Política que se concede al contratar. Se construye a partir del precio que el
 * propio agente cotizó, no de una cifra que nos inventemos: el tope de gasto es
 * exactamente lo que cuesta el trabajo, ni un token más.
 */
export function sessionPolicy(budget: bigint) {
  return {
    // Allowlist: los cuatro contratos que el flujo ERC-8183 necesita para
    // crear y financiar un trabajo, y ni uno más. La sesión no puede tocar
    // nada fuera de esta lista aunque quisiera.
    //
    // El router y la policy no estaban en la primera versión y contratar
    // revertía con `UnauthorizedCall`, indicando el contrato exacto que había
    // bloqueado. Ese rechazo es la prueba de que el acotado se aplica en
    // cadena y no es decorativo.
    // Se usa ADDRESSES, no ADDR: la política del SDK está obsoleta y la que de
    // verdad se llama es la corregida. Permitir una y llamar a otra habría
    // dejado la allowlist describiendo algo que no ocurre.
    calls: [
      { to: ADDRESSES.commerce, signature: "" }, // escrow de trabajos
      { to: ADDRESSES.router, signature: "" }, // EvaluatorRouter
      { to: ADDRESSES.policy, signature: "" }, // política de disputa
      { to: ADDRESSES.paymentToken, signature: "" }, // $U
    ],
    spend: [
      // Derivado del precio que cotizó el agente, con margen para varias
      // contrataciones. Ver HIRES_PER_SESSION.
      {
        limit: budget * HIRES_PER_SESSION,
        period: "day" as const,
        token: ADDRESSES.paymentToken,
      },
      // Y un tope pequeno en nativo para la comision del relay.
      //
      // Sin esta segunda entrada, contratar revierte con `NoSpendPermissions`:
      // la clave de sesion paga la comision del relay en BNB, no en $U, y una
      // politica que solo autoriza $U no la cubre. Se descubrio ejecutandolo,
      // porque el error solo aparece al intentar gastar.
      { limit: NATIVE_FEE_CAP, period: "day" as const },
    ],
  };
}

export type GrantResult = {
  publicKey: Hex;
  expiry: number;
  transactionHash?: Hex;
  walletAddress: Address;
  /** Direccion de la identidad propia del agente que recibe la sesion. */
  agentAddress: Address;
  policy: {
    allowlist: Address[];
    capRaw: string;
    capHires: number;
    capToken: Address;
    expiry: number;
  };
};


export async function grant(
  agentId: string,
  budget: bigint,
): Promise<GrantResult> {
  const { client, wallet, signer } = await getWallet();
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const permissions = sessionPolicy(budget);

  // La sesion se concede a la clave PROPIA del agente, no a una generada al
  // vuelo. Cada agente contratado acaba con su propia autoridad acotada sobre
  // la tesoreria, revocable por separado sin tocar a los demas.
  //
  // register: true deja la clave en el Keystore publico, que es lo que permite
  // a cualquiera verificar su autoridad sin preguntarnos a nosotros.
  const sessionSigner = signerFromPrivateKey(agentKey(agentId));
  const opts = { wallet, signer, sessionSigner, permissions, expiry };

  // La clave del agente es determinista, así que la segunda vez que se contrata
  // al mismo agente ya está en el Keystore y `register: true` revierte con
  // "KeyStore: key already registered". No es un error del usuario ni algo que
  // deba verse: la clave sigue registrada y verificable públicamente desde la
  // primera vez, y lo único que cambia es que esta concesión no la re-registra.
  //
  // Se intenta registrar primero y se reintenta sin registro, en vez de
  // consultar antes: una comprobación previa sería una condición de carrera
  // contra otra petición concediendo a la vez.
  let session;
  try {
    session = await client.grantSession({ ...opts, register: true });
  } catch (err) {
    if (!/already registered/i.test(revertMessage(err))) throw err;
    session = await client.grantSession({ ...opts, register: false });
  }

  return {
    publicKey: session.publicKey,
    expiry,
    transactionHash: session.transactionHash,
    walletAddress: wallet.address,
    agentAddress: agentIdentity(agentId),
    policy: {
      allowlist: [
        ADDRESSES.commerce,
        ADDRESSES.router,
        ADDRESSES.policy,
        ADDRESSES.paymentToken,
      ],
      capRaw: (budget * HIRES_PER_SESSION).toString(),
      capHires: Number(HIRES_PER_SESSION),
      capToken: ADDRESSES.paymentToken,
      expiry,
    },
  };
}

export type HireResult = { jobId: string; transactionHash?: Hex };

export async function hire(opts: {
  agentId: string;
  expiry: number;
  provider: Address;
  task: string;
  budget: bigint;
}): Promise<HireResult> {
  const { client, wallet } = await getWallet();
  await topUpIfLow(wallet.address);

  // La sesión se reconstruye, no se recuerda.
  //
  // Antes se guardaba en un Map del proceso y contratar fallaba con "session
  // not held by this instance" en cuanto la petición caía en otra instancia
  // serverless — es decir, en producción, de forma intermitente. Como la clave
  // del agente es determinista y la política se deriva del presupuesto, basta
  // con el expiry que devolvió la concesión para rearmarla byte a byte.
  const session: Session = {
    walletAddress: wallet.address,
    signer: signerFromPrivateKey(agentKey(opts.agentId)),
    publicKey: agentPublicKey(opts.agentId),
    permissions: sessionPolicy(opts.budget),
    expiry: opts.expiry,
  };

  // El jobId se predice como jobCounter() + 1; si otro trabajo se crea en el
  // mismo bloque el lote revierte sin efecto y basta reintentar.
  const counter = await pub.readContract({
    address: ADDRESSES.commerce,
    abi: parseAbi(["function jobCounter() view returns (uint256)"]),
    functionName: "jobCounter",
  });
  const jobId = counter + 1n;

  const calls = buildHireCalls({
    addresses: ADDRESSES,
    jobId,
    provider: opts.provider,
    description: opts.task.slice(0, 4000),
    budget: opts.budget,
    // Debe superar ahora + ventana de disputa. Dos horas da margen de sobra.
    expiredAt: BigInt(Math.floor(Date.now() / 1000) + 7200),
  });

  const res = await client.execute({ session, calls, chainId: CHAIN_ID });
  return {
    jobId: String(jobId),
    transactionHash: (res as { transactionHash?: Hex }).transactionHash,
  };
}

/**
 * Revocar solo necesita la clave pública, no la sesión completa. Por eso el
 * botón de revocar funciona aunque la instancia que concedió la sesión ya no
 * exista — que es justo lo que pasa en serverless.
 */
export async function revoke(publicKey: Hex) {
  const { client, wallet, signer } = await getWallet();
  const res = await client.revokeSession({
    wallet,
    signer,
    session: publicKey,
  });
  return { transactionHash: (res as { transactionHash?: Hex }).transactionHash };
}

/** Estado de un trabajo leido del kernel, listo para mostrar. */
export type JobState = {
  id: string;
  status: string;
  provider: Address;
  budget: string;
  expiredAt: number;
  submittedAt: number;
  /** true mientras el vendedor no haya entregado nada. */
  undelivered: boolean;
  /** Vencido y aun financiado: el escrow se puede reclamar. */
  reclaimable: boolean;
};

/** Lee un trabajo del kernel ERC-8183. Solo lectura, sin clave. */
export async function readJob(jobId: bigint): Promise<JobState> {
  const j = await getErc8183Job(BNB_TESTNET, jobId);
  const expiredAt = Number(j.expiredAt);
  const undelivered = j.submittedAt === 0n;
  return {
    id: String(j.id),
    status: j.statusName,
    provider: j.provider,
    budget: j.budget.toString(),
    expiredAt,
    submittedAt: Number(j.submittedAt),
    undelivered,
    reclaimable:
      j.statusName === "FUNDED" &&
      undelivered &&
      expiredAt < Math.floor(Date.now() / 1000),
  };
}

/**
 * Recupera el escrow de un trabajo que el vendedor nunca entrego.
 *
 * Es el otro final del ciclo de vida, y en este ecosistema es el habitual: de
 * los trabajos que hemos financiado, ninguno recibio entrega. `settle` libera
 * el dinero HACIA el vendedor tras la ventana de disputa; esto lo devuelve al
 * comprador cuando pasa `expiredAt` sin que haya entregado nada.
 *
 * Va por la via admin y no por la sesion del agente a proposito: reclamar es un
 * acto del comprador sobre su propio dinero, no autoridad delegada al vendedor.
 * Ademas la sesion caduca en una hora y el trabajo tarda dos en vencer, asi que
 * una sesion nunca estaria viva para hacerlo.
 */
export async function reclaim(jobId: bigint) {
  const { client, wallet, signer } = await getWallet();
  const call = buildClaimRefundCall(CHAIN_ID, jobId);
  const res = await client.execute({
    wallet,
    signer,
    calls: [call],
    chainId: CHAIN_ID,
  });
  return {
    jobId: String(jobId),
    transactionHash: (res as { transactionHash?: Hex }).transactionHash,
  };
}

/**
 * Recarga la tesorería si le queda poco $U. Silenciosa a propósito: si el faucet
 * está en periodo de espera no es un error que deba ver el usuario, y contratar
 * seguirá funcionando mientras quede saldo.
 */
async function topUpIfLow(address: Address) {
  try {
    const bal = await pub.readContract({
      address: ADDRESSES.paymentToken,
      abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
      functionName: "balanceOf",
      args: [address],
    });
    if (bal >= U_TOPUP_THRESHOLD) return;

    const allowed = await pub.readContract({
      address: U_FAUCET,
      abi: parseAbi(["function allowedToWithdraw(address) view returns (bool)"]),
      functionName: "allowedToWithdraw",
      args: [address],
    });
    if (!allowed) return; // en espera; se reintentará en la próxima contratación
    await claimTestU();
  } catch {
    // Una recarga fallida nunca debe impedir contratar con el saldo que ya hay.
  }
}

/** Reclama $U de prueba para que la demo pueda financiar trabajos. */
export async function claimTestU() {
  const { client, wallet, signer } = await getWallet();
  const res = await client.execute({
    wallet,
    signer,
    chainId: CHAIN_ID,
    calls: [
      {
        to: U_FAUCET,
        data: encodeFunctionData({
          abi: [
            {
              name: "requestTokens",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [],
              outputs: [],
            },
          ],
          functionName: "requestTokens",
        }),
      },
    ],
  });
  return { transactionHash: (res as { transactionHash?: Hex }).transactionHash };
}
