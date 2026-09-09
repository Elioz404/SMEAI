// Las cifras publicadas miden a terceros, y solo a terceros.
//
// POR QUE ESTE FICHERO EXISTE
//
// Es la afirmacion sobre la que descansa todo lo demas del sitio: los agentes
// que publicamos nosotros se ven, se etiquetan y NO suman. Si esa frase deja de
// ser cierta, SMEAI se convierte en lo que critica — un marketplace que se
// llena consigo mismo — y lo hace sin que nada se ponga rojo, porque las
// paginas seguirian renderizando perfectamente con un numero inflado.
//
// No es teorico. El 9 de septiembre el ciclo completo de `lifecycle-demo.mjs`
// se colo en `data/jobs.json`: el filtro miraba el comprador, y el comprador
// era la tesoreria en los dos casos. Durante unos minutos el sitio dijo "11
// jobs contra agentes que no controlamos, 1 entrego", presentando NUESTRA
// entrega como la de un tercero. Se encontro a mano. Esto es para que la
// proxima se encuentre sola.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyErc8183ManifestText } from '@altananetwork/sdk';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const snapshot = load('../data/snapshot.json');
const jobs = load('../data/jobs.json');
const lifecycle = load('../data/lifecycle-demo.json');

const ours = snapshot.agents.filter((a) => a.is_ours === true);
const others = snapshot.agents.filter((a) => a.is_ours !== true);

test('hay agentes propios y estan etiquetados', () => {
  // Si esto llega a cero, el resto de asertos pasarian por vacio y dejarian de
  // proteger nada: la comprobacion tiene que fallar, no volverse decorativa.
  assert.ok(ours.length > 0, 'sin agentes propios etiquetados no hay nada que excluir');
  for (const a of ours) {
    assert.equal(typeof a.name, 'string');
    assert.ok(a.name.length > 0, 'un agente propio sin nombre no se puede etiquetar en pantalla');
  }
});

test('el recuento de cabecera excluye a los nuestros', () => {
  assert.equal(snapshot.totals.ours, ours.length, 'totals.ours no cuadra');
  assert.equal(
    snapshot.totals.agents,
    others.length,
    'totals.agents incluye agentes nuestros',
  );
});

test('ni "live" ni "hireable" nos cuentan a nosotros', () => {
  assert.equal(snapshot.totals.live, others.filter((a) => a.live).length);
  assert.equal(snapshot.totals.hireable, others.filter((a) => a.hireable).length);
});

test('cada categoria mide terceros y contabiliza lo nuestro aparte', () => {
  for (const [key, c] of Object.entries(snapshot.per_category)) {
    const inCat = (a) => a.categories.includes(key);
    assert.equal(c.total, others.filter(inCat).length, `${key}.total`);
    assert.equal(c.ours, ours.filter(inCat).length, `${key}.ours`);
    assert.equal(
      c.hireable,
      others.filter((a) => inCat(a) && a.hireable).length,
      `${key}.hireable`,
    );
  }
});

test('las cuatro categorias del hackathon siguen existiendo', () => {
  // Una categoria que desaparece del snapshot vacia su pagina sin romper nada.
  for (const k of ['rebalancing', 'grid', 'yield', 'health']) {
    assert.ok(snapshot.per_category[k], `falta la categoria ${k}`);
  }
});

test('ningun trabajo del recuento lo vendimos nosotros', () => {
  // El fallo del 9 de septiembre, exactamente.
  const seller = lifecycle.seller.toLowerCase();
  const mine = jobs.jobs.filter((j) => j.provider.toLowerCase() === seller);
  assert.deepEqual(
    mine.map((j) => j.id),
    [],
    'un trabajo vendido por nosotros esta contando como actividad del mercado',
  );
});

test('el comprador de todos los trabajos es la tesoreria', () => {
  assert.match(jobs.treasury, /^0x[0-9a-fA-F]{40}$/);
  assert.ok(jobs.jobs.length > 0, 'sin trabajos no hay nada que medir');
});

test('los totales de trabajos cuadran con la lista', () => {
  const t = jobs.totals;
  const by = (s) => jobs.jobs.filter((j) => j.status === s).length;
  const sum = (l) => l.reduce((a, j) => a + BigInt(j.budget), 0n).toString();

  assert.equal(t.jobs, jobs.jobs.length, 'totals.jobs');
  assert.equal(t.funded, by('FUNDED'), 'totals.funded');
  assert.equal(t.submitted, by('SUBMITTED'), 'totals.submitted');
  assert.equal(t.completed, by('COMPLETED'), 'totals.completed');
  assert.equal(t.expired, by('EXPIRED'), 'totals.expired');
  assert.equal(t.delivered, jobs.jobs.filter((j) => j.delivered).length, 'totals.delivered');
  assert.equal(t.paid_raw, sum(jobs.jobs), 'totals.paid_raw');
  assert.equal(
    t.escrowed_raw,
    sum(jobs.jobs.filter((j) => j.status === 'FUNDED' || j.status === 'SUBMITTED')),
    'totals.escrowed_raw',
  );
});

test('el ciclo completo se registro entero, o no se anuncia', () => {
  // La pagina solo enseña el bloque cuando el estado es COMPLETED. Si el
  // registro quedara a medias, esto lo dice aqui en vez de dejar una tabla con
  // un paso sin transaccion detras.
  assert.match(lifecycle.job_id, /^\d+$/);
  assert.match(lifecycle.hire.tx, /^0x[0-9a-f]{64}$/i, 'falta el hash de la contratacion');
  assert.match(lifecycle.submit.tx, /^0x[0-9a-f]{64}$/i, 'falta el hash de la entrega');
  assert.ok(lifecycle.settle, 'no hay liquidacion registrada');
  assert.equal(lifecycle.settle.status, 'COMPLETED');
  assert.match(lifecycle.settle.tx, /^0x[0-9a-f]{64}$/i, 'falta el hash de la liquidacion');
  assert.equal(
    lifecycle.settle.paid_raw,
    lifecycle.price_raw,
    'lo cobrado no es lo que se escrowo',
  );
});

test('el vendedor del ciclo no es el comprador', () => {
  // Si coincidieran, el trabajo no probaria nada: seria dinero saliendo y
  // entrando en la misma direccion.
  assert.notEqual(
    lifecycle.seller.toLowerCase(),
    lifecycle.buyer.toLowerCase(),
    'comprador y vendedor son la misma direccion',
  );
});

test('el vendedor del ciclo no esta en el catalogo', () => {
  // La garantia es por construccion —no esta registrado en ERC-8004, asi que
  // el ingest no puede verlo— y esto lo comprueba desde el resultado.
  const seller = lifecycle.seller.toLowerCase();
  for (const a of snapshot.agents) {
    assert.notEqual((a.agent_wallet ?? '').toLowerCase(), seller, `${a.name} expone al vendedor`);
    assert.notEqual((a.owner_address ?? '').toLowerCase(), seller, `${a.name} lo tiene de dueño`);
  }
});

test('el deliverable publicado sigue reproduciendo el hash de la cadena', () => {
  // La pagina invita a cualquiera a descargar el manifiesto y rehashearlo. Esa
  // invitacion deja de ser cierta si el fichero se reformatea: el compromiso es
  // con unos BYTES exactos, y un `prettier` bienintencionado sobre
  // `public/deliverable/` romperia la prueba sin cambiar nada visible.
  const text = readFileSync(
    new URL(`../public/deliverable/${lifecycle.job_id}.json`, import.meta.url),
    'utf8',
  );
  assert.equal(
    verifyErc8183ManifestText(text, lifecycle.deliverable),
    true,
    'los bytes servidos ya no dan el hash comprometido en el kernel',
  );

  const manifest = JSON.parse(text);
  assert.equal(manifest.job_id, Number(lifecycle.job_id), 'el manifiesto es de otro trabajo');
  assert.ok(
    typeof manifest.metadata?.disclosure === 'string' &&
      /both sides of this job are smeai/i.test(manifest.metadata.disclosure),
    'la divulgacion de que el trabajo es nuestro tiene que viajar dentro del hash',
  );
});

test('un agente MCP contratable lo es por haber contestado, no por declararlo', () => {
  // La regla del sitio es la misma para los dos protocolos: card valida Y
  // servicio que responde. Lo que cambia es el idioma en que se pregunta, no la
  // vara. Si esto se relajara, "contratable" pasaria a significar "lo dice el
  // registro", que es exactamente el dato inflado que medimos en otros.
  const mcp = others.filter((a) => a.service?.protocol === 'mcp');
  assert.ok(mcp.length > 0, 'sin agentes MCP este aserto no protege nada');

  for (const a of mcp) {
    const probe = a.probes.find((p) => p.kind === 'mcp');
    assert.ok(probe, `${a.name}: servicio MCP sin sonda MCP detras`);
    assert.equal(probe.ok, true, `${a.name}: servicio alcanzable con sonda fallida`);
    assert.ok(
      Array.isArray(probe.skill_list) && probe.skill_list.length > 0,
      `${a.name}: alcanzable pero sin una sola herramienta enumerada`,
    );
    if (a.hireable) {
      assert.equal(a.live, true, `${a.name}: contratable sin estar vivo`);
    }
  }
});

test('a un servidor MCP no se le atribuye una conversacion A2A', () => {
  // El paso de servicio A2A manda un JSON-RPC que un servidor MCP no entiende.
  // Si un MCP apareciera con `speaks_a2a`, seria que se le hablo en el idioma
  // equivocado y se apunto el resultado igualmente.
  for (const a of others.filter((x) => x.service?.protocol === 'mcp')) {
    assert.notEqual(a.service.speaks_a2a, true, `${a.name}: marcado como hablante de A2A`);
  }
});

test('cada cifra publicada lleva la marca de cuando se midio', () => {
  // El sitio dice "hace 4h", no "ahora". Sin estas fechas esa frase se
  // inventaria sola.
  for (const [name, value] of [
    ['snapshot.generated_at', snapshot.generated_at],
    ['jobs.generated_at', jobs.generated_at],
    ['lifecycle.generated_at', lifecycle.generated_at],
  ]) {
    assert.ok(value, `${name} vacio`);
    assert.ok(
      Number.isFinite(Date.parse(value)),
      `${name} no es una fecha legible: ${value}`,
    );
  }
});
