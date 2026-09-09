// Handshake MCP: preguntarle a un servidor MCP en su propio idioma.
//
// POR QUE UN GET NO SIRVE
//
// La sonda general del ingest pide la URL y mira si vuelve algo con forma de
// agent-card. Contra un servidor MCP eso mide la puerta, no la casa: MCP es
// JSON-RPC sobre POST, asi que un GET puede devolver 200 y un JSON descriptivo
// mientras el servidor no atiende una sola llamada — o al reves, puede fallar
// contra un servidor sano que solo responde a POST.
//
// Medido en el registro el 9 de septiembre de 2026: 19 agentes declaran MCP y
// ningun otro protocolo, y CERO podian marcarse contratables, porque nunca se
// les hablaba en su idioma. Cuatro de esos endpoints completan el handshake y
// listan herramientas reales en cuanto se les pregunta bien.
//
// Es el mismo principio que ya aplicabamos al A2A —comprobar el escaparate no
// es comprobar la tienda— aplicado al protocolo que faltaba.
//
// Vive aqui y no dentro de `scripts/ingest.mjs` por la misma razon que
// `net-guard.mjs`: se puede probar sin red y sin arrancar una ingesta de
// veinte minutos.

import { readCapped, sanitizeText } from './net-guard.mjs';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

const DEFAULT_TIMEOUT_MS = 8000;

/** Cuantas herramientas se guardan por agente. Igual que las skills de A2A. */
const MAX_TOOLS = 8;

/**
 * Tope de bytes por respuesta.
 *
 * Empezo en 12 KB y estaba mal. Un `tools/list` no es un mensaje corto: lleva
 * el JSON Schema completo de cada herramienta, y medido contra los servidores
 * reales del registro son 30 KB en el MCP de Venus (16 herramientas) y 52 KB
 * en el de Aave (22). Con el tope bajo, el JSON llegaba cortado, no parseaba, y
 * los dos quedaban anotados como "no lista herramientas" — un fallo nuestro
 * apuntado en su expediente, que es exactamente lo que este proyecto mide en
 * los demas.
 *
 * Sigue habiendo tope porque la URL la elige un desconocido y sin el un cuerpo
 * de gigabytes tumba la ingesta. 256 KB deja cinco veces el mayor servidor
 * legitimo que hemos visto y sigue siendo memoria acotada.
 */
const MAX_BODY_BYTES = 262144;

/**
 * Extrae el objeto JSON-RPC de la respuesta.
 *
 * El transporte permite contestar en JSON o en SSE, y cada servidor elige. Un
 * parser que solo entienda JSON marcaria como rotos a los que hablan SSE, que
 * es un fallo nuestro anotado como fallo suyo.
 */
export function parseRpcBody(text, contentType) {
  if ((contentType ?? '').includes('text/event-stream')) {
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      try {
        return JSON.parse(line.slice(5).trim());
      } catch {
        // una linea `data:` que no es JSON no invalida las siguientes
      }
    }
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Normaliza la lista de herramientas a la misma forma que las skills de A2A. */
export function normalizeTools(tools) {
  if (!Array.isArray(tools)) return null;
  return tools.slice(0, MAX_TOOLS).map((t) => ({
    id: sanitizeText(t?.name ?? '', 60),
    name: sanitizeText(t?.title ?? t?.name ?? '', 80),
    description: sanitizeText(t?.description ?? '', 240),
  }));
}

async function mcpCall(url, body, { sessionId, timeoutMs } = {}) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // Igual que en la sonda general: una URL publica puede redirigir a la red
    // interna y saltarse la validacion que ya se hizo sobre el host original.
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  const text = await readCapped(res, MAX_BODY_BYTES);
  return {
    status: res.status,
    sessionId: res.headers.get('mcp-session-id'),
    json: parseRpcBody(text, res.headers.get('content-type')),
    // Si se llego al tope, lo que hay en `text` esta cortado. Importa porque un
    // JSON cortado no parsea, y sin esta senal ese silencio se confundiria con
    // un servidor que no tiene nada que decir.
    truncated: text.length >= MAX_BODY_BYTES,
  };
}

/**
 * `initialize` -> `notifications/initialized` -> `tools/list`.
 *
 * Devuelve que sabe hacer el servidor, o por que no se ha podido saber. No
 * lanza: un servidor que no contesta no es un error del proceso, es el
 * resultado que hay que publicar.
 */
export async function mcpHandshake(url, opts = {}) {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs;

  try {
    const init = await mcpCall(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'smeai', version: '1' },
        },
      },
      { timeoutMs },
    );

    const server = init.json?.result;
    if (!server) {
      return {
        ok: false,
        status: init.status,
        latency_ms: Date.now() - t0,
        error: 'initialize no devolvio un resultado JSON-RPC',
      };
    }

    // El transporte pide esta notificacion antes de operar. Los servidores que
    // medimos no la exigen, pero mandarla no cuesta nada y los que si la exigen
    // dejarian de parecer rotos por una formalidad que si nos toca cumplir.
    await mcpCall(
      url,
      { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
      { sessionId: init.sessionId, timeoutMs },
    ).catch(() => null);

    const listed = await mcpCall(
      url,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { sessionId: init.sessionId, timeoutMs },
    );

    const tools = normalizeTools(listed.json?.result?.tools);

    return {
      ok: Boolean(tools),
      status: listed.status,
      latency_ms: Date.now() - t0,
      server_name: sanitizeText(server.serverInfo?.name ?? '', 80) || null,
      protocol_version: sanitizeText(server.protocolVersion ?? '', 20) || null,
      tools,
      tool_count: Array.isArray(listed.json?.result?.tools)
        ? listed.json.result.tools.length
        : null,
      error: tools
        ? undefined
        : listed.truncated
          ? `la lista de herramientas supera ${MAX_BODY_BYTES} bytes y llego cortada`
          : 'el servidor inicia pero no lista herramientas',
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      latency_ms: Date.now() - t0,
      error: err.name === 'TimeoutError' ? 'timeout' : String(err.message).slice(0, 120),
    };
  }
}

/**
 * Un endpoint MCP se sondea UNA vez, aunque lo declaren veinte identidades.
 *
 * Nueve de los diecinueve solo-MCP apuntan al mismo host. Sondear por identidad
 * serian veintisiete peticiones contra un servidor que acabaria devolviendo 429,
 * y leeriamos como caido un servicio sano: exactamente el error que el paso del
 * servicio ya documenta haberse hecho a si mismo. Se memoiza la PROMESA y no el
 * resultado, para que las sondas simultaneas compartan una sola llamada.
 */
const inFlight = new Map();

export function probeMcp(url, opts) {
  if (inFlight.has(url)) return inFlight.get(url);
  const run = mcpHandshake(url, opts);
  inFlight.set(url, run);
  return run;
}

/** Solo para los tests: sin esto, un caso contaminaria al siguiente. */
export function resetMcpCache() {
  inFlight.clear();
}
