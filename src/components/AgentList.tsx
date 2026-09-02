"use client";

import { useMemo, useState } from "react";
import { AgentRow } from "./AgentRow";
import type { AgentListItem } from "@/lib/taxonomy";

type StatusFilter = "all" | "hireable" | "issues";
type NetFilter = "all" | "mainnet" | "testnet";
type SortKey = "score" | "latency" | "name";

/**
 * Lista filtrable. Recibe la proyeccion ligera, no el snapshot completo.
 *
 * Los filtros por defecto muestran TODO, incluidos los caidos. Ocultarlos por
 * defecto seria mas bonito y menos honesto: que la mayoria de agentes del
 * registro no responda es el hallazgo, no un detalle que esconder.
 */
export function AgentList({ agents }: { agents: AgentListItem[] }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [net, setNet] = useState<NetFilter>("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = agents.filter((a) => {
      if (status === "hireable" && a.service !== "hireable") return false;
      if (status === "issues" && a.service === "hireable") return false;
      if (net === "mainnet" && a.testnet) return false;
      if (net === "testnet" && !a.testnet) return false;
      if (
        needle &&
        !a.name.toLowerCase().includes(needle) &&
        !a.description.toLowerCase().includes(needle)
      )
        return false;
      return true;
    });

    return out.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "latency") {
        // Los que no responden van al final, no al principio con latencia 0.
        const av = a.latency ?? Number.MAX_SAFE_INTEGER;
        const bv = b.latency ?? Number.MAX_SAFE_INTEGER;
        return av - bv;
      }
      return b.score - a.score;
    });
  }, [agents, status, net, sort, q]);

  const liveCount = agents.filter((a) => a.service === "hireable").length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line pb-4">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: `All ${agents.length}` },
            { value: "hireable", label: `Hireable ${liveCount}` },
            { value: "issues", label: `Issues ${agents.length - liveCount}` },
          ]}
        />
        <Segmented
          label="Network"
          value={net}
          onChange={setNet}
          options={[
            { value: "all", label: "Both" },
            { value: "mainnet", label: "Mainnet" },
            { value: "testnet", label: "Testnet" },
          ]}
        />
        <Segmented
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "score", label: "Score" },
            { value: "latency", label: "Fastest" },
            { value: "name", label: "Name" },
          ]}
        />

        <div className="ml-auto">
          <label className="t-label mb-1 block">Search</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name or description"
            className="t-data w-48 rounded border border-line bg-sunken px-2 py-1.5 text-t1 placeholder:text-t3 focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="t-data py-12 text-center text-t3">
          Nothing matches these filters.
        </p>
      ) : (
        <div className="mt-1">
          {shown.map((a) => (
            <AgentRow key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div>
      <span className="t-label mb-1 block">{label}</span>
      <div className="inline-flex rounded border border-line bg-sunken p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`t-data rounded px-2 py-1 transition-colors ${
              value === o.value
                ? "bg-overlay text-t1"
                : "text-t3 hover:text-t2"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
