#!/usr/bin/env node
// Devuelve la wallet del tesoro a EOA pura en BSC Mainnet.
//
// POR QUE HACE FALTA
//
// Al importar la clave en MetaMask, MetaMask convirtio la cuenta en una smart
// account delegandola por EIP-7702 a su propio contrato
// (0x63c0c19a…, "MetaMask: EIP-7702 Delegator"). Altana espera la cuenta
// delegada a SU implementacion — como en testnet — asi que su relay simula la
// operacion contra codigo ajeno y revierte con datos vacios, sin explicar nada.
//
// Una delegacion 7702 se borra firmando una autorizacion a la direccion cero.
// Eso es exactamente lo que hace el boton "switch back to standard account" de
// MetaMask, pero no depende de que su interfaz lo ofrezca.
//
// Despues de esto, la primera operacion de Altana pondra su propia delegacion,
// igual que hizo en testnet.
//
// Uso:
//   node scripts/clear-delegation.mjs            # solo comprueba
//   node scripts/clear-delegation.mjs --confirm  # firma y envia

import { BNB } from '@altananetwork/sdk';
import { createPublicClient, createWalletClient, http, zeroAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';

const CONFIRM = process.argv.includes('--confirm');
const log = (...a) => console.log(...a);

function adminKey() {
  const k = process.env.ALTANA_ADMIN_KEY?.trim();
  if (!k) throw new Error('ALTANA_ADMIN_KEY no esta definida');
  return k.startsWith('0x') ? k : `0x${k}`;
}

const account = privateKeyToAccount(adminKey());
// El RPC por defecto de viem devolvio bytecode obsoleto tras limpiar la
// delegacion, mientras que este y los dataseed de Binance daban el estado real.
const pub = createPublicClient({ chain: bsc, transport: http(BNB.publicRpcUrl) });
const wallet = createWalletClient({ account, chain: bsc, transport: http(BNB.publicRpcUrl) });

/** Lee el designador 7702, si lo hay. */
async function delegation() {
  const code = await pub.getBytecode({ address: account.address });
  if (!code) return null;
  if (!code.startsWith('0xef0100')) return { raw: code, target: null };
  return { raw: code, target: `0x${code.slice(8)}` };
}

async function main() {
  log(`cuenta : ${account.address}`);
  log(`cadena : BSC Mainnet (56)\n`);

  const before = await delegation();
  const balance = await pub.getBalance({ address: account.address });
  log(`saldo        : ${Number(balance) / 1e18} BNB`);
  log(`delegacion   : ${before ? (before.target ?? before.raw) : '(ninguna — ya es EOA pura)'}`);

  if (!before) {
    log('\nNo hay nada que borrar.');
    return;
  }
  if (!before.target) {
    // Codigo que no es un designador 7702 seria un contrato de verdad, y
    // entonces esto no aplica: mejor parar que enviar una transaccion a ciegas.
    throw new Error('la cuenta tiene codigo que no es una delegacion 7702; no se toca');
  }

  if (!CONFIRM) {
    log('\n--- SIMULACION. Nada enviado. Anade --confirm para borrar la delegacion. ---');
    return;
  }

  // `executor: 'self'` = la propia cuenta envia la transaccion que lleva su
  // autorizacion, asi que viem ajusta el nonce de la autorizacion a nonce+1.
  log('\nfirmando autorizacion a la direccion cero...');
  const authorization = await account.signAuthorization({
    address: zeroAddress,
    chainId: bsc.id,
    nonce: (await pub.getTransactionCount({ address: account.address })) + 1,
  });

  log('enviando transaccion tipo 4...');
  const hash = await wallet.sendTransaction({
    authorizationList: [authorization],
    to: account.address,
    value: 0n,
  });
  log(`tx: ${hash}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  log(`recibo: ${receipt.status} · bloque ${receipt.blockNumber}`);

  const after = await delegation();
  log(`\ndelegacion despues: ${after ? (after.target ?? after.raw) : '(ninguna — EOA pura)'}`);
  const spent = balance - (await pub.getBalance({ address: account.address }));
  log(`gastado: ${Number(spent) / 1e18} BNB`);

  if (after) throw new Error('la delegacion sigue ahi; revisar antes de continuar');
  log('\nListo. Altana pondra su propia delegacion en la primera operacion.');
}

main().catch((err) => {
  console.error('\nFALLO:', err.message);
  process.exit(1);
});
