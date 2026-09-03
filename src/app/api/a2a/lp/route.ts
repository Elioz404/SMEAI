import { NextResponse } from "next/server";
import { lpPosition } from "@/lib/pancake";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * SMEAI Reference PancakeSwap LP Monitor — el segundo agente que publicamos.
 *
 * POR QUE EXISTE
 *
 * El reto de PancakeSwap pide que "your agent must deliver a real benefit to
 * PancakeSwap traders or liquidity providers". Surtir el catalogo de agentes
 * ajenos que lo hacen no es lo mismo que tener uno.
 *
 * Responde lo que de verdad decide a un proveedor de liquidez en V3: si su
 * rango sigue conteniendo el precio, y a que distancia esta de salirse. Fuera de
 * rango una posicion deja de cobrar y queda entera en uno de los dos activos, y
 * eso pasa sin avisar.
 *
 * Las mismas tres reglas que el otro agente propio: va etiquetado, queda fuera
 * de todas las cifras del sitio, y no cobra ni negocia. Un agente nuestro dentro
 * del flujo de pago seria inventario propio.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const SKILL_ID = "lp_range";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const self = `${url.protocol}//${url.host}${url.pathname}`;
  return NextResponse.json(
    {
      protocolVersion: "0.2.0",
      name: "SMEAI Reference PancakeSwap LP Monitor",
      description:
        "Reads a PancakeSwap V3 liquidity position on BSC mainnet and reports whether it is still in range, how far the price can move before it stops earning fees, and what fees are sitting uncollected. Published by SMEAI as a reference implementation, free to call, and deliberately excluded from every statistic on the site.",
      url: self,
      provider: { organization: "SMEAI", url: `${url.protocol}//${url.host}` },
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      skills: [
        {
          id: SKILL_ID,
          name: "PancakeSwap V3 range check",
          description:
            'Send {"skill":"lp_range","tokenId":"12345"} with the position NFT id and receive the pair, fee tier, current tick against the position bounds, how much room is left on each side, and any uncollected fees.',
          tags: ["pancakeswap", "liquidity", "LP range", "rebalancing", "V3"],
          examples: [`{"skill":"${SKILL_ID}","tokenId":"1"}`],
        },
      ],
    },
    { headers: CORS },
  );
}

function rpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: CORS });
}
function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { headers: CORS });
}

export async function POST(req: Request) {
  let body: {
    id?: unknown;
    method?: string;
    params?: { message?: { parts?: { kind?: string; data?: Record<string, unknown>; text?: string }[] } };
  };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error: body is not JSON.");
  }

  const id = body.id;
  if (body.method !== "message/send") {
    return rpcError(id, -32601, `Unknown method "${body.method}". This agent speaks A2A message/send.`);
  }

  const parts = body.params?.message?.parts ?? [];
  const data = parts.find((p) => p.kind === "data")?.data ?? {};
  const text = parts.find((p) => p.kind === "text")?.text ?? "";

  const skill = typeof data.skill === "string" ? data.skill : null;
  if (skill && skill !== SKILL_ID) {
    return rpcError(id, -32602, `Unknown skill "${skill}". This agent has one: "${SKILL_ID}".`);
  }

  // El id puede venir en el data part o suelto en el texto: aceptar las dos
  // formas evita rechazar a un cliente por donde coloco el dato.
  const raw = [data.tokenId, data.positionId, data.id].find(
    (v) => typeof v === "string" || typeof v === "number",
  );
  const fromText = text.match(/\b\d{1,12}\b/)?.[0];
  const picked = raw !== undefined ? String(raw) : fromText;

  if (!picked || !/^\d+$/.test(picked)) {
    return rpcError(
      id,
      -32602,
      'This agent needs a PancakeSwap V3 position id. Send {"skill":"lp_range","tokenId":"12345"}.',
    );
  }

  try {
    const pos = await lpPosition(BigInt(picked));
    return rpc(id, {
      kind: "message",
      role: "agent",
      parts: [
        { kind: "text", text: pos.verdict },
        { kind: "data", data: { response: pos } },
      ],
    });
  } catch (err) {
    return rpcError(
      id,
      -32000,
      `Could not read position ${picked}: ${String((err as Error).message).slice(0, 160)}`,
    );
  }
}
