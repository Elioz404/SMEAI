// Lo que publicamos sobre agentes de OTROS.
//
// POR QUE ESTE FICHERO ES DISTINTO DE LOS DEMAS
//
// El resto de la suite protege cifras que, si se rompen, quedan mal en nuestra
// pagina. Esta protege afirmaciones firmadas con nuestra clave y escritas para
// siempre en el registro publico de otra persona. Un error aqui no se corrige
// en la siguiente pasada.
//
// De ahi que los asertos no midan formato sino las tres promesas que hace el
// documento: que el hash comprometido es el de los bytes que servimos, que solo
// hablamos de agentes a los que llamamos y respondieron siempre, y que no
// escribimos un registro por cada sombrero que lleve un mismo backend.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keccak256, toBytes } from 'viem';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const feedback = load('../data/feedback.json');
const snapshot = load('../data/snapshot.json');
const history = load('../data/history.json');

/** Mismo calculo que el publicador: `-` y `?` no son caidas. */
function record(agentId) {
  const marks = (history.agents[agentId] ?? '').split('');
  return {
    observed: marks.filter((m) => m !== '-' && m !== '?').length,
    hireable: marks.filter((m) => m === 'h').length,
  };
}

const bySubject = (id) =>
  snapshot.agents.find((a) => String(a.token_id) === String(id) && a.chain_id === feedback.chain_id);

test('hay registros y apuntan al registro de reputacion correcto', () => {
  assert.ok(feedback.records.length > 0, 'sin registros no se protege nada');
  assert.equal(feedback.chain_id, 56, 'se publica en mainnet');
  assert.match(feedback.registry, /^0x[0-9a-fA-F]{40}$/);
  assert.match(feedback.issuer, /^0x[0-9a-fA-F]{40}$/);
});

test('el hash comprometido es el de los bytes que servimos', () => {
  // La promesa entera del documento. Si alguien reformatea public/feedback/ —
  // un prettier bienintencionado basta— el puntero en cadena deja de resolver
  // a lo que dice resolver, y no hay forma de corregirlo despues.
  for (const r of feedback.records) {
    const text = readFileSync(
      new URL(`../public/feedback/${r.agent_id}.json`, import.meta.url),
      'utf8',
    );
    assert.equal(
      keccak256(toBytes(text)),
      r.hash,
      `#${r.agent_id}: el fichero servido ya no reproduce el hash publicado`,
    );
    assert.equal(Buffer.byteLength(text), r.bytes, `#${r.agent_id}: cambio el tamaño`);
  }
});

test('cada documento habla del agente que dice, y de nuestra medicion', () => {
  for (const r of feedback.records) {
    const doc = load(`../public/feedback/${r.agent_id}.json`);
    assert.equal(doc.subject.agent_id, r.agent_id, 'el documento es de otro agente');
    assert.equal(doc.subject.chain_id, feedback.chain_id);
    assert.equal(doc.subject.endpoint, r.endpoint, 'el endpoint no coincide con el publicado');
    assert.equal(doc.measurement.claim, 'reachability', 'la afirmacion tiene que seguir acotada');
    assert.equal(doc.measurement.checks_observed, doc.measurement.checks_reachable);
    assert.ok(doc.measurement.method.length > 80, 'sin metodo, el dato es una opinion');
    assert.ok(
      Array.isArray(doc.known_defects) && doc.known_defects.length >= 4,
      `#${r.agent_id}: un registro de reputacion que no dice como puede equivocarse no es una medicion`,
    );
  }
});

test('solo publicamos de quien respondio en TODAS las pasadas que lo miramos', () => {
  for (const r of feedback.records) {
    const agent = bySubject(r.agent_id);
    assert.ok(agent, `#${r.agent_id}: publicado pero ausente del snapshot`);
    assert.notEqual(agent.is_ours, true, `#${r.agent_id}: no se publica reputacion de lo nuestro`);

    const { observed, hireable } = record(agent.agent_id);
    assert.ok(
      observed >= feedback.min_checks,
      `#${r.agent_id}: solo ${observed} pasadas, por debajo del minimo de ${feedback.min_checks}`,
    );
    assert.equal(
      hireable,
      observed,
      `#${r.agent_id}: publicado como perfecto con ${observed - hireable} caida(s) medidas`,
    );
  }
});

test('el valor publicado es la medicion, no un numero elegido', () => {
  for (const r of feedback.records) {
    const agent = bySubject(r.agent_id);
    const { observed, hireable } = record(agent.agent_id);
    // int128 con dos decimales: el contrato guarda 10000 para el 100,00%.
    assert.equal(r.value, Math.round((hireable / observed) * 10000), `#${r.agent_id}`);
    assert.equal(r.value_decimals, 2);
    assert.ok(r.value > 0 && r.value <= 10000, `#${r.agent_id}: valor fuera de rango`);
  }
});

test('un backend, un registro', () => {
  // 41 identidades cumplian el criterio y son 4 backends. Escribir 41 registros
  // seria llenar el registro de entradas redundantes, que es exactamente lo que
  // este proyecto mide y denuncia en los demas.
  const endpoints = feedback.records.map((r) => r.endpoint);
  assert.equal(
    new Set(endpoints).size,
    endpoints.length,
    'hay dos registros para el mismo backend',
  );

  const ids = feedback.records.map((r) => r.agent_id);
  assert.equal(new Set(ids).size, ids.length, 'hay dos registros para el mismo agente');
});

test('la representante de un backend compartido es la de token_id mas bajo', () => {
  // Deterministico a proposito: dos ejecuciones tienen que elegir a la misma,
  // o acabariamos publicando un registro nuevo por cada pasada.
  for (const r of feedback.records) {
    if (r.identities <= 1) continue;
    const sameBackend = snapshot.agents.filter(
      (a) =>
        !a.is_ours &&
        a.chain_id === feedback.chain_id &&
        a.hireable &&
        a.service?.url === r.endpoint &&
        record(a.agent_id).observed >= feedback.min_checks &&
        record(a.agent_id).hireable === record(a.agent_id).observed,
    );
    const lowest = sameBackend
      .map((a) => Number(a.token_id))
      .sort((x, y) => x - y)[0];
    assert.equal(Number(r.agent_id), lowest, `#${r.agent_id}: no es la representante deterministica`);
  }
});

test('cada registro publicado guarda su transaccion', () => {
  // Antes de --confirm todos estan a null, y eso es un estado valido: lo que no
  // puede haber es un registro que diga estar en cadena sin hash que lo pruebe.
  for (const r of feedback.records) {
    if (r.tx === null) continue;
    assert.match(r.tx, /^0x[0-9a-f]{64}$/i, `#${r.agent_id}: hash de transaccion mal formado`);
    assert.ok(Number.isInteger(r.block) && r.block > 0, `#${r.agent_id}: sin bloque`);
  }
});
