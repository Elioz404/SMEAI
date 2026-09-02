"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/taxonomy";

/** El tope mostrado debe ser el que se concede de verdad: 5x el precio. */
function grantCap(price: string): string {
  try {
    return (BigInt(price) * 5n).toString();
  } catch {
    return price;
  }
}

type Status =
  | { configured: false }
  | {
      configured: true;
      chainId: number;
      walletAddress: string;
      explorer: string;
      native: string;
      paymentToken: string;
      uBalance: string;
      commerce: string;
    };

type Grant = {
  publicKey: string;
  expiry: number;
  transactionHash?: string;
  walletAddress: string;
  agentAddress: string;
  policy: {
    allowlist: string[];
    capRaw: string;
    capToken: string;
    expiry: number;
  };
  error?: string;
};

/**
 * Contratación real: sesión Altana acotada + trabajo ERC-8183 financiado en
 * cadena, sobre BSC Testnet.
 *
 * La política se enseña ANTES de conceder nada. Un panel que dijera "concedido"
 * sin mostrar qué puede hacer la clave sería precisamente el modelo de confianza
 * ciega que Altana existe para eliminar.
 */
export function AltanaHire({
  agentId,
  agentName,
  price,
}: {
  agentId: string;
  agentName: string;
  price: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [job, setJob] = useState<{ jobId?: string; transactionHash?: string; error?: string } | null>(null);
  const [revoked, setRevoked] = useState<{ transactionHash?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/altana")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false }));
  }, []);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const r = await fetch("/api/altana", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, agentId, ...extra }),
      });
      return await r.json();
    } finally {
      setBusy(null);
    }
  }

  const expiryDate = grant ? new Date(grant.expiry * 1000) : null;

  return (
    <section className="mt-12">
      <h2 className="t-h2 text-t1">Hire on-chain with a scoped session</h2>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-t3">
        {agentName} holds its own key. Granting gives that key — and only that
        key — scoped authority over the treasury: the four ERC-8183 contracts a
        hire needs, capped at the price it quoted, expiring in an hour, recorded
        in the public Keystore. It then funds the job itself. BSC Testnet — no
        real funds move.
      </p>

      {status && !status.configured && (
        <p className="t-body mt-4 rounded-panel border border-dashed border-line px-4 py-4 text-t2">
          Not configured on this deployment. The flow is implemented and the code
          is in <span className="t-mono">src/lib/altana.ts</span>; it needs an{" "}
          <span className="t-mono">ALTANA_ADMIN_KEY</span> for a funded BSC
          Testnet wallet to run.
        </p>
      )}

      {status?.configured && (
        <div className="mt-4 overflow-hidden rounded-panel border border-line bg-raised">
          <div className="border-b border-line px-4 py-3">
            <p className="t-label">Demo wallet · BSC Testnet</p>
            <a
              href={`${status.explorer}/address/${status.walletAddress}`}
              target="_blank"
              rel="noreferrer noopener"
              className="t-data mt-1 block break-all text-t2 underline decoration-line-strong underline-offset-2 hover:text-accent"
            >
              {status.walletAddress}
            </a>
            <p className="t-data mt-1.5 text-t3">
              balance {formatPrice(status.uBalance) ?? "0"} $U
              {status.uBalance === "0" && (
                <button
                  onClick={async () => setJob(await call("faucet"))}
                  disabled={busy !== null}
                  className="ml-2 underline decoration-line-strong hover:text-accent"
                >
                  claim test $U
                </button>
              )}
            </p>
          </div>

          {/* Paso 1 — la política, visible antes de conceder nada. */}
          <div className="border-b border-line px-4 py-4">
            <p className="t-label">
              Step 1 · the policy this session will carry
            </p>
            <dl className="mt-2.5 flex flex-col gap-1.5">
              <Row label="may call">
                the ERC-8183 escrow, router, dispute policy and $U token — and
                nothing else
              </Row>
              <Row label="may spend">
                at most {formatPrice(grantCap(price))} $U a day — five times the{" "}
                {formatPrice(price)} $U this agent quoted, so the cap stays tied
                to its own price — plus a small BNB cap for the relay fee
              </Row>
              <Row label="expires">one hour after granting</Row>
              <Row label="granted to">
                this agent&apos;s own key, not a shared one — revoking it leaves
                every other agent&apos;s authority untouched
              </Row>
              <Row label="registered">
                in the public Keystore, so anyone can verify it
              </Row>
            </dl>

            <button
              onClick={async () => setGrant(await call("grant"))}
              disabled={busy !== null || grant !== null}
              className="mt-3.5 rounded bg-accent px-3.5 py-1.5 text-[12px] font-medium text-[#0a0c10] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy === "grant" ? "Granting…" : "Grant session"}
            </button>

            {grant?.error && <Err text={grant.error} />}
            {grant?.publicKey && (
              <div className="mt-3 rounded border border-line bg-sunken px-3 py-2.5">
                <p className="t-data text-t2">
                  agent identity{" "}
                  <a
                    href={`${status.explorer}/address/${grant.agentAddress}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-t1 underline decoration-line-strong underline-offset-2 hover:text-accent"
                  >
                    {grant.agentAddress}
                  </a>
                </p>
                <p className="t-data mt-1 break-all text-t3">
                  session key {grant.publicKey}
                </p>
                <p className="t-data mt-1 text-t3">
                  expires {expiryDate?.toUTCString()}
                </p>
                {grant.transactionHash && (
                  <Tx
                    explorer={status.explorer}
                    hash={grant.transactionHash}
                    label="grant tx"
                  />
                )}
              </div>
            )}
          </div>

          {/* Paso 2 — financiar el trabajo a través de esa clave. */}
          <div className="border-b border-line px-4 py-4">
            <p className="t-label">Step 2 · fund the job through that key</p>
            <button
              onClick={async () =>
                setJob(await call("hire", { expiry: grant?.expiry }))
              }
              disabled={busy !== null || !grant?.publicKey}
              className="mt-2.5 rounded border border-line-strong px-3.5 py-1.5 text-[12px] text-t1 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-30"
            >
              {busy === "hire" ? "Funding…" : `Hire ${agentName}`}
            </button>
            {job?.error && <Err text={job.error} />}
            {job?.jobId && (
              <div className="mt-3 rounded border border-line bg-sunken px-3 py-2.5">
                <p className="t-data text-t2">
                  job <span className="text-t1">#{job.jobId}</span> funded in
                  escrow
                </p>
                {job.transactionHash && (
                  <Tx
                    explorer={status.explorer}
                    hash={job.transactionHash}
                    label="hire tx"
                  />
                )}
              </div>
            )}
          </div>

          {/* Paso 3 — control del usuario. Sin esto, la sesión sería una promesa. */}
          <div className="px-4 py-4">
            <p className="t-label">Step 3 · cut it off</p>
            <p className="mt-1 text-[12px] leading-relaxed text-t3">
              One transaction. Takes effect immediately, on-chain, whether or not
              the agent agrees.
            </p>
            <button
              onClick={async () =>
                setRevoked(
                  await call("revoke", { publicKey: grant?.publicKey }),
                )
              }
              disabled={busy !== null || !grant?.publicKey || revoked !== null}
              className="mt-2.5 rounded border px-3.5 py-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-30"
              style={{ borderColor: "var(--dead)", color: "var(--dead)" }}
            >
              {busy === "revoke" ? "Revoking…" : "Revoke session"}
            </button>
            {revoked?.error && <Err text={revoked.error} />}
            {revoked?.transactionHash && (
              <div className="mt-3 rounded border border-line bg-sunken px-3 py-2.5">
                <p className="t-data" style={{ color: "var(--dead)" }}>
                  session revoked
                </p>
                <Tx
                  explorer={status.explorer}
                  hash={revoked.transactionHash}
                  label="revoke tx"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="t-data w-24 shrink-0 text-t3">{label}</dt>
      <dd className="text-[12px] leading-snug text-t2">{children}</dd>
    </div>
  );
}

function Tx({
  explorer,
  hash,
  label,
}: {
  explorer: string;
  hash: string;
  label: string;
}) {
  return (
    <a
      href={`${explorer}/tx/${hash}`}
      target="_blank"
      rel="noreferrer noopener"
      className="t-data mt-1 block break-all text-t2 underline decoration-line-strong underline-offset-2 hover:text-accent"
    >
      {label}: {hash}
    </a>
  );
}

function Err({ text }: { text: string }) {
  return (
    <p className="t-data mt-2 break-words" style={{ color: "var(--dead)" }}>
      {text}
    </p>
  );
}
