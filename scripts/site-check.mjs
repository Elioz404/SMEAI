#!/usr/bin/env node
// Comprueba que el sitio publicado responde. Es la alarma de la entrega.
//
// POR QUE ES UN SCRIPT Y NO CURL DENTRO DEL WORKFLOW
//
// Esta comprobacion se dispara desde DOS sitios: su propio workflow
// (`site.yml`) y un job suelto dentro de `verify.yml`. La duplicacion es
// deliberada —GitHub entrega los cron por aproximacion y el 6 de septiembre
// dejo `site uptime` cuatro horas sin ejecutarse, que es un punto ciego justo
// en la alarma que dice que la entrega sigue siendo alcanzable— pero duplicar
// el DISPARO no puede significar duplicar la LISTA. Con las rutas escritas dos
// veces, el dia que se añada una pagina una de las dos copias se queda vieja y
// nadie se entera hasta que hace falta.
//
// Aqui viven una vez. Y ademas se puede ejecutar en local antes de tocar nada.
//
// Uso:
//   node scripts/site-check.mjs
//   SMEAI_PUBLIC_URL=https://otro-despliegue.vercel.app node scripts/site-check.mjs

const BASE = (process.env.SMEAI_PUBLIC_URL || 'https://smeai-dev.vercel.app').replace(/\/$/, '');
const TIMEOUT_MS = 25000;

// Cada ruta con el codigo que DEBE devolver, no con un 200 universal.
//
// /api/hire responde 405 a un GET porque solo acepta POST: exigirle 200 daria
// un rojo permanente, y no comprobarla dejaria sin vigilancia la ruta que de
// verdad contrata. Un 405 prueba que existe y que sigue rechazando el metodo
// equivocado; un 404 seria el fallo real.
//
// Las paginas de agente quedan fuera a proposito: su id sale del snapshot y un
// agente puede desaparecer del registro sin que nada este roto. Se vigila
// /category/rebalancing, cuya clave esta fija en categories.mjs y que el build
// genera siempre.
const ROUTES = [
  ['', 200],
  ['/start', 200],
  ['/census', 200],
  ['/report', 200],
  ['/method', 200],
  ['/scope', 200],
  ['/roadmap', 200],
  ['/category/rebalancing', 200],
  ['/api/agents?limit=1', 200],
  ['/api/jobs', 200],
  ['/api/census', 200],
  ['/api/altana', 200],
  ['/api/a2a', 200],
  ['/api/a2a/lp', 200],
  ['/api/a2a/grid', 200],
  ['/api/hire', 405],
];

async function check(path, want) {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { path, want, got: res.status, ms: Date.now() - t0 };
  } catch (err) {
    return { path, want, got: err.name === 'TimeoutError' ? 'timeout' : 'sin respuesta', ms: Date.now() - t0, why: err.message };
  }
}

const results = [];
for (const [path, want] of ROUTES) results.push(await check(path, want));

let fail = 0;
for (const r of results) {
  const ok = r.got === r.want;
  if (!ok) fail++;
  console.log(
    (ok ? 'ok  ' : 'CAIDO') +
      ' ' + String(r.got).padStart(7) +
      ' ' + (String(r.ms) + 'ms').padStart(7) +
      '  ' + (r.path || '/') +
      (ok ? '' : `  <- se esperaba ${r.want}${r.why ? ' · ' + String(r.why).slice(0, 80) : ''}`),
  );
}

console.log(`\n${results.length - fail}/${results.length} rutas correctas en ${BASE}`);
if (fail) {
  console.log('El sitio publicado NO esta sirviendo lo que deberia.');
  process.exitCode = 1;
}
