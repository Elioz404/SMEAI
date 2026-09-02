"use client";

import { useState } from "react";
import { defaultEnvelope, type Skill } from "@/lib/taxonomy";

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
 * Por que un editor de JSON y no una caja de chat: al probarlo contra agentes
 * reales, un mensaje de texto devuelve "unknown skill", y un sobre incompleto
 * devuelve "Invalid request format: 'task_description'". Cada agente documenta
 * su propio esquema en la descripcion de la skill. No existe una forma comun
 * que podamos inventar, asi que mostramos la documentacion del agente y
 * enviamos exactamente lo que el usuario compone.
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
  // Prerrellenado con un sobre que el agente acepta de verdad. Pulsar "Send"
  // sin tocar nada tiene que funcionar: es literalmente el criterio que se
  // juzga ("hire, without instructions").
  const [envelope, setEnvelope] = useState(
    first ? JSON.stringify(defaultEnvelope(first, agentName), null, 2) : "",
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const selected = skills.find((s) => s.id === skillId);

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
      <h2 className="t-h2 text-t1">Hire this agent</h2>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-t3">
        Dispatches a real A2A <span className="t-mono">message/send</span> to{" "}
        {agentName} and prints exactly what comes back. This sends a message; it
        does not sign transactions or move funds.
      </p>

      <div className="mt-4 overflow-hidden rounded-panel border border-line bg-raised">
        <div className="border-b border-line px-4 py-4">
          {skills.length > 0 ? (
            <>
              <p className="t-label">Skills declared on-chain</p>
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
                      {s.id}
                    </button>
                  );
                })}
              </div>

              {selected && (
                <div className="mt-3 rounded border-l-2 border-line-strong bg-sunken px-3 py-2.5">
                  <p className="text-[12px] font-medium text-t1">
                    {selected.name}
                  </p>
                  {selected.description && (
                    <p className="mt-1 text-[12px] leading-relaxed text-t2">
                      {selected.description}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-t2">
              This agent declares no skills in its card. Send plain text and see
              what it does with it.
            </p>
          )}
        </div>

        <div className="px-4 py-4">
          <label className="t-label mb-1.5 block" htmlFor="hire-payload">
            Request payload · prefilled, ready to send
          </label>
          <textarea
            id="hire-payload"
            value={envelope}
            onChange={(e) => {
              setEnvelope(e.target.value);
              setJsonError(null);
            }}
            rows={7}
            spellCheck={false}
            placeholder='{ "skill": "…" }'
            className="t-data w-full resize-y rounded border border-line bg-sunken px-3 py-2.5 leading-relaxed text-t1 placeholder:text-t3 focus:border-accent focus:outline-none"
          />
          {jsonError && (
            <p className="t-data mt-1.5" style={{ color: "var(--dead)" }}>
              invalid JSON — {jsonError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={send}
              disabled={busy || !envelope.trim()}
              className="rounded bg-accent px-3.5 py-1.5 text-[12px] font-medium text-[#0a0c10] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy ? "Calling agent…" : "Send to agent"}
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
        </div>
      </div>

      {result && (
        <div className="mt-3 overflow-hidden rounded-panel border border-line bg-raised">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="t-data text-t2">{result.stage}</span>
            <span className="t-data">
              <span
                style={{ color: result.ok ? "var(--live)" : "var(--dead)" }}
              >
                {result.ok
                  ? `${result.status} OK`
                  : (result.error ?? `HTTP ${result.status}`)}
              </span>
              {result.latency_ms !== undefined && (
                <span className="text-t3"> · {result.latency_ms} ms</span>
              )}
            </span>
          </div>
          <pre className="t-data max-h-96 overflow-auto p-4 leading-relaxed text-t2">
            {result.response !== undefined && result.response !== null
              ? JSON.stringify(result.response, null, 2)
              : (result.raw ?? result.error ?? "no response body")}
          </pre>
        </div>
      )}
    </section>
  );
}
