import { Catalogue } from "@/components/Catalogue";
import { MarketSearch } from "@/components/MarketSearch";
import {
  mainnetRegistry,
  since,
  snapshot,
  toListItem,
} from "@/lib/snapshot";


export default function Home() {
  // Una sola proyeccion para el buscador y el catalogo: son los mismos agentes
  // y calcularla dos veces mandaria dos copias del mismo array al navegador.
  const items = snapshot.agents.map(toListItem);
  const probes = snapshot.agents.flatMap((a) => a.probes);
  const blocked = probes.filter((p) => p.blocked).length;
  const called = probes.length - blocked;

  return (
    <div>
      <Header called={called} blocked={blocked} />

      <div className="wrap px-6 pb-20 lg:px-10">
        <MarketSearch agents={items} />
        <div className="mt-12" />
        <Stats />

        <Catalogue agents={items} />
      </div>
    </div>
  );
}

function Header({ called, blocked }: { called: number; blocked: number }) {
  const hireable = snapshot.totals.hireable;
  const reg = mainnetRegistry();

  return (
    <header className="relative overflow-hidden border-b border-line px-6 pb-10 pt-12 lg:px-10 lg:pt-16">
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.55]"
      />
      <div className="wrap relative">
        <p className="t-label">BNB Smart Chain · ERC-8004 agent index</p>

        {/* El titular abre por la puerta, no por el diagnostico.
            Este sitio aspira a ser adoptado como "the canonical front door for
            every agent on BSC", y una puerta invita a pasar. Los mismos hechos
            en el orden inverso — cuantos responden AHORA primero, y el contraste
            con el registro justo debajo como evidencia — leen como un sitio
            donde contratar en vez de como una auditoria de lo que no funciona.
            No se ha suavizado ni una cifra: solo cambia cual se lee primero. */}
        <h1 className="t-display mt-4 max-w-3xl text-t1">
          <span style={{ color: "var(--live)" }}>{hireable} agents</span> on BSC
          <span className="text-t3"> will answer you right now.</span>
        </h1>

        <p className="t-body mt-5 max-w-2xl text-t2">
          Every one of them was called {since(snapshot.finished_at)} — the card,
          then the service behind it — and answered. Their latency, their price
          and the moment we checked are on every listing. The other{" "}
          {(reg.registered ?? 0).toLocaleString("en-US")} entries in the registry
          are why that sentence needs proving.
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
      <div className="col-span-full flex flex-col gap-2 bg-raised px-5 pb-4">
        <p className="text-[12px] leading-relaxed text-t3">
          The last two numbers are the point. {snapshot.totals.live} agents serve
          a valid card, but only {snapshot.totals.hireable} have a working A2A
          service behind it. Checking the card alone would have told you{" "}
          {snapshot.totals.live}, and{" "}
          {snapshot.totals.live - snapshot.totals.hireable} of those cannot be
          hired by anyone.
        </p>
        {snapshot.totals.cloned > 0 && (
          <p className="text-[12px] leading-relaxed text-t3">
            A registration is not an identity either.{" "}
            <span className="text-t2">
              {snapshot.totals.cloned} of the listings here are one operator
              wearing several hats
            </span>{" "}
            — same owner, same backend, {snapshot.totals.clusters} cluster
            {snapshot.totals.clusters === 1 ? "" : "s"} in total. Unpenalised
            they scored 100 and filled this page. They are still listed, scored
            down and labelled, because deleting them would hide how much of the
            registry works this way.
          </p>
        )}
      </div>
    </section>
  );
}
