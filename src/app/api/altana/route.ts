import { NextResponse } from "next/server";
import { snapshot } from "@/lib/snapshot";
import { jobs } from "@/lib/jobs";
import * as altana from "@/lib/altana";
import type { Address, Hex } from "viem";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Contratación real vía Altana: sesión acotada, trabajo ERC-8183 financiado en
 * cadena, y revocación. Todo en BSC Testnet.
 *
 * Una sola ruta con `action` en vez de cuatro archivos: son cuatro pasos del
 * mismo flujo, comparten validación y ninguno tiene sentido por separado.
 */

const HEX = /^0x[0-9a-fA-F]+$/;

/**
 * Solo se puede contratar a un vendedor que ya esté en el snapshot y sea
 * contratable. Sin esto, cualquiera podría hacernos financiar un trabajo a una
 * dirección arbitraria con nuestros fondos de prueba.
 */
function findSeller(agentId: string) {
  const a = snapshot.agents.find((x) => x.agent_id === agentId);
  if (!a || !a.hireable) return null;
  const provider = (a.agent_wallet ?? a.owner_address) as Address | null;
  if (!provider || !HEX.test(provider)) return null;
  return { agent: a, provider };
}

export async function GET() {
  try {
    return NextResponse.json(await altana.status());
  } catch (err) {
    return NextResponse.json(
      { configured: altana.isConfigured(), error: (err as Error).message },
      { status: 200 },
    );
  }
}

export async function POST(req: Request) {
  if (!altana.isConfigured()) {
    return NextResponse.json(
      {
        error:
          "Altana is not configured on this deployment (ALTANA_ADMIN_KEY missing)",
      },
      { status: 503 },
    );
  }

  let body: {
    action?: string;
    agentId?: string;
    publicKey?: string;
    expiry?: number;
    task?: string;
    jobId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "faucet":
        return NextResponse.json(await altana.claimTestU());

      case "grant": {
        const seller = findSeller(body.agentId ?? "");
        if (!seller) {
          return NextResponse.json(
            { error: "unknown or non-hireable agent" },
            { status: 400 },
          );
        }
        const budget = quoteOf(seller.agent);
        if (budget === null) {
          return NextResponse.json(
            { error: "this agent has not quoted a price, so there is no cap to set" },
            { status: 400 },
          );
        }
        return NextResponse.json(await altana.grant(body.agentId!, budget));
      }

      case "hire": {
        const seller = findSeller(body.agentId ?? "");
        if (!seller) {
          return NextResponse.json(
            { error: "unknown or non-hireable agent" },
            { status: 400 },
          );
        }
        const budget = quoteOf(seller.agent);
        if (budget === null) {
          return NextResponse.json({ error: "no quoted price" }, { status: 400 });
        }
        if (!body.expiry || !Number.isFinite(body.expiry)) {
          return NextResponse.json(
            { error: "grant a session first" },
            { status: 400 },
          );
        }
        return NextResponse.json(
          await altana.hire({
            agentId: body.agentId!,
            expiry: body.expiry,
            provider: seller.provider,
            task:
              (body.task ?? "").trim().slice(0, 500) ||
              `Report the current state of what ${seller.agent.name} covers, and recommend an action.`,
            budget,
          }),
        );
      }

      case "revoke": {
        if (!body.publicKey || !HEX.test(body.publicKey)) {
          return NextResponse.json(
            { error: "publicKey required" },
            { status: 400 },
          );
        }
        return NextResponse.json(await altana.revoke(body.publicKey as Hex));
      }

      case "reclaim": {
        const id = String(body.jobId ?? "");
        if (!/^[0-9]+$/.test(id)) {
          return NextResponse.json({ error: "jobId required" }, { status: 400 });
        }
        // Solo trabajos que sabemos nuestros. Sin esto, cualquiera podria
        // hacernos gastar gas llamando al kernel con ids arbitrarios.
        if (!jobs.jobs.some((j) => j.id === id)) {
          return NextResponse.json(
            { error: "unknown job" },
            { status: 400 },
          );
        }
        // El fichero puede llevar hasta 30 minutos de retraso, asi que el
        // estado se relee de la cadena antes de tocar nada.
        const state = await altana.readJob(BigInt(id));
        if (!state.reclaimable) {
          return NextResponse.json(
            {
              error: !state.undelivered
                ? "This job has a deliverable, so the escrow is not the buyer's to reclaim. Settle it instead."
                : state.status !== "FUNDED"
                  ? `This job is ${state.status}; only a FUNDED job holds escrow to reclaim.`
                  : "This job has not expired yet. The seller still has time to deliver.",
              job: state,
            },
            { status: 400 },
          );
        }
        return NextResponse.json({
          ...(await altana.reclaim(BigInt(id))),
          job: state,
        });
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    // Los rechazos on-chain se traducen, no se ocultan. Un `ExceededSpendLimit`
    // significa que la política hizo su trabajo, y el usuario merece leer eso y
    // no un revert en crudo. El mensaje original se conserva debajo.
    const raw = (err as Error).message ?? "";
    return NextResponse.json(
      { error: explain(raw), raw: raw.slice(0, 400) },
      { status: 200 },
    );
  }
}

/**
 * Traduce los rechazos que la política de sesión provoca a propósito.
 *
 * Los tres primeros no son averías: son la prueba de que el acotado se aplica en
 * cadena. Presentarlos como errores genéricos haría parecer roto justo lo que
 * mejor funciona.
 */
function explain(raw: string): string {
  if (/ExceededSpendLimit/.test(raw)) {
    return "The session's daily spend cap is used up. It is derived from the price this agent quoted and covers five hires a day; the cap accrues per agent, so granting a fresh session does not reset it. The chain refused this, not us — the cap is doing its job.";
  }
  if (/UnauthorizedCall/.test(raw)) {
    return "The session tried to call a contract outside its allowlist and the chain refused it. This is the scoping working.";
  }
  if (/KeyNotFound|expired|Expired/.test(raw)) {
    return "This session has expired or been revoked. Grant a new one.";
  }
  if (/PolicyNotWhitelisted/.test(raw)) {
    return "The ERC-8183 kernel rejected the dispute policy. Set ALTANA_POLICY_ADDRESS to a policy the EvaluatorRouter whitelists.";
  }
  if (/insufficient|InsufficientBalance/i.test(raw)) {
    return "The treasury wallet is out of funds on BSC Testnet.";
  }
  return raw.slice(0, 300);
}

function quoteOf(a: (typeof snapshot.agents)[number]): bigint | null {
  const p = a.service?.quote?.price;
  if (!p) return null;
  try {
    return BigInt(p);
  } catch {
    return null;
  }
}
