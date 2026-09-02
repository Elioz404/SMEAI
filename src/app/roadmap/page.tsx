import Link from "next/link";
import { mainnetRegistry, since, snapshot } from "@/lib/snapshot";
import { history } from "@/lib/history";

export const metadata = {
  title: "Roadmap — SMEAI",
};

/**
 * Que esta hecho y que no.
 *
 * Existe porque el premio de este hackathon es la adopcion como producto, y un
 * jurado que evalua adoptar necesita saber si hay algo despues del 9 de
 * septiembre. Pero un roadmap es facil de escribir y barato de prometer, asi
 * que este separa las tres cosas que suelen mezclarse: lo entregado (con
 * cifras que se pueden comprobar en el propio sitio), lo siguiente, y lo que
 * hemos decidido NO hacer — que suele decir mas de un producto que su lista de
 * deseos.
 */
export default function RoadmapPage() {
  const reg = mainnetRegistry();
  const t = snapshot.totals;

  const shipped = [
    {
      title: "Two-level verification",
      body: `Every listed agent has its card and its A2A service called separately. ${t.live} serve a card; ${t.hireable} have a service behind it. The gap is the point.`,
    },
    {
      title: "Deterministic classification",
      body: "Agents are placed in the four categories by rules over their registered name and description, and each listing records the phrase that matched. Semantic search alone puts an agent called “water” under health factor.",
    },
    {
      title: "Cloned-identity detection",
      body: `${t.cloned} listings share one owner and one backend. They are scored down and labelled rather than removed, because how much of the registry works this way is itself the finding.`,
    },
    {
      title: "Price discovery",
      body: "Where an agent exposes an ERC-8183 negotiation skill, we request a real quote and show the price, the delivery estimate and the signed negotiation hash it returned.",
    },
    {
      title: "Hiring, two ways",
      body: "A real A2A task, prefilled so the first click works; and an on-chain hire that funds an ERC-8183 job in escrow through a scoped Altana session — allowlisted to four contracts, capped at the agent's own quoted price, expiring in an hour, revocable in one transaction.",
    },
    {
      title: "Verification history",
      body: `Every run is committed to the repository. ${history.checks.length} checks recorded so far, growing every 30 minutes. An agent's page shows whether it has been up all along or only when you happened to look.`,
    },
    {
      title: "Agent Advantage Report",
      body: "Three real tasks run with an agent and without one, outputs attached. The agents win two and lose one.",
    },
  ];

  const next = [
    {
      title: "Recovery alerts",
      body: "The history already records when an agent comes back. Surfacing that — “three agents in this category recovered today” — is the obvious next read of data we are already collecting.",
    },
    {
      title: "Quote coverage",
      body: `Only ${t.quotes} agents currently return a price, because only they expose a negotiation skill. As more sellers implement ERC-8183, price becomes a column you can sort a marketplace by.`,
    },
    {
      title: "Mainnet hiring",
      body: "The on-chain hire runs on BSC Testnet today. The same flow works on mainnet; what it needs is a funded treasury and a decision that real money should move, which is not a decision to make during a hackathon.",
    },
    {
      title: "Per-agent session policy",
      body: "Spend caps are currently derived from the quoted price. Letting a buyer set their own cap and expiry before granting is a small change to a flow that already enforces both on-chain.",
    },
  ];

  const notPlanned = [
    {
      title: "Listing our own agents",
      body: "Health Factor has one hireable agent and we could raise that to two by deploying one. We are not going to. A marketplace that fills its thinnest category with its own inventory has stopped measuring the ecosystem and started decorating it.",
    },
    {
      title: "Hiding failures",
      body: "Removing dead agents would produce a shorter, cleaner, more flattering catalogue. It would also delete the most useful thing we know about them.",
    },
    {
      title: "Reputation scores we cannot source",
      body: `Of ${reg.registered?.toLocaleString("en-US")} agents on BSC, ${reg.endpoint_verified} carry a verified endpoint and almost none carry on-chain feedback. TVL, win rates and uptime percentages are not available for these agents, so we do not display fields for them.`,
    },
  ];

  return (
    <div className="wrap px-6 pb-20 lg:px-10">
      <header className="border-b border-line py-10">
        <p className="t-label">Reference</p>
        <h1 className="t-h1 mt-3 text-t1">What is built, and what is not</h1>
        <p className="t-body mt-3 max-w-3xl text-t2">
          Everything under <span className="text-t1">Shipped</span> is running on
          this site right now and can be checked from it — no item here is a
          description of intent. Everything under{" "}
          <span className="text-t1">Next</span> is a direction, not a date.
        </p>
        <p className="t-data mt-4 text-t3">
          Figures measured {since(snapshot.finished_at)} · the catalogue
          re-verifies itself every 30 minutes
        </p>
      </header>

      <Block
        n="01"
        title="Shipped"
        tone="var(--live)"
        hint="Live on this site. Follow any claim to the page that proves it."
        items={shipped}
      />

      <Block
        n="02"
        title="Next"
        tone="var(--warn)"
        hint="Ordered by how much they improve a hiring decision, not by how hard they are."
        items={next}
      />

      <Block
        n="03"
        title="Deliberately not planned"
        tone="var(--muted)"
        hint="A product is also what it refuses to do."
        items={notPlanned}
      />

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="t-h2 text-t1">On continuity</h2>
        <div className="mt-3 flex max-w-3xl flex-col gap-3">
          <p className="t-body text-t2">
            The most useful thing to know about whether this keeps running is
            that nobody has to keep it running. There is no database to
            provision, no always-on worker to babysit and no paid service in the
            path — the catalogue is re-verified and committed by a scheduled job,
            and the site is rebuilt from what that job wrote.
          </p>
          <p className="t-body text-t2">
            That was a deliberate constraint rather than a shortcut. The likeliest
            way for a project like this to fail is not a bug; it is a free tier
            quietly expiring, or a process nobody restarted. Nothing here can go
            to sleep, and a degraded run refuses to publish over a good one
            rather than replacing the catalogue with a worse copy of itself.
          </p>
          <p className="t-body text-t2">
            None of the above is a promise of timing, and nothing here implies
            mainnet activity is live. It is not.
          </p>
        </div>
        <p className="t-data mt-5 text-t3">
          See also{" "}
          <Link href="/scope" className="text-t2 underline decoration-line-strong underline-offset-2 hover:text-accent">
            scope and risk
          </Link>{" "}
          and{" "}
          <Link href="/method" className="text-t2 underline decoration-line-strong underline-offset-2 hover:text-accent">
            how verification works
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function Block({
  n,
  title,
  tone,
  hint,
  items,
}: {
  n: string;
  title: string;
  tone: string;
  hint: string;
  items: { title: string; body: string }[];
}) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <div className="flex items-baseline gap-3">
        <span className="t-mono text-[22px] leading-none text-line-strong">
          {n}
        </span>
        <h2 className="t-h2 text-t1" style={{ color: tone }}>
          {title}
        </h2>
      </div>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-t3">{hint}</p>

      <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-2">
        {items.map((it) => (
          <div key={it.title} className="flex gap-3">
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: tone }}
            />
            <div className="min-w-0">
              <h3 className="text-[13px] font-medium text-t1">{it.title}</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-t2">
                {it.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
