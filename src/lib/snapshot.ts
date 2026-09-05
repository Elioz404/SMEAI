// Acceso al snapshot. SOLO para componentes de servidor y rutas de API.
//
// Este modulo importa data/snapshot.json (232 KB). Cualquier componente marcado
// con "use client" que importe algo de aqui como valor arrastra ese JSON al
// navegador. Si lo necesitas en cliente, cogelo de `@/lib/taxonomy`.
//
// El snapshot lo produce `scripts/ingest.mjs` y lo refresca un cron de GitHub
// Actions varias veces al dia. Se importa como JSON estatico a proposito: sin
// base de datos y sin servidor encendido, la app no puede caerse durante la
// ventana de judging.

import raw from "../../data/snapshot.json";
import { recentMarks } from "./history";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type Agent,
  type AgentListItem,
  type CategoryKey,
  bestProbe,
  measured,
} from "./taxonomy";

export type {
  Agent,
  AgentListItem,
  CategoryKey,
  Probe,
  Skill,
} from "./taxonomy";
export {
  CATEGORY_META,
  CATEGORY_ORDER,
  bestProbe,
  explorerAddress,
  explorerTx,
  formatEta,
  formatPrice,
  measured,
  measuredItems,
  safeHref,
  since,
} from "./taxonomy";

export type Snapshot = {
  generated_at: string;
  finished_at: string;
  pipeline: { chain: number; raw: number; clean: number; relevant: number }[];
  /** Cifras del registro medidas en cada pasada, nunca escritas a mano. */
  registry: {
    chain_id: number;
    chain_name: string;
    registered: number | null;
    endpoint_verified: number | null;
  }[];
  totals: {
    agents: number;
    live: number;
    hireable: number;
    services_checked: number;
    quotes: number;
    endpoints_probed: number;
    endpoints_blocked: number;
    /** Listados que comparten dueño y backend con otro. */
    cloned: number;
    /** Cuántos grupos distintos de identidades clonadas hay. */
    clusters: number;
    /** Agentes publicados por nosotros. Nunca sumados en el resto de cifras. */
    ours?: number;
  };
  per_category: Record<
    CategoryKey,
    { total: number; live: number; hireable: number; ours?: number }
  >;
  agents: Agent[];
};

/** Atajo: las cifras de mainnet, que son las que abren la portada. */
export function mainnetRegistry() {
  return (
    snapshot.registry.find((r) => r.chain_id === 56) ?? {
      chain_id: 56,
      chain_name: "BSC Mainnet",
      registered: null,
      endpoint_verified: null,
    }
  );
}

export const snapshot = raw as unknown as Snapshot;

export function toListItem(a: Agent): AgentListItem {
  const p = bestProbe(a);
  const status: AgentListItem["status"] = !p
    ? "none"
    : p.valid_card
      ? "live"
      : p.ok
        ? "partial"
        : p.blocked
          ? "blocked"
          : "dead";
  const svc: AgentListItem["service"] = a.hireable
    ? "hireable"
    : a.service?.requires_auth
      ? "auth"
      : a.service?.throttled
        ? "throttled"
        : a.service
          ? "down"
          : "unknown";

  return {
    id: a.agent_id,
    chain: a.chain_id,
    token: a.token_id,
    name: a.name,
    description: a.description,
    testnet: a.is_testnet,
    status,
    service: svc,
    latency: p?.ok ? p.latency_ms : null,
    score: a.trust_score,
    categories: a.categories,
    checkedAt: p?.checked_at ?? a.probes[0]?.checked_at ?? snapshot.finished_at,
    price: a.service?.quote?.price ?? null,
    currency: a.service?.quote?.currency ?? null,
    etaSeconds: a.service?.quote?.eta_seconds ?? null,
    clusterSize: a.cluster?.size,
    ours: a.is_ours === true,
    history: recentMarks(a.agent_id),
  };
}

export function agentsIn(category: CategoryKey): Agent[] {
  return snapshot.agents
    .filter((a) => a.categories.includes(category))
    .sort((a, b) => b.trust_score - a.trust_score);
}

export function findAgent(chainId: number, tokenId: string): Agent | undefined {
  return snapshot.agents.find(
    (a) => a.chain_id === chainId && a.token_id === tokenId,
  );
}

/**
 * Conteos por categoria para la navegacion lateral.
 *
 * Sobre `measured`: la nav afirma cuanta oferta hay en cada categoria, asi que
 * los agentes propios no entran. Si entraran, la barra lateral contradiria a
 * los totales del propio snapshot.
 */
export function navCounts() {
  return CATEGORY_ORDER.map((key) => {
    const all = measured(snapshot.agents).filter((a) => a.categories.includes(key));
    return {
      key,
      label: CATEGORY_META[key].label,
      short: CATEGORY_META[key].short,
      accent: CATEGORY_META[key].accent,
      total: all.length,
      live: all.filter((a) => a.live).length,
      hireable: all.filter((a) => a.hireable).length,
    };
  });
}
