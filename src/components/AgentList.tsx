"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
/** Lee un parametro de la URL solo si es uno de los valores que aceptamos. */
function pick<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

const STATUSES = ["all", "hireable", "issues"] as const;
const NETS = ["all", "mainnet", "testnet"] as const;
const SORTS = ["score", "latency", "name"] as const;

export function AgentList({ agents }: { agents: AgentListItem[] }) {
  const router = useRouter();
  const params = useSearchParams();

  // El estado arranca desde la URL, no desde los valores por defecto: asi un
  // enlace a /category/health?net=mainnet abre ya filtrado, sobrevive a una
  // recarga y se puede mandar a alguien. Antes el filtro existia pero moria
  // en la pestana de quien lo tocaba.
  const [status, setStatus] = useState<StatusFilter>(() =>
    pick(params.get("status"), STATUSES, "all"),
  );
  const [net, setNet] = useState<NetFilter>(() => pick(params.get("net"), NETS, "all"));
  const [sort, setSort] = useState<SortKey>(() => pick(params.get("sort"), SORTS, "score"));
  const [q, setQ] = useState(() => params.get("q") ?? "");

  // Solo se escribe lo que se aparta del valor por defecto, para que una URL
  // sin filtrar siga siendo la URL limpia. `replace` y no `push`: filtrar no
  // deberia llenar el boton de atras.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (status !== "all") sp.set("status", status);
    if (net !== "all") sp.set("net", net);
    if (sort !== "score") sp.set("sort", sort);
    if (q.trim()) sp.set("q", q.trim());
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [status, net, sort, q, router]);

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
