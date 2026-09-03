"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AgentRow } from "./AgentRow";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  type AgentListItem,
} from "@/lib/taxonomy";

type NetFilter = "all" | "mainnet" | "testnet";

// Cuantos agentes se muestran por categoria en la portada.
// Es el mismo numero para las cuatro, a proposito: el brief exige que las
// cuatro categorias tengan la misma profundidad, y la maquetacion debe
// afirmarlo antes de que nadie lea un numero. Cuatro columnas de 44, 24, 36 y
// 19 filas dirian lo contrario de un vistazo.
const PER_CATEGORY = 5;

/**
 * Las cuatro categorias de la portada, con un selector de red que las gobierna
 * a la vez.
 *
 * Existe porque el catalogo mezcla dos redes y la portada las sumaba en un solo
 * numero. "37 de 85 contratables" no distingue entre un agente que cobra dinero
 * real y uno que vive en una red de pruebas, y esa es exactamente la distincion
 * que alguien evaluando el ecosistema necesita hacer primero.
 *
 * El filtro por defecto es "las dos". Abrir en mainnet enseñaria un catalogo mas
 * respetable y esconderia la mitad del trabajo verificado.
 */
export function Catalogue({ agents }: { agents: AgentListItem[] }) {
  const [net, setNet] = useState<NetFilter>("all");

  const shown = useMemo(
    () =>
      agents.filter((a) => {
        if (net === "mainnet") return !a.testnet;
        if (net === "testnet") return a.testnet;
        return true;
      }),
    [agents, net],
  );

  const counts = useMemo(
    () => ({
      all: agents.length,
      mainnet: agents.filter((a) => !a.testnet).length,
      testnet: agents.filter((a) => a.testnet).length,
    }),
    [agents],
  );

  return (
    <div className="mt-14">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
        <div>
          <span className="t-label mb-1 block">Network</span>
          <div className="inline-flex rounded border border-line bg-sunken p-0.5">
            {(
              [
                ["all", `Both ${counts.all}`],
                ["mainnet", `Mainnet ${counts.mainnet}`],
                ["testnet", `Testnet ${counts.testnet}`],
              ] as [NetFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setNet(value)}
                aria-pressed={net === value}
                className={`t-data rounded px-2 py-1 transition-colors ${
                  net === value ? "bg-overlay text-t1" : "text-t3 hover:text-t2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="t-data max-w-md text-t3">
          {net === "mainnet"
            ? "Agents registered on BSC mainnet. Hiring from this site settles on testnet."
            : net === "testnet"
              ? "Testnet agents can only answer about testnet state. Read the badge before the answer."
              : "Both networks, labelled per listing. A testnet agent cannot answer about mainnet."}
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-12">
        {CATEGORY_ORDER.map((key) => {
          const meta = CATEGORY_META[key];
          const all = shown
            .filter((a) => a.categories.includes(key))
            .sort((a, b) => b.score - a.score);
          const hireable = all.filter((a) => a.service === "hireable").length;
          const top = all.slice(0, PER_CATEGORY);
          const href =
            net === "all" ? `/category/${key}` : `/category/${key}?net=${net}`;

          return (
            <section key={key}>
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line-strong pb-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="t-mono flex size-7 items-center justify-center rounded text-[10px] font-semibold"
                    style={{
                      color: meta.accent,
                      boxShadow: `inset 0 0 0 1px ${meta.accent}55`,
                    }}
                  >
                    {meta.short}
                  </span>
                  <div>
                    <h2 className="t-h2 text-t1">{meta.label}</h2>
                    <p className="text-[12px] leading-snug text-t3">
                      {meta.blurb}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-5">
                  <p className="t-data text-t3">
                    <span
                      className="text-[15px]"
                      style={{ color: "var(--live)" }}
                    >
                      {hireable}
                    </span>
                    <span className="text-[15px] text-t3"> / {all.length}</span>
                    <span className="ml-1.5">hireable</span>
                  </p>
                  <Link
                    href={href}
                    className="t-data rounded border border-line px-2.5 py-1 text-t2 transition-colors hover:border-accent hover:text-accent"
                  >
                    View all {all.length}
                  </Link>
                </div>
              </div>

              <div className="mt-1">
                {top.length === 0 ? (
                  <p className="t-data py-8 text-center text-t3">
                    No agents in this category on{" "}
                    {net === "mainnet" ? "mainnet" : "testnet"}.
                  </p>
                ) : (
                  top.map((a) => (
                    <AgentRow key={a.id} agent={a} showCategories={false} />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
