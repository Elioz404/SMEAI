"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  measuredItems,
  type AgentListItem,
  type CategoryKey,
} from "@/lib/taxonomy";
import { SERVICE_META } from "./AgentRow";

/**
 * Buscador global y accesos por categoría, en la portada.
 *
 * El criterio de Functionality dice "land, find an agent by category, with
 * minimal friction". Antes había que entrar en una categoría para poder buscar,
 * lo que obligaba a saber en cuál mirar antes de poder mirar. Aquí se busca
 * desde la primera pantalla.
 *
 * Los resultados salen como una capa sobre la página en vez de navegar a otra:
 * buscar no debería costar una recarga ni perder el sitio.
 */
export function MarketSearch({ agents }: { agents: AgentListItem[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (needle.length < 2) return [];
    return agents
      .filter(
        (a) =>
          a.name.toLowerCase().includes(needle) ||
          a.description.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        // Contratables primero: si buscas para contratar, lo que responde va
        // antes que lo que solo está registrado.
        const ha = a.service === "hireable" ? 1 : 0;
        const hb = b.service === "hireable" ? 1 : 0;
        if (ha !== hb) return hb - ha;
        return b.score - a.score;
      })
      .slice(0, 8);
  }, [agents, needle]);

  return (
    <section className="mt-8">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${agents.length} agents — try venus, grid, pancakeswap, liquidation`}
          aria-label="Search agents"
          className="w-full rounded-panel border border-line bg-sunken px-4 py-3 text-[13px] text-t1 placeholder:text-t3 focus:border-accent focus:outline-none"
        />

        {needle.length >= 2 && (
          <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-panel border border-line-strong bg-overlay shadow-2xl">
            {results.length === 0 ? (
              <p className="t-data px-4 py-4 text-t3">
                Nothing matches “{q}”.
              </p>
            ) : (
              results.map((a) => {
                const svc = SERVICE_META[a.service];
                return (
                  <Link
                    key={a.id}
                    href={`/agent/${a.chain}/${a.token}`}
                    className="flex items-start gap-3 border-b border-line px-4 py-2.5 transition-colors last:border-b-0 hover:bg-raised"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 size-1.5 shrink-0 rounded-full"
                      style={{ background: svc.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-t1">
                        {a.name}
                      </span>
                      <span className="t-data text-t3">
                        <span style={{ color: svc.color }}>{svc.label}</span>
                        {" · "}
                        {a.categories
                          .map((k) => CATEGORY_META[k as CategoryKey].label)
                          .join(", ")}
                        {" · "}
                        {a.testnet ? "testnet" : "mainnet"}
                      </span>
                    </span>
                    <span className="t-mono shrink-0 text-[13px] text-t2">
                      {a.score}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Las cuatro categorías con idéntico peso visual: el criterio de Agent
          Diversity exige "equal depth", y la maquetación debería afirmarlo
          antes de que nadie lea un número. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key];
          // Profundidad de la categoria: es una afirmacion sobre el mercado,
          // asi que los agentes propios no cuentan aqui.
          const inCat = measuredItems(agents).filter((a) =>
            a.categories.includes(key),
          );
          const n = inCat.filter((a) => a.service === "hireable").length;
          const total = inCat.length;
          return (
            <Link
              key={key}
              href={`/category/${key}`}
              className="group flex items-center gap-2.5 rounded-panel border border-line bg-raised px-3 py-2.5 transition-colors hover:border-line-strong"
            >
              <span
                aria-hidden
                className="t-mono flex size-6 shrink-0 items-center justify-center rounded text-[9px] font-semibold"
                style={{
                  color: meta.accent,
                  boxShadow: `inset 0 0 0 1px ${meta.accent}55`,
                }}
              >
                {meta.short}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-t1 group-hover:text-accent">
                  {meta.label}
                </span>
                <span className="t-data text-t3">
                  <span style={{ color: "var(--live)" }}>{n}</span> of {total}{" "}
                  hireable
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
