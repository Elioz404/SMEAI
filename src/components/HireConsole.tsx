"use client";

import { useState } from "react";
import {
  EXAMPLE,
  defaultEnvelope,
  envelopeSubject,
  withSubject,
  type Skill,
  readA2A,
} from "@/lib/taxonomy";

type Result = {
  stage: string;
  ok?: boolean;
  status?: number;
  service_url?: string;
  latency_ms?: number;
  response?: unknown;
  raw?: string;
  error?: string;
};

/**
 * El criterio de "activate it" del hackathon. No abre un modal ni encola nada:
 * manda la tarea al endpoint A2A del agente y ensena la respuesta literal,
 * incluido el fallo. Un boton que finge exito seria peor que no tenerlo.
 *
 * Por defecto NO se ve JSON.
 *
 * La version anterior abria directamente con un editor de sobres JSON. Era
 * honesta —cada agente documenta su propio esquema y no existe una forma comun
 * que inventarse— pero el criterio dice "someone with zero Agent Studio
 * knowledge should be able to get through it". Alguien asi ve un editor JSON y
 * se para, aunque funcione a la primera. Ahora el JSON esta detras de "Edit
 * request", para quien quiera verlo o cambiarlo.
 */
export function HireConsole({
  agentName,
  endpoint,
  skills,
}: {
  agentName: string;
  endpoint: string;
  skills: Skill[];
}) {
  const first = skills[0];
  const [skillId, setSkillId] = useState<string | null>(first?.id ?? null);
  const [envelope, setEnvelope] = useState(
    first ? JSON.stringify(defaultEnvelope(first, agentName), null, 2) : "",
  );
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const selected = skills.find((s) => s.id === skillId);
  // Si el sobre lleva uno de los identificadores de ejemplo, hay que decirlo:
  // un usuario podria leer el resultado como si fuera su propia posicion.
  const usesExample = Object.values(EXAMPLE).some((v) => envelope.includes(v));
  // Que identificador pide este agente, para ofrecer un campo con su etiqueta
  // en vez de obligar a editar JSON. Es lo que convierte la demo de "mira lo
  // que hace" en "mira lo que hace con lo tuyo".
  const subject = envelopeSubject(envelope);

  function pick(s: Skill) {
    setSkillId(s.id);
    setEnvelope(JSON.stringify(defaultEnvelope(s, agentName), null, 2));
    setJsonError(null);
    setResult(null);
  }

  async function send() {
    let parsed: Record<string, unknown> | undefined;
    const trimmed = envelope.trim();
    if (trimmed) {
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        setJsonError((err as Error).message);
        setAdvanced(true); // si el JSON esta roto hay que poder verlo
        return;
      }
    }
    setJsonError(null);
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/hire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint,
          envelope: parsed,
          text: parsed ? undefined : trimmed,
        }),
      });
      setResult(await res.json());
    } catch (err) {
      setResult({ stage: "client", ok: false, error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="t-h2 text-t1">Ask this agent</h2>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-t3">
        Sends a real task to {agentName} over A2A and prints exactly what comes
        back. This sends a message; it does not sign transactions or move funds.
      </p>

      <div className="mt-4 overflow-hidden rounded-panel border border-line bg-raised">
        {skills.length > 0 ? (
          <div className="border-b border-line px-4 py-4">
            <p className="t-label">What it can be asked to do</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {skills.map((s) => {
                const active = skillId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => pick(s)}
                    aria-pressed={active}
                    className="t-data rounded px-2 py-1 transition-colors"
                    style={{
                      color: active ? "#0a0c10" : "var(--text-2)",
                      background: active ? "var(--accent)" : "transparent",
                      boxShadow: active
                        ? "none"
                        : "inset 0 0 0 1px var(--line-strong)",
                    }}
                  >
                    {s.name || s.id}
                  </button>
                );
              })}
            </div>
            {selected?.description && (
              <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-t2">
                {selected.description}
              </p>
            )}
          </div>
        ) : (
          <div className="border-b border-line px-4 py-4">
            <p className="text-[12.5px] text-t2">
              This agent declares no skills in its card, so there is nothing
              documented to ask for. You can still send it plain text and see
              what it does.
            </p>
          </div>
        )}

        {subject && (
          <div className="border-b border-line px-4 py-4">
            <label className="t-label mb-1.5 block" htmlFor="hire-subject">
              {subject.label}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="hire-subject"
                value={subject.value}
                onChange={(e) =>
                  setEnvelope(
                    withSubject(envelope, subject.key, e.target.value),
                  )
                }
                spellCheck={false}
                className="t-data min-w-0 flex-1 rounded border border-line bg-sunken px-3 py-2 text-t1 placeholder:text-t3 focus:border-accent focus:outline-none"
              />
              {!usesExample && (
                <button
                  onClick={() =>
                    setEnvelope(
                      withSubject(
                        envelope,
                        subject.key,
                        EXAMPLE[
                          subject.key === "walletAddress"
                            ? "wallet"
                            : subject.key === "tokenId"
                              ? "tokenId"
                              : "pool"
                        ],
                      ),
                    )
                  }
                  className="t-data shrink-0 rounded border border-line-strong px-2.5 py-2 text-t2 transition-colors hover:border-accent hover:text-accent"
                >
                  Use example
                </button>
              )}
            </div>
            <p className="t-data mt-1.5 text-t3">
              {subject.hint}.{" "}
              {usesExample
                ? "This is a real public one, used as an example — replace it with your own to get an answer about your position."
                : "The agent will answer about this one."}
            </p>
          </div>
        )}

        <div className="px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={send}
              disabled={busy || !envelope.trim()}
              className="rounded bg-accent px-4 py-2 text-[12.5px] font-medium text-[#0a0c10] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy ? "Calling agent…" : `Ask ${agentName}`}
            </button>

            <button
              onClick={() => setAdvanced((v) => !v)}
              className="t-data text-t3 underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent"
            >
              {advanced ? "Hide request" : "Edit request"}
            </button>

            {busy && (
              <span className="t-data flex items-center gap-2 text-t3">
                <span
                  aria-hidden
                  className="pulse-live size-1.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
                waiting, up to 12s
              </span>
            )}
          </div>

          {!advanced && (
            <p className="t-data mt-2.5 max-w-2xl leading-relaxed text-t3">
              Ready to send as-is — prefilled from what this agent asks for.
              {usesExample && (
                <>
                  {" "}
                  It needs a position to look at, so the request carries a real
                  public one from BSC Testnet as an example, not yours. Use{" "}
                  <span className="text-t2">Edit request</span> to point it at a
                  different address.
                </>
              )}
            </p>
          )}

          {advanced && (
            <div className="mt-3">
              <label className="t-label mb-1.5 block" htmlFor="hire-payload">
                Request payload
              </label>
              <textarea
                id="hire-payload"
                value={envelope}
                onChange={(e) => {
                  setEnvelope(e.target.value);
                  setJsonError(null);
                }}
                rows={8}
                spellCheck={false}
                placeholder='{ "skill": "…" }'
                className="t-data w-full resize-y rounded border border-line bg-sunken px-3 py-2.5 leading-relaxed text-t1 placeholder:text-t3 focus:border-accent focus:outline-none"
              />
              {jsonError && (
                <p className="t-data mt-1.5" style={{ color: "var(--dead)" }}>
                  invalid JSON — {jsonError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="mt-3 overflow-hidden rounded-panel border border-line bg-raised">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="t-data text-t2">{result.stage}</span>
            <span className="t-data">
              <span style={{ color: result.ok ? "var(--live)" : "var(--dead)" }}>
                {result.ok
                  ? `${result.status} OK`
                  : (result.error ?? `HTTP ${result.status}`)}
              </span>
              {result.latency_ms !== undefined && (
                <span className="text-t3"> · {result.latency_ms} ms</span>
              )}
            </span>
          </div>
          {/* Lo que el agente dijo, en un renglon. El sobre JSON-RPC sigue
              disponible debajo: es la prueba, pero no deberia ser lo primero
              que hay que descifrar para saber si la contratacion salio bien. */}
          <Reading reading={readA2A(result.response)} />

          <button
            onClick={() => setShowRaw((v) => !v)}
            className="t-data w-full border-t border-line px-4 py-2 text-left text-t3 transition-colors hover:text-t1"
          >
            {showRaw ? "Hide" : "Show"} the raw response
          </button>
          {showRaw && (
            <pre className="t-data max-h-96 overflow-auto border-t border-line p-4 leading-relaxed text-t2">
              {result.response !== undefined && result.response !== null
                ? JSON.stringify(result.response, null, 2)
                : (result.raw ?? result.error ?? "no response body")}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * La respuesta del agente, dicha en cristiano.
 *
 * Si no se reconoce la forma no se inventa nada: no se pinta resumen y queda
 * el JSON, que es lo honesto. Un resumen equivocado seria peor que ninguno.
 */
function Reading({ reading }: { reading: ReturnType<typeof readA2A> }) {
  if (!reading) return null;

  if (reading.kind === "quote") {
    return (
      <div className="border-b border-line px-4 py-3">
        <p className="t-data" style={{ color: "var(--live)" }}>
          The agent quoted a price
        </p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {reading.price && (
            <span className="t-mono text-[17px] text-t1">
              {reading.price} {reading.currency ? "$U" : ""}
            </span>
          )}
          {reading.eta && (
            <span className="t-data text-t2">delivery in ~{reading.eta}</span>
          )}
        </p>
        {reading.hash && (
          <p className="t-data mt-1.5 truncate text-t3">
            signed negotiation {reading.hash}
          </p>
        )}
      </div>
    );
  }

  if (reading.kind === "refusal") {
    return (
      <div className="border-b border-line px-4 py-3">
        <p className="t-data" style={{ color: "var(--warn)" }}>
          The agent declined this request
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-t2">
          {reading.reason}
        </p>
        {reading.offers.length > 0 && (
          <div className="mt-2">
            <p className="t-label">What it does sell</p>
            {reading.offers.map((o) => (
              <p key={o.id} className="t-data mt-0.5 text-t2">
                {o.name}
                {o.price ? ` — ${o.price} $U` : ""}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-line px-4 py-3">
      <p className="t-data text-t3">The agent answered</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-t2">{reading.text}</p>
    </div>
  );
}
