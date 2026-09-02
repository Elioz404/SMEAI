import { notFound } from "next/navigation";
import { AgentList } from "@/components/AgentList";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type CategoryKey,
  agentsIn,
  since,
  snapshot,
  toListItem,
} from "@/lib/snapshot";

export function generateStaticParams() {
  return CATEGORY_ORDER.map((key) => ({ key }));
}

export default async function CategoryPage({
  params,
}: PageProps<"/category/[key]">) {
  const { key } = await params;
  if (!CATEGORY_ORDER.includes(key as CategoryKey)) notFound();

  const cat = key as CategoryKey;
  const meta = CATEGORY_META[cat];
  const agents = agentsIn(cat);
  const items = agents.map(toListItem);
  const hireable = items.filter((a) => a.service === "hireable").length;
  const withCard = items.filter((a) => a.status === "live").length;
  const fastest = items
    .filter((a) => a.latency !== null)
    .sort((a, b) => a.latency! - b.latency!)[0];

  return (
    <div className="wrap px-6 pb-20 lg:px-10">
      <header className="border-b border-line py-10">
        <p className="t-label">Category</p>
        <div className="mt-3 flex items-center gap-3">
          <span
            aria-hidden
            className="t-mono flex size-9 items-center justify-center rounded text-xs font-semibold"
            style={{
              color: meta.accent,
              boxShadow: `inset 0 0 0 1px ${meta.accent}55`,
            }}
          >
            {meta.short}
          </span>
          <h1 className="t-h1 text-t1">{meta.label}</h1>
        </div>
        <p className="t-body mt-3 max-w-2xl text-t2">{meta.blurb}.</p>

        <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
          <Metric value={String(agents.length)} label="listed" />
          <Metric value={String(withCard)} label="serve a card" tone="var(--warn)" />
          <Metric value={String(hireable)} label="hireable now" tone="var(--live)" />
          <Metric
            value={fastest ? `${fastest.latency} ms` : "—"}
            label="fastest response"
          />
          <Metric value={since(snapshot.finished_at)} label="last checked" />
        </dl>
      </header>

      <div className="mt-8">
        <AgentList agents={items} />
      </div>
    </div>
  );
}

function Metric({
  value,
  label,
  tone = "var(--text)",
}: {
  value: string;
  label: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="t-mono text-[22px] leading-none" style={{ color: tone }}>
        {value}
      </dt>
      <dd className="t-label mt-1.5">{label}</dd>
    </div>
  );
}
