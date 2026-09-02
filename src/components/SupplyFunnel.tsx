import type { Agent } from "@/lib/taxonomy";

/**
 * De cuántos agentes registrados sale uno contratable, y dónde se pierden los
 * demás.
 *
 * Existe por una razón incómoda: health factor tiene 20 agentes registrados y
 * uno contratable. Una lista sin explicación se lee como que el marketplace
 * está vacío. El desglose demuestra lo contrario — ocho de esos veinte apuntan
 * a direcciones privadas, y eso lo medimos nosotros, no lo dice el registro.
 *
 * El mismo panel va en las cuatro categorías. Tratar igual a la categoría más
 * pobre que a la más rica es lo que "equal depth" significa cuando la oferta
 * real no es igual.
 */
export function SupplyFunnel({ agents }: { agents: Agent[] }) {
  const total = agents.length;
  if (!total) return null;

  const noEndpoint = agents.filter((a) => a.probes.length === 0).length;
  const privateOnly = agents.filter(
    (a) => a.probes.length > 0 && a.probes.every((p) => p.blocked),
  ).length;
  const cardDown = agents.filter(
    (a) =>
      !a.live &&
      a.probes.length > 0 &&
      !a.probes.every((p) => p.blocked),
  ).length;
  const serviceDown = agents.filter((a) => a.live && !a.hireable).length;
  const hireable = agents.filter((a) => a.hireable).length;

  const rows = [
    {
      n: noEndpoint,
      label: "declare no callable endpoint at all",
      hint: "registered on-chain, but with nothing to call",
      tone: "var(--muted)",
    },
    {
      n: privateOnly,
      label: "point at a private or loopback address",
      hint: "a local deployment that was never published — unreachable by anyone, not just by us",
      tone: "var(--muted)",
    },
    {
      n: cardDown,
      label: "declare a public endpoint that does not answer",
      hint: "these are the ones a directory would list as working",
      tone: "var(--dead)",
    },
    {
      n: serviceDown,
      label: "serve an agent card but no working service",
      hint: "the shop window is up; the shop is not",
      tone: "var(--warn)",
    },
    {
      n: hireable,
      label: "answer on both, and can be hired",
      hint: "",
      tone: "var(--live)",
    },
  ].filter((r) => r.n > 0);

  return (
    <section className="mt-10">
      <h2 className="t-h2 text-t1">Where the supply goes</h2>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-t3">
        Of {total} agents registered in this category, this is what we found when
        we called each one. Measured on the last run, not taken from the registry.
      </p>

      <div className="mt-4 overflow-hidden rounded-panel border border-line">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-start gap-3 border-b border-line bg-raised px-4 py-3 last:border-b-0"
          >
            <span
              className="t-mono w-8 shrink-0 text-right text-[15px]"
              style={{ color: r.tone }}
            >
              {r.n}
            </span>
            <span
              aria-hidden
              className="mt-1.5 h-1.5 shrink-0 rounded-full"
              style={{
                background: r.tone,
                width: `${Math.max(3, (r.n / total) * 120)}px`,
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] leading-snug text-t2">
                {r.label}
              </span>
              {r.hint && (
                <span className="t-data mt-0.5 block text-t3">{r.hint}</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {hireable <= 2 && (
        <p className="t-body mt-3 max-w-2xl text-t2">
          This category is thin, and the honest version of why took four
          attempts. Three searches came back empty and we nearly concluded the
          shortage was the ecosystem&apos;s. The fourth — keyword search rather
          than semantic — returned 142 agents our pipeline had never seen,
          because the other three nets were all looking in the same place. We
          fixed the pipeline and the catalogue more than doubled.
          <br />
          <br />
          It changed nothing here. This category went from 20 registered agents
          to {total} and still has {hireable} that can actually be hired: the
          rest declare no endpoint, point at a laptop, or serve a card in front
          of a dead service. That is a real shortage, now measured on twice the
          sample — not a gap in what we index, and not something we will paper
          over by listing entries nobody can hire.
        </p>
      )}
    </section>
  );
}
