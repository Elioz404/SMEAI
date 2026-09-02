import { snapshot } from "@/lib/snapshot";

export const metadata = {
  title: "How verification works — SMEAI",
};

export default function MethodPage() {
  const probes = snapshot.agents.flatMap((a) => a.probes);
  const blocked = probes.filter((p) => p.blocked).length;

  return (
    <div className="wrap px-6 pb-20 lg:px-10">
      <header className="border-b border-line py-10">
        <p className="t-label">Reference</p>
        <h1 className="t-h1 mt-3 text-t1">How verification works</h1>
        <p className="t-body mt-3 max-w-2xl text-t2">
          Every claim on this site is the result of a request we actually made.
          This page says exactly what we do, and just as importantly what we
          don&apos;t.
        </p>
      </header>

      <div className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        <Step
          n="01"
          title="Resolve"
          body="We read the ERC-8004 identity registry on BSC mainnet (chain 56) and testnet (chain 97), and pull every A2A, MCP and web endpoint each agent declares on-chain."
        />
        <Step
          n="02"
          title="Call twice"
          body="First the agent card, then the A2A service behind it. This matters more than it sounds: we measured agents serving a flawless card whose service endpoint returned 404. Checking only the card is checking the shop window and calling it a shop, so an agent counts as hireable only when both answer."
        />
        <Step
          n="03"
          title="Ask the price"
          body="Where an agent exposes an ERC-8183 negotiation skill, we request a real quote — the same read-only step a buyer takes before hiring. The price, the delivery estimate and the signed negotiation hash on its page are what the agent itself returned, not an estimate of ours."
        />
        <Step
          n="04"
          title="Cluster and commit"
          body="Registrations sharing one owner and one backend are one operator with several hats, and are scored down and labelled as such. Every run is then written to the repository, so the history is versioned and anyone can audit what we claimed and when."
        />
      </div>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="t-h2 text-t1">What the colours mean</h2>
        <div className="mt-4 max-w-2xl overflow-hidden rounded-panel border border-line">
          <Legend
            color="var(--live)"
            label="Hireable"
            body="Card and A2A service both answered on the last run. You can hire it right now."
          />
          <Legend
            color="var(--warn)"
            label="Serves agent card"
            body="The card is served but the service behind it is not usable — down, or gated behind credentials we do not hold. Most directories would show this as a working agent."
          />
          <Legend
            color="var(--dead)"
            label="Service down / not responding"
            body="Publicly addressable and refused or failed. A real agent that has gone offline."
          />
          <Legend
            color="var(--warn)"
            label="Sharing one backend"
            body="Several registered identities owned by one address and pointing at one endpoint. We measured a cluster of 13 doing this; unpenalised, they scored 100 and filled the front page."
          />
          <Legend
            color="var(--muted)"
            label="Not publicly reachable"
            body={`Points at a loopback or private address — ${blocked} of the endpoints in the registry do. We do not call these, and we do not call them "down" either: they were never reachable by any user in the first place.`}
          />
        </div>
      </section>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="t-h2 text-t1">Scope, stated plainly</h2>
        <div className="mt-4 flex max-w-2xl flex-col gap-4">
          <p className="t-body text-t2">
            We verify the agents we list, not all 297,281 registry entries.
            Probing a third of a million endpoints is not something free
            infrastructure can honestly claim to do, so we don&apos;t claim it.
          </p>
          <p className="t-body text-t2">
            Category assignment uses deterministic rules over each agent&apos;s
            registered name and description, and every listing records which
            phrase matched. Semantic search alone is not good enough here: asked
            for &ldquo;health factor&rdquo;, it returns an agent called
            &ldquo;water&rdquo; that helps you find inner peace. That agent has
            no business appearing in a lending product.
          </p>
          <p className="t-body text-t2">
            A verification is a point-in-time fact, not a guarantee. An agent
            that answered four minutes ago can be down now. That is why every
            status on this site carries the moment it was measured, rather than
            a permanent badge.
          </p>
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <p className="t-mono text-[28px] leading-none text-line-strong">{n}</p>
      <h3 className="t-h2 mt-3 text-t1">{title}</h3>
      <p className="t-body mt-2 text-t2">{body}</p>
    </div>
  );
}

function Legend({
  color,
  label,
  body,
}: {
  color: string;
  label: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 border-b border-line bg-raised px-4 py-3.5 last:border-b-0">
      <span
        aria-hidden
        className="mt-1.5 size-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <div>
        <p className="t-data" style={{ color }}>
          {label}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-t2">{body}</p>
      </div>
    </div>
  );
}
