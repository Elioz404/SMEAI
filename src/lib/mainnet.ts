// La demostracion en BSC Mainnet, leida del registro que dejo el script.
//
// SOLO SERVIDOR, como el resto de lectores de datos.
//
// Lo escribe `scripts/mainnet-demo.mjs`, que se ejecuta A MANO y una sola vez.
// La web MUESTRA esto; no puede volver a ejecutarlo. `src/lib/altana.ts` fija
// `CHAIN_ID = 97` como constante sin variable de entorno, asi que ninguna
// peticion HTTP puede gastar fondos reales por muy mal configurado que este el
// despliegue. Esa es la diferencia entre una demostracion registrada y un boton
// que cualquiera puede pulsar durante dos semanas con nuestro dinero.

import "server-only";
import raw from "../../data/mainnet-demo.json";

export type MainnetStep = {
  step: "grant" | "hire" | "revoke";
  tx: string;
  publicKey?: string;
  jobId?: string;
  status?: string;
  expired_at?: number;
  dispute_window?: number;
};

export type MainnetDemo = {
  generated_at: string;
  chain_id: number;
  explorer: string;
  treasury: string;
  keystore: string;
  commerce: string;
  provider: string;
  policy: { allowlist: string[]; expiry: number };
  steps: MainnetStep[];
  spent_wei: string;
};

export const mainnetDemo = raw as MainnetDemo;

/** El paso de contratacion, que es el que lleva el trabajo. */
export function hireStep(): MainnetStep | undefined {
  return mainnetDemo.steps.find((s) => s.step === "hire");
}

/** BNB gastado, con seis decimales. */
export function spentBnb(): string {
  try {
    return (Number(BigInt(mainnetDemo.spent_wei)) / 1e18).toFixed(6);
  } catch {
    return "0";
  }
}

/** Etiquetas legibles de cada paso, en el orden en que ocurrieron. */
export const STEP_LABEL: Record<MainnetStep["step"], string> = {
  grant: "Session granted to the agent's own key",
  hire: "ERC-8183 job funded in escrow",
  revoke: "Session revoked",
};

/**
 * El explorador de claves de Altana, que es donde el jurado mira.
 *
 * Observa el REGISTRO DE CLAVES, no los trabajos: ahi se ven las concesiones y
 * las revocaciones, pero no el job ERC-8183, que vive en el kernel y se lee en
 * el explorador de la cadena. Conviene decirlo para que nadie busque el trabajo
 * donde no esta.
 */
export const ALTANA_EXPLORER = {
  mainnet: `https://explorer.altana.network/account/${mainnetDemo.treasury}`,
  testnet: `https://testnet.altana.network/account/${mainnetDemo.treasury}`,
} as const;
