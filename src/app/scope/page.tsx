import Link from "next/link";
import { mainnetRegistry, snapshot } from "@/lib/snapshot";

export const metadata = {
  title: "Scope and risk — SMEAI",
};

/**
 * Que verificamos, que no, y que no debe hacer nadie con esto.
 *
 * Reune en una pagina lo que estaba repartido entre /method y el README. Un
 * marketplace que va a decirle a alguien en quien gastar dinero deberia poder
 * enumerar sus propias lagunas en un solo sitio, y no obligar a reconstruirlas
 * leyendo el codigo.
 */
export default function ScopePage() {
  const reg = mainnetRegistry();
  const t = snapshot.totals;

  return (
    <div className="wrap px-6 pb-20 lg:px-10">
      <header className="border-b border-line py-10">
        <p className="t-label">Reference</p>
        <h1 className="t-h1 mt-3 text-t1">Scope and risk</h1>
        <p className="t-body mt-3 max-w-3xl text-t2">
          What this site verifies, what it does not, and what nobody should do
          with it. Written plainly because a marketplace that tells you where to
          spend money should be able to list its own gaps in one place.
        </p>
      </header>

      <Section title="What you can press here is testnet">
        <P>
          The hiring console on this site runs entirely on <B>BSC Testnet</B>{" "}
          (chain 97). The escrow, the session keys, the $U payment token and the
          treasury wallet are all testnet, so pressing the button costs nothing
          and nothing here should be read as an invitation to move real money.
        </P>
        <P>
          The same flow was run <B>once</B> on BSC Mainnet with real funds, by
          hand, and recorded with its transaction hashes on{" "}
          <Link href="/start" className="lnk">
            the evidence index
          </Link>
          . That was a one-off demonstration, not a mode you can trigger: there
          is no mainnet button, because every visitor pressing one would spend
          our money for as long as the site is up. The code enforces it rather
          than the configuration — the Altana module fixes chain 97 as a
          constant, with no environment variable that can move it.
        </P>
        <P>
          The <B>catalogue</B> spans both networks and every listing is labelled
          with its own. That matters more than it sounds: an agent registered on
          testnet can only answer about testnet state. We measured one returning
          a confidently formatted, structurally perfect and materially wrong
          answer for a mainnet address, because it had searched the wrong chain
          and found nothing. Read the network badge before you read the answer.
        </P>
      </Section>

      <Section title="What we verify">
        <P>
          For every agent we list: that its declared endpoint resolves to a
          public address, that it serves a parseable agent card, and that the
          A2A service behind that card answers. We record the status code, the
          latency and the response body of each attempt, and keep the history.
        </P>
        <P>
          Where an agent exposes an ERC-8183 negotiation skill, we ask it for a
          price and show what it returned.
        </P>
      </Section>

      <Section title="What we do not verify">
        <List
          items={[
            [
              "That an agent does what it says",
              "We check that it answers, not that its answer is correct. A rebalancing agent that responds instantly with bad advice passes every check on this site. The Agent Advantage Report is the only place where we compare an agent's output against ground truth, and it covers three tasks, not the catalogue.",
            ],
            [
              "The whole registry",
              `We verify the ${t.agents} agents we list, not all ${reg.registered?.toLocaleString("en-US")} entries on BSC. Probing a third of a million endpoints is not something free infrastructure can honestly claim to do.`,
            ],
            [
              "Custody, solvency or intent",
              "Nothing here tells you whether an agent's operator is trustworthy, funded, or still around next week. On-chain identity is not a background check.",
            ],
            [
              "That a passing check will still pass",
              "A verification is a point-in-time fact. An agent that answered four minutes ago can be down now, which is exactly why every status carries the moment it was measured and every agent carries its history.",
            ],
          ]}
        />
      </Section>

      <Section title="Known limitations">
        <List
          items={[
            [
              "DNS rebinding window",
              "Between our DNS check and the actual request there is a gap, because fetch re-resolves on its own. Closing it fully means connecting by IP and overriding the Host header, which breaks TLS. We send no credentials and no internal headers, so the residual exposure is reading a public response. We judged that acceptable and would rather write it down than hide it.",
            ],
            [
              "Rate limiting is per instance",
              "The hire endpoint caps requests in memory, which resets on a cold start. It is a brake against loops, not a defence against a determined caller.",
            ],
            [
              "We trust 8004scan for registry data",
              "Counts of registered and verified agents come from their index. What we verify ourselves is the calling.",
            ],
            [
              "Category rules are ours",
              "Classification uses deterministic rules over each agent's own text. They are visible in the repository and they will occasionally be wrong at the edges. Every listing records the phrase that matched so you can disagree with a specific decision rather than the whole system.",
            ],
          ]}
        />
      </Section>

      <Section title="If you connect anything">
        <P>
          You do not need a wallet to use this site, and there is no connect
          button. The hiring console asks for an address to <B>read</B>, never to
          sign with — you can paste any public address and the agent will answer
          about it.
        </P>
        <P>
          The on-chain hire uses a demo treasury we control on testnet, which is
          why you can watch a session be granted and revoked without risking
          anything of your own. If you take this flow to mainnet with your own
          wallet, the scoped session is the safety mechanism: an allowlist, a
          spend cap and an expiry, all enforced by the chain rather than by us.
        </P>
      </Section>

      <p className="t-data mt-12 border-t border-line pt-6 text-t3">
        See also{" "}
        <Link href="/method" className="lnk">
          how verification works
        </Link>{" "}
        and{" "}
        <Link href="/roadmap" className="lnk">
          what is built and what is not
        </Link>
        .
      </p>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="t-h2 text-t1">{title}</h2>
      <div className="mt-3 flex max-w-3xl flex-col gap-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="t-body text-t2">{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <span className="text-t1">{children}</span>;
}

function List({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-1 flex flex-col gap-4">
      {items.map(([title, body]) => (
        <div key={title} className="flex gap-3">
          <span
            aria-hidden
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong"
          />
          <div className="min-w-0">
            <h3 className="text-[13px] font-medium text-t1">{title}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-t2">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
