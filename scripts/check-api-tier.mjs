#!/usr/bin/env node
// Dice en que tier estas AHORA MISMO, leyendo las cabeceras de rate limit.
//
// No hace falta esperar a que 8004scan conteste al formulario: el propio limite
// que devuelve la API es la respuesta. Anonimo son 1.000/dia; Pro, 100.000.
//
// Uso:  node scripts/check-api-tier.mjs           (anonimo)
//       SCAN_API_KEY=xxx node scripts/check-api-tier.mjs   (con tu key)

// Lee la key del entorno o de .env.local, y nunca la imprime: solo dice en que
// tier estas. Una key en un historial de terminal o en un log es una key
// filtrada, aunque sea de solo lectura.
async function readKey() {
  if (process.env.SCAN_API_KEY) return process.env.SCAN_API_KEY.trim();
  const { readFile } = await import('node:fs/promises');
  const text = await readFile('.env.local', 'utf8').catch(() => '');
  return (text.match(/^SCAN_API_KEY=(.+)$/m)?.[1] ?? '').trim();
}

const KEY = await readKey();
const res = await fetch(
  'https://api.8004scan.io/api/v1/agents?chain_id=97&limit=1',
  { headers: KEY ? { 'X-API-Key': KEY } : {} },
);

// Las cabeceras reales son -day y -minute, no la generica. Buscar la generica
// hacia que el comprobador dijera "no se puede determinar" con el dato delante.
const limit = Number(res.headers.get('x-ratelimit-limit-day') ?? 0);
const perMin = res.headers.get('x-ratelimit-limit-minute');
const left = res.headers.get('x-ratelimit-remaining-day');
const reset = res.headers.get('x-ratelimit-reset');

console.log(KEY ? `con API key (…${KEY.slice(-4)})` : 'anonimo (sin key)');
console.log('  http      :', res.status);
console.log('  limite/dia:', limit || '(no informado)');
console.log('  limite/min:', perMin ?? '?');
console.log('  restantes :', left ?? '?');
console.log('  reset en  :', reset ? reset + 's' : '?');

if (!limit) {
  console.log('\n  no se puede determinar el tier');
} else if (limit >= 100000) {
  console.log('\n  >>> PRO ACTIVO. Sube SCAN_API_KEY como secret en GitHub.');
} else if (limit > 1000) {
  console.log('\n  >>> tier intermedio (' + limit + '/dia).');
} else {
  console.log('\n  >>> sigues en anonimo. El upgrade aun no esta aplicado.');
  console.log('      A ~60 llamadas por pasada, eso son ~' + Math.floor(limit / 60) + ' pasadas al dia.');
}
