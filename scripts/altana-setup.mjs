#!/usr/bin/env node
// Genera una wallet desechable de BSC Testnet para la integracion con Altana.
//
// La clave privada se escribe DIRECTAMENTE en .env.local y no se imprime nunca.
// Solo se muestra la direccion publica, que es lo unico que hace falta compartir
// para pedir fondos al faucet. Asi la clave no acaba en un historial de terminal,
// en un log, ni en una conversacion.
//
// Esta wallet es de usar y tirar, y es solo para BSC Testnet. Nunca metas aqui
// una clave que controle fondos reales.
//
// Uso:  node scripts/altana-setup.mjs
//       node scripts/altana-setup.mjs --force   (regenera y sustituye)

import { readFile, writeFile, chmod } from 'node:fs/promises';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const FILE = '.env.local';
const KEY = 'ALTANA_ADMIN_KEY';
const force = process.argv.includes('--force');

const existing = await readFile(FILE, 'utf8').catch(() => '');

if (existing.includes(`${KEY}=`) && !force) {
  const account = currentAccount(existing);
  console.log(`${FILE} ya contiene ${KEY}.`);
  if (account) console.log(`direccion: ${account}`);
  console.log('\nUsa --force para generar una nueva y sustituirla.');
  process.exit(0);
}

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);

// Se conserva cualquier otra variable que ya hubiera en el fichero.
const kept = existing
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith(`${KEY}=`))
  .join('\n');

const body =
  (kept ? kept + '\n' : '') +
  `# Wallet desechable de BSC Testnet para el flujo de contratacion con Altana.\n` +
  `# Generada el ${new Date().toISOString()}. NO la reutilices en mainnet.\n` +
  `${KEY}=${pk}\n`;

await writeFile(FILE, body, { mode: 0o600 });
await chmod(FILE, 0o600).catch(() => {});

console.log('Wallet de testnet creada y guardada en .env.local (permisos 600).');
console.log('La clave privada no se ha mostrado y no esta en ningun log.\n');
console.log(`  direccion a financiar:  ${account.address}\n`);
console.log('Siguiente paso: consigue tBNB para esa direccion en un faucet que');
console.log('no exija saldo en mainnet, y despues reinicia el servidor.');

function currentAccount(text) {
  const m = text.match(new RegExp(`^${KEY}=(0x[0-9a-fA-F]{64})`, 'm'));
  if (!m) return null;
  try {
    return privateKeyToAccount(m[1]).address;
  } catch {
    return null;
  }
}
