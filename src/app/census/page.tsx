import Link from "next/link";
import { census, censusFor, pct, type CensusChain } from "@/lib/census";
import { since } from "@/lib/taxonomy";

export const metadata = {
  title: "Census — SMEAI",
  description:
    "What the agents outside the catalogue actually are, measured by sample.",
};

/**
 * El censo: la poblacion que el catalogo NO cubre.
 *
 * El catalogo verifica en profundidad las cuatro categorias del brief. Eso deja
 * una pregunta legitima sin responder — y los otros 25.000 que declaran A2A en
 * mainnet, que son? Esta pagina la responde con una muestra, y dice en todo
 * momento cuanto ha mirado.
 *
 * Cada cifra de aqui lleva al lado si es exacta (leida del indice) o muestreada.
 * Mezclarlas seria justo el tipo de dato inflado que este proyecto denuncia.
 */
export default function CensusPage() {
  const main = censusFor(56);
  const test = censusFor(97);

  return (
    <div className="wrap px-6 pb-20 lg:px-10">
      <header className="border-b border-line py-10">
        <p className="t-label">Reference</p>
        <h1 className="t-h1 mt-3 text-t1">
          What the rest of the registry is
        </h1>
        <p className="t-body mt-3 max-w-3xl text-t2">
          The catalogue verifies the four categories in depth. This page is about
          everything else — the tens of thousands of identities that declare a
          protocol and never appear in a marketplace. It is a{" "}
          <span className="text-t1">sample</span>, and it says so on every number
          it draws from one.
        </p>
        <p className="t-data mt-4 text-t3">
          Measured {since(census.generated_at)}
        </p>
      </header>

      {main && <ChainBlock c={main} lead />}
      {test && <ChainBlock c={test} />}

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="t-h2 text-t1">How this was measured, and its limits</h2>
        <div className="mt-3 flex max-w-3xl flex-col gap-3">
          <P>
            Population figures are exact: the registry index returns them as a
            count. Everything else is a stratified sample, drawn at even
            intervals across the population rather than from the first page,
            because the first page and the last turn out to hold different
            operators.
          </P>
          <P>
            The index does not paginate reliably to the end. Measured: a request
            at offset 20,000 takes 19 seconds, and past roughly 22,000 it times
            out. So the deepest part of the mainnet population is not sampled at
            all, and the coverage figure above says exactly how much is missing.
            We would rather publish that than a round number that hides it.
          </P>
          <P>
            A shared backend is not proof of cloning. A platform that hosts
            thousands of users&rsquo; agents on one domain is doing something
            ordinary; the number below counts identities per host, not
            duplicates.
          </P>
        </div>
        <p className="t-data mt-5 text-t3">
          See also{" "}
          <Link href="/method" className="lnk">
            how verification works
          </Link>{" "}
          and{" "}
          <Link href="/scope" className="lnk">
            scope and risk
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function ChainBlock({ c, lead = false }: { c: CensusChain; lead?: boolean }) {
  const s = c.sample;
  const pop = c.population;
  const brokenPct = pct(s.broken_template, s.with_endpoint);
  const resolvePct = s.broken_template
    ? pct(s.template_resolves, s.broken_template)
    : null;
  const coverage = s.covers_fraction ? Math.round(s.covers_fraction * 100) : null;

  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="t-h2 text-t1">{c.chain_name}</h2>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
        <Metric value={fmt(pop.registered)} label="registered" note="exact" />
        <Metric
          value={fmt(pop.declares_a2a)}
          label="declare an A2A endpoint"
          note="exact"
          tone="var(--accent)"
        />
        <Metric
          value={String(s.size)}
          label="sampled"
          note={
            coverage !== null
              ? `across ${coverage}% of the population`
              : "stratified"
          }
        />
        {s.strata_failed.length > 0 && (
          <Metric
            value={`${s.strata.length}/${s.strata_planned}`}
            label="strata answered"
            note="the index timed out on the rest"
            tone="var(--warn)"
          />
        )}
      </dl>

      {/* El hallazgo. Solo se muestra si la muestra lo sostiene. */}
      {s.broken_template > 0 && (
        <div className="mt-8 rounded-panel border border-line bg-raised p-5">
          <p className="t-label" style={{ color: "var(--warn)" }}>
            Finding
          </p>
          <p className="t-body mt-2 max-w-3xl text-t2">
            <span className="text-t1">
              {s.broken_template} of {s.with_endpoint} sampled registrations
              {brokenPct !== null ? ` (${brokenPct}%)` : ""}
            </span>{" "}
            carry an endpoint URL with an unsubstituted placeholder — a template
            that was written to the chain with <code className="t-mono">{"{…}"}</code>{" "}
            still in it. Fetched as registered, they return an error.
            {resolvePct !== null && (
              <>
                {" "}
                Substituting the agent&rsquo;s own token id makes{" "}
                <span className="text-t1">
                  {s.template_resolves} of {s.broken_template}
                  {resolvePct !== null ? ` (${resolvePct}%)` : ""}
                </span>{" "}
                answer.
              </>
            )}
          </p>
          <p className="t-body mt-3 max-w-3xl text-t2">
            That distinction matters. These are not abandoned agents. Their
            on-chain record is wrong, and anyone probing the registry as written
            — us included, before we checked — counts them as dead.
          </p>

          {c.examples.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {["Token", "As registered", "With the id substituted"].map(
                      (h) => (
                        <th key={h} className="t-label py-2 pr-4 font-normal">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {c.examples.map((e) => (
                    <tr
                      key={e.token_id}
                      className="border-b border-line last:border-b-0"
                    >
                      <td className="t-mono py-2 pr-4 text-[12px] text-t2">
                        #{e.token_id}
                      </td>
                      <td
                        className="t-data py-2 pr-4"
                        style={{ color: "var(--dead)" }}
                      >
                        {e.registered_status}
                      </td>
                      <td
                        className="t-data py-2 pr-4"
                        style={{ color: "var(--live)" }}
                      >
                        {e.corrected_status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="t-data mt-2 text-t3">
                {c.examples[0].registered_url}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Lo que la propia plataforma dice de sus agentes, cuando lo dice. */}
      {s.platform_status.length > 0 && (
        <div className="mt-6">
          <p className="t-label">
            What the hosting platform reports about them
          </p>
          <div className="mt-2 flex flex-col gap-1">
            {s.platform_status.map((p) => (
              <p key={p.status} className="t-data text-t2">
                <span className="text-t1">{p.count}</span> ·{" "}
                <code className="t-mono">{p.status}</code>
              </p>
            ))}
          </div>
          <p className="t-body mt-2 max-w-3xl text-t2">
            Read from the platform&rsquo;s own response, not inferred from a
            failed probe. It is a better source about its own agents than our
            guess would be.
          </p>
        </div>
      )}

      <div className="mt-6">
        <p className="t-label">
          Where the sampled identities point — {s.distinct_hosts} distinct host
          {s.distinct_hosts === 1 ? "" : "s"} in {s.size} identities
        </p>
        <div className="mt-2 flex flex-col gap-1">
          {s.hosts.slice(0, 6).map((h) => (
            <div key={h.host} className="flex items-baseline gap-3">
              <span className="t-mono w-10 shrink-0 text-right text-[12px] text-t1">
                {h.count}
              </span>
              <span className="t-data truncate text-t2">{h.host}</span>
            </div>
          ))}
        </div>
        {lead && s.distinct_hosts <= 2 && (
          <p className="t-body mt-3 max-w-3xl text-t2">
            Every identity the sample reached resolves to the same backend. That
            is a statement about the sampled range, not proof about the part the
            index would not serve.
          </p>
        )}
      </div>
    </section>
  );
}

function fmt(n: number | null) {
  return n === null ? "—" : n.toLocaleString("en-US");
}

function Metric({
  value,
  label,
  note,
  tone = "var(--text)",
}: {
  value: string;
  label: string;
  note?: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="t-mono text-[22px] leading-none" style={{ color: tone }}>
        {value}
      </dt>
      <dd className="t-label mt-1.5">{label}</dd>
      {note && <dd className="t-data mt-0.5 text-t3">{note}</dd>}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="t-body text-t2">{children}</p>;
}
