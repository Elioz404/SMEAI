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
  buildHireCalls,
  createClient,
  signerFromPrivateKey,
  type Session,
  type Wallet,
} from "@altananetwork/sdk";
import {
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { bscTestnet } from "viem/chains";

const CHAIN_ID = 97;
const ADDR = ERC8183_ADDRESSES[CHAIN_ID];

/** Faucet de $U en testnet: 10 $U por reclamo, 30 min de espera. */
const U_FAUCET: Address = "0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3";

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
    calls: [
      { to: ADDR.commerce, signature: "" }, // escrow de trabajos
      { to: ADDR.router, signature: "" }, // EvaluatorRouter
      { to: ADDR.policy, signature: "" }, // política optimista de disputa
      { to: ADDR.paymentToken, signature: "" }, // $U
    ],
    spend: [
      // El precio del trabajo, en $U. Ni un token mas.
      { limit: budget, period: "day" as const, token: ADDR.paymentToken },
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
  policy: {
    allowlist: Address[];
    capRaw: string;
    capToken: Address;
    expiry: number;
  };
};

/** Sesiones vivas de este proceso. Se pierde en frío; revocar no depende de esto. */
const liveSessions = new Map<string, Session>();

export async function grant(budget: bigint): Promise<GrantResult> {
  const { client, wallet, signer } = await getWallet();
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const permissions = sessionPolicy(budget);

  // register: true deja la clave en el Keystore público, que es lo que permite
  // a cualquiera verificar su autoridad sin preguntarnos a nosotros.
  const session = await client.grantSession({
    wallet,
    signer,
    permissions,
    expiry,
    register: true,
  });

  liveSessions.set(session.publicKey, session);

  return {
    publicKey: session.publicKey,
    expiry,
    transactionHash: session.transactionHash,
    walletAddress: wallet.address,
    policy: {
      allowlist: [ADDR.commerce, ADDR.router, ADDR.policy, ADDR.paymentToken],
      capRaw: budget.toString(),
      capToken: ADDR.paymentToken,
      expiry,
    },
  };
}

export type HireResult = { jobId: string; transactionHash?: Hex };

export async function hire(opts: {
  publicKey: Hex;
  provider: Address;
  task: string;
  budget: bigint;
}): Promise<HireResult> {
  const { client } = await getWallet();
  const session = liveSessions.get(opts.publicKey);
  if (!session) {
    throw new Error(
      "session not held by this instance — grant a new one (serverless instances do not share memory)",
    );
  }
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
  liveSessions.delete(publicKey);
  return { transactionHash: (res as { transactionHash?: Hex }).transactionHash };
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
