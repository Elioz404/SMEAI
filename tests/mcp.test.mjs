// El handshake MCP, contra servidores de mentira que se comportan como los de
// verdad.
//
// POR QUE UN SERVIDOR LOCAL Y NO LOS REALES
//
// Los endpoints del registro se caen, cambian de herramientas y estan al otro
// lado de la red. Un test que dependa de ellos falla por motivos que no son el
// codigo, y un test que falla por motivos ajenos deja de leerse. Aqui se
// levanta un servidor por caso y se le hace decir exactamente lo que hace falta
// comprobar, incluido lo que ningun servidor real haria a peticion.
//
// El tope de bytes tiene su propio caso porque ya se equivoco una vez: estaba
// en 12 KB, y el `tools/list` del MCP de Aave ocupa 52 KB porque lleva el JSON
// Schema de sus 22 herramientas. Con aquel tope el JSON llegaba cortado, no
// parseaba, y un servidor sano quedaba anotado como que no lista nada.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  mcpHandshake,
  normalizeTools,
  parseRpcBody,
  probeMcp,
  resetMcpCache,
} from '../src/lib/mcp.mjs';

/**
 * Levanta un servidor que responde con lo que devuelva `handler(method, req)`.
 * Devuelve la URL y un cierre; el `after` de cada test lo apaga.
 */
async function serve(handler) {
  const seen = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      // un cuerpo ilegible tambien es un caso valido de prueba
    }
    seen.push({ method: parsed?.method, sessionId: req.headers['mcp-session-id'] });
    const out = handler(parsed?.method, parsed) ?? { status: 200, body: '{}' };
    res.writeHead(out.status, out.headers ?? { 'content-type': 'application/json' });
    res.end(out.body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}/mcp`,
    seen,
    close: () => new Promise((r) => server.close(r)),
  };
}

const okInit = {
  status: 200,
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'servidor-de-prueba', version: '1.0.0' },
    },
  }),
};

const toolsBody = (tools) =>
  JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools } });

test('parseRpcBody entiende JSON y SSE, y no revienta con basura', () => {
  assert.deepEqual(parseRpcBody('{"a":1}', 'application/json'), { a: 1 });
  assert.equal(parseRpcBody('no soy json', 'application/json'), null);

  // El transporte permite las dos formas y cada servidor elige.
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
  assert.deepEqual(parseRpcBody(sse, 'text/event-stream'), {
    jsonrpc: '2.0',
    id: 1,
    result: { ok: true },
  });

  // Una linea `data:` ilegible no puede invalidar las siguientes.
  const messy = 'data: {roto\ndata: {"result":"segunda"}\n';
  assert.deepEqual(parseRpcBody(messy, 'text/event-stream'), { result: 'segunda' });
  assert.equal(parseRpcBody('data: nada\n', 'text/event-stream'), null);
});

test('normalizeTools deja las herramientas con la misma forma que las skills A2A', () => {
  const out = normalizeTools([
    { name: 'borrow', title: 'Borrow Token', description: 'Pide prestado.' },
    { name: 'supply' }, // sin titulo ni descripcion
  ]);
  assert.deepEqual(out[0], {
    id: 'borrow',
    name: 'Borrow Token',
    description: 'Pide prestado.',
  });
  assert.equal(out[1].id, 'supply');
  assert.equal(out[1].name, 'supply', 'sin titulo, el nombre cae al id');
  assert.equal(out[1].description, '');

  assert.equal(normalizeTools(null), null, 'sin lista no se inventa una');
  assert.equal(normalizeTools('herramientas'), null, 'lo que no es lista, no cuenta');

  const many = normalizeTools(Array.from({ length: 40 }, (_, i) => ({ name: `t${i}` })));
  assert.equal(many.length, 8, 'se guardan como mucho ocho, igual que en A2A');
});

test('un servidor que inicia y lista herramientas queda como alcanzable', async (t) => {
  const s = await serve((method) =>
    method === 'initialize'
      ? okInit
      : method === 'tools/list'
        ? { status: 200, body: toolsBody([{ name: 'health_factor', description: 'Lee Venus.' }]) }
        : { status: 202, body: '' },
  );
  t.after(s.close);

  const r = await mcpHandshake(s.url);
  assert.equal(r.ok, true);
  assert.equal(r.server_name, 'servidor-de-prueba');
  assert.equal(r.protocol_version, '2025-06-18');
  assert.equal(r.tool_count, 1);
  assert.equal(r.tools[0].id, 'health_factor');
  assert.equal(r.error, undefined);

  // Se manda la notificacion que pide el transporte, y en su orden.
  assert.deepEqual(
    s.seen.map((x) => x.method),
    ['initialize', 'notifications/initialized', 'tools/list'],
  );
});

test('un 201 al iniciar es igual de valido que un 200', async (t) => {
  // El MCP de Venus del registro contesta 201. Exigir 200 lo habria dado por
  // roto sin haberlo leido.
  const s = await serve((method) =>
    method === 'initialize'
      ? { ...okInit, status: 201 }
      : method === 'tools/list'
        ? { status: 201, body: toolsBody([{ name: 'borrow' }]) }
        : { status: 202, body: '' },
  );
  t.after(s.close);

  const r = await mcpHandshake(s.url);
  assert.equal(r.ok, true);
  assert.equal(r.tool_count, 1);
});

test('la sesion que abre el servidor se devuelve en las llamadas siguientes', async (t) => {
  const s = await serve((method) =>
    method === 'initialize'
      ? { ...okInit, headers: { 'content-type': 'application/json', 'mcp-session-id': 'abc123' } }
      : { status: 200, body: toolsBody([{ name: 'x' }]) },
  );
  t.after(s.close);

  await mcpHandshake(s.url);
  const after = s.seen.filter((x) => x.method !== 'initialize');
  assert.ok(after.length > 0);
  for (const call of after) {
    assert.equal(call.sessionId, 'abc123', 'la sesion no se propago');
  }
});

test('el transporte SSE se entiende igual que el JSON', async (t) => {
  const sse = (obj) => ({
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    body: `event: message\ndata: ${JSON.stringify(obj)}\n\n`,
  });
  const s = await serve((method) =>
    method === 'initialize'
      ? sse(JSON.parse(okInit.body))
      : sse({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'grid' }] } }),
  );
  t.after(s.close);

  const r = await mcpHandshake(s.url);
  assert.equal(r.ok, true, 'un servidor que habla SSE no esta roto');
  assert.equal(r.tools[0].id, 'grid');
});

test('si initialize no devuelve resultado, se dice eso y no se sigue', async (t) => {
  const s = await serve(() => ({ status: 500, body: 'Internal Server Error' }));
  t.after(s.close);

  const r = await mcpHandshake(s.url);
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
  assert.match(r.error, /initialize/);
  // Una sola llamada: si el saludo no sale, no se pide la lista ni se manda la
  // notificacion. Insistir contra un servidor que ya fallo solo suma carga.
  assert.deepEqual(
    s.seen.map((x) => x.method),
    ['initialize'],
    'no se sigue llamando tras el fallo',
  );
});

test('un servidor que inicia pero no lista nada se distingue del que no inicia', async (t) => {
  const s = await serve((method) =>
    method === 'initialize' ? okInit : { status: 200, body: '{"jsonrpc":"2.0","id":2,"result":{}}' },
  );
  t.after(s.close);

  const r = await mcpHandshake(s.url);
  assert.equal(r.ok, false);
  assert.equal(r.server_name, 'servidor-de-prueba', 'se conserva quien dijo ser');
  assert.match(r.error, /no lista herramientas/);
});

test('una lista enorme se reporta como cortada, no como vacia', async (t) => {
  // El fallo real: con el tope en 12 KB, los 52 KB del MCP de Aave llegaban
  // cortados y el servidor sano quedaba anotado como que no tiene herramientas.
  // Aqui se fuerza a superar el tope actual para comprobar que ahora lo dice.
  const huge = Array.from({ length: 4000 }, (_, i) => ({
    name: `tool_${i}`,
    description: 'x'.repeat(200),
  }));
  const s = await serve((method) =>
    method === 'initialize' ? okInit : { status: 200, body: toolsBody(huge) },
  );
  t.after(s.close);

  const r = await mcpHandshake(s.url);
  assert.equal(r.ok, false);
  assert.match(r.error, /cortada/, 'debe decir que llego cortada, no que no lista nada');
});

test('una lista grande pero dentro del tope se lee entera', async (t) => {
  // 22 herramientas con esquema, que es el tamaño del MCP de Aave real.
  const many = Array.from({ length: 22 }, (_, i) => ({
    name: `tool_${i}`,
    description: 'd'.repeat(1500),
  }));
  const s = await serve((method) =>
    method === 'initialize' ? okInit : { status: 200, body: toolsBody(many) },
  );
  t.after(s.close);

  const r = await mcpHandshake(s.url);
  assert.equal(r.ok, true, '33 KB entran de sobra en el tope');
  assert.equal(r.tool_count, 22, 'se cuentan todas');
  assert.equal(r.tools.length, 8, 'pero solo se guardan ocho');
});

test('el mismo endpoint se llama una vez aunque lo pidan veinte identidades', async (t) => {
  // Nueve de los diecinueve agentes solo-MCP comparten backend. Sin esto son
  // veintisiete peticiones al mismo host y un 429 que nos hariamos solos.
  resetMcpCache();
  let initCalls = 0;
  const s = await serve((method) => {
    if (method === 'initialize') initCalls++;
    return method === 'initialize' ? okInit : { status: 200, body: toolsBody([{ name: 'a' }]) };
  });
  t.after(() => {
    resetMcpCache();
    return s.close();
  });

  const all = await Promise.all(Array.from({ length: 9 }, () => probeMcp(s.url)));
  assert.equal(initCalls, 1, `se llamo ${initCalls} veces en vez de una`);
  for (const r of all) assert.equal(r.ok, true, 'todas las identidades reciben el resultado');
});
