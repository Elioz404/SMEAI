#!/usr/bin/env node
// Imprime las DOS direcciones que intervienen, y cual hay que financiar.
//
// Comprobado en runtime: Altana delega sobre la propia EOA (modelo Porto,
// EIP-7702), asi que wallet.address coincide con la direccion del signer. Se
// imprimen las dos de todos modos: si una futura version del SDK cambiase a una
// smart account con direccion distinta, esto lo haria evidente antes de gastar
// un claim de faucet, que tiene 24 h de espera.
//
// Lee la clave de .env.local y nunca la imprime.

import { readFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient, BNB_TESTNET, signerFromPrivateKey } from '@altananetwork/sdk';

const text = await readFile('.env.local', 'utf8').catch(() => '');
const m = text.match(/^ALTANA_ADMIN_KEY=(0x[0-9a-fA-F]{64})/m);
if (!m) {
  console.error('No hay ALTANA_ADMIN_KEY en .env.local. Ejecuta primero:');
  console.error('  node scripts/altana-setup.mjs');
  process.exit(1);
}

const pk = m[1];
const eoa = privateKeyToAccount(pk).address;

const client = createClient({ chains: [BNB_TESTNET] });
const signer = signerFromPrivateKey(pk);
const wallet = await client.createWallet({ signer });

console.log('BSC Testnet (chain 97)\n');
console.log(`  signer (EOA)          ${eoa}`);
console.log(`  wallet Altana         ${wallet.address}`);
console.log('');
console.log('  >>> FINANCIA ESTA:    ' + wallet.address);
console.log('');
console.log('  explorador: https://testnet.bscscan.com/address/' + wallet.address);
