// Trabajos ERC-8183 que hemos financiado, leidos del kernel.
//
// SOLO SERVIDOR, como snapshot.ts: importa un JSON que no debe viajar entero al
// navegador. Los componentes reciben ya la vista que necesitan.
//
// Lo produce `scripts/jobs.mjs` y lo refresca GitHub Actions junto al snapshot.

import "server-only";
import raw from "../../data/jobs.json";
import { snapshot } from "./snapshot";

export type Job = {
  id: string;
  provider: string;
  description: string;
  /** Importe en unidades crudas de $U (18 decimales). */
  budget: string;
  status: "OPEN" | "FUNDED" | "SUBMITTED" | "COMPLETED" | "REJECTED" | "EXPIRED";
  expired_at: number;
  submitted_at: number;
  delivered: boolean;
};

export type Jobs = {
  generated_at: string;
  chain_id: number;
  treasury: string;
  commerce: string;
  payment_token: string;
  explorer: string;
  counter: string;
  totals: {
    jobs: number;
    funded: number;
    submitted: number;
    completed: number;
    rejected: number;
    expired: number;
    delivered: number;
    reclaimable: number;
    escrowed_raw: string;
    paid_raw: string;
  };
  jobs: Job[];
};

export const jobs = raw as Jobs;

/** Un trabajo con el agente al que se le pago, si sigue en el catalogo. */
export type JobWithAgent = Job & {
  agent: { id: string; name: string; chain: number; token: string } | null;
  /** Vencido, financiado y sin entrega: el escrow se puede recuperar. */
  reclaimable: boolean;
};

/**
 * Cruza cada trabajo con su agente por la direccion del proveedor.
 *
 * El cruce se hace aqui y no en el script a proposito: `data/jobs.json` guarda
 * solo hechos de la cadena, que no caducan. Que un proveedor siga en el
 * catalogo depende del snapshot, que cambia cada 30 minutos.
 */
export function jobsWithAgents(): JobWithAgent[] {
  const byAddress = new Map<string, (typeof snapshot.agents)[number]>();
  for (const a of snapshot.agents) {
    for (const addr of [a.agent_wallet, a.owner_address]) {
      if (addr) byAddress.set(addr.toLowerCase(), a);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  return jobs.jobs.map((j) => {
    const a = byAddress.get(j.provider.toLowerCase());
    return {
      ...j,
      agent: a
        ? { id: a.agent_id, name: a.name, chain: a.chain_id, token: a.token_id }
        : null,
      reclaimable:
        j.status === "FUNDED" && !j.delivered && j.expired_at < now,
    };
  });
}

/** Cuantos proveedores distintos han cobrado. */
export function distinctProviders(): number {
  return new Set(jobs.jobs.map((j) => j.provider.toLowerCase())).size;
}

/** Importe en $U con dos decimales, desde unidades crudas. */
export function formatU(raw: string): string {
  try {
    return (Number(BigInt(raw)) / 1e18).toFixed(2);
  } catch {
    return "0.00";
  }
}
