import { NextResponse } from "next/server";
import { snapshot } from "@/lib/snapshot";
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
    task?: string;
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
        return NextResponse.json(await altana.grant(budget));
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
        if (!body.publicKey || !HEX.test(body.publicKey)) {
          return NextResponse.json(
            { error: "grant a session first" },
            { status: 400 },
          );
        }
        return NextResponse.json(
          await altana.hire({
            publicKey: body.publicKey as Hex,
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

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    // El error de cadena se devuelve tal cual: si la wallet no tiene fondos o
    // el relay rechaza, el usuario tiene que verlo, no una pantalla en blanco.
    return NextResponse.json(
      { error: (err as Error).message.slice(0, 400) },
      { status: 200 },
    );
  }
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
