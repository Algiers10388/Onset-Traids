#!/usr/bin/env node
/**
 * Deploy FlashArbOptimized to one chain and write the address into flash-arb/searcher/config/<chain>.toml.
 *
 *   npm run compile:flash-arb            # (node scripts/compile-contracts.cjs) builds the artifact first
 *   FLASH_ARB_SIGNER_KEY=0x... CONFIRM_DEPLOY=yes node scripts/deploy-flash-arb.cjs arbitrum
 *
 * The deploying wallet becomes the contract OWNER (only it can start flash loans), so use the same key as the searcher.
 * Optional: FLASH_ARB_RPC_<CHAIN> overrides the RPC URL from the TOML.
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const chain = (process.argv[2] || '').toLowerCase();
const tomlPath = path.join(__dirname, `../flash-arb/searcher/config/${chain}.toml`);
const artifactPath = path.join(__dirname, '../flash-arb/contracts/out/FlashArbOptimized.json');
if (!chain || !fs.existsSync(tomlPath)) { console.error('usage: deploy-flash-arb.cjs <arbitrum|base|optimism>'); process.exit(1); }
if (!fs.existsSync(artifactPath)) { console.error('artifact missing: run node scripts/compile-contracts.cjs first'); process.exit(1); }
if (!process.env.FLASH_ARB_SIGNER_KEY) { console.error('set FLASH_ARB_SIGNER_KEY'); process.exit(1); }

let toml = fs.readFileSync(tomlPath, 'utf8');
const get = (k) => (toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, 'm')) || [])[1];
const chainId = Number((toml.match(/^chain_id\s*=\s*(\d+)/m) || [])[1]);
const rpc = process.env[`FLASH_ARB_RPC_${chain.toUpperCase()}`] || get('rpc_http');
const aavePool = get('aave_v3_pool');
const balancerVault = get('balancer_vault') || '0xBA12222222228d8Ba445958a75a0704d566BF2C8';

(async () => {
  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== chainId) throw new Error(`RPC chain id ${net.chainId} != TOML chain id ${chainId}`);
  const wallet = new ethers.Wallet(process.env.FLASH_ARB_SIGNER_KEY, provider);
  const bal = await provider.getBalance(wallet.address);
  console.log(`chain=${chain} (${chainId}) owner/deployer=${wallet.address} balance=${ethers.formatEther(bal)} ETH`);
  console.log(`balancerVault=${balancerVault} aavePool=${aavePool}`);
  if (process.env.CONFIRM_DEPLOY !== 'yes') { console.log('dry run only. Re-run with CONFIRM_DEPLOY=yes to broadcast.'); return; }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const c = await factory.deploy(balancerVault, aavePool);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log('deployed:', addr);
  const owner = await c.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) throw new Error('owner mismatch after deploy');

  toml = toml.replace(/^flash_arb_contract\s*=\s*"[^"]*"/m, `flash_arb_contract = "${addr}"`);
  fs.writeFileSync(tomlPath, toml);
  console.log(`wrote flash_arb_contract to ${path.relative(process.cwd(), tomlPath)}. Next: cd flash-arb/searcher && ./run-live.sh --chains <chain> (LIVE).`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
