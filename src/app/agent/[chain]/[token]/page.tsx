import Link from "next/link";
import { notFound } from "next/navigation";
import { HireConsole } from "@/components/HireConsole";
import { AltanaHire } from "@/components/AltanaHire";
import { displayStatus } from "@/components/AgentRow";
import {
  CATEGORY_META,
  type CategoryKey,
  explorerAddress,
  explorerTx,
  findAgent,
  formatEta,
  formatPrice,
  safeHref,
  since,
  snapshot,
  toListItem,
} from "@/lib/snapshot";

export function generateStaticParams() {
  return snapshot.agents.map((a) => ({
    chain: String(a.chain_id),
    token: a.token_id,
  }));
}

export default async function AgentPage({
  params,
}: PageProps<"/agent/[chain]/[token]">) {
  const { chain, token } = await params;
  const agent = findAgent(Number(chain), token);
  if (!agent) notFound();

  const item = toListItem(agent);
  const st = displayStatus(item);
  const a2a = agent.probes.find((p) => p.kind === "a2a" && p.valid_card);

  return (
    <div className="wrap px-6 pb-20 lg:px-10">
      <div className="pt-6">
        <Link
          href={`/category/${agent.categories[0] ?? "rebalancing"}`}
          className="t-data text-t3 transition-colors hover:text-accent"
        >
          &larr; back to {CATEGORY_META[
            (agent.categories[0] ?? "rebalancing") as CategoryKey
          ].label}
        </Link>
      </div>

      <header className="border-b border-line pb-8 pt-5">
        {/* Rejilla explícita en vez de flex-wrap: con wrap, la tarjeta de
            estado caía debajo del título en anchos intermedios y perdía la
            posición que le da su jerarquía. */}
        <div className="grid items-start gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {agent.categories.map((k) => (
                <span
                  key={k}
                  className="t-data rounded px-1.5 py-px"
                  style={{
                    color: CATEGORY_META[k as CategoryKey].accent,
                    boxShadow: `inset 0 0 0 1px ${CATEGORY_META[k as CategoryKey].accent}44`,
                  }}
                >
                  {CATEGORY_META[k as CategoryKey].label}
                </span>
              ))}
              <span
                className="t-data rounded px-1.5 py-px"
                style={{
                  color: agent.is_testnet ? "var(--text-3)" : "var(--accent)",
                  boxShadow: `inset 0 0 0 1px ${agent.is_testnet ? "var(--line-strong)" : "var(--accent-dim)"}`,
                }}
              >
                {agent.chain_name}
              </span>
            </div>

            <h1 className="t-h1 mt-3 text-t1">{agent.name}</h1>
            <p className="t-body mt-3 max-w-[78ch] text-t2">
              {agent.description}
            </p>
          </div>

          {/* Tarjeta de estado. Es lo primero que un usuario necesita saber,
              asi que ocupa la esquina superior derecha y no se pierde en el
              cuerpo de la pagina. */}
          <div className="w-full max-w-xs rounded-panel border border-line bg-raised p-4 lg:max-w-none">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className={`size-2 rounded-full ${item.service === "hireable" ? "pulse-live" : ""}`}
                style={{ background: st.color }}
              />
              <span className="t-data" style={{ color: st.color }}>
                {st.label}
              </span>
            </div>

            <div className="mt-4 flex items-end gap-4">
              <div>
                <p className="t-mono text-[26px] leading-none text-t1">
                  {agent.trust_score}
                </p>
                <p className="t-label mt-1">trust score</p>
              </div>
              {item.latency !== null && (
                <div>
                  <p className="t-mono text-[26px] leading-none text-t2">
                    {item.latency}
                    <span className="text-[13px] text-t3">ms</span>
                  </p>
                  <p className="t-label mt-1">latency</p>
                </div>
              )}
            </div>

            <p className="t-label mt-4 border-t border-line pt-3">
              checked {since(item.checkedAt)}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-x-12 gap-y-12 py-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Section
            title="Verification evidence"
            hint="Raw result of the last request we made to each endpoint this agent declares on-chain."
          >
            {agent.probes.length === 0 ? (
              <p className="t-body rounded-panel border border-dashed border-line px-4 py-5 text-t2">
                This agent is registered on-chain but declares no callable
                endpoint. There is nothing to verify and nothing to hire.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {agent.probes.map((p) => (
                  <div
                    key={p.kind + p.url}
                    className="overflow-hidden rounded-panel border border-line bg-raised"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                      <span className="t-data uppercase text-t2">{p.kind}</span>
                      <span className="t-data">
                        <span
                          style={{
                            color: p.ok
                              ? "var(--live)"
                              : p.blocked
                                ? "var(--muted)"
                                : "var(--dead)",
                          }}
                        >
                          {p.blocked
                            ? "not called"
                            : (p.status ?? p.error ?? "error")}
                        </span>
                        {!p.blocked && (
                          <span className="text-t3"> · {p.latency_ms} ms</span>
                        )}
                        <span className="text-t3"> · {since(p.checked_at)}</span>
                      </span>
                    </div>

                    <div className="px-4 py-3.5">
                      {safeHref(p.url) ? (
                        <a
                          href={safeHref(p.url)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="t-data break-all text-t2 underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent"
                        >
                          {p.url}
                        </a>
                      ) : (
                        <span className="t-data break-all text-t3">{p.url}</span>
                      )}

                      {p.blocked && p.error && (
                        <p className="t-data mt-2 text-t3">{p.error}</p>
                      )}

                      {p.sample && (
                        <pre className="t-data mt-3 max-h-40 overflow-auto rounded border border-line bg-sunken p-3 leading-relaxed text-t2">
                          {p.sample}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {agent.service && (
            <div className="mt-12">
              <Section
                title="Service check"
                hint="The agent card is the shop window. This is the shop: the A2A endpoint you would actually hire through."
              >
                <div className="overflow-hidden rounded-panel border border-line bg-raised">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                    <span className="t-data uppercase text-t2">a2a service</span>
                    <span className="t-data">
                      <span
                        style={{
                          color: agent.service.reachable
                            ? "var(--live)"
                            : agent.service.requires_auth
                              ? "var(--warn)"
                              : "var(--dead)",
                        }}
                      >
                        {agent.service.status ?? agent.service.error ?? "no response"}
                      </span>
                      {agent.service.latency_ms !== undefined && (
                        <span className="text-t3"> · {agent.service.latency_ms} ms</span>
                      )}
                    </span>
                  </div>

                  <div className="px-4 py-3.5">
                    {safeHref(agent.service.url) ? (
                      <a
                        href={safeHref(agent.service.url)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="t-data break-all text-t2 underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent"
                      >
                        {agent.service.url}
                      </a>
                    ) : (
                      <span className="t-data break-all text-t3">
                        {agent.service.url}
                      </span>
                    )}

                    {!agent.service.reachable && !agent.service.requires_auth && (
                      <p className="t-body mt-3 text-t2">
                        This agent serves a valid card, but the endpoint behind
                        it does not answer. Nobody can hire it right now,
                        whatever the registry says.
                      </p>
                    )}
                    {agent.service.requires_auth && (
                      <p className="t-body mt-3 text-t2">
                        The service is up but requires credentials we do not
                        hold, so it cannot be hired from here.
                      </p>
                    )}

                    {/* Cotizacion real, pedida al agente. Es el dato que decide
                        una contratacion y que ningun directorio muestra. */}
                    {agent.service.quote?.accepted && (
                      <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 border-t border-line pt-4">
                        <div>
                          <dt className="t-mono text-[22px] leading-none text-accent">
                            {formatPrice(agent.service.quote.price) ?? "—"}
                            <span className="text-[13px] text-t3"> $U</span>
                          </dt>
                          <dd className="t-label mt-1.5">quoted price</dd>
                        </div>
                        <div>
                          <dt className="t-mono text-[22px] leading-none text-t1">
                            {formatEta(agent.service.quote.eta_seconds) ?? "—"}
                          </dt>
                          <dd className="t-label mt-1.5">estimated delivery</dd>
                        </div>
                        {agent.service.quote.negotiation_hash && (
                          <div className="min-w-0">
                            <dt className="t-data break-all text-t2">
                              {agent.service.quote.negotiation_hash}
                            </dt>
                            <dd className="t-label mt-1.5">negotiation hash</dd>
                          </div>
                        )}
                      </dl>
                    )}
                    {agent.service.quote && !agent.service.quote.accepted && (
                      <p className="t-data mt-3 text-t3">
                        Declined our quote request: {agent.service.quote.reason}
                      </p>
                    )}
                  </div>
                </div>
              </Section>
            </div>
          )}

          {a2a && (
            <div className="mt-12">
              <HireConsole
                agentName={agent.name}
                endpoint={a2a.url}
                skills={(a2a.skill_list ?? []).filter((s) => s.id || s.name)}
              />
            </div>
          )}

          {agent.service?.quote?.accepted && agent.service.quote.price && (
            <AltanaHire
              agentId={agent.agent_id}
              agentName={agent.name}
              price={agent.service.quote.price}
            />
          )}
        </div>

        <aside className="flex flex-col gap-10">
          <Section title={`Why it scores ${agent.trust_score}`}>
            <ul className="flex flex-col gap-2">
              {agent.trust_reasons.map((r) => (
                <li key={r} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 size-1 shrink-0 rounded-full"
                    style={{
                      background:
                        item.status === "live"
                          ? "var(--live)"
                          : "var(--line-strong)",
                    }}
                  />
                  <span className="text-[12.5px] leading-relaxed text-t2">
                    {r}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {agent.cluster && agent.cluster.size > 1 && (
            <Section title="Shared backend">
              <p className="text-[12.5px] leading-relaxed text-t2">
                This is one of{" "}
                <span className="t-mono" style={{ color: "var(--warn)" }}>
                  {agent.cluster.size}
                </span>{" "}
                registered identities owned by the same address and pointing at
                the same service endpoint. One backend wearing several hats is
                not several agents, so its score is reduced accordingly.
              </p>
              <p className="t-data mt-2 break-all text-t3">
                {agent.cluster.shared_endpoint}
              </p>
              <ul className="mt-3 flex flex-col gap-1">
                {agent.cluster.siblings.slice(0, 6).map((sib) => (
                  <li key={sib.token_id}>
                    <Link
                      href={`/agent/${sib.chain_id}/${sib.token_id}`}
                      className="t-data text-t2 transition-colors hover:text-accent"
                    >
                      {sib.name}
                    </Link>
                  </li>
                ))}
                {agent.cluster.siblings.length > 6 && (
                  <li className="t-data text-t3">
                    and {agent.cluster.siblings.length - 6} more
                  </li>
                )}
              </ul>
            </Section>
          )}

          <Section title="On-chain identity">
            <dl className="flex flex-col gap-3">
              <Field label="Registry">
                <Ext
                  href={explorerAddress(agent.chain_id, agent.registry)}
                  text={agent.registry}
                />
              </Field>
              <Field label="Token ID">
                <span className="t-data text-t2">{agent.token_id}</span>
              </Field>
              {agent.owner_address && (
                <Field label="Owner">
                  <Ext
                    href={explorerAddress(agent.chain_id, agent.owner_address)}
                    text={agent.owner_address}
                  />
                </Field>
              )}
              {agent.agent_wallet && (
                <Field label="Agent wallet">
                  <Ext
                    href={explorerAddress(agent.chain_id, agent.agent_wallet)}
                    text={agent.agent_wallet}
                  />
                </Field>
              )}
              {agent.created_tx_hash && (
                <Field label="Registered in">
                  <Ext
                    href={explorerTx(agent.chain_id, agent.created_tx_hash)}
                    text={agent.created_tx_hash}
                  />
                </Field>
              )}
              <Field label="x402 payments">
                <span className="t-data text-t2">
                  {agent.x402_supported ? "supported" : "not supported"}
                </span>
              </Field>
              <Field label="On-chain feedback">
                <span className="t-data text-t2">{agent.total_feedbacks}</span>
              </Field>
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="t-h2 text-t1">{title}</h2>
      {hint && <p className="mt-1 text-[12px] leading-relaxed text-t3">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="t-label">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-all">{children}</dd>
    </div>
  );
}

function Ext({ href, text }: { href: string; text: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="t-data text-t2 underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent"
    >
      {text}
    </a>
  );
}
