#!/usr/bin/env node
// Checks every address in a searcher TOML against the chain: is there contract code there?
//   node scripts/verify-addresses.cjs arbitrum        (also: base, optimism)
// Needs network access to the chain's public RPC (rpc_http in the TOML). Read-only: no transactions, no keys.
const fs = require('fs');
const path = require('path');
const chain = process.argv[2] || 'arbitrum';
const file = path.join(__dirname, '..', 'flash-arb', 'searcher', 'config', `${chain}.toml`);
if (!fs.existsSync(file)) { console.error(`No config for "${chain}"`); process.exit(1); }
const text = fs.readFileSync(file, 'utf8');
const rpc = process.env.RPC_URL || (text.match(/^rpc_http\s*=\s*"([^"]+)"/m) || [])[1];
const wantId = Number((text.match(/^chain_id\s*=\s*(\d+)/m) || [])[1]);
if (!rpc) { console.error('rpc_http not found'); process.exit(1); }

const entries = [];
let section = '';
for (const raw of text.split('\n')) {
  const line = raw.replace(/#.*$/, '').trim();
  const sec = line.match(/^\[(.+)\]$/);
  if (sec) { section = sec[1]; continue; }
  const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*"(0x[0-9a-fA-F]{40})"/);
  if (kv) entries.push({ name: (section ? section + '.' : '') + kv[1], addr: kv[2] });
}
const SELECTORS = [
  { match: /^dexes\.(camelot_v2|sushiswap_v2)\.router$/, any: [{ name: 'swapExactTokensForTokens', sel: '38ed1739' }], hint: [{ name: 'swapExactTokensForTokensSupportingFeeOnTransferTokens(referrer)', sel: 'ac3893ba' }] },
  { match: /^dexes\.uniswap_v3\.router$/, any: [{ name: 'exactInputSingle (SwapRouter v1)', sel: '414bf389' }, { name: 'exactInputSingle (SwapRouter02)', sel: '04e45aaf' }] },
  { match: /^dexes\.(camelot_v2|sushiswap_v2)\.factory$/, any: [{ name: 'getPair', sel: 'e6a43905' }] },
  { match: /^dexes\.uniswap_v3\.factory$/, any: [{ name: 'getPool', sel: '1698ee82' }] },
];
const SKIP_EOA = /beneficiary|signer|profit|gas_wallet/; // wallets are not contracts
async function call(method, params) {
  const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}
(async () => {
  const id = parseInt(await call('eth_chainId', []), 16);
  console.log(`RPC ${rpc}\nchain id: ${id} ${id === wantId ? '(matches config)' : `(CONFIG SAYS ${wantId}: WRONG RPC)`}\n`);
  let bad = 0;
  for (const e of entries) {
    if (/^0x0{40}$/i.test(e.addr)) { console.log(`  --  ${e.name}: zero address (not set yet)`); continue; }
    try {
      const code = await call('eth_getCode', [e.addr, 'latest']);
      const has = code && code !== '0x';
      const isWallet = SKIP_EOA.test(e.name);
      const ok = isWallet ? true : has;
      if (!ok) bad++;
      console.log(`  ${ok ? 'ok' : 'NO'}  ${e.name}: ${e.addr} ${has ? `(contract, ${(code.length - 2) / 2} bytes)` : '(NO CODE: wrong address or wrong chain)'}`);
      // Heuristic ABI check: the 4-byte selector the searcher/contract calls must appear in the runtime code.
      // (Not reliable for proxies: a proxy's code only holds its own selectors.)
      if (has) {
        const need = SELECTORS.find((s) => s.match.test(e.name));
        if (need) {
          const found = need.any.filter((x) => code.toLowerCase().includes(x.sel));
          const alt = (need.hint || []).filter((x) => code.toLowerCase().includes(x.sel));
          if (found.length) console.log(`        selector ok: ${found.map((x) => x.name).join(' or ')}`);
          else { bad++; console.log(`        !! missing selector ${need.any.map((x) => x.name + ' 0x' + x.sel).join(' / ')}: the contract/searcher call will revert here${alt.length ? ' (found instead: ' + alt.map((x) => x.name).join(', ') + ')' : ''}`); }
        }
      }
    } catch (err) { bad++; console.log(`  ??  ${e.name}: ${err.message}`); }
  }
  console.log(bad ? `\n${bad} problem(s). Fix the TOML before running the searcher.` : '\nAll configured contracts exist on this chain.');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('RPC error:', e.message); process.exit(1); });
