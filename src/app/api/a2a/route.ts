import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { venusHealth } from "@/lib/venus";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * SMEAI Reference Health Factor Monitor — un agente A2A que publicamos nosotros.
 *
 * POR QUE EXISTE
 *
 * Health Factor es la categoria mas delgada del ecosistema, y su suministro
 * cuelga de un solo agente de terceros que ha estado estable en todas las
 * comprobaciones. El periodo de evaluacion dura dos semanas durante las cuales
 * no podemos intervenir: si ese agente cae, la categoria se queda sin nada que
 * activar y el recorrido muere ahi.
 *
 * Esto es la red de seguridad. Y para que no se convierta en otra cosa:
 *
 *   1. Va etiquetado como nuestro en todas partes donde aparece.
 *   2. Queda EXCLUIDO de toda estadistica — el embudo, los recuentos por
 *      categoria, el censo. Las cifras del sitio siguen midiendo unicamente
 *      agentes de terceros.
 *   3. No cobra ni implementa `negotiate`. Un agente propio dentro del flujo de
 *      pago seria inventario nuestro, que es justo lo que le criticamos a
 *      quien llena su marketplace consigo mismo.
 *
 * Hace un trabajo real: lee la posicion en Venus desde la cadena y calcula el
 * health factor de verdad — colateral ponderado por su collateral factor y
 * precio de oraculo, dividido por la deuda — no el atajo de `getAccountLiquidity`.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const SKILL_ID = "health_factor";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * La agent card. El `url` se compone desde la peticion en vez de fijarse: asi
 * es correcta en local, en un preview y en produccion sin tocar codigo ni
 * arriesgarse a publicar una card que apunte a otro despliegue.
 */
export function GET(req: Request) {
  const url = new URL(req.url);
  const self = `${url.protocol}//${url.host}${url.pathname}`;

  return NextResponse.json(
    {
      protocolVersion: "0.2.0",
      name: "SMEAI Reference Health Factor Monitor",
      description:
        "Reads a wallet's Venus position on BSC mainnet and returns its real health factor — weighted collateral over debt, priced by the Venus oracle. Published by SMEAI as a reference implementation, free to call, and deliberately excluded from every statistic on the site.",
      url: self,
      provider: {
        organization: "SMEAI",
        url: `${url.protocol}//${url.host}`,
      },
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      skills: [
        {
          id: SKILL_ID,
          name: "Venus health factor",
          description:
            'Send {"skill":"health_factor","wallet":"0x…"} and receive the account\'s weighted collateral, debt, health factor and how far collateral can fall before liquidation.',
          tags: ["venus", "health factor", "liquidation", "lending"],
          examples: [`{"skill":"${SKILL_ID}","wallet":"0x0000000000000000000000000000000000000000"}`],
        },
      ],
    },
    { headers: CORS },
  );
}

/** Respuesta JSON-RPC con el mismo id que trajo la peticion. */
function rpc(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: CORS });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { headers: CORS },
  );
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

  // La direccion puede venir en el data part o suelta en el texto. Aceptar las
  // dos formas evita rechazar a un cliente por donde puso el dato, que es una
  // de las causas de "no responde" que medimos en otros agentes.
  const fromData = [data.wallet, data.address, data.account].find(
    (v) => typeof v === "string" && isAddress(v as string),
  ) as string | undefined;
  const fromText = text.match(/0x[a-fA-F0-9]{40}/)?.[0];
  const wallet = fromData ?? (fromText && isAddress(fromText) ? fromText : undefined);

  if (!wallet) {
    return rpcError(
      id,
      -32602,
      'This agent needs a wallet address. Send {"skill":"health_factor","wallet":"0x…"}.',
    );
  }

  try {
    const health = await venusHealth(wallet as Address);
    return rpc(id, {
      kind: "message",
      role: "agent",
      parts: [
        { kind: "text", text: health.verdict },
        { kind: "data", data: { response: health } },
      ],
    });
  } catch (err) {
    return rpcError(id, -32000, `Venus read failed: ${String((err as Error).message).slice(0, 160)}`);
  }
}
