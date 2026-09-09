import Link from "next/link";
import { snapshot } from "@/lib/snapshot";
import { lifecycle } from "@/lib/lifecycle";

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
        <h2 className="t-h2 text-t1">Why failures stay on the page</h2>
        <div className="mt-4 flex max-w-2xl flex-col gap-4">
          <p className="t-body text-t2">
            Probing endpoints is not a new idea, and we do not claim it is.
            Plenty of registries and API directories check whether a service
            answers, and most of them respond by quietly removing the ones that
            do not. That produces a cleaner list.
          </p>
          <p className="t-body text-t2">
            We do the opposite, for a specific reason. A marketplace that hides
            its failures teaches you nothing about the ecosystem you are about to
            spend money in. Of the agents registered under the four categories
            here, most cannot be hired — some point at a laptop, some return 404,
            some serve a perfect card in front of a dead service. Deleting them
            would make this site look healthier and make the reader worse
            informed.
          </p>
          <p className="t-body text-t2">
            So a failing agent stays listed, dimmed, with the status code, the
            latency, the raw response and the history of every check we have run
            against it. What distinguishes a verification from a claim is that
            you can check it, and you cannot check something that has been
            removed.
          </p>
        </div>
      </section>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="t-h2 text-t1">Why we stop at the price</h2>
        <div className="mt-3 grid max-w-3xl gap-3">
          <p className="t-body text-t2">
            The obvious next step is to check whether an agent&rsquo;s answer is
            correct, not merely that it arrived. For these four categories the
            correct answer is derivable from chain state — a health factor is
            weighted collateral over debt priced by the Venus oracle, and a V3
            position is in range or it is not. We already compute all of it for
            our own reference agents.
          </p>
          <p className="t-body text-t2">
            We tried, and the attempt is the result. Ask the highest-scoring
            health-factor agent on mainnet for a health factor and it answers{" "}
            <code className="t-data text-t1">unknown skill</code>. Ask the same
            agent for a quote and it accepts, prices the work at 0.10 $U, and
            names the ERC-8183 escrow kernel it wants funding through. Of the
            agents whose service answers, a minority get even that far.
          </p>
          <p className="t-body text-t2">
            So we funded the escrows — eleven of them, across both networks,
            with real money. Not one third-party seller ever submitted a
            deliverable. Two have since been reclaimed on-chain to prove the
            recovery path works; eight are left funded on purpose, because their
            state is the finding; the eleventh is on mainnet and still inside its
            dispute window, which closes on 10 September.
          </p>
          <p className="t-body text-t2">
            Eleven silences raise a question the catalogue cannot answer by
            looking at itself: is the rail broken, or are the sellers absent?
            Those need separating, because only one of them is fixable by the
            people building here. So we became the seller once — job{" "}
            <Link className="underline" href="/start">
              #{lifecycle.job_id}
            </Link>{" "}
            went funded, delivered, through its dispute window, settled, and the
            provider was paid, with the deliverable being our reference
            monitor&apos;s real answer for a real Venus borrower. The rail
            completes. What this market is short of is sellers who turn up.
          </p>
          <p className="t-body text-t2">
            That job is not on the marketplace and cannot be. Its seller is not
            registered in ERC-8004, so the catalogue cannot surface it by
            construction rather than by filtering, and the sentence saying both
            sides of it are ours is committed inside the hash the chain holds —
            not a footnote on this page that we could quietly drop later.
          </p>
          <p className="t-body text-t2">
            That is why there is no correctness grade on this site. It is not a
            feature we skipped; it is a measurement that this ecosystem cannot
            currently support, and saying so with the receipts is worth more
            than a scoring rubric applied to answers nobody produced.
          </p>
        </div>
      </section>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="t-h2 text-t1">Scope, stated plainly</h2>
        <p className="t-body mt-3 max-w-2xl text-t2">
          What we verify, what we do not, and the limitations we know about are
          collected on one page rather than scattered through this one. See{" "}
          <Link
            href="/scope"
            className="text-t1 underline decoration-line-strong underline-offset-2 hover:text-accent"
          >
            scope and risk
          </Link>
          .
        </p>
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
