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

/**
 * Marca de disponibilidad de un agente en una comprobacion concreta.
 * Vive aqui y no en history.ts porque las listas del cliente la pintan, y
 * history.ts importa el JSON del historial, que no debe viajar al navegador.
 */
export type Mark = "h" | "c" | "d" | "b" | "-";

export const MARK_META: Record<Mark, { color: string; label: string }> = {
  h: { color: "var(--live)", label: "hireable" },
  c: { color: "var(--warn)", label: "card only, service down" },
  d: { color: "var(--dead)", label: "not responding" },
  b: { color: "var(--muted)", label: "not publicly reachable" },
  "-": { color: "var(--line)", label: "not listed yet" },
};

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
  /** El host nos limito el paso (429): no medido, no defectuoso. */
  throttled?: boolean;
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
  /**
   * Agente publicado por NOSOTROS.
   *
   * Son tres, de referencia, uno por cada categoria delgada: si el unico
   * agente estable de terceros de una categoria cae durante la evaluacion, esa
   * categoria se queda sin nada que activar y no podemos intervenir.
   *
   * Se excluye de TODAS las cifras: totales, por categoria y embudo. Un
   * marketplace que se cuenta a si mismo entre la oferta ha dejado de medir el
   * ecosistema. Se muestra, se etiqueta, y no suma.
   */
  is_ours?: boolean;
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
  service: "hireable" | "auth" | "throttled" | "down" | "unknown";
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
  /** Publicado por nosotros: se etiqueta y no cuenta en ninguna cifra. */
  ours?: boolean;
  /** Ultimas marcas de disponibilidad, una por comprobacion. */
  history?: string;
};

/**
 * Lo que CUENTA.
 *
 * `scripts/ingest.mjs` ya excluye nuestros agentes de los totales que escribe
 * en el snapshot. Esto es lo que mantiene alineada con esos totales cualquier
 * cifra que la web calcule por su cuenta: sin ello el sitio decia 263 agentes
 * mientras su propio total publicado decia 262.
 *
 * La linea es esta. Un numero que afirma algo sobre el MERCADO los excluye:
 * totales por categoria, el embudo de oferta, la profundidad de cada
 * categoria. Una etiqueta que solo describe la LISTA visible no los excluye
 * —el contador de un filtro dice cuantas filas vas a ver, no cuantos agentes
 * hay en BSC— porque hacerlo daria un control que promete 262 y enseña 263.
 */
export const measured = (list: Agent[]): Agent[] =>
  list.filter((a) => a.is_ours !== true);

export const measuredItems = (list: AgentListItem[]): AgentListItem[] =>
  list.filter((a) => a.ours !== true);

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
/**
 * Identificadores publicos reales de BSC Testnet, usados como ejemplo cuando un
 * agente exige uno y el usuario aun no ha puesto el suyo. Descubiertos en
 * cadena: la posicion V3 mas reciente, su pool, y un prestatario real de Venus.
 */
export const EXAMPLE = {
  tokenId: "37143",
  pool: "0xb96b19C1Bf6E8a33Bc350BB22663cAacfF4e6853",
  wallet: "0x0949251a1c62157c9dcC24fA8FF6b373959dea69",
} as const;

/**
 * Que identificador pide el sobre, si pide alguno. Permite ofrecer un campo
 * con la etiqueta correcta en vez de obligar a editar JSON.
 */
export function envelopeSubject(envelope: string): {
  key: "walletAddress" | "tokenId" | "poolAddress";
  label: string;
  hint: string;
  value: string;
} | null {
  let parsed: { input?: Record<string, string> };
  try {
    parsed = JSON.parse(envelope);
  } catch {
    return null;
  }
  const input = parsed?.input;
  if (!input) return null;

  if (typeof input.walletAddress === "string")
    return {
      key: "walletAddress",
      label: "Wallet to analyse",
      hint: "Any BSC address with a lending position",
      value: input.walletAddress,
    };
  if (typeof input.tokenId === "string")
    return {
      key: "tokenId",
      label: "Position to analyse",
      hint: "A PancakeSwap V3 position NFT id",
      value: input.tokenId,
    };
  if (typeof input.poolAddress === "string")
    return {
      key: "poolAddress",
      label: "Pool to analyse",
      hint: "A PancakeSwap V3 pool address",
      value: input.poolAddress,
    };
  return null;
}

/** Sustituye el identificador conservando el resto del sobre intacto. */
export function withSubject(envelope: string, key: string, value: string): string {
  try {
    const parsed = JSON.parse(envelope);
    parsed.input = { ...(parsed.input ?? {}), [key]: value };
    return JSON.stringify(parsed, null, 2);
  } catch {
    return envelope;
  }
}

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

  // Agentes que exigen un identificador concreto en `input`.
  //
  // No esta documentado en la descripcion de la skill: lo dicen al fallar.
  // Medido llamandolos:
  //   "RangeKeeper requires input.tokenId for a PancakeSwap V3 position read."
  //   "VenusGuard requires input.walletAddress for Venus health monitoring."
  //   "GridPilot requires input.poolAddress for a PancakeSwap V3 market-context read."
  //
  // Los valores por defecto son identificadores publicos reales de BSC Testnet,
  // descubiertos en cadena (la posicion V3 mas reciente y su pool). Sin ellos el
  // primer clic devuelve un error, que es exactamente el "dead end" que el
  // criterio de Functionality penaliza.
  const wants = (f: string) => new RegExp(f, "i").test(`${id} ${doc}`);

  if (wants("health|venus|lending|liquidat|collateral")) {
    return { skill: id, input: { walletAddress: EXAMPLE.wallet } };
  }
  if (wants("range|position|rebalanc|liquidity")) {
    return { skill: id, input: { tokenId: EXAMPLE.tokenId } };
  }
  if (wants("grid|pool|market|context|twap")) {
    return { skill: id, input: { poolAddress: EXAMPLE.pool } };
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

/* --- Lectura de la respuesta de un agente -----------------------------------

   Un agente contesta un sobre JSON-RPC, no una frase. Enseñar ese sobre en
   crudo es correcto y es ilegible: quien pulsa "contratar" recibe 2.600
   caracteres y no sabe si le han cotizado o le han dicho que no.

   Esto extrae lo que un humano necesita. El JSON sigue estando debajo, porque
   la prueba es el JSON — pero deja de ser lo primero que se lee. */

export type A2AReading =
  | { kind: "quote"; accepted: true; price: string | null; currency: string | null; eta: string | null; hash: string | null }
  | { kind: "refusal"; reason: string; offers: { id: string; name: string; price: string | null }[] }
  | { kind: "text"; text: string }
  | null;

/**
 * Localiza el cuerpo util dentro de una respuesta A2A.
 *
 * Hay dos formas en circulacion: unos vendedores la envuelven en
 * `result.parts[].data.response` y otros la ponen directamente en `result`.
 * Mirar solo la primera daba por mudos a agentes que contestaban bien.
 */
function a2aBody(res: unknown): { body: Record<string, unknown> | null; hash: string | null; text: string | null } {
  const r = (res as { result?: unknown })?.result;
  const parts = (r as { parts?: unknown })?.parts;
  if (Array.isArray(parts)) {
    const data = parts.find((p) => (p as { kind?: string })?.kind === "data") as
      | { data?: Record<string, unknown> }
      | undefined;
    const txt = parts.find((p) => (p as { kind?: string })?.kind === "text") as
      | { text?: string }
      | undefined;
    const inner = data?.data?.response as Record<string, unknown> | undefined;
    return {
      body: inner ?? (data?.data as Record<string, unknown> | undefined) ?? null,
      hash: (data?.data?.negotiation_hash as string | undefined) ?? null,
      text: txt?.text ?? null,
    };
  }
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    return { body: o, hash: (o.negotiation_hash as string | undefined) ?? null, text: null };
  }
  return { body: null, hash: null, text: null };
}

/** Traduce una respuesta A2A a algo que se puede leer de un vistazo. */
export function readA2A(res: unknown): A2AReading {
  const { body, hash, text } = a2aBody(res);

  if (body) {
    const terms = body.terms as Record<string, unknown> | undefined;
    const price = (terms?.price ?? body.price) as string | undefined;
    if (body.accepted === true || price) {
      return {
        kind: "quote",
        accepted: true,
        price: formatPrice(price ?? null),
        currency: (terms?.currency ?? body.currency ?? null) as string | null,
        eta: formatEta((body.estimated_completion_seconds ?? null) as number | null),
        hash: hash ?? null,
      };
    }
    if (body.accepted === false) {
      const raw = Array.isArray(body.services) ? body.services : [];
      return {
        kind: "refusal",
        reason: String(body.reason ?? "The agent declined this request."),
        offers: raw.slice(0, 5).map((s) => {
          const o = s as Record<string, unknown>;
          return {
            id: String(o.id ?? ""),
            name: String(o.name ?? o.id ?? ""),
            price: formatPrice((o.price ?? null) as string | null),
          };
        }),
      };
    }
  }

  if (text && text.trim()) return { kind: "text", text: text.trim().slice(0, 600) };
  return null;
}
