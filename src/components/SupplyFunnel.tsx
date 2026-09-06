import { measured, type Agent } from "@/lib/taxonomy";

/** Enfasis en linea, para no arrastrar una dependencia por una palabra. */
function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-t1">{children}</strong>;
}

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
  // El embudo describe de cuantos agentes REGISTRADOS sale uno contratable.
  // Los nuestros no son oferta del ecosistema, asi que no entran en ninguno de
  // los escalones ni en el total del que se parte.
  const list = measured(agents);
  const total = list.length;
  if (!total) return null;

  const noEndpoint = list.filter((a) => a.probes.length === 0).length;
  const privateOnly = list.filter(
    (a) => a.probes.length > 0 && a.probes.every((p) => p.blocked),
  ).length;
  const cardDown = list.filter(
    (a) =>
      !a.live &&
      a.probes.length > 0 &&
      !a.probes.every((p) => p.blocked),
  ).length;
  const serviceDown = list.filter((a) => a.live && !a.hireable).length;

  // El ultimo escalon se parte en dos, y la distincion no es cosmetica.
  //
  // "Contratable" significaba que el servicio contesta. Pero contestar y
  // vender no son lo mismo: de los que contestan, solo una minoria llega a
  // nombrar un precio cuando se le pide una cotizacion firmada. El resto habla
  // el protocolo y ahi se queda.
  //
  // Las dos filas siguen siendo excluyentes entre si, asi que el embudo sigue
  // sumando exactamente el total de la categoria.
  const quoting = list.filter((a) => a.hireable && a.service?.quote?.accepted).length;
  const hireable = list.filter((a) => a.hireable).length;
  const answeringNoPrice = hireable - quoting;

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
      n: answeringNoPrice,
      label: "answer on both, but never name a price",
      hint: "the service works; asked for a signed quote, it does not produce one",
      tone: "var(--text-2)",
    },
    {
      n: quoting,
      label: "answer, and quote a price when asked",
      hint: "the full commercial path, as far as it can be walked without paying",
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

      {quoting > 0 && (
        <p className="t-body mt-3 max-w-2xl text-t2">
          A quote is where the trail goes cold. Across both networks we funded
          eleven of these jobs through the ERC-8183 escrow and{" "}
          <B>not one seller ever submitted a deliverable</B>. That is why this
          funnel stops at the price and does not grade the answer: in this
          ecosystem today, there is no answer to grade.
        </p>
      )}

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
