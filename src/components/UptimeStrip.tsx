import { MARK_META, type Uptime } from "@/lib/history";
import { since } from "@/lib/taxonomy";

/**
 * Historial de disponibilidad de un agente, una barra por comprobación.
 *
 * Es la diferencia entre "responde ahora" y "ha respondido 38 de las últimas
 * 40, y se cayó ayer a las 15:00" — que es lo que el criterio de Data Quality
 * llama pasar de un conteo a una decisión informada.
 *
 * Cada barra es una petición HTTP que hicimos de verdad, y su instante está en
 * el `title` para que se pueda comprobar una a una.
 */
export function UptimeStrip({
  uptime,
  compact = false,
}: {
  uptime: Uptime;
  compact?: boolean;
}) {
  if (!uptime.marks.length) {
    return (
      <p className="t-data text-t3">
        No verification history yet — this agent appeared after the last run.
      </p>
    );
  }

  return (
    <div>
      <div
        className="flex items-end gap-px"
        role="img"
        aria-label={
          uptime.pct === null
            ? "No verification history"
            : `Hireable in ${uptime.hireable} of ${uptime.observed} checks`
        }
      >
        {uptime.marks.map((m, i) => (
          <span
            key={i}
            title={`${MARK_META[m].label} · ${uptime.at[i] ?? ""}`}
            // max-w acotado: con pocas comprobaciones la tira crece hacia la
            // derecha en vez de estirar cinco barras a todo el ancho, que se
            // leia como bloques y no como historial.
            className={`w-full max-w-[9px] flex-1 rounded-[1px] ${compact ? "h-3" : "h-7"}`}
            style={{
              background: MARK_META[m].color,
              // Las comprobaciones en que el agente aún no existía se dibujan
              // más bajas: no son caídas, son ausencias, y merecen leerse
              // distinto de un fallo.
              opacity: m === "-" ? 0.5 : 1,
              transform: m === "-" ? "scaleY(0.35)" : undefined,
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>

      {!compact && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {uptime.pct !== null && (
            <span className="t-data">
              <span
                className="text-[15px]"
                style={{
                  color:
                    uptime.pct >= 95
                      ? "var(--live)"
                      : uptime.pct >= 60
                        ? "var(--warn)"
                        : "var(--dead)",
                }}
              >
                {uptime.pct}%
              </span>
              <span className="text-t3">
                {" "}
                hireable · {uptime.hireable} of {uptime.observed} checks
              </span>
            </span>
          )}
          {uptime.lastDrop && (
            <span className="t-data text-t3">
              last failure {since(uptime.lastDrop)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
