import { ERC8183_ADDRESSES } from '@altananetwork/sdk';
import { createPublicClient, fallback, http, parseAbi } from 'viem';
import { bsc } from 'viem/chains';
const p = createPublicClient({ chain: bsc, transport: fallback([http('https://bsc-dataseed.binance.org'), http('https://bsc-dataseed1.defibit.io')]) });
const REG = ERC8183_ADDRESSES[56].registry;
const abi = parseAbi(['function tokenURI(uint256) view returns (string)','function ownerOf(uint256) view returns (address)']);
const IDS = [];
for (let i = 300000; i <= 331500; i += 2500) IDS.push(BigInt(i));
IDS.push(331324n, 331325n, 331328n);
let termix = 0, two = 0, empty = 0, minId = null, maxId = null;
const owners = new Set();
for (const id of IDS) {
  let uri; try { uri = await p.readContract({ address: REG, abi, functionName: 'tokenURI', args: [id] }); } catch { continue; }
  let d; try { d = uri.startsWith('data:') ? JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString('utf8'))
                                           : await fetch(uri,{signal:AbortSignal.timeout(10000)}).then(r=>r.json()); } catch { continue; }
  const eps = (d.services ?? []).map(s => s.endpoint ?? '');
  if (!eps.some(e => e.includes('termix'))) continue;
  termix++;
  minId = minId === null ? id : (id < minId ? id : minId);
  maxId = maxId === null ? id : (id > maxId ? id : maxId);
  if (eps.filter(e => /\{[A-Za-z_][A-Za-z0-9_]*\}/.test(e)).length >= 2) two++;
  if (Array.isArray(d.registrations) && d.registrations.length === 0) empty++;
  try { owners.add((await p.readContract({ address: REG, abi, functionName: 'ownerOf', args: [id] })).toLowerCase()); } catch {}
}
console.log(`   documentos de TermiX leidos : ${termix}`);
console.log(`   con DOS endpoints marcados  : ${two}/${termix}`);
console.log(`   con registrations vacio     : ${empty}/${termix}`);
console.log(`   duenos distintos            : ${owners.size}`);
console.log(`   rango real de ids           : ${minId} – ${maxId}`);
