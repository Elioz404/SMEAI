import Link from "next/link";
import {
  CATEGORY_META,
  type AgentListItem,
  type CategoryKey,
  MARK_META,
  type Mark,
  formatEta,
  formatPrice,
  since,
} from "@/lib/taxonomy";

export const STATUS_META: Record<
  AgentListItem["status"],
  { label: string; color: string }
> = {
  live: { label: "Serves agent card", color: "var(--warn)" },
  partial: { label: "Host up, no agent card", color: "var(--warn)" },
  dead: { label: "Card not responding", color: "var(--dead)" },
  blocked: { label: "Not publicly reachable", color: "var(--muted)" },
  none: { label: "No endpoint declared", color: "var(--muted)" },
};

/**
 * Estado del servicio. Es el que manda: la card es el escaparate, el servicio es
 * la tienda. Un agente puede servir una card impecable y tener el endpoint A2A
 * caido, y entonces no lo puede contratar nadie.
 */
export const SERVICE_META: Record<
  AgentListItem["service"],
  { label: string; color: string }
> = {
  hireable: { label: "Hireable", color: "var(--live)" },
  auth: { label: "Needs credentials", color: "var(--warn)" },
  throttled: { label: "Rate-limited, not measured", color: "var(--muted)" },
  down: { label: "Service down", color: "var(--dead)" },
  unknown: { label: "No service endpoint", color: "var(--muted)" },
};

/** El estado que se muestra: el del servicio si lo conocemos, si no el de la card. */
export function displayStatus(a: AgentListItem) {
  if (a.status === "live") return SERVICE_META[a.service];
  return STATUS_META[a.status];
}

/**
 * La unidad de presentacion del producto. Una sola, usada en la portada y en
 * las paginas de categoria: dos disenos distintos para lo mismo obligarian al
 * usuario a reaprender la lectura al cambiar de pagina.
 *
 * Orden de lectura deliberado: estado primero (a la izquierda, donde empieza la
 * vista), luego identidad, y los datos medidos alineados a la derecha en mono
 * para que las columnas de cifras se comparen de un vistazo.
 */
export function AgentRow({
  agent,
  showCategories = true,
}: {
  agent: AgentListItem;
  showCategories?: boolean;
}) {
  const st = displayStatus(agent);
  const isLive = agent.service === "hireable";
  const price = formatPrice(agent.price);
  const eta = formatEta(agent.etaSeconds);

  return (
    <Link
      href={`/agent/${agent.chain}/${agent.token}`}
      className={`group relative flex items-start gap-3 border-b border-line px-3 py-3 transition-colors last:border-b-0 hover:bg-raised ${
        isLive ? "" : "opacity-65 hover:opacity-100"
      }`}
    >
      {/* Barra de acento a la izquierda, visible solo al pasar por encima:
          marca la fila activa sin anadir ruido permanente. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-px scale-y-0 bg-accent transition-transform group-hover:scale-y-100"
      />

      <span
        aria-hidden
        className={`mt-1.5 size-1.5 shrink-0 rounded-full ${isLive ? "pulse-live" : ""}`}
        style={{ background: st.color }}
      />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium leading-snug text-t1 group-hover:text-accent">
            {agent.name}
          </span>
          <span
            className="t-data shrink-0 rounded px-1 py-px"
            style={{
              color: agent.testnet ? "var(--text-3)" : "var(--accent)",
              boxShadow: `inset 0 0 0 1px ${agent.testnet ? "var(--line-strong)" : "var(--accent-dim)"}`,
            }}
          >
            {agent.testnet ? "testnet" : "mainnet"}
          </span>
        </span>

        {/* max-w en ch, no en px: limita por número de caracteres, que es lo
            que realmente cansa al ojo al volver de renglón.
            Sin `block`: line-clamp necesita display:-webkit-box y `block` lo
            anula, dejando descripciones de cuatro líneas que rompen el ritmo
            vertical de la lista. */}
        <span className="mt-1 line-clamp-2 max-w-[92ch] text-[12px] leading-relaxed text-t2">
          {agent.description}
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="t-data" style={{ color: st.color }}>
            {st.label}
          </span>
          {agent.latency !== null && (
            <span className="t-data text-t3">{agent.latency} ms</span>
          )}
          <span className="t-data text-t3">{since(agent.checkedAt)}</span>

          {/* Precio y plazo que el propio agente cotizo al pedirselo. Es el
              dato que decide una contratacion y que ningun directorio muestra. */}
          {price && (
            <span className="t-data" style={{ color: "var(--accent)" }}>
              {price} $U
            </span>
          )}
          {eta && <span className="t-data text-t3">~{eta}</span>}

          {/* Un backend con N identidades registradas no son N agentes. Se
              avisa en la propia fila, no escondido en la ficha. */}
          {agent.clusterSize && agent.clusterSize > 1 && (
            <span className="t-data" style={{ color: "var(--warn)" }}>
              1 of {agent.clusterSize} sharing one backend
            </span>
          )}

          {showCategories &&
            agent.categories.map((k) => (
              <span
                key={k}
                className="t-data"
                style={{ color: CATEGORY_META[k as CategoryKey].accent }}
              >
                {CATEGORY_META[k as CategoryKey].short}
              </span>
            ))}
        </span>
      </span>

      {/* Historial en la propia fila. Un agente que parpadea se ve aqui sin
          abrir su ficha, que es donde un comprador decide a quien mirar. */}
      {agent.history && agent.history.length > 1 && (
        <MiniHistory marks={agent.history} />
      )}

      <ScoreMeter score={agent.score} live={isLive} />
    </Link>
  );
}

/** Tira compacta de disponibilidad: una marca por comprobacion. */
function MiniHistory({ marks }: { marks: string }) {
  const flapped = new Set(marks.replace(/-/g, "")).size > 1;
  return (
    <span
      className="hidden shrink-0 items-end gap-px pt-1 sm:flex"
      title={
        flapped
          ? "Availability has changed across checks — open the agent for the full history"
          : "Availability across recent checks"
      }
      aria-hidden
    >
      {marks.split("").map((m, i) => (
        <span
          key={i}
          className="h-3.5 w-[3px] rounded-[1px]"
          style={{
            background: MARK_META[m as Mark]?.color ?? "var(--line)",
            opacity: m === "-" ? 0.4 : 1,
            transform: m === "-" ? "scaleY(0.35)" : undefined,
            transformOrigin: "bottom",
          }}
        />
      ))}
    </span>
  );
}

/**
 * El score, con la barra debajo de la cifra. La barra no es adorno: permite
 * comparar dos agentes sin leer los numeros, que es como se escanea una lista.
 */
function ScoreMeter({ score, live }: { score: number; live: boolean }) {
  return (
    <span className="flex w-12 shrink-0 flex-col items-end gap-1 pt-0.5">
      <span
        className="t-mono text-[15px] leading-none"
        style={{ color: live ? "var(--text)" : "var(--text-3)" }}
      >
        {score}
      </span>
      <span className="h-0.5 w-full overflow-hidden rounded-full bg-line-strong">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(2, score)}%`,
            background: live ? "var(--live)" : "var(--muted)",
          }}
        />
      </span>
    </span>
  );
}
