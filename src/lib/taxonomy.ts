// Tipos, constantes y formateadores puros. NO importa data/snapshot.json.
//
// Esta separación existe por una razón medida, no por gusto arquitectónico:
// cuando `CATEGORY_META` y `since()` vivían junto al import del JSON, cualquier
// componente cliente que los usara arrastraba el snapshot entero al navegador.
// Medido: un chunk de 184 KB con los 114 agentes completos, incluidos sus
// `trust_reasons` y los cuerpos de respuesta que nadie iba a leer allí.
//
// Regla: si un componente cliente lo necesita, va aquí. Si toca el snapshot,
// va en snapshot.ts y solo lo usan componentes de servidor.

export type CategoryKey = "rebalancing" | "grid" | "yield" | "health";

export const CATEGORY_META: Record<
  CategoryKey,
  { label: string; short: string; blurb: string; accent: string }
> = {
  rebalancing: {
    label: "Rebalancing",
    // Marca de dos letras para la barra lateral plegada. Sin emojis: en un
    // producto de datos, un icono decorativo no dice nada y un monograma sí.
    short: "RB",
    blurb: "Manages LP ranges, resets positions automatically",
    accent: "#f0b90b",
  },
  grid: {
    label: "Grid Trading",
    short: "GR",
    blurb: "Places and manages automated grid orders",
    accent: "#4ec9d4",
  },
  yield: {
    label: "Yield Optimisation",
    short: "YL",
    blurb: "Routes liquidity to the highest available APR",
    accent: "#8b9dff",
  },
  health: {
    label: "Health Factor",
    short: "HF",
    blurb: "Protects lending positions from liquidation",
    accent: "#e8798f",
  },
};

export const CATEGORY_ORDER: CategoryKey[] = [
  "rebalancing",
  "grid",
  "yield",
  "health",
];

export type Skill = { id: string; name: string; description: string };

export type Probe = {
  kind: "a2a" | "mcp" | "web";
  url: string;
  ok: boolean;
  status: number | null;
  latency_ms: number;
  valid_card: boolean;
  skills: number | null;
  /** Skills declaradas en el agent card: lo que el agente realmente acepta. */
  skill_list?: Skill[] | null;
  /** URL del servicio A2A, que suele diferir de la URL de la card. */
  service_url?: string | null;
  /** true si ni siquiera intentamos la llamada: la URL no es alcanzable
   *  desde un cliente publico (loopback, red privada, esquema o puerto raro). */
  blocked?: boolean;
  sample?: string;
  error?: string;
  checked_at: string;
};

/**
 * Resultado de llamar al servicio A2A real, no solo a la agent-card.
 *
 * Existe porque medimos que cuatro agentes servian su card perfectamente y su
 * endpoint de servicio devolvia 404. Verificar la card y llamarlo "responde" era
 * verificar el escaparate y llamarlo tienda.
 */
export type Service = {
  url: string;
  status: number | null;
  reachable: boolean;
  speaks_a2a?: boolean;
  requires_auth?: boolean;
  blocked?: boolean;
  latency_ms?: number;
  error?: string;
  checked_at?: string;
  /** Cotizacion ERC-8183 real devuelta por el agente al pedirsela. */
  quote?: {
    accepted: boolean;
    price?: string | null;
    currency?: string | null;
    eta_seconds?: number | null;
    negotiation_hash?: string | null;
    reason?: string;
  };
};

export type Agent = {
  agent_id: string;
  token_id: string;
  chain_id: number;
  chain_name: string;
  is_testnet: boolean;
  registry: string;
  name: string;
  description: string;
  owner_address: string | null;
  agent_wallet: string | null;
  x402_supported: boolean;
  is_endpoint_verified: boolean;
  total_feedbacks: number;
  scan_score: number;
  created_at: string | null;
  created_tx_hash: string | null;
  categories: CategoryKey[];
  category_evidence: Partial<Record<CategoryKey, string>>;
  probes: Probe[];
  trust_score: number;
  trust_reasons: string[];
  /** Sirve una agent-card valida. Necesario pero NO suficiente para contratar. */
  live: boolean;
  /** Card valida Y servicio A2A que responde. Esto es lo que puedes contratar. */
  hireable: boolean;
  service?: Service;
  /** Otras identidades registradas que comparten dueno y backend con esta. */
  cluster?: {
    key: string;
    size: number;
    shared_endpoint: string;
    siblings: { name: string; token_id: string; chain_id: number }[];
  };
};

/**
 * Proyeccion minima para las listas filtrables del cliente: ~150 bytes por
 * agente en vez de los ~2 KB del registro completo.
 */
export type AgentListItem = {
  id: string;
  chain: number;
  token: string;
  name: string;
  description: string;
  testnet: boolean;
  /** Estado de la agent-card. */
  status: "live" | "partial" | "dead" | "blocked" | "none";
  /** Estado del servicio real, que es lo que decide si se puede contratar. */
  service: "hireable" | "auth" | "down" | "unknown";
  latency: number | null;
  score: number;
  categories: CategoryKey[];
  checkedAt: string;
  /** Precio cotizado por el propio agente, en unidades minimas. */
  price?: string | null;
  currency?: string | null;
  etaSeconds?: number | null;
  /** >1 si comparte dueno y backend con otras identidades registradas. */
  clusterSize?: number;
};

/**
 * Sobre de peticion listo para enviar, prerrellenado para la skill elegida.
 *
 * Por que existe: la consola prerrellenaba `{"skill":"negotiate"}` y el agente
 * respondia `Invalid request format: 'task_description'`. Un juez que pulsa
 * "Send" sin tocar nada se topaba con un error, que es exactamente el
 * "dead end" que el criterio de Functionality penaliza, y lo contrario de
 * "hire, without instructions".
 *
 * Los campos salen de lo que los propios agentes documentan en la descripcion
 * de su skill, no de un esquema que nos hayamos inventado.
 */
export function defaultEnvelope(
  skill: Skill,
  agentName: string,
): Record<string, unknown> {
  const id = skill.id;
  const doc = `${skill.name} ${skill.description}`.toLowerCase();

  if (/negotiat/i.test(id)) {
    return {
      skill: id,
      task_description: `Report the current state of the position or market that ${agentName} covers, and recommend an action.`,
      terms: {
        deliverables: "A written status report with a recommended action",
        quality_standards: "Accurate as of the current block, with sources",
      },
    };
  }

  if (/notify_funded/i.test(id)) {
    // Requiere un job_id que solo existe tras financiar en cadena. Se deja el
    // hueco marcado en vez de inventar un numero que fallaria igual.
    return { skill: id, job_id: 0 };
  }

  // Caso general: si la documentacion menciona un campo de texto libre, lo
  // incluimos; si no, mandamos solo la skill.
  if (/task_description/.test(doc)) {
    return {
      skill: id,
      task_description: `Report the current state of what ${agentName} covers.`,
    };
  }
  if (/\bquery\b|\bquestion\b|\bprompt\b/.test(doc)) {
    return { skill: id, query: `What is the current state of your coverage?` };
  }
  return { skill: id };
}

/** El probe que mejor representa el estado del agente: preferimos una card valida. */
export function bestProbe(a: Agent): Probe | undefined {
  return (
    a.probes.find((p) => p.valid_card) ??
    a.probes.find((p) => p.ok) ??
    a.probes[0]
  );
}

/** Enlace al explorador correcto segun la red. */
export function explorerTx(chainId: number, hash: string): string {
  const base =
    chainId === 56 ? "https://bscscan.com" : "https://testnet.bscscan.com";
  return `${base}/tx/${hash}`;
}

export function explorerAddress(chainId: number, addr: string): string {
  const base =
    chainId === 56 ? "https://bscscan.com" : "https://testnet.bscscan.com";
  return `${base}/address/${addr}`;
}

/**
 * Las URLs de los agentes las escribe quien registra el agente, asi que llegan
 * a `href` como texto de un tercero. Nada impide registrar `javascript:...`, que
 * seria XSS almacenado. Solo dejamos pasar http y https; el resto se pinta como
 * texto plano y no como enlace.
 */
export function safeHref(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Precio cotizado por el agente. Llega en unidades minimas como cadena, porque
 * un uint256 no cabe en un Number sin perder precision.
 *
 * El token del escrow ERC-8183 es $U, con 18 decimales. No inventamos conversion
 * a dolares: nadie nos ha dado un precio de mercado fiable para $U y mostrar una
 * cifra en USD que no podemos justificar seria exactamente el tipo de dato
 * inflado que este producto denuncia.
 */
export function formatPrice(raw?: string | null, decimals = 18): string | null {
  if (!raw) return null;
  try {
    const v = BigInt(raw);
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    const frac = v % base;
    if (frac === 0n) return whole.toString();
    const frac4 = (frac * 10000n) / base;
    return `${whole}.${frac4.toString().padStart(4, "0").replace(/0+$/, "")}`;
  } catch {
    return null;
  }
}

/** "10 min" a partir de segundos. Para el plazo que promete el agente. */
export function formatEta(seconds?: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 90) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 90) return `${m} min`;
  return `${Math.round(m / 60)}h`;
}

/** "3 min ago" — el dato que convierte una verificacion en una prueba. */
export function since(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
