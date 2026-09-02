import Link from "next/link";
import { AgentRow } from "@/components/AgentRow";
import { MarketSearch } from "@/components/MarketSearch";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  agentsIn,
  mainnetRegistry,
  since,
  snapshot,
  toListItem,
} from "@/lib/snapshot";

// Cuántos agentes se muestran por categoría en la portada.
// Es el mismo número para las cuatro, a propósito: el brief exige que las
// cuatro categorías tengan la misma profundidad, y la maquetación debe
// afirmarlo antes de que nadie lea un número. Cuatro columnas de 44, 24, 36 y
// 19 filas dirían lo contrario de un vistazo.
const PER_CATEGORY = 5;

export default function Home() {
  const probes = snapshot.agents.flatMap((a) => a.probes);
  const blocked = probes.filter((p) => p.blocked).length;
  const called = probes.length - blocked;

  return (
    <div>
      <Header called={called} blocked={blocked} />

      <div className="wrap px-6 pb-20 lg:px-10">
        <MarketSearch agents={snapshot.agents.map(toListItem)} />
        <div className="mt-12" />
        <Stats />

        <div className="mt-14 flex flex-col gap-12">
          {CATEGORY_ORDER.map((key) => {
            const meta = CATEGORY_META[key];
            const all = agentsIn(key);
            const hireable = all.filter((a) => a.hireable).length;
            const top = all.slice(0, PER_CATEGORY).map(toListItem);

            return (
              <section key={key}>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line-strong pb-3">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="t-mono flex size-7 items-center justify-center rounded text-[10px] font-semibold"
                      style={{
                        color: meta.accent,
                        boxShadow: `inset 0 0 0 1px ${meta.accent}55`,
                      }}
                    >
                      {meta.short}
                    </span>
                    <div>
                      <h2 className="t-h2 text-t1">{meta.label}</h2>
                      <p className="text-[12px] leading-snug text-t3">
                        {meta.blurb}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    <p className="t-data text-t3">
                      <span
                        className="text-[15px]"
                        style={{ color: "var(--live)" }}
                      >
                        {hireable}
                      </span>
                      <span className="text-[15px] text-t3"> / {all.length}</span>
                      <span className="ml-1.5">hireable</span>
                    </p>
                    <Link
                      href={`/category/${key}`}
                      className="t-data rounded border border-line px-2.5 py-1 text-t2 transition-colors hover:border-accent hover:text-accent"
                    >
                      View all {all.length}
                    </Link>
                  </div>
                </div>

                <div className="mt-1">
                  {top.map((a) => (
                    <AgentRow key={a.id} agent={a} showCategories={false} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Header({ called, blocked }: { called: number; blocked: number }) {
  return (
    <header className="relative overflow-hidden border-b border-line px-6 pb-10 pt-12 lg:px-10 lg:pt-16">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.55]"
      />
      <div className="wrap relative">
        <p className="t-label">BNB Smart Chain · ERC-8004 agent index</p>

        <h1 className="t-display mt-4 max-w-3xl text-t1">
          Agents that
          <span style={{ color: "var(--live)" }}> answer</span>
          <span className="text-t3">, not agents that registered.</span>
        </h1>

        <p className="t-body mt-5 max-w-2xl text-t2">
          Anyone can register an agent on BSC. Almost nobody checks whether the
          thing they registered is still there. SMEAI calls every endpoint it
          lists and shows you the result, with the latency and the timestamp
          attached.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="t-data flex items-center gap-2 text-t2">
            <span
              aria-hidden
              className="pulse-live size-1.5 rounded-full"
              style={{ background: "var(--live)" }}
            />
            Last run {since(snapshot.finished_at)}
          </span>
          <span className="t-data text-t3">{called} endpoints called</span>
          {blocked > 0 && (
            <span
              className="t-data text-t3"
              title="Endpoints pointing at private or loopback addresses, which no public user could ever reach"
            >
              {blocked} unreachable by design
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * La evidencia va arriba porque es el argumento del producto entero.
 * Las dos primeras cifras son de 8004scan; las dos ultimas las medimos nosotros,
 * y esa distincion se marca con la etiqueta de origen bajo cada una.
 */
function Stats() {
  const reg = mainnetRegistry();
  const items = [
    {
      value: reg.registered?.toLocaleString("en-US") ?? "—",
      label: "agents in the BSC registry",
      source: "8004scan · chain 56",
      tone: "var(--text)",
    },
    {
      value: reg.endpoint_verified?.toLocaleString("en-US") ?? "—",
      label: "have a verified endpoint",
      source: "8004scan",
      tone: "var(--dead)",
    },
    {
      value: String(snapshot.totals.live),
      label: "serve a valid agent card",
      source: "SMEAI · we called them",
      tone: "var(--warn)",
    },
    {
      value: String(snapshot.totals.hireable),
      label: "whose service actually answers",
      source: `SMEAI · ${since(snapshot.finished_at)}`,
      tone: "var(--live)",
    },
  ];

  return (
    <section className="-mt-px grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="bg-raised px-5 py-5">
          <p className="t-stat" style={{ color: it.tone }}>
            {it.value}
          </p>
          <p className="mt-2 text-[12.5px] leading-snug text-t2">{it.label}</p>
          <p className="t-label mt-2">{it.source}</p>
        </div>
      ))}
      <p className="col-span-full bg-raised px-5 pb-4 text-[12px] leading-relaxed text-t3">
        The last two numbers are the point. {snapshot.totals.live} agents serve a
        valid card, but only {snapshot.totals.hireable} have a working A2A
        service behind it. Checking the card alone would have told you{" "}
        {snapshot.totals.live}, and {snapshot.totals.live - snapshot.totals.hireable}{" "}
        of those cannot be hired by anyone.
      </p>
    </section>
  );
}
