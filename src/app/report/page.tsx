import report from "../../../data/advantage-report.json";
import { since } from "@/lib/taxonomy";

export const metadata = {
  title: "Agent Advantage Report — SMEAI",
};

type Task = (typeof report.tasks)[number];

/**
 * El entregable obligatorio del reto de TermiX.
 *
 * Todo lo numerico sale de data/advantage-report.json, que produce
 * scripts/advantage-report.mjs ejecutando las dos vias de verdad. La prosa es
 * analisis del autor y se distingue del dato medido.
 *
 * El informe incluye una tarea que los agentes PIERDEN, y de forma grave. Un
 * informe con tres victorias no seria creible, y ademas el fallo es el hallazgo
 * mas util de los tres.
 */
export default function ReportPage() {
  const t = (id: string) => report.tasks.find((x) => x.id === id) as Task;
  const lp = t("lp-range");
  const venus = t("venus-health");
  const grid = t("grid-context");

  return (
    <div className="wrap px-6 pb-20 lg:px-10">
      <header className="border-b border-line py-10">
        <p className="t-label">Required submission · TermiX Challenge</p>
        <h1 className="t-h1 mt-3 text-t1">Agent Advantage Report</h1>
        <p className="t-body mt-3 max-w-3xl text-t2">
          Three real tasks, each run twice: once by hiring an agent listed on
          SMEAI, once by reading the contracts directly. Both outputs are
          attached below, unedited. The agents win two and lose one, and the loss
          is the most useful result of the three.
        </p>
        <p className="t-data mt-4 text-t3">
          Run {since(report.generated_at)} · every number on this page was
          measured, not estimated
        </p>
      </header>

      <section className="mt-10">
        <h2 className="t-h2 text-t1">Method</h2>
        <div className="mt-3 flex max-w-3xl flex-col gap-3">
          <p className="t-body text-t2">
            The &ldquo;with agent&rdquo; path is a real A2A{" "}
            <span className="t-mono">message/send</span> to an agent registered
            on the ERC-8004 registry and listed on SMEAI. The &ldquo;without
            agent&rdquo; path is direct <span className="t-mono">eth_call</span>{" "}
            reads against PancakeSwap V3 and Venus, written for this report.
          </p>
          <p className="t-body text-t2">
            Inputs were discovered on-chain, not chosen: the position and pool
            come from the most recent{" "}
            <span className="t-mono">IncreaseLiquidity</span> event on BSC
            Testnet, and the borrower from the most recent{" "}
            <span className="t-mono">Borrow</span> event on Venus mainnet.
          </p>
          <p className="t-body text-t2">
            Two different clocks are reported and never mixed.{" "}
            <span className="text-t1">Machine time</span> is measured.{" "}
            <span className="text-t1">Author time</span> is how long it took a
            developer to build each path the first time — for the manual path,
            that includes working out which contract to call and how to decode
            it. Author time is declared, not measured, and is labelled as such.
          </p>
          <p className="t-body text-t2">
            Cost: the three skills used here are free to call. The priced path
            exists and was measured separately — agents exposing an ERC-8183{" "}
            <span className="t-mono">negotiate</span> skill quote{" "}
            <span className="text-accent">0.1 $U</span> with a 10-minute delivery
            estimate, returned with a signed negotiation hash.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="t-h2 text-t1">Results at a glance</h2>
        <div className="mt-4 overflow-x-auto rounded-panel border border-line">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-line bg-raised">
                <Th>Task</Th>
                <Th>Category</Th>
                <Th right>Agent</Th>
                <Th right>Manual</Th>
                <Th right>RPC calls</Th>
                <Th>Winner</Th>
              </tr>
            </thead>
            <tbody>
              <Tr
                task="LP range state"
                cat="Rebalancing"
                agent={`${lp.with_agent.machine_ms} ms`}
                manual={`${lp.without_agent.machine_ms} ms`}
                rpc={String(lp.without_agent.rpc_calls)}
                winner="agent"
                winnerNote="richer, and agrees"
              />
              <Tr
                task="Venus liquidation risk"
                cat="Security"
                agent={`${venus.with_agent.machine_ms} ms`}
                manual={`${venus.without_agent.machine_ms} ms`}
                rpc={String(venus.without_agent.rpc_calls)}
                winner="manual"
                winnerNote="agent answered wrongly"
              />
              <Tr
                task="Grid market context"
                cat="Trading"
                agent={`${grid.with_agent.machine_ms} ms`}
                manual={`${grid.without_agent.machine_ms} ms`}
                rpc={String(grid.without_agent.rpc_calls)}
                winner="agent"
                winnerNote="TWAP we did not compute"
              />
            </tbody>
          </table>
        </div>
        <p className="t-data mt-3 text-t3">
          The agent is slower on the wire in all three. Latency is not where the
          advantage is, and pretending otherwise would be easy to disprove.
        </p>
      </section>

      <Finding
        n="01"
        title="Where the agent wins: it knows what the numbers mean"
        verdict="agent"
      >
        <p className="t-body text-t2">
          On the LP task both paths returned the same tick (
          <span className="t-mono text-t1">115133</span>), the same liquidity and
          the same price, from independent code. That agreement is the useful
          part: it is cross-validation, and it means the agent is reading the
          chain rather than guessing.
        </p>
        <p className="t-body mt-3 text-t2">
          What the manual path could not produce without more work: the pair is{" "}
          <span className="t-mono text-t1">WBNB/GFT</span>, token decimals, tick
          spacing, the position owner, and the block the reading belongs to. My
          version returned two raw addresses and left the reader to look them up.
        </p>
        <p className="t-body mt-3 text-t2">
          The honest summary is that the advantage is not speed — the agent took{" "}
          {lp.with_agent.machine_ms} ms against {lp.without_agent.machine_ms} ms
          — it is that the buyer does not need to know that PancakeSwap keeps
          positions in a NonfungiblePositionManager, that the pool must be
          derived through the factory, or how to read{" "}
          <span className="t-mono">slot0</span>. That knowledge is the thing
          being bought.
        </p>
      </Finding>

      <Finding
        n="02"
        title="Where the agent loses, badly: a confident wrong answer"
        verdict="manual"
      >
        <p className="t-body text-t2">
          We asked both paths whether a real Venus borrower is close to
          liquidation. The direct read returned{" "}
          <span className="t-mono text-t1">
            $
            {(
              venus.without_agent.output as { excessLiquidityUsd?: number }
            )?.excessLiquidityUsd?.toFixed(2)}
          </span>{" "}
          of excess liquidity across{" "}
          <span className="t-mono text-t1">
            {
              (venus.without_agent.output as { marketsEntered?: number })
                ?.marketsEntered
            }
          </span>{" "}
          markets, no shortfall.
        </p>
        <p className="t-body mt-3 text-t2">
          VenusGuard returned{" "}
          <span className="t-mono" style={{ color: "var(--dead)" }}>
            &quot;positions&quot;: []
          </span>{" "}
          — no positions at all — with{" "}
          <span className="t-mono">coverage: AVAILABLE</span> and a completed
          task status. It did not error. It produced a structurally perfect,
          confidently formatted, materially wrong answer.
        </p>
        <p className="t-body mt-3 text-t2">
          The cause is in its own output:{" "}
          <span className="t-mono text-t1">network: testnet</span>. The agent is
          registered on BSC Testnet and reads testnet Venus. The wallet has its
          position on mainnet. Nothing in the ERC-8004 registration says the
          agent only answers for one network, and nothing in its reply flags that
          the address was not found on the chain it searched.
        </p>
        <p className="t-body mt-3 text-t2">
          For a liquidation-risk agent this is the worst possible failure mode:
          silence would be safe, an error would be safe, and &ldquo;you have no
          position&rdquo; is the one answer that gets someone liquidated. It is
          also why every listing on SMEAI carries its network on the card rather
          than in a footnote.
        </p>
      </Finding>

      <Finding
        n="03"
        title="Where the agent wins by knowing what it does not know"
        verdict="agent"
      >
        <p className="t-body text-t2">
          On the trading task my manual grid computed a step, subtracted the fee
          tier and declared a negative edge. It was arithmetic on a single
          spot price.
        </p>
        <p className="t-body mt-3 text-t2">
          GridPilot returned the same spot numbers and added TWAP windows — and
          this is the part worth paying for, marked{" "}
          <span className="t-mono" style={{ color: "var(--live)" }}>
            1h: AVAILABLE
          </span>{" "}
          but{" "}
          <span className="t-mono" style={{ color: "var(--warn)" }}>
            6h and 24h: UNAVAILABLE
          </span>
          . The pool has not accumulated enough oracle observations, and rather
          than interpolating something plausible it said so.
        </p>
        <p className="t-body mt-3 text-t2">
          An agent that refuses to answer beyond its data is worth more than one
          that always answers, and it is the opposite of what VenusGuard did in
          finding 02. Both are Spotriq reference agents, which shows this is a
          per-skill property rather than a per-vendor one.
        </p>
      </Finding>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="t-h2 text-t1">What this means for hiring</h2>
        <div className="mt-3 flex max-w-3xl flex-col gap-3">
          <p className="t-body text-t2">
            Two of three tasks came back better through an agent, and neither for
            the reason a marketplace usually advertises. Nothing was faster.
            What the buyer avoided was knowing the protocol layout — and in the
            grid case, getting oracle context they would not have thought to
            compute.
          </p>
          <p className="t-body text-t2">
            The third result is the one that should change how these things are
            sold. An agent can be live, deterministic, fast and precise, and
            still be wrong because it is looking at the wrong chain. No
            reputation score catches that, because the agent is behaving exactly
            as designed. Only comparing its answer against ground truth catches
            it, which is what this report did and what a marketplace should keep
            doing after the pitch is over.
          </p>
        </div>
      </section>

      <section className="mt-14 border-t border-line pt-10">
        <h2 className="t-h2 text-t1">Raw outputs</h2>
        <p className="mt-1 text-[12px] text-t3">
          Unedited, as returned. Reproduce with{" "}
          <span className="t-mono">node scripts/advantage-report.mjs</span>.
        </p>
        <div className="mt-5 flex flex-col gap-8">
          {report.tasks.map((task) => (
            <div key={task.id}>
              <h3 className="t-h2 text-t1">{task.title}</h3>
              <p className="t-data mt-1 text-t3">
                {task.category} · agent: {task.agent.name} (chain{" "}
                {task.agent.chain}, token {task.agent.token}) · input{" "}
                {JSON.stringify(task.input)}
              </p>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                <Output
                  label={`With agent — ${task.with_agent.machine_ms} ms`}
                  tone="var(--accent)"
                  body={task.with_agent}
                />
                <Output
                  label={`Without agent — ${task.without_agent.machine_ms} ms, ${task.without_agent.rpc_calls} RPC calls`}
                  tone="var(--text-2)"
                  body={task.without_agent}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`t-label px-4 py-2.5 font-normal ${right ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Tr({
  task,
  cat,
  agent,
  manual,
  rpc,
  winner,
  winnerNote,
}: {
  task: string;
  cat: string;
  agent: string;
  manual: string;
  rpc: string;
  winner: "agent" | "manual";
  winnerNote: string;
}) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-4 py-3 text-[12.5px] text-t1">{task}</td>
      <td className="t-data px-4 py-3 text-t3">{cat}</td>
      <td className="t-data px-4 py-3 text-right text-t2">{agent}</td>
      <td className="t-data px-4 py-3 text-right text-t2">{manual}</td>
      <td className="t-data px-4 py-3 text-right text-t3">{rpc}</td>
      <td className="px-4 py-3">
        <span
          className="t-data"
          style={{
            color: winner === "agent" ? "var(--live)" : "var(--warn)",
          }}
        >
          {winner === "agent" ? "agent" : "manual"}
        </span>
        <span className="t-data text-t3"> · {winnerNote}</span>
      </td>
    </tr>
  );
}

function Finding({
  n,
  title,
  verdict,
  children,
}: {
  n: string;
  title: string;
  verdict: "agent" | "manual";
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <div className="flex items-baseline gap-3">
        <span className="t-mono text-[22px] leading-none text-line-strong">
          {n}
        </span>
        <span
          className="t-data rounded px-1.5 py-px"
          style={{
            color: verdict === "agent" ? "var(--live)" : "var(--warn)",
            boxShadow: `inset 0 0 0 1px ${verdict === "agent" ? "var(--live)" : "var(--warn)"}55`,
          }}
        >
          {verdict} wins
        </span>
      </div>
      <h2 className="t-h2 mt-3 max-w-3xl text-t1">{title}</h2>
      <div className="mt-3 max-w-3xl">{children}</div>
    </section>
  );
}

function Output({
  label,
  tone,
  body,
}: {
  label: string;
  tone: string;
  body: unknown;
}) {
  return (
    <div className="overflow-hidden rounded-panel border border-line bg-raised">
      <div className="border-b border-line px-4 py-2.5">
        <span className="t-data" style={{ color: tone }}>
          {label}
        </span>
      </div>
      <pre className="t-data max-h-80 overflow-auto p-4 leading-relaxed text-t2">
        {JSON.stringify(body, null, 2)}
      </pre>
    </div>
  );
}
