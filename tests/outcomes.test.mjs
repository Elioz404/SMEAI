// La calificacion de correccion: que el veredicto se siga del dato.
//
// POR QUE HAY QUE VIGILAR ESTO
//
// Es la unica parte del sitio que dice si el trabajo de otro esta BIEN. Los
// demas numeros describen si contesta; este juzga lo que contesta, y un
// veredicto mal derivado es una acusacion.
//
// El fallo concreto que estos asertos impiden ya ocurrio durante el desarrollo:
// la primera comparacion dio un 3% de diferencia y parecia un error del agente.
// Tres muestras despues coincidia al centimo — servia cache. Un veredicto
// "divergent" sobre observaciones que incluyen un acierto exacto seria repetir
// ese error, y aqui no puede pasar sin que algo se ponga rojo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const outcomes = load('../data/outcomes.json');
const snapshot = load('../data/snapshot.json');

const VERDICTS = ['match', 'stale', 'divergent', 'unreadable'];

/**
 * Herramientas que NUNCA deben aparecer en una comprobacion.
 *
 * Los MCP de Venus y Aave exponen operaciones que mueven dinero junto a las de
 * lectura, en la misma lista. La proteccion real es que la tabla de
 * comprobaciones se escribe a mano; esto es el cinturon: si alguien añade una
 * comprobacion copiando el nombre de al lado, falla aqui y no contra un
 * contrato de prestamos.
 */
const WRITE_TOOLS = [
  'borrow',
  'repay',
  'supply',
  'withdraw',
  'mintToken',
  'redeemUnderlying',
  'enterMarkets',
  'exitMarket',
  'updateToken',
  'setUserUseReserveAsCollateral',
];

test('hay comprobaciones y la configuracion es coherente', () => {
  assert.ok(outcomes.results.length > 0, 'sin comprobaciones no se protege nada');
  assert.ok(outcomes.tolerance > 0 && outcomes.tolerance < 0.1, 'tolerancia fuera de rango razonable');
  assert.ok(outcomes.samples >= 2, 'con una sola muestra no se distingue cache de error');
  assert.ok(Number.isFinite(Date.parse(outcomes.generated_at)));
});

test('ninguna comprobacion llama a una herramienta que escribe', () => {
  for (const r of outcomes.results) {
    assert.ok(
      !WRITE_TOOLS.includes(r.tool),
      `${r.id}: "${r.tool}" mueve fondos y no puede estar en una comprobacion`,
    );
    assert.match(r.tool, /^(get|list|read)/i, `${r.id}: "${r.tool}" no parece una lectura`);
  }
});

test('cada veredicto es uno de los cuatro posibles', () => {
  for (const r of outcomes.results) {
    assert.ok(VERDICTS.includes(r.verdict), `${r.id}: veredicto desconocido "${r.verdict}"`);
    assert.ok(r.detail && r.detail.length > 10, `${r.id}: veredicto sin explicacion`);
  }
});

test('el veredicto se sigue de las observaciones, no se elige', () => {
  for (const r of outcomes.results) {
    const deltas = r.observations.map((o) => o.delta).filter((d) => typeof d === 'number');
    if (!deltas.length) {
      assert.equal(r.verdict, 'unreadable', `${r.id}: sin observaciones pero con veredicto`);
      continue;
    }
    const hit = deltas.some((d) => d <= outcomes.tolerance);
    const miss = deltas.some((d) => d > outcomes.tolerance);

    if (r.verdict === 'match') {
      assert.ok(hit && !miss, `${r.id}: "match" con observaciones fuera de tolerancia`);
    }
    if (r.verdict === 'stale') {
      // El aserto que impide repetir el error del desarrollo: "cacheado" exige
      // haber acertado alguna vez Y haber fallado alguna vez.
      assert.ok(hit, `${r.id}: "stale" sin una sola coincidencia que lo respalde`);
      assert.ok(miss, `${r.id}: "stale" sin ninguna observacion retrasada`);
    }
    if (r.verdict === 'divergent') {
      assert.ok(
        !hit,
        `${r.id}: marcado como divergente pese a haber coincidido con la cadena — eso es cache, no error`,
      );
    }
  }
});

test('la verdad viene de un contrato, no de otro agente', () => {
  for (const r of outcomes.results) {
    assert.match(
      r.truth_source,
      /0x[0-9a-fA-F]{40}/,
      `${r.id}: la referencia tiene que nombrar el contrato que se leyo`,
    );
    assert.notEqual(
      r.truth_source.toLowerCase(),
      r.endpoint.toLowerCase(),
      `${r.id}: la verdad no puede salir del propio agente que se califica`,
    );
  }
});

test('se califica a agentes que estan en el catalogo y responden', () => {
  for (const r of outcomes.results) {
    const agent = snapshot.agents.find(
      (a) => String(a.token_id) === r.agent.token_id && a.chain_id === r.agent.chain_id,
    );
    assert.ok(agent, `${r.id}: se califica a #${r.agent.token_id}, que no esta en el snapshot`);
    assert.notEqual(agent.is_ours, true, `${r.id}: no nos calificamos a nosotros mismos`);
    assert.equal(agent.hireable, true, `${r.id}: se califica a un agente que no responde`);
  }
});

test('cada observacion lleva cuando se tomo', () => {
  for (const r of outcomes.results) {
    for (const o of r.observations) {
      assert.ok(Number.isFinite(Date.parse(o.at)), `${r.id}: observacion sin fecha legible`);
      assert.ok(o.delta >= 0, `${r.id}: delta negativo`);
    }
  }
});
