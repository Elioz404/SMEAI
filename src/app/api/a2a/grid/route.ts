import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { gridCheck } from "@/lib/grid";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * SMEAI Reference Grid Viability Checker — el tercer agente que publicamos.
 *
 * POR QUE EXISTE
 *
 * Grid Trading es la segunda categoria mas fina del ecosistema: cuatro agentes
 * contratables, tres de ellos estables. La evaluacion dura dos semanas sin que
 * podamos intervenir, y si esos caen la categoria se queda sin nada que
 * activar. Este es el suelo, igual que el de health factor.
 *
 * Responde lo unico que se puede afirmar sin adivinar el futuro: si el paso del
 * grid cubre sus propios costes. Cada ciclo paga la comision del pool dos veces,
 * asi que por debajo del doble de la comision se pierde en cada vuelta, gane o
 * pierda el mercado. Deliberadamente NO predice precios.
 *
 * Las mismas tres reglas que los otros dos propios: etiquetado, excluido de
 * todas las cifras del sitio, y sin cobrar ni negociar.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const SKILL_ID = "grid_viability";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const self = `${url.protocol}//${url.host}${url.pathname}`;
  return NextResponse.json(
    {
      protocolVersion: "0.2.0",
      name: "SMEAI Reference Grid Viability Checker",
      description:
        "Reads a PancakeSwap V3 pool on BSC mainnet and works out whether a proposed grid step covers its own costs. A full cycle pays the pool fee twice, so any step below that loses money every time it completes — regardless of where the price goes. Published by SMEAI as a reference implementation, free to call, and excluded from every statistic on the site. It does not predict prices.",
      url: self,
      provider: { organization: "SMEAI", url: `${url.protocol}//${url.host}` },
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      skills: [
        {
          id: SKILL_ID,
          name: "Grid step viability",
          description:
            'Send {"skill":"grid_viability","pool":"0x…","stepPct":0.5} with a PancakeSwap V3 pool address and, optionally, the grid step you are considering. Returns the pool fee, the current price, the active liquidity, the break-even step, and whether yours clears it. Omit stepPct to get the break-even alone.',
          tags: ["grid trading", "pancakeswap", "V3", "fees", "break-even"],
          examples: [
            `{"skill":"${SKILL_ID}","pool":"0x36696169c63e42cd08ce11f5deebbcebae652050","stepPct":0.5}`,
          ],
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

  // La direccion puede venir en el data part o suelta en el texto: aceptar las
  // dos formas evita rechazar a un cliente por donde coloco el dato.
  const fromData = [data.pool, data.address, data.pair].find(
    (v) => typeof v === "string" && isAddress(v as string),
  ) as string | undefined;
  const fromText = text.match(/0x[a-fA-F0-9]{40}/)?.[0];
  const pool = fromData ?? (fromText && isAddress(fromText) ? fromText : undefined);

  if (!pool) {
    return rpcError(
      id,
      -32602,
      'This agent needs a PancakeSwap V3 pool address. Send {"skill":"grid_viability","pool":"0x…","stepPct":0.5}.',
    );
  }

  const rawStep = [data.stepPct, data.step, data.gridStep].find(
    (v) => typeof v === "number" || (typeof v === "string" && v !== ""),
  );
  const step = rawStep === undefined ? null : Number(rawStep);
  if (step !== null && (!Number.isFinite(step) || step <= 0)) {
    return rpcError(id, -32602, "stepPct must be a positive number, as a percentage — 0.5 means 0.5%.");
  }

  try {
    const check = await gridCheck(pool as Address, step);
    return rpc(id, {
      kind: "message",
      role: "agent",
      parts: [
        { kind: "text", text: check.verdict },
        { kind: "data", data: { response: check } },
      ],
    });
  } catch (err) {
    return rpcError(
      id,
      -32000,
      `Could not read pool ${pool}: ${String((err as Error).message).slice(0, 160)}`,
    );
  }
}
