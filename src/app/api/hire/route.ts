import { NextResponse } from "next/server";
import { snapshot } from "@/lib/snapshot";
import { checkUrl, readCapped } from "@/lib/net-guard.mjs";

export const runtime = "nodejs";
// Vercel Hobby corta las funciones a 10 s por defecto. Sin declararlo, una
// llamada de 20 s muere a mitad y el usuario ve un error generico justo en la
// demo. Lo subimos y mantenemos los timeouts de fetch por debajo del limite.
export const maxDuration = 30;

/**
 * "Hire" hace lo que dice: manda una tarea real al agente por A2A y devuelve lo
 * que conteste. Sin simulacion y sin "coming soon" — si el agente esta caido, el
 * usuario lo ve aqui igual que lo ve en la ficha.
 *
 * Seguridad: esta ruta hace peticiones salientes a URLs que declaran terceros en
 * un registro publico. Dos capas de defensa, porque una sola no basta:
 *   1. Allowlist: solo endpoints que ya estan en el snapshot. Impide que un
 *      cliente nos mande cualquier URL (proxy abierto).
 *   2. checkUrl: valida esquema, puerto y la IP resuelta. Hace falta porque la
 *      propia allowlist se alimenta de datos hostiles — en el registro real hay
 *      24 endpoints apuntando a loopback, incluido `http://localhost:3000/...`.
 */
const ALLOWED = new Set(
  snapshot.agents.flatMap((a) => a.probes.map((p) => p.url)),
);

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 16_000;

// Rate limit en memoria. Es por instancia y se pierde en cada arranque en frio,
// asi que no es una defensa fuerte: es un tope para que un bucle no queme la
// cuota gratuita ni convierta el sitio en un amplificador contra los agentes.
// Un limite compartido de verdad necesitaria almacenamiento, que este proyecto
// no tiene por diseno.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // techo de memoria
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "too many requests — wait a minute" },
      { status: 429 },
    );
  }

  let body: {
    endpoint?: string;
    text?: string;
    envelope?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { endpoint, text, envelope } = body;
  if (!endpoint || !ALLOWED.has(endpoint)) {
    return NextResponse.json(
      { error: "unknown endpoint: only agents listed on SMEAI can be called" },
      { status: 400 },
    );
  }

  const safe = await checkUrl(endpoint);
  if (!safe.ok) {
    return NextResponse.json(
      { error: `endpoint not reachable from a public client (${safe.reason})` },
      { status: 400 },
    );
  }

  const prompt = (text ?? "").trim().slice(0, 4000);
  const hasEnvelope =
    envelope && typeof envelope === "object" && !Array.isArray(envelope);
  if (!prompt && !hasEnvelope) {
    return NextResponse.json({ error: "empty task" }, { status: 400 });
  }

  const started = Date.now();

  try {
    // 1. Leemos el agent card para descubrir la URL real del servicio A2A.
    //    El endpoint registrado on-chain apunta a la card, no al servicio.
    const cardRes = await fetch(endpoint, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!cardRes.ok) {
      return NextResponse.json({
        stage: "agent-card",
        ok: false,
        status: cardRes.status,
        latency_ms: Date.now() - started,
        error: `agent card returned ${cardRes.status}`,
      });
    }

    let card: Record<string, unknown>;
    try {
      card = JSON.parse(await readCapped(cardRes, MAX_BODY_BYTES));
    } catch {
      return NextResponse.json({
        stage: "agent-card",
        ok: false,
        latency_ms: Date.now() - started,
        error: "agent card is not valid JSON",
      });
    }

    // De donde sale la URL del servicio, por orden.
    //
    // Un agent-card A2A estandar la declara en `url`. Pero muchos vendedores
    // sirven en su lugar un documento de descubrimiento en el MISMO path que
    // atiende el JSON-RPC, y ahi `endpoint` no es una direccion sino una
    // descripcion — medido: "A2A JSON-RPC, POST only". Tomarla por URL hacia
    // fallar la contratacion con "malformed URL" en agentes que funcionan.
    //
    // Si el campo no parece una URL absoluta, el endpoint del que acabamos de
    // leer la card ES el servicio: eso es lo que significa que el registro lo
    // declare como endpoint A2A. Mismo criterio que usa la ingesta, para que
    // el catalogo y el boton no discrepen sobre quien es contratable.
    const declared = (card?.url ?? card?.endpoint) as unknown;
    const looksAbsolute =
      typeof declared === "string" && /^https?:\/\//i.test(declared.trim());
    const serviceUrl = looksAbsolute ? (declared as string).trim() : endpoint;

    // La URL del servicio sale del cuerpo que nos acaba de devolver el agente,
    // asi que es tan poco fiable como la primera: se valida igual.
    const safeService = await checkUrl(serviceUrl);
    if (!safeService.ok) {
      return NextResponse.json({
        stage: "agent-card",
        ok: false,
        latency_ms: Date.now() - started,
        error: `agent card points its service at a blocked address (${safeService.reason})`,
      });
    }

    // 2. Enviamos la tarea por JSON-RPC (A2A `message/send`).
    //
    //    Los agentes reales no aceptan texto libre: esperan un sobre con el
    //    nombre de la skill en un data part. Lo comprobamos contra un agente en
    //    produccion: primero contesto "unknown skill: None" a un mensaje de
    //    texto, y despues "Invalid request format: 'task_description'" a un
    //    sobre incompleto. Cada agente documenta su esquema en la descripcion
    //    de la skill, asi que mandamos el sobre tal cual lo compone el usuario
    //    en vez de inventarnos una forma comun que no existe.
    const parts: Record<string, unknown>[] = [];
    if (hasEnvelope) parts.push({ kind: "data", data: envelope });
    if (prompt) parts.push({ kind: "text", text: prompt });

    const rpc = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "message/send",
      params: {
        message: {
          role: "user",
          parts,
          messageId: crypto.randomUUID(),
        },
      },
    };

    const t1 = Date.now();
    const res = await fetch(serviceUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(rpc),
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const raw = await readCapped(res, MAX_BODY_BYTES);
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // el agente contesto algo que no es JSON; lo devolvemos crudo igualmente
    }

    return NextResponse.json({
      stage: "message/send",
      ok: res.ok,
      status: res.status,
      service_url: serviceUrl,
      agent_card_skills: Array.isArray(card?.skills) ? card.skills.length : null,
      latency_ms: Date.now() - t1,
      total_ms: Date.now() - started,
      response: parsed,
      raw: parsed ? undefined : raw,
    });
  } catch (err) {
    const e = err as Error;
    return NextResponse.json({
      stage: "network",
      ok: false,
      latency_ms: Date.now() - started,
      error: e.name === "TimeoutError" ? "timed out after 12s" : e.message,
    });
  }
}
