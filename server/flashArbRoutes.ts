import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import { sizeArbitrage, computeAdaptiveDepthFraction } from './arbSizing.ts';
import { fetchLiveTickers } from './liveMarketData.ts';
import { loadOrCompileContractArtifact } from './contractArtifactLoader.ts';
import {
  ALL_SUPPORTED_ARB_CHAINS,
  CHAIN_LAYER_META,
  isSupportedArbChain,
  verifyChainRouteTypesReadiness,
  ARBITRUM_TOKENS,
  CHAIN_TOKENS,
  getChainTokens,
  ARBITRUM_DEX_ROUTERS,
  CHAIN_DEX_ROUTERS,
  CAMELOT_V3_ROUTER_ADDRESS,
  getChainDexRouters,
  getEffectiveChainDexRouters,
  parseSimulatorDexSelection,
  resolveArbitrageCandidates,
  buildScaledArbitrageCandidates,
  buildMaxProfitProbeCalldata,
  rebuildCandidateWithMinProfit,
  parseInsufficientProfitError,
  toTokenUnits,
  encodeExecuteDirectFlashArb,
  encodeRescueTokens,
  encodeRescueTokensTo,
  encodeErc20Transfer,
  encodeErc721SafeTransferFrom,
  encodeErc1155SafeTransferFrom,
  parseExtraTokenSpec,
  classifyDetectedErcStandard,
  ERC165_INTERFACE_IDS,
  decodeArbitrageSwapsExecutedLogs,
  decodeFlashArbRevertError,
  DEFAULT_MIN_GAS_RESERVE_WEI,
  computeTradeGasAndFinancingExtra,
  computeGasSurplusAllocation,
  KNOWN_FLASH_ARB_CONTRACTS,
  normalizeValidContractAddress,
  resolveAndValidateSweepContracts,
  getReceiptTimeoutMs,
  computeOptimalFeeParams,
  type AllLayerFilter,
  type ArbitrumTokenInfo,
  type BlockchainLayer,
  type EncodedArbitrageCandidate,
  type ErcStandard,
  type ExtraTokenSpec,
  type RouteExecutionInput,
  type RouterCapabilityOptions,
  type SupportedArbChain,
} from './flashArbExecutor.ts';
import {
  ETH_POOL_SPECS,
  POLYGON_POOL_SPECS,
  BSC_POOL_SPECS,
  AVALANCHE_POOL_SPECS,
  LINEA_POOL_SPECS,
  SCROLL_POOL_SPECS,
  APECHAIN_POOL_SPECS,
} from './multiChainPools.ts';
import {
  normalizeTokenSymbolFilter,
  filterSweepTokensBySymbols,
} from '../src/utils/usdtAutoSweep.ts';

export const flashArbRouter = Router();

const DEFAULT_PROFIT_WALLET = '0xD5503C876a5DFeE057727cfacb6a59E8C7554f5b';
const LEGACY_DEFAULT_PROFIT_WALLET = '0x65602eb9e09b07002872e074004400d37e27ccb9';
if (
  !process.env.FLASH_ARB_PROFIT_WALLET ||
  process.env.FLASH_ARB_PROFIT_WALLET.trim().toLowerCase() === LEGACY_DEFAULT_PROFIT_WALLET
) {
  process.env.FLASH_ARB_PROFIT_WALLET = DEFAULT_PROFIT_WALLET;
}
const gasWalletEnv = () => (process.env.FLASH_ARB_GAS_WALLET || '').trim();
const profitWalletEnv = () =>
  normalizeValidContractAddress(process.env.FLASH_ARB_PROFIT_WALLET || '') || DEFAULT_PROFIT_WALLET;

export const ETHEREUM_RPC_POOL = [
  process.env.ETHEREUM_RPC_URL,
  'https://ethereum-rpc.publicnode.com',
  'https://eth.meowrpc.com',
  'https://rpc.flashbots.net',
  'https://1rpc.io/eth',
].filter(Boolean) as string[];

// Single-request / tx-broadcast / receipt pool (drpc rejects batch >3 but handles single tx/receipt calls reliably)
export const ETHEREUM_TX_RPC_POOL = [
  process.env.ETHEREUM_RPC_URL,
  'https://ethereum-rpc.publicnode.com',
  'https://eth.meowrpc.com',
  'https://rpc.flashbots.net',
  'https://eth.drpc.org',
].filter(Boolean) as string[];

export const POLYGON_RPC_POOL = [
  process.env.POLYGON_RPC_URL,
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon-rpc.com',
  'https://1rpc.io/matic',
].filter(Boolean) as string[];

export const BSC_RPC_POOL = [
  process.env.BSC_RPC_URL,
  'https://bsc-rpc.publicnode.com',
  'https://bsc-dataseed.bnbchain.org',
  'https://1rpc.io/bnb',
].filter(Boolean) as string[];

export const AVALANCHE_RPC_POOL = [
  process.env.AVALANCHE_RPC_URL,
  'https://avalanche-c-chain-rpc.publicnode.com',
  'https://api.avax.network/ext/bc/C/rpc',
  'https://1rpc.io/avax/c',
].filter(Boolean) as string[];

export const ARBITRUM_RPC_POOL = [
  process.env.ARBITRUM_RPC_URL,
  'https://arb1.arbitrum.io/rpc',
  'https://arbitrum-one-rpc.publicnode.com',
  'https://arbitrum.meowrpc.com',
  'https://1rpc.io/arb',
].filter(Boolean) as string[];

// PublicNode rejects eth_getTransactionReceipt with -32602 ("Archive requests require a personal token"),
// so tx submission, deployment, and receipt verification use receipt-capable endpoints first.
export const ARBITRUM_TX_RPC_POOL = [
  process.env.ARBITRUM_RPC_URL,
  'https://arb1.arbitrum.io/rpc',
  'https://arbitrum.meowrpc.com',
  'https://1rpc.io/arb',
].filter(Boolean) as string[];

export const BASE_RPC_POOL = [
  process.env.BASE_RPC_URL,
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://1rpc.io/base',
].filter(Boolean) as string[];

export const OPTIMISM_RPC_POOL = [
  process.env.OPTIMISM_RPC_URL,
  'https://optimism-rpc.publicnode.com',
  'https://mainnet.optimism.io',
  'https://1rpc.io/op',
].filter(Boolean) as string[];

export const LINEA_RPC_POOL = [
  process.env.LINEA_RPC_URL,
  'https://rpc.linea.build',
  'https://linea-rpc.publicnode.com',
  'https://1rpc.io/linea',
].filter(Boolean) as string[];

export const SCROLL_RPC_POOL = [
  process.env.SCROLL_RPC_URL,
  'https://scroll-rpc.publicnode.com',
  'https://rpc.scroll.io',
  'https://1rpc.io/scroll',
].filter(Boolean) as string[];

export const APECHAIN_RPC_POOL = [
  process.env.APECHAIN_RPC_URL,
  'https://rpc.apechain.com/http',
  'https://apechain.calderachain.xyz/http',
].filter(Boolean) as string[];

const CHAIN_RPC_POOLS: Record<SupportedArbChain, string[]> = {
  ethereum: ETHEREUM_RPC_POOL,
  polygon: POLYGON_RPC_POOL,
  bsc: BSC_RPC_POOL,
  avalanche: AVALANCHE_RPC_POOL,
  arbitrum: ARBITRUM_RPC_POOL,
  base: BASE_RPC_POOL,
  optimism: OPTIMISM_RPC_POOL,
  linea: LINEA_RPC_POOL,
  scroll: SCROLL_RPC_POOL,
  apechain: APECHAIN_RPC_POOL,
};

function parseSupportedChain(raw: unknown, fallback: SupportedArbChain = 'arbitrum'): SupportedArbChain {
  const s = String(raw || '').toLowerCase();
  return isSupportedArbChain(s) ? s : fallback;
}

const RPC_ENDPOINTS: Record<string, {
  name: string;
  layer: BlockchainLayer;
  nativeSymbol: string;
  rpc: string;
  explorer: string;
  chainId: number;
  balancerVault: string;
  aavePool: string;
}> = {
  ethereum: {
    ...CHAIN_LAYER_META.ethereum,
    rpc: ETHEREUM_RPC_POOL[0],
  },
  polygon: {
    ...CHAIN_LAYER_META.polygon,
    rpc: POLYGON_RPC_POOL[0],
  },
  bsc: {
    ...CHAIN_LAYER_META.bsc,
    rpc: BSC_RPC_POOL[0],
  },
  avalanche: {
    ...CHAIN_LAYER_META.avalanche,
    rpc: AVALANCHE_RPC_POOL[0],
  },
  arbitrum: {
    ...CHAIN_LAYER_META.arbitrum,
    rpc: ARBITRUM_TX_RPC_POOL[0],
  },
  base: {
    ...CHAIN_LAYER_META.base,
    name: 'Base L2',
    rpc: BASE_RPC_POOL[0],
  },
  optimism: {
    ...CHAIN_LAYER_META.optimism,
    rpc: OPTIMISM_RPC_POOL[0],
  },
  linea: {
    ...CHAIN_LAYER_META.linea,
    rpc: LINEA_RPC_POOL[0],
  },
  scroll: {
    ...CHAIN_LAYER_META.scroll,
    rpc: SCROLL_RPC_POOL[0],
  },
  apechain: {
    ...CHAIN_LAYER_META.apechain,
    rpc: APECHAIN_RPC_POOL[0],
  },
};

// Tracks endpoints that have returned 429 or network errors to avoid hammering them
const rpcCooldowns = new Map<string, number>();

/**
 * Resilient multi-endpoint RPC caller that fails over instantly across public RPC providers
 * and enforces backoff if any provider returns 429 Too Many Requests.
 */
async function fetchRpcBatchWithFailover(chain: SupportedArbChain, calls: any[]): Promise<{ results: any[]; rpcUrl: string }> {
  const pool = CHAIN_RPC_POOLS[chain] || ARBITRUM_RPC_POOL;
  // Sort endpoints: non-cooled down first, then by earliest cooldown expiry
  const candidates = [...pool].sort((a, b) => (rpcCooldowns.get(a) || 0) - (rpcCooldowns.get(b) || 0));

  let lastError: Error | null = null;
  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(calls),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.status === 429) {
        rpcCooldowns.set(url, Date.now() + 45000);
        lastError = new Error(`${RPC_ENDPOINTS[chain]?.name || chain} RPC HTTP 429 on ${url}`);
        continue;
      }

      if (!resp.ok) {
        rpcCooldowns.set(url, Date.now() + 15000);
        lastError = new Error(`${RPC_ENDPOINTS[chain]?.name || chain} RPC HTTP ${resp.status} on ${url}`);
        continue;
      }

      const results = await resp.json();
      if (!Array.isArray(results)) {
        rpcCooldowns.set(url, Date.now() + 15000);
        lastError = new Error(`${RPC_ENDPOINTS[chain]?.name || chain} RPC returned a non-batch response`);
        continue;
      }

      // Successful! Clear cooldown
      rpcCooldowns.delete(url);
      return { results, rpcUrl: url };
    } catch (err: any) {
      rpcCooldowns.set(url, Date.now() + 20000);
      lastError = err;
    }
  }

  throw lastError || new Error(`All ${chain} RPC endpoints failed`);
}

function getRpcPool(chain: string, txCapable = false): string[] {
  const c = parseSupportedChain(chain);
  if (c === 'ethereum' && txCapable) return ETHEREUM_TX_RPC_POOL;
  if (c === 'arbitrum' && txCapable) return ARBITRUM_TX_RPC_POOL;
  return CHAIN_RPC_POOLS[c] || ARBITRUM_RPC_POOL;
}

async function fetchRpcSingleWithFailover(
  chain: string,
  method: string,
  params: any[],
  txCapable = false
): Promise<{ result: any; rpcUrl: string }> {
  const pool = getRpcPool(chain, txCapable);
  const candidates = [...pool].sort((a, b) => (rpcCooldowns.get(a) || 0) - (rpcCooldowns.get(b) || 0));
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.status === 429 || resp.status === 403) {
        rpcCooldowns.set(url, Date.now() + 45000);
        lastError = new Error(`${chain} RPC HTTP ${resp.status} on ${url}`);
        continue;
      }

      const json: any = await resp.json();
      if (json?.error) {
        const errMsg = String(json.error.message || `RPC error ${json.error.code} on ${url}`);
        const errCode = Number(json.error.code);
        const isEvmRevert =
          errCode === 3 ||
          typeof json.error.data === 'string' ||
          /revert|insufficient|execution reverted/i.test(errMsg);

        if (isEvmRevert) {
          rpcCooldowns.delete(url);
          const revertErr: any = new Error(errMsg);
          revertErr.code = errCode;
          revertErr.data = json.error.data;
          throw revertErr;
        }

        const isRateOrQuota =
          errCode === -32001 ||
          errCode === -32005 ||
          /usage limit|rate limit|too many requests|upgrade/i.test(errMsg);
        rpcCooldowns.set(url, Date.now() + (isRateOrQuota ? 60000 : 30000));
        lastError = new Error(errMsg);
        continue;
      }

      if (!resp.ok) {
        rpcCooldowns.set(url, Date.now() + 15000);
        lastError = new Error(`${chain} RPC HTTP ${resp.status} on ${url}`);
        continue;
      }

      rpcCooldowns.delete(url);
      return { result: json.result, rpcUrl: url };
    } catch (err: any) {
      if (err?.code === 3 || typeof err?.data === 'string' || /revert|execution reverted/i.test(String(err?.message || ''))) {
        throw err;
      }
      rpcCooldowns.set(url, Date.now() + 20000);
      lastError = err;
    }
  }

  throw lastError || new Error(`All ${chain} RPC endpoints failed for ${method}`);
}

async function broadcastRawTxToPool(
  chain: string,
  rawSignedTx: string,
  maxFanOut = 2
): Promise<{ txHash: string; acceptedUrls: string[] }> {
  const pool = getRpcPool(chain, true);
  const candidates = [...pool].sort((a, b) => (rpcCooldowns.get(a) || 0) - (rpcCooldowns.get(b) || 0));
  const acceptedUrls: string[] = [];
  let txHash = '';
  let lastErr: Error | null = null;

  for (const url of candidates) {
    if (acceptedUrls.length >= maxFanOut) break;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_sendRawTransaction',
          params: [rawSignedTx],
          id: Date.now(),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.status === 429 || resp.status === 403) {
        rpcCooldowns.set(url, Date.now() + 45000);
        lastErr = new Error(`${chain} RPC HTTP ${resp.status} on ${url}`);
        continue;
      }

      const json: any = await resp.json();
      if (json?.error) {
        const msg = String(json.error.message || `RPC error ${json.error.code}`);
        if (/already known|already in (the )?mempool|known transaction/i.test(msg)) {
          acceptedUrls.push(url);
          continue;
        }
        const isQuotaOrTransport =
          Number(json.error.code) === -32001 ||
          Number(json.error.code) === -32005 ||
          /usage limit|rate limit|timeout|internal error/i.test(msg);
        if (isQuotaOrTransport) {
          rpcCooldowns.set(url, Date.now() + 45000);
          lastErr = new Error(msg);
          continue;
        }
        throw new Error(msg);
      }

      if (typeof json?.result === 'string' && json.result.startsWith('0x')) {
        txHash = json.result;
        acceptedUrls.push(url);
        rpcCooldowns.delete(url);
      }
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || '');
      if (acceptedUrls.length === 0 && !/429|403|timeout|abort|fetch|network|rate limit|usage limit|ECONN|socket/i.test(msg)) {
        throw err;
      }
    }
  }

  if (acceptedUrls.length === 0 || !txHash) {
    throw lastErr || new Error(`Failed to broadcast raw transaction across ${chain} RPC pool`);
  }
  return { txHash, acceptedUrls };
}

async function waitForReceiptWithFailover(
  chain: string,
  txHash: string,
  timeoutMs?: number,
  options?: {
    isDeployment?: boolean;
    rawSignedTx?: string;
    onStuckPending?: (elapsedMs: number) => Promise<{ replacementHash?: string; rawSignedTx?: string } | null>;
  }
): Promise<{
  txHash: string;
  status: number;
  blockNumber: number;
  gasUsed: bigint;
  effectiveGasPrice: bigint | null;
  contractAddress?: string | null;
  logs: Array<{ address?: string; topics: string[]; data: string }>;
}> {
  const c = parseSupportedChain(chain);
  const effectiveTimeoutMs = timeoutMs ?? getReceiptTimeoutMs(c, Boolean(options?.isDeployment));
  const pollIntervalMs = c === 'ethereum' ? 2000 : 1500;
  const startedAt = Date.now();
  const deadline = startedAt + effectiveTimeoutMs;

  let activeTxHash = txHash;
  let activeRawTx = options?.rawSignedTx;
  let rebroadcasted = false;
  let attemptedSpeedUp = false;

  while (Date.now() < deadline) {
    try {
      const { result } = await fetchRpcSingleWithFailover(chain, 'eth_getTransactionReceipt', [activeTxHash], true);
      if (result && result.blockNumber) {
        return {
          txHash: activeTxHash,
          status: result.status === '0x1' || result.status === 1 ? 1 : 0,
          blockNumber: parseInt(result.blockNumber, 16),
          gasUsed: result.gasUsed ? BigInt(result.gasUsed) : 0n,
          effectiveGasPrice: result.effectiveGasPrice ? BigInt(result.effectiveGasPrice) : null,
          contractAddress: result.contractAddress || null,
          logs: Array.isArray(result.logs) ? result.logs : [],
        };
      }
    } catch {
      // Transient RPC error; keep polling across remaining pool endpoints until deadline
    }

    const elapsed = Date.now() - startedAt;
    if (!rebroadcasted && activeRawTx && elapsed >= (c === 'ethereum' ? 18_000 : 12_000)) {
      rebroadcasted = true;
      void broadcastRawTxToPool(chain, activeRawTx, 3).catch(() => {});
    }

    if (!attemptedSpeedUp && options?.onStuckPending && elapsed >= (c === 'ethereum' ? 42_000 : 22_000)) {
      attemptedSpeedUp = true;
      try {
        const txLookup = await fetchRpcSingleWithFailover(chain, 'eth_getTransactionByHash', [activeTxHash], true).catch(() => null);
        if (txLookup?.result && !txLookup.result.blockNumber) {
          const bumped = await options.onStuckPending(elapsed);
          if (bumped?.replacementHash) {
            activeTxHash = bumped.replacementHash;
            activeRawTx = bumped.rawSignedTx || activeRawTx;
            rebroadcasted = false;
          }
        }
      } catch {
        // Keep waiting for original txHash if speed-up skipped or failed
      }
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  // Final check of mempool state so timeout errors preserve actionable context
  let pendingTx: any = null;
  try {
    const lookup = await fetchRpcSingleWithFailover(chain, 'eth_getTransactionByHash', [activeTxHash], true);
    pendingTx = lookup?.result || null;
  } catch {}

  const rpcInfo = RPC_ENDPOINTS[c] || RPC_ENDPOINTS.arbitrum;
  const pendingInMempool = Boolean(pendingTx && !pendingTx.blockNumber);
  const nonceNum = pendingTx?.nonce ? parseInt(pendingTx.nonce, 16) : null;
  const secs = Math.round(effectiveTimeoutMs / 1000);
  const msg = pendingInMempool
    ? `Timed out after ${secs}s waiting for confirmation of (${activeTxHash}) on ${chain}: transaction is still pending in mempool${nonceNum !== null ? ` (nonce ${nonceNum})` : ''}. Use Speed Up or verify status before submitting another tx.`
    : `Timed out waiting for transaction receipt (${activeTxHash}) on ${chain} after ${secs}s.`;

  const err: any = new Error(msg);
  err.timedOut = true;
  err.txHash = activeTxHash;
  err.chain = c;
  err.explorerUrl = `${rpcInfo.explorer}/tx/${activeTxHash}`;
  err.pendingInMempool = pendingInMempool;
  err.nonce = nonceNum;
  throw err;
}

async function broadcastSignedTxAndWait(params: {
  chain: SupportedArbChain;
  cleanKey: string;
  to?: string;
  data?: string;
  valueWei?: bigint;
  gasLimit: bigint;
  isDeployment?: boolean;
  allowAutoSpeedUp?: boolean;
  urgencyMultiplierPct?: number;
  nonceOverride?: number;
  minBalanceWei?: bigint;
}): Promise<{
  txHash: string;
  receipt: Awaited<ReturnType<typeof waitForReceiptWithFailover>>;
}> {
  const { chain, cleanKey, to, data, valueWei = 0n, gasLimit } = params;
  const c = parseSupportedChain(chain);
  const rpcInfo = RPC_ENDPOINTS[c] || RPC_ENDPOINTS.arbitrum;
  const signerAddress = new ethers.Wallet(cleanKey).address;

  const [balResp, latestNonceResp, pendingNonceResp, blockResp, priorityResp, gasPriceResp] = await Promise.all([
    fetchRpcSingleWithFailover(c, 'eth_getBalance', [signerAddress, 'latest'], true),
    fetchRpcSingleWithFailover(c, 'eth_getTransactionCount', [signerAddress, 'latest'], true),
    fetchRpcSingleWithFailover(c, 'eth_getTransactionCount', [signerAddress, 'pending'], true),
    fetchRpcSingleWithFailover(c, 'eth_getBlockByNumber', ['latest', false], true).catch(() => ({ result: null })),
    fetchRpcSingleWithFailover(c, 'eth_maxPriorityFeePerGas', [], true).catch(() => ({ result: null })),
    fetchRpcSingleWithFailover(c, 'eth_gasPrice', [], true).catch(() => ({ result: null })),
  ]);

  const balanceWei = typeof balResp.result === 'string' ? BigInt(balResp.result) : 0n;
  const minBalance = params.minBalanceWei ?? 50000000000000n;
  if (balanceWei < minBalance) {
    throw new Error(
      `Gas wallet ${signerAddress} holds ${ethers.formatEther(balanceWei)} ${rpcInfo.nativeSymbol} on ${rpcInfo.name}, below minimum required gas balance (${ethers.formatEther(minBalance)} ${rpcInfo.nativeSymbol}).`
    );
  }

  const latestNonce = typeof latestNonceResp.result === 'string' ? parseInt(latestNonceResp.result, 16) : 0;
  const pendingNonce = typeof pendingNonceResp.result === 'string' ? parseInt(pendingNonceResp.result, 16) : latestNonce;

  if (params.nonceOverride === undefined && pendingNonce > latestNonce) {
    throw new Error(
      `Signer ${signerAddress} already has a pending transaction at nonce ${latestNonce} on ${rpcInfo.name} (pending nonce ${pendingNonce}). Speed up or cancel nonce ${latestNonce} before sending a new transaction.`
    );
  }

  const nonceToUse = params.nonceOverride ?? latestNonce;
  const baseFeeWei = blockResp?.result?.baseFeePerGas ? BigInt(blockResp.result.baseFeePerGas) : null;
  const rpcPriorityWei = typeof priorityResp?.result === 'string' ? BigInt(priorityResp.result) : null;
  const rpcGasPriceWei = typeof gasPriceResp?.result === 'string' ? BigInt(gasPriceResp.result) : null;

  const feeParams = computeOptimalFeeParams({
    chain: c,
    baseFeePerGasWei: baseFeeWei,
    rpcMaxPriorityFeePerGasWei: rpcPriorityWei,
    rpcGasPriceWei,
    balanceWei,
    gasLimit,
    valueWei,
    urgencyMultiplierPct: params.urgencyMultiplierPct ?? (c === 'ethereum' ? 125 : 110),
  });

  const signTxWithFees = async (fees: ReturnType<typeof computeOptimalFeeParams>) => {
    const wallet = new ethers.Wallet(cleanKey);
    const txReq: ethers.TransactionRequest = {
      chainId: rpcInfo.chainId,
      nonce: nonceToUse,
      gasLimit,
      value: valueWei,
      ...(to ? { to } : {}),
      ...(data ? { data } : {}),
      ...(c === 'bsc'
        ? { type: 0, gasPrice: fees.gasPrice }
        : {
            type: 2,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          }),
    };
    const rawSignedTx = await wallet.signTransaction(txReq);
    const txHash = ethers.keccak256(rawSignedTx);
    return { rawSignedTx, txHash };
  };

  const initial = await signTxWithFees(feeParams);
  await broadcastRawTxToPool(c, initial.rawSignedTx, c === 'ethereum' ? 3 : 2);

  const receipt = await waitForReceiptWithFailover(c, initial.txHash, undefined, {
    isDeployment: params.isDeployment,
    rawSignedTx: initial.rawSignedTx,
    onStuckPending: params.allowAutoSpeedUp
      ? async () => {
          const [latestBlock, latestPriority, latestGas] = await Promise.all([
            fetchRpcSingleWithFailover(c, 'eth_getBlockByNumber', ['latest', false], true).catch(() => ({ result: null })),
            fetchRpcSingleWithFailover(c, 'eth_maxPriorityFeePerGas', [], true).catch(() => ({ result: null })),
            fetchRpcSingleWithFailover(c, 'eth_gasPrice', [], true).catch(() => ({ result: null })),
          ]);
          const bumpedBase = latestBlock?.result?.baseFeePerGas ? BigInt(latestBlock.result.baseFeePerGas) : baseFeeWei;
          const bumpedPriority = typeof latestPriority?.result === 'string' ? BigInt(latestPriority.result) : rpcPriorityWei;
          const bumpedGasPrice = typeof latestGas?.result === 'string' ? BigInt(latestGas.result) : rpcGasPriceWei;
          const bumpedFees = computeOptimalFeeParams({
            chain: c,
            baseFeePerGasWei: bumpedBase,
            rpcMaxPriorityFeePerGasWei:
              bumpedPriority && bumpedPriority > feeParams.maxPriorityFeePerGas ? bumpedPriority : feeParams.maxPriorityFeePerGas,
            rpcGasPriceWei: bumpedGasPrice && bumpedGasPrice > feeParams.gasPrice ? bumpedGasPrice : feeParams.gasPrice,
            balanceWei,
            gasLimit,
            valueWei,
            urgencyMultiplierPct: 140,
          });
          // Enforce strict +25% replacement bump required by geth/reth mempool rules
          if (bumpedFees.maxPriorityFeePerGas < (feeParams.maxPriorityFeePerGas * 125n) / 100n) {
            bumpedFees.maxPriorityFeePerGas = (feeParams.maxPriorityFeePerGas * 125n) / 100n;
          }
          if (bumpedFees.maxFeePerGas < (feeParams.maxFeePerGas * 125n) / 100n) {
            bumpedFees.maxFeePerGas = (feeParams.maxFeePerGas * 125n) / 100n;
          }
          if (bumpedFees.gasPrice < (feeParams.gasPrice * 125n) / 100n) {
            bumpedFees.gasPrice = (feeParams.gasPrice * 125n) / 100n;
          }
          const replacement = await signTxWithFees(bumpedFees);
          await broadcastRawTxToPool(c, replacement.rawSignedTx, c === 'ethereum' ? 3 : 2);
          return { replacementHash: replacement.txHash, rawSignedTx: replacement.rawSignedTx };
        }
      : undefined,
  });

  return { txHash: receipt.txHash, receipt };
}

/**
 * Forwards excess native ETH above `minReserveWei` (default 0.002 ETH) from the Gas Signer Wallet
 * directly to `recipient` (FLASH_ARB_PROFIT_WALLET). Never drains below operational gas reserve
 * and skips dust amounts smaller than 2x the estimated L2 transfer fee.
 */
async function sweepGasWalletEthSurplus(params: {
  chain: SupportedArbChain;
  cleanKey: string;
  signerAddress: string;
  recipient: string;
  minReserveWei?: bigint;
  maxSendWei?: bigint;
}): Promise<{
  swept: boolean;
  sentWei: bigint;
  sentEthFormatted: string;
  txHash?: string;
  explorerUrl?: string;
  reason?: string;
}> {
  const { chain, cleanKey, signerAddress, recipient } = params;
  const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
  const minReserveWei = params.minReserveWei ?? DEFAULT_MIN_GAS_RESERVE_WEI;

  if (signerAddress.toLowerCase() === recipient.toLowerCase()) {
    return {
      swept: false,
      sentWei: 0n,
      sentEthFormatted: '0',
      reason: 'Gas wallet matches Profit Vault recipient; no ETH transfer needed.',
    };
  }

  const [balResp, gasPriceResp, estGasResp] = await Promise.all([
    fetchRpcSingleWithFailover(chain, 'eth_getBalance', [signerAddress, 'latest'], true),
    fetchRpcSingleWithFailover(chain, 'eth_gasPrice', [], true),
    fetchRpcSingleWithFailover(
      chain,
      'eth_estimateGas',
      [{ from: signerAddress, to: recipient, value: '0x1' }, 'latest'],
      true
    ).catch(() => ({ result: '0x61a8' })), // 25,000 gas fallback for L2 native ETH transfers
  ]);

  const balanceWei = typeof balResp.result === 'string' ? BigInt(balResp.result) : 0n;
  const gasPriceWei = typeof gasPriceResp.result === 'string' ? BigInt(gasPriceResp.result) : 0n;
  const transferGasUnits =
    typeof estGasResp.result === 'string' && estGasResp.result.startsWith('0x')
      ? BigInt(estGasResp.result)
      : 25000n;

  const alloc = computeGasSurplusAllocation({
    balanceWei,
    minReserveWei,
    transferGasUnits,
    gasPriceWei,
    maxSendWei: params.maxSendWei,
  });

  if (!alloc.worthSending || alloc.sendWei <= 0n) {
    const reserveEth = Number(ethers.formatEther(minReserveWei)).toFixed(4);
    const balEth = Number(ethers.formatEther(balanceWei)).toFixed(6);
    return {
      swept: false,
      sentWei: 0n,
      sentEthFormatted: '0',
      reason:
        alloc.maxSendableWei <= 0n
          ? `Gas wallet balance (${balEth} ETH) is within ${reserveEth} ETH operational reserve.`
          : `Surplus above ${reserveEth} ETH reserve is smaller than 2x L2 transfer gas fee; skipped to avoid wasting gas.`,
    };
  }

  try {
    const { txHash: sentTxHash, receipt } = await broadcastSignedTxAndWait({
      chain,
      cleanKey,
      to: recipient,
      valueWei: alloc.sendWei,
      gasLimit: alloc.gasLimit,
      allowAutoSpeedUp: true,
    });
    if (receipt.status !== 1) {
      return {
        swept: false,
        sentWei: 0n,
        sentEthFormatted: '0',
        reason: `Gas surplus transfer ${sentTxHash} reverted on-chain.`,
      };
    }

    return {
      swept: true,
      sentWei: alloc.sendWei,
      sentEthFormatted: Number(ethers.formatEther(alloc.sendWei)).toFixed(6),
      txHash: sentTxHash,
      explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
    };
  } catch (err: any) {
    return {
      swept: false,
      sentWei: 0n,
      sentEthFormatted: '0',
      reason: err?.message || 'Failed to broadcast gas surplus transfer.',
    };
  }
}

/**
 * Fetch raw on-chain balance and gas price via JSON-RPC with multi-endpoint failover
 */
async function queryChainGas(chain: SupportedArbChain, address: string) {
  const pool = CHAIN_RPC_POOLS[chain] || ARBITRUM_RPC_POOL;
  const nativeSymbol = CHAIN_LAYER_META[chain]?.nativeSymbol || 'ETH';
  let lastErr = 'RPC Query Timeout';

  for (const rpcUrl of pool) {
    if ((rpcCooldowns.get(rpcUrl) || 0) > Date.now()) continue;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const [balRes, gasRes] = await Promise.all([
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [address, 'latest'],
            id: 1,
          }),
          signal: controller.signal,
        }),
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_gasPrice',
            params: [],
            id: 2,
          }),
          signal: controller.signal,
        }),
      ]);

      clearTimeout(timeoutId);

      if (balRes.status === 429 || gasRes.status === 429) {
        rpcCooldowns.set(rpcUrl, Date.now() + 45000);
        lastErr = `${rpcUrl} returned HTTP 429`;
        continue;
      }

      if (!balRes.ok || !gasRes.ok) {
        lastErr = `HTTP ${balRes.status || gasRes.status}`;
        continue;
      }

      const balData = await balRes.json();
      const gasData = await gasRes.json();

      const balHex = balData?.result;
      const gasHex = gasData?.result;
      if (typeof balHex !== 'string' || typeof gasHex !== 'string') {
        continue;
      }

      const balanceWei = BigInt(balHex);
      const gasPriceWei = BigInt(gasHex);

      const weiPerNative = 10n ** 18n;
      const wholeUnits = balanceWei / weiPerNative;
      const remainderWei = balanceWei % weiPerNative;
      const fractionalPart = (remainderWei * 1000000n) / weiPerNative;
      const nativeStr = `${wholeUnits}.${fractionalPart.toString().padStart(6, '0')}`;
      const nativeNum = parseFloat(nativeStr);

      const gasPriceGwei = Number(gasPriceWei) / 1e9;
      const avgGasPerTx = 148000n;
      const costPerTxWei = avgGasPerTx * gasPriceWei;
      const estimatedTxs = costPerTxWei > 0n ? Number(balanceWei / costPerTxWei) : null;

      return {
        success: true,
        nativeSymbol,
        balanceEth: nativeNum,
        balanceEthFormatted: `${nativeNum.toFixed(4)} ${nativeSymbol}`,
        gasPriceGwei: Number(gasPriceGwei.toFixed(3)),
        estimatedTxsRemaining: estimatedTxs === null ? null : Math.max(0, estimatedTxs),
        rawHex: balHex,
      };
    } catch (err: any) {
      lastErr = err.message || 'RPC Query Timeout';
    }
  }

  return {
    success: false,
    nativeSymbol,
    balanceEth: null as number | null,
    balanceEthFormatted: null as string | null,
    gasPriceGwei: null as number | null,
    estimatedTxsRemaining: null as number | null,
    error: lastErr,
  };
}

const SHORT_BALANCE_CACHE_TTL_MS = 12_000;
const SHORT_GAS_CACHE_TTL_MS = 15_000;
const gasStatusResponseCache = new Map<string, { payload: any; fetchedAt: number }>();
const walletBalancesResponseCache = new Map<string, { payload: any; fetchedAt: number }>();
const contractBalancesResponseCache = new Map<string, { payload: any; fetchedAt: number }>();
const holdingsOverviewResponseCache = new Map<string, { payload: any; fetchedAt: number }>();

function invalidateBalanceResponseCaches(chain?: SupportedArbChain) {
  gasStatusResponseCache.clear();
  if (!chain) {
    walletBalancesResponseCache.clear();
    contractBalancesResponseCache.clear();
    holdingsOverviewResponseCache.clear();
    return;
  }
  const prefix = `${chain}:`;
  for (const k of walletBalancesResponseCache.keys()) if (k.startsWith(prefix)) walletBalancesResponseCache.delete(k);
  for (const k of contractBalancesResponseCache.keys()) if (k.startsWith(prefix)) contractBalancesResponseCache.delete(k);
  for (const k of holdingsOverviewResponseCache.keys()) if (k.startsWith(prefix)) holdingsOverviewResponseCache.delete(k);
}

/**
 * GET /api/flash-arb/gas-status
 * Queries real-time on-chain native gas balance of the Gas Holder Wallet across all L1/L2/L3 chains
 */
flashArbRouter.get('/gas-status', async (req: Request, res: Response) => {
  try {
    const address = String(req.query.address || gasWalletEnv());
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ success: false, error: 'No valid address: pass ?address= or set FLASH_ARB_GAS_WALLET.' });
    }
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const cacheKey = address.toLowerCase();
    const cachedGas = gasStatusResponseCache.get(cacheKey);
    if (!forceRefresh && cachedGas && Date.now() - cachedGas.fetchedAt < SHORT_GAS_CACHE_TTL_MS) {
      return res.json(cachedGas.payload);
    }

    const [liveFeed, ...gasStatuses] = await Promise.all([
      getLiveTokenPriceFeed().catch(() => null),
      ...ALL_SUPPORTED_ARB_CHAINS.map((c) => queryChainGas(c, address)),
    ]);

    const ethUsdPrice =
      liveFeed?.ethUsd ||
      getLiveTokenUsdPrice('WETH', 'arbitrum') ||
      0;

    const chainsOut: Record<string, any> = {};
    ALL_SUPPORTED_ARB_CHAINS.forEach((c, idx) => {
      const status = gasStatuses[idx];
      const meta = CHAIN_LAYER_META[c];
      const nativeUsd =
        meta.nativeSymbol === 'ETH'
          ? ethUsdPrice
          : getLiveTokenUsdPrice(meta.wrappedNativeSymbol, c) ||
            getLiveTokenUsdPrice(meta.nativeSymbol, c) ||
            0;
      const minReserve = meta.nativeSymbol === 'ETH' ? 0.002 : 0.05;
      chainsOut[c] = {
        ...RPC_ENDPOINTS[c],
        layer: meta.layer,
        nativeUsdPrice: nativeUsd > 0 ? nativeUsd : null,
        ...status,
        balanceUsd: nativeUsd > 0 ? Number(((status.balanceEth ?? 0) * nativeUsd).toFixed(2)) : 0,
        fundedForTrading: (status.balanceEth ?? 0) >= minReserve,
      };
    });

    const isSignerConfigured = Boolean(process.env.FLASH_ARB_SIGNER_KEY);

    const payload = {
      success: true,
      gasWallet: address,
      profitWallet: profitWalletEnv(),
      isSignerConfigured,
      ethUsdPrice: ethUsdPrice > 0 ? ethUsdPrice : null,
      chains: chainsOut,
      timestamp: Date.now(),
    };
    gasStatusResponseCache.set(cacheKey, { payload, fetchedAt: Date.now() });
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/flash-arb/signer-config
 * Checks whether the Gas Execution Private Key is registered in server memory
 */
flashArbRouter.get('/signer-config', (_req: Request, res: Response) => {
  const isKeyConfigured = Boolean(process.env.FLASH_ARB_SIGNER_KEY);
  const keyStr = process.env.FLASH_ARB_SIGNER_KEY || '';
  const keyPreview = isKeyConfigured
    ? `••••••••••••••••••••••••••••••••••••••••••••${keyStr.slice(-4)}`
    : null;

  res.json({
    success: true,
    gasWallet: gasWalletEnv(),
    profitWallet: profitWalletEnv(),
    isKeyConfigured,
    keyPreview,
    architecture: {
      gasFunderRole: 'Executes trades and pays L2 gas & sequencer tips on Arbitrum & Base',
      profitVaultRole: 'Receives 100% of realized net flash loan profits via asset.transfer(recipient, netProfit)',
      nonCustodialGuarantee: 'Smart contract FlashArbOptimized holds 0 residual tokens before and after every execution',
    },
  });
});

/**
 * POST /api/flash-arb/signer-config
 * Registers the execution signer key for the gas holder wallet in secure server runtime memory
 */
flashArbRouter.post('/signer-config', (req: Request, res: Response) => {
  try {
    const { privateKey, gasWallet, profitWallet } = req.body;

    if (!privateKey || typeof privateKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Private key is required',
      });
    }

    const cleanKey = privateKey.trim();
    // Validate standard EVM private key format (64 hex characters or 66 if starting with 0x)
    const hexPattern = /^(0x)?[a-fA-F0-9]{64}$/;
    if (!hexPattern.test(cleanKey)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid EVM private key format. Must be a 64-character hexadecimal string (with or without 0x prefix).',
      });
    }

    // Securely register into server memory
    process.env.FLASH_ARB_SIGNER_KEY = cleanKey.startsWith('0x') ? cleanKey : `0x${cleanKey}`;

    if (gasWallet && typeof gasWallet === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(gasWallet.trim())) {
      process.env.FLASH_ARB_GAS_WALLET = gasWallet.trim();
    }

    const normalizedProfit = normalizeValidContractAddress(profitWallet);
    if (normalizedProfit) {
      process.env.FLASH_ARB_PROFIT_WALLET = normalizedProfit;
    }

    const keyLast4 = process.env.FLASH_ARB_SIGNER_KEY.slice(-4);
    invalidateBalanceResponseCaches();

    return res.json({
      success: true,
      message: 'Signer key successfully configured in server memory for live Arbitrum and Base execution',
      isKeyConfigured: true,
      gasWallet: process.env.FLASH_ARB_GAS_WALLET,
      profitWallet: profitWalletEnv(),
      keyPreview: `••••••••••••••••••••••••••••••••••••••••••••${keyLast4}`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/flash-arb/profit-wallet
 * Syncs the configured profit recipient wallet (and optional gas wallet) into server runtime memory
 */
flashArbRouter.post('/profit-wallet', (req: Request, res: Response) => {
  try {
    const { profitWallet, gasWallet } = req.body || {};
    const normalizedProfit = normalizeValidContractAddress(profitWallet);
    if (!normalizedProfit) {
      return res.status(400).json({
        success: false,
        error: 'Valid non-zero 42-character EVM address (0x...) is required for profitWallet.',
      });
    }
    process.env.FLASH_ARB_PROFIT_WALLET = normalizedProfit;
    const normalizedGas = normalizeValidContractAddress(gasWallet);
    if (normalizedGas) {
      process.env.FLASH_ARB_GAS_WALLET = normalizedGas;
    }
    invalidateBalanceResponseCaches();
    return res.json({
      success: true,
      profitWallet: profitWalletEnv(),
      gasWallet: gasWalletEnv(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/flash-arb/signer-config
 * Clears signer key from server memory
 */
flashArbRouter.delete('/signer-config', (_req: Request, res: Response) => {
  delete process.env.FLASH_ARB_SIGNER_KEY;
  res.json({
    success: true,
    message: 'Signer key cleared from server memory',
    isKeyConfigured: false,
  });
});

/**
 * POST /api/flash-arb/agent/initialize-signer
 * 1-Click Autonomous Agent Provisioning: Creates or initializes a real cryptographic EVM execution signer
 */
flashArbRouter.post('/agent/initialize-signer', async (_req: Request, res: Response) => {
  try {
    const { ethers } = await import('ethers');
    let wallet: any;
    let isNew = false;

    if (process.env.FLASH_ARB_SIGNER_KEY) {
      wallet = new ethers.Wallet(process.env.FLASH_ARB_SIGNER_KEY);
    } else {
      wallet = ethers.Wallet.createRandom();
      process.env.FLASH_ARB_SIGNER_KEY = wallet.privateKey;
      process.env.FLASH_ARB_GAS_WALLET = wallet.address;
      isNew = true;
    }

    const keyLast4 = wallet.privateKey.slice(-4);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      address: wallet.address,
      // Shown once, only when the key was just created. An existing key is never sent back.
      privateKey: isNew ? wallet.privateKey : undefined,
      keyPreview: `••••••••••••••••••••••••••••••••••••••••••••${keyLast4}`,
      isNew,
      gasWallet: wallet.address,
      profitWallet: profitWalletEnv(),
      message: isNew
        ? `Dedicated Autonomous Execution Signer Agent initialized (${wallet.address}). Ready to sign & broadcast live on-chain flash loans.`
        : `Autonomous Execution Signer active (${wallet.address}).`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/flash-arb/contract-status
 * Inspects on-chain bytecode of the flash arb contract to check if deployed
 */
flashArbRouter.get('/contract-status', async (req: Request, res: Response) => {
  try {
    const chain = String(req.query.chain || 'arbitrum').toLowerCase();
    const address = String(req.query.address || '').trim();
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ success: false, error: 'Invalid EVM contract address' });
    }

    const { result: codeRaw } = await fetchRpcSingleWithFailover(chain, 'eth_getCode', [address, 'latest'], true);
    const code = codeRaw || '0x';
    const lowerCode = code.toLowerCase();
    const isEip7702Eoa = lowerCode.startsWith('0xef0100') && lowerCode.length === 48;
    const isDeployed = code !== '0x' && code.length > 2 && !isEip7702Eoa;
    const supportsOptimizedArbitrage = isDeployed && lowerCode.includes('23b3aa6b');
    const supportsRescueTokensTo = isDeployed && lowerCode.includes('a7070692');
    const isFlashArbContract = supportsOptimizedArbitrage || supportsRescueTokensTo || (isDeployed && lowerCode.includes('ae3bf8'));
    const isProfitVaultAddress = address.toLowerCase() === profitWalletEnv().toLowerCase();

    let contractOwner: string | null = null;
    let supportsAlgebra = false;
    let supportsCamelotV2 = false;
    if (isDeployed) {
      const [ownerRes, capsRes] = await Promise.all([
        fetchRpcSingleWithFailover(chain, 'eth_call', [{ to: address, data: '0x8da5cb5b' }, 'latest'], false).catch(() => ({ result: '0x' })),
        fetchRpcSingleWithFailover(chain, 'eth_call', [{ to: address, data: '0x459a01ae' }, 'latest'], false).catch(() => ({ result: '0x' })),
      ]);
      if (typeof ownerRes?.result === 'string' && ownerRes.result.length >= 66) {
        try {
          contractOwner = ethers.getAddress(`0x${ownerRes.result.slice(-40)}`);
        } catch {}
      }
      if (typeof capsRes?.result === 'string' && capsRes.result.length >= 66) {
        try {
          const capMask = BigInt(capsRes.result.slice(0, 66));
          supportsAlgebra = (capMask & 2n) !== 0n;
          supportsCamelotV2 = (capMask & 4n) !== 0n;
        } catch {}
      }
    }

    let signerAddress: string | null = null;
    const signerKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    if (signerKey) {
      try {
        signerAddress = new ethers.Wallet(signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`).address;
      } catch {}
    }

    const ownerMatchesSigner = Boolean(
      contractOwner && signerAddress && contractOwner.toLowerCase() === signerAddress.toLowerCase()
    );

    return res.json({
      success: true,
      chain,
      address,
      isDeployed,
      isEip7702Eoa,
      isFlashArbContract,
      isProfitVaultAddress,
      supportsOptimizedArbitrage,
      supportsRescueTokensTo,
      bytecodeLength: code !== '0x' && code.length > 2 ? (code.length - 2) / 2 : 0,
      owner: contractOwner,
      signerAddress,
      ownerMatchesSigner,
      supportsAlgebra,
      supportsCamelotV2,
      camelotV3Adapter: chain === 'arbitrum' ? DEPLOYED_CAMELOT_ADAPTERS.arbitrum || null : null,
      explorerUrl: `${rpcInfo.explorer}/address/${address}#code`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/flash-arb/broadcast
 * Broadcasts a real signed transaction to Arbitrum/Base/Optimism via the server-configured signer key
 */
flashArbRouter.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const { chain, to, data, gasLimit } = req.body;
    const targetChain = String(chain || 'arbitrum').toLowerCase();
    const rpcInfo = RPC_ENDPOINTS[targetChain] || RPC_ENDPOINTS.arbitrum;

    if (!process.env.FLASH_ARB_SIGNER_KEY) {
      return res.status(400).json({
        success: false,
        error: 'No server-side signer private key configured. Enter private key in Signer Key Config.',
      });
    }

    // Verify target contract code using failover RPC pool
    const { result: codeRaw } = await fetchRpcSingleWithFailover(targetChain, 'eth_getCode', [to, 'latest'], true);
    const code = codeRaw || '0x';
    if (code === '0x' || code.length <= 2) {
      return res.status(400).json({
        success: false,
        error: `Contract ${to} has no deployed bytecode on ${rpcInfo.name}. You must deploy FlashArbOptimized.sol first before executing flash loans.`,
        isContractUndeployed: true,
      });
    }

    const { ethers } = await import('ethers');
    const callData = typeof data === 'string' && data ? data : '0x';
    const isDirectSweepSelector = callData.toLowerCase().startsWith('0x7804d9ac');
    let cleanKey = '';
    let signerAddress = '';
    try {
      cleanKey = process.env.FLASH_ARB_SIGNER_KEY.trim().startsWith('0x')
        ? process.env.FLASH_ARB_SIGNER_KEY.trim()
        : `0x${process.env.FLASH_ARB_SIGNER_KEY.trim()}`;
      signerAddress = new ethers.Wallet(cleanKey).address;
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Configured FLASH_ARB_SIGNER_KEY is invalid.',
      });
    }

    // Pre-check contract owner() so non-owner signers fail fast before burning gas on an Unauthorized() revert
    try {
      const { result: ownerRaw } = await fetchRpcSingleWithFailover(
        targetChain,
        'eth_call',
        [{ to, data: '0x8da5cb5b' }, 'latest'],
        true
      );
      if (typeof ownerRaw === 'string' && ownerRaw.length >= 66) {
        const contractOwner = ethers.getAddress(`0x${ownerRaw.slice(-40)}`);
        if (contractOwner.toLowerCase() !== signerAddress.toLowerCase()) {
          return res.status(400).json({
            success: false,
            error: `Signer wallet ${signerAddress} is not the owner of contract ${to} (owner is ${contractOwner}). Deploy your own contract with this signer or switch to the owner key so onlyOwner sweep/arb calls do not revert.`,
          });
        }
      }
    } catch {
      // Contract may not expose owner(); proceed to pre-flight checks
    }

    // Guard against calling executeDirectFlashArb(recipient) (0x7804d9ac) when contract holds 0 ETH:
    // That selector only sweeps native ETH held on the contract and performs zero DEX swaps or flash loans.
    let contractBalanceWei = 0n;
    if (isDirectSweepSelector) {
      try {
        const { result: contractBalRaw } = await fetchRpcSingleWithFailover(
          targetChain,
          'eth_getBalance',
          [to, 'latest'],
          true
        );
        contractBalanceWei = BigInt(contractBalRaw || '0x0');
      } catch {
        contractBalanceWei = 0n;
      }
      if (contractBalanceWei <= 0n) {
        return res.status(400).json({
          success: false,
          isEmptyEthSweep: true,
          isEthSweepOnly: true,
          error: `Blocked to prevent wasted gas: executeDirectFlashArb (0x7804d9ac) only sweeps native ETH held on contract ${to} (currently 0.0000 ETH) and performs ZERO flash-loan swaps. Use /api/flash-arb/simulator/execute or /api/flash-arb/agent/trigger to execute executeOptimizedArbitrage().`,
        });
      }
    }

    // Pre-flight eth_estimateGas on all non-empty transactions so reverting calls never spend L2 gas
    let preflightGasLimit = gasLimit ? BigInt(gasLimit) : 300000n;
    try {
      const { result: estGasHex } = await fetchRpcSingleWithFailover(
        targetChain,
        'eth_estimateGas',
        [{ from: signerAddress, to, data: callData }, 'latest'],
        true
      );
      if (typeof estGasHex === 'string' && estGasHex.startsWith('0x')) {
        const est = BigInt(estGasHex);
        preflightGasLimit = est > 0n ? (est * 125n) / 100n : preflightGasLimit;
      }
    } catch (estErr: any) {
      return res.status(422).json({
        success: false,
        simulationFailed: true,
        error: `Pre-flight eth_estimateGas aborted broadcast (0 gas spent): ${decodeFlashArbRevertError(estErr)}`,
      });
    }

    const { txHash: sentTxHash, receipt } = await broadcastSignedTxAndWait({
      chain: parseSupportedChain(targetChain),
      cleanKey,
      to,
      data: callData,
      gasLimit: preflightGasLimit,
      allowAutoSpeedUp: isDirectSweepSelector,
      minBalanceWei: 100000000000000n,
    });

    if (!receipt || receipt.status !== 1) {
      return res.status(500).json({
        success: false,
        txHash: sentTxHash,
        explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
        error: 'Transaction reverted on-chain.',
      });
    }

    const decodedSwap = decodeArbitrageSwapsExecutedLogs(receipt.logs || [], to);

    return res.json({
      success: true,
      txHash: sentTxHash,
      chain: rpcInfo.name,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      isEthSweepOnly: isDirectSweepSelector,
      arbitrageExecuted: Boolean(decodedSwap),
      sweptEthWei: isDirectSweepSelector ? contractBalanceWei.toString() : undefined,
      explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
    });
  } catch (err: any) {
    return res.status(err?.timedOut ? 504 : 500).json({
      success: false,
      timedOut: Boolean(err?.timedOut),
      pendingInMempool: Boolean(err?.pendingInMempool),
      txHash: err?.txHash,
      explorerUrl: err?.explorerUrl,
      nonce: err?.nonce ?? null,
      error: err.message || 'On-chain broadcast failed',
    });
  }
});

/**
 * GET /api/flash-arb/deploy-payload
 * Returns compiled bytecode, ABI, and encoded constructor payload for deploying FlashArbOptimized
 */
flashArbRouter.get('/deploy-payload', async (req: Request, res: Response) => {
  try {
    const chain = String(req.query.chain || 'arbitrum').toLowerCase();
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;

    const artifact = await loadOrCompileContractArtifact('FlashArbOptimized');

    const { ethers } = await import('ethers');
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const constructorArgs = [rpcInfo.balancerVault, rpcInfo.aavePool];
    const encodedArgs = abiCoder.encode(['address', 'address'], constructorArgs);
    const deployData = artifact.bytecode + encodedArgs.slice(2);

    return res.json({
      success: true,
      chain,
      chainName: rpcInfo.name,
      chainId: rpcInfo.chainId,
      constructorArgs: {
        balancerVault: rpcInfo.balancerVault,
        aavePool: rpcInfo.aavePool,
        profitVault: profitWalletEnv(),
      },
      bytecodeLength: artifact.bytecode.length,
      deployData,
      abi: artifact.abi,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

const RUNTIME_DEPLOYMENTS_FILE = path.resolve(process.cwd(), '.flash-arb-deployments.json');

// In-memory registry of active FlashArb contract addresses per chain (persisted to .flash-arb-deployments.json on updates)
const DEPLOYED_CONTRACTS: Record<string, string> = {
  ethereum: (process.env.FLASH_ARB_CONTRACT_ETHEREUM || '0x5901B4B159Ea0Cab54effcbF00F0076c96AD898D').trim(),
  polygon: (process.env.FLASH_ARB_CONTRACT_POLYGON || '0xBBA273E057cDa31bB359d8AA8749256246B6d0cC').trim(),
  bsc: (process.env.FLASH_ARB_CONTRACT_BSC || '0xBBA273E057cDa31bB359d8AA8749256246B6d0cC').trim(),
  avalanche: (process.env.FLASH_ARB_CONTRACT_AVALANCHE || '').trim(),
  arbitrum: '0xeee31ff9e69904b43c124095b6f33aa61505bcc2',
  base: '0x37440674a814f24d9C6ea0990b272215D40c4512',
  optimism: '0x738C8Eb31316B23d9b8A68B0c2658B456c932598',
  linea: (process.env.FLASH_ARB_CONTRACT_LINEA || '').trim(),
  scroll: (process.env.FLASH_ARB_CONTRACT_SCROLL || '').trim(),
  apechain: (process.env.FLASH_ARB_CONTRACT_APECHAIN || '').trim(),
};

// In-memory registry of optional stateless CamelotV3SwapAdapter addresses (lets legacy FlashArbOptimized call Camelot V3)
const DEPLOYED_CAMELOT_ADAPTERS: Record<string, string> = {
  arbitrum: (process.env.CAMELOT_V3_ADAPTER_ARBITRUM || '').trim(),
};

function loadRuntimeDeployments() {
  try {
    if (!fs.existsSync(RUNTIME_DEPLOYMENTS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(RUNTIME_DEPLOYMENTS_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      if (raw.contracts && typeof raw.contracts === 'object') {
        for (const [k, v] of Object.entries(raw.contracts)) {
          const norm = normalizeValidContractAddress(String(v || ''));
          if (norm && k in DEPLOYED_CONTRACTS) {
            DEPLOYED_CONTRACTS[k] = norm;
          }
        }
      }
      if (raw.camelotAdapters && typeof raw.camelotAdapters === 'object') {
        for (const [k, v] of Object.entries(raw.camelotAdapters)) {
          const str = String(v || '').trim();
          if (!str) {
            DEPLOYED_CAMELOT_ADAPTERS[k] = '';
          } else {
            const norm = normalizeValidContractAddress(str);
            if (norm) DEPLOYED_CAMELOT_ADAPTERS[k] = norm;
          }
        }
      }
    }
  } catch {}
}

function persistRuntimeDeployments() {
  try {
    fs.writeFileSync(
      RUNTIME_DEPLOYMENTS_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          contracts: DEPLOYED_CONTRACTS,
          camelotAdapters: DEPLOYED_CAMELOT_ADAPTERS,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {}
}

loadRuntimeDeployments();

/**
 * GET /api/flash-arb/deployed-contracts
 * Returns the currently active FlashArb contract addresses across all supported chains
 */
flashArbRouter.get('/deployed-contracts', (_req: Request, res: Response) => {
  res.json({
    success: true,
    contracts: DEPLOYED_CONTRACTS,
  });
});

/**
 * POST /api/flash-arb/deployed-contracts
 * Updates the active contract address for a specific chain
 */
flashArbRouter.post('/deployed-contracts', (req: Request, res: Response) => {
  const { chain, address } = req.body;
  const targetChain = String(chain || 'arbitrum').toLowerCase();
  const normalizedAddr = normalizeValidContractAddress(address);
  if (!normalizedAddr) {
    return res.status(400).json({ success: false, error: 'Invalid non-zero EVM contract address format (must be 0x followed by 40 hex chars)' });
  }
  DEPLOYED_CONTRACTS[targetChain] = normalizedAddr;
  persistRuntimeDeployments();
  liveAgent.invalidateChainInfraCache(targetChain as SupportedArbChain);
  return res.json({
    success: true,
    chain: targetChain,
    contractAddress: DEPLOYED_CONTRACTS[targetChain],
    contracts: DEPLOYED_CONTRACTS,
  });
});

/**
 * POST /api/flash-arb/deploy-contract
 * Autonomous Deployment Agent: Signs & broadcasts contract creation on the selected chain
 */
flashArbRouter.post('/deploy-contract', async (req: Request, res: Response) => {
  try {
    const { chain, privateKey: reqPrivateKey } = req.body;
    const targetChain = String(chain || 'arbitrum').toLowerCase();
    const rpcInfo = RPC_ENDPOINTS[targetChain] || RPC_ENDPOINTS.arbitrum;

    const artifact = await loadOrCompileContractArtifact('FlashArbOptimized');

    const { ethers } = await import('ethers');

    const signerKey = reqPrivateKey || process.env.FLASH_ARB_SIGNER_KEY;

    if (!signerKey) {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encodedArgs = abiCoder.encode(['address', 'address'], [rpcInfo.balancerVault, rpcInfo.aavePool]);
      const deployData = artifact.bytecode + encodedArgs.slice(2);

      return res.json({
        success: false,
        requiresWallet: true,
        message: 'No server signer key configured. Configure FLASH_ARB_SIGNER_KEY in Signer Key Config to deploy via Server Agent.',
        deployData,
        chain: targetChain,
        chainName: rpcInfo.name,
        chainId: rpcInfo.chainId,
        rpcUrl: rpcInfo.rpc,
        explorer: rpcInfo.explorer,
        constructorArgs: [rpcInfo.balancerVault, rpcInfo.aavePool],
      });
    }

    const txPool = getRpcPool(targetChain, true);
    const cleanKey = signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`;
    const walletAddress = new ethers.Wallet(cleanKey).address;
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
    const deployTxReq = await factory.getDeployTransaction(rpcInfo.balancerVault, rpcInfo.aavePool);
    let deployGasLimit = 3200000n;
    try {
      const { result: estHex } = await fetchRpcSingleWithFailover(
        targetChain,
        'eth_estimateGas',
        [{ from: walletAddress, data: deployTxReq.data }, 'latest'],
        true
      );
      if (typeof estHex === 'string' && estHex.startsWith('0x')) {
        const est = BigInt(estHex);
        if (est > 0n) deployGasLimit = (est * 125n) / 100n;
      }
    } catch {}

    const { txHash, receipt } = await broadcastSignedTxAndWait({
      chain: parseSupportedChain(targetChain),
      cleanKey,
      data: deployTxReq.data,
      gasLimit: deployGasLimit,
      isDeployment: true,
      allowAutoSpeedUp: true,
      minBalanceWei: 100000000000000n,
    });
    if (receipt.status !== 1) {
      throw new Error('Contract deployment transaction reverted on-chain.');
    }
    const deployedAddress = receipt.contractAddress || '';
    if (!deployedAddress) {
      throw new Error(`Contract deployment mined (${txHash}) without contractAddress on ${rpcInfo.name}`);
    }
    const contractAddress = deployedAddress;
    const wallet = { address: walletAddress };

    // Register into active deployed contracts store
    DEPLOYED_CONTRACTS[targetChain] = contractAddress;
    persistRuntimeDeployments();
    liveAgent.invalidateChainInfraCache(targetChain as SupportedArbChain);

    return res.json({
      success: true,
      contractAddress,
      txHash,
      chain: targetChain,
      chainName: rpcInfo.name,
      deployer: wallet.address,
      balancerVault: rpcInfo.balancerVault,
      aavePool: rpcInfo.aavePool,
      profitVault: profitWalletEnv(),
      explorerUrl: `${rpcInfo.explorer}/address/${contractAddress}`,
      txExplorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
    });
  } catch (err: any) {
    return res.status(err?.timedOut ? 504 : 500).json({
      success: false,
      timedOut: Boolean(err?.timedOut),
      pendingInMempool: Boolean(err?.pendingInMempool),
      txHash: err?.txHash,
      explorerUrl: err?.explorerUrl,
      nonce: err?.nonce ?? null,
      error: err.message || 'Contract deployment failed',
    });
  }
});

flashArbRouter.get('/camelot-adapter', async (_req: Request, res: Response) => {
  const arbInfra = await liveAgent.getChainInfra('arbitrum').catch(() => null);
  const signerKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
  let signerAddress: string | null = null;
  if (signerKey) {
    try {
      signerAddress = new ethers.Wallet(signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`).address;
    } catch {}
  }
  const contractOwner = arbInfra?.contractOwner ?? null;
  res.json({
    success: true,
    adapters: DEPLOYED_CAMELOT_ADAPTERS,
    camelotV3Router: CAMELOT_V3_ROUTER_ADDRESS,
    arbitrumCapabilities: arbInfra
      ? {
          contractAddr: arbInfra.contractAddr,
          contractOwner,
          signerAddress,
          ownerMatchesSigner: Boolean(
            contractOwner && signerAddress && contractOwner.toLowerCase() === signerAddress.toLowerCase()
          ),
          supportsAlgebra: arbInfra.contractSupportsAlgebra,
          supportsCamelotV2: arbInfra.contractSupportsCamelotV2,
          camelotV3Adapter: arbInfra.camelotV3Adapter,
        }
      : null,
  });
});

flashArbRouter.post('/camelot-adapter', (req: Request, res: Response) => {
  const { chain, address } = req.body || {};
  const targetChain = String(chain || 'arbitrum').toLowerCase();
  const cleanAddr = String(address || '').trim();
  if (cleanAddr && !/^0x[a-fA-F0-9]{40}$/i.test(cleanAddr)) {
    return res.status(400).json({ success: false, error: 'Invalid adapter address format (must be 0x + 40 hex chars)' });
  }
  DEPLOYED_CAMELOT_ADAPTERS[targetChain] = cleanAddr ? ethers.getAddress(cleanAddr) : '';
  persistRuntimeDeployments();
  liveAgent.invalidateChainInfraCache(targetChain as SupportedArbChain);
  return res.json({
    success: true,
    chain: targetChain,
    adapterAddress: DEPLOYED_CAMELOT_ADAPTERS[targetChain],
    adapters: DEPLOYED_CAMELOT_ADAPTERS,
  });
});

flashArbRouter.get('/camelot-adapter-payload', async (req: Request, res: Response) => {
  try {
    const chain = String(req.query.chain || 'arbitrum').toLowerCase();
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const artifact = await loadOrCompileContractArtifact('CamelotV3SwapAdapter');
    const { ethers } = await import('ethers');
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedArgs = abiCoder.encode(['address'], [CAMELOT_V3_ROUTER_ADDRESS]);
    const deployData = artifact.bytecode + encodedArgs.slice(2);
    return res.json({
      success: true,
      chain,
      chainName: rpcInfo.name,
      chainId: rpcInfo.chainId,
      constructorArgs: { camelotRouter: CAMELOT_V3_ROUTER_ADDRESS },
      bytecodeLength: artifact.bytecode.length,
      deployData,
      abi: artifact.abi,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

flashArbRouter.post('/deploy-camelot-adapter', async (req: Request, res: Response) => {
  try {
    const { chain, privateKey: reqPrivateKey } = req.body || {};
    const targetChain = String(chain || 'arbitrum').toLowerCase();
    if (targetChain !== 'arbitrum') {
      return res.status(400).json({ success: false, error: 'CamelotV3SwapAdapter is only needed on Arbitrum One.' });
    }
    const rpcInfo = RPC_ENDPOINTS.arbitrum;
    const artifact = await loadOrCompileContractArtifact('CamelotV3SwapAdapter');
    const { ethers } = await import('ethers');

    const signerKey = reqPrivateKey || process.env.FLASH_ARB_SIGNER_KEY;
    if (!signerKey) {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encodedArgs = abiCoder.encode(['address'], [CAMELOT_V3_ROUTER_ADDRESS]);
      return res.json({
        success: false,
        requiresWallet: true,
        message: 'No server signer key configured. Configure FLASH_ARB_SIGNER_KEY in Signer Key Config to deploy CamelotV3SwapAdapter.',
        deployData: artifact.bytecode + encodedArgs.slice(2),
        chain: targetChain,
        chainName: rpcInfo.name,
        chainId: rpcInfo.chainId,
        constructorArgs: [CAMELOT_V3_ROUTER_ADDRESS],
      });
    }

    const cleanKey = signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`;
    const walletAddress = new ethers.Wallet(cleanKey).address;
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode);
    const deployTxReq = await factory.getDeployTransaction(CAMELOT_V3_ROUTER_ADDRESS);
    let deployGasLimit = 1200000n;
    try {
      const { result: estHex } = await fetchRpcSingleWithFailover(
        targetChain,
        'eth_estimateGas',
        [{ from: walletAddress, data: deployTxReq.data }, 'latest'],
        true
      );
      if (typeof estHex === 'string' && estHex.startsWith('0x')) {
        const est = BigInt(estHex);
        if (est > 0n) deployGasLimit = (est * 125n) / 100n;
      }
    } catch {}

    const { txHash, receipt } = await broadcastSignedTxAndWait({
      chain: parseSupportedChain(targetChain),
      cleanKey,
      data: deployTxReq.data,
      gasLimit: deployGasLimit,
      isDeployment: true,
      allowAutoSpeedUp: true,
      minBalanceWei: 50000000000000n,
    });
    if (receipt.status !== 1) throw new Error('Adapter deployment transaction reverted on-chain.');
    const deployedAddress = receipt.contractAddress || '';
    if (!deployedAddress) {
      throw new Error(`CamelotV3SwapAdapter deployment mined (${txHash}) without contractAddress on Arbitrum One`);
    }

    DEPLOYED_CAMELOT_ADAPTERS.arbitrum = ethers.getAddress(deployedAddress);
    persistRuntimeDeployments();
    liveAgent.invalidateChainInfraCache('arbitrum');

    const arbInfra = await liveAgent.getChainInfra('arbitrum').catch(() => null);
    const activeContractOwner = arbInfra?.contractOwner ?? null;
    const ownerMismatch = Boolean(
      activeContractOwner && activeContractOwner.toLowerCase() !== walletAddress.toLowerCase()
    );

    return res.json({
      success: true,
      adapterAddress: DEPLOYED_CAMELOT_ADAPTERS.arbitrum,
      txHash,
      chain: 'arbitrum',
      chainName: rpcInfo.name,
      deployer: walletAddress,
      camelotV3Router: CAMELOT_V3_ROUTER_ADDRESS,
      activeContract: DEPLOYED_CONTRACTS.arbitrum,
      activeContractOwner,
      ownerMismatch,
      explorerUrl: `${rpcInfo.explorer}/address/${DEPLOYED_CAMELOT_ADAPTERS.arbitrum}`,
      txExplorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
    });
  } catch (err: any) {
    return res.status(err?.timedOut ? 504 : 500).json({ success: false, error: err.message || 'Adapter deployment failed' });
  }
});

// ============================================================
// LIVE ON-CHAIN MEV AGENT ENGINE (ARBITRUM · BASE · OPTIMISM)
// ============================================================

export interface MonitoredPoolState {
  id: string;
  chain: SupportedArbChain;
  name: string;
  dex: string;
  pair: string;
  poolAddress: string;
  feeTierPercent: number;
  priceUsd: number;
  blockNumber: number;
  lastUpdated: number;
  depthSummary: string;
}

export interface LiveArbitrageOpportunity {
  id: string;
  chain: SupportedArbChain;
  timestamp: number;
  blockNumber: number;
  pair: string;
  buyDex: string;
  buyPool: string;
  buyPrice: number;
  sellDex: string;
  sellPool: string;
  sellPrice: number;
  grossSpreadUsd: number;
  grossSpreadBps: number;
  dexFeeBps: number;
  dexFeeUsd?: number;
  slippageCostUsd?: number;
  estNetProfitUsd: number;
  isProfitable: boolean;
  isActionable: boolean;
  profitGuardStatus: 'PROFIT_SECURED' | 'REVERT_PROTECTION_BLOCKED';
  profitGuardReason: string;
  loanToken: string;
  loanAmount: number;
  optimalLoanAmount: number;
  optimalGasLimit: number;
  gasCostUsd: number;
  gasSavingsPercent: number;
  priceImpactBps: number;
  routeType: number;
  contractExecutable?: boolean;
}

export interface ExecutedAgentTrade {
  id: string;
  chain?: SupportedArbChain;
  txHash: string;
  timestamp: number;
  blockNumber: number;
  pair: string;
  buyDex: string;
  sellDex: string;
  grossSpreadUsd: number | null;
  netProfitUsd: number | null;
  gasCostEth: number | null;
  gasSavedUsd?: number;
  loanFeeSavedUsd?: number;
  gasSavedEthSwept?: string | null;
  gasSweepTxHash?: string | null;
  status: 'CONFIRMED' | 'REVERTED' | 'PENDING';
  explorerUrl: string;
  profitRecipient: string;
}

// In-Memory Live Agent State with Dynamic Parameter Optimizer & Strict Profit Guard
// ---- Monitored pools (verified on-chain across Arbitrum One, Base L2, and Optimism Mainnet) ----
// Every pool address was verified via factory getPool / getPair / poolByPair and measured liquidity >= $5,000.
interface Tok { sym: string; addr: string; dec: number }
const T = {
  WETH: { sym: 'WETH', addr: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', dec: 18 },
  USDC: { sym: 'USDC', addr: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', dec: 6 },
  USDCe: { sym: 'USDC.e', addr: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', dec: 6 },
  USDT: { sym: 'USDT', addr: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', dec: 6 },
  DAI: { sym: 'DAI', addr: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', dec: 18 },
  ARB: { sym: 'ARB', addr: '0x912CE59144191C1204E64559FE8253a0e49E6548', dec: 18 },
  WBTC: { sym: 'WBTC', addr: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', dec: 8 },
  LINK: { sym: 'LINK', addr: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', dec: 18 },
  GMX: { sym: 'GMX', addr: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', dec: 18 },
  AAVE: { sym: 'AAVE', addr: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196', dec: 18 },
  PENDLE: { sym: 'PENDLE', addr: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8', dec: 18 },
  UNI: { sym: 'UNI', addr: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', dec: 18 },
  wstETH: { sym: 'wstETH', addr: '0x5979D7b546E38E414F7E9822514be443A4800529', dec: 18 },
} satisfies Record<string, Tok>;

const BASE_T = {
  WETH: { sym: 'WETH', addr: '0x4200000000000000000000000000000000000006', dec: 18 },
  USDC: { sym: 'USDC', addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', dec: 6 },
  USDbC: { sym: 'USDbC', addr: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', dec: 6 },
  USDT: { sym: 'USDT', addr: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', dec: 6 },
  cbETH: { sym: 'cbETH', addr: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', dec: 18 },
  wstETH: { sym: 'wstETH', addr: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', dec: 18 },
  ezETH: { sym: 'ezETH', addr: '0x2416092f143378750bb29b79eD961ab195CcEea5', dec: 18 },
  AERO: { sym: 'AERO', addr: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', dec: 18 },
  DAI: { sym: 'DAI', addr: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', dec: 18 },
  cbBTC: { sym: 'cbBTC', addr: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', dec: 8 },
  DEGEN: { sym: 'DEGEN', addr: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', dec: 18 },
  VIRTUAL: { sym: 'VIRTUAL', addr: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', dec: 18 },
  MORPHO: { sym: 'MORPHO', addr: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', dec: 18 },
} satisfies Record<string, Tok>;

const OP_T = {
  WETH: { sym: 'WETH', addr: '0x4200000000000000000000000000000000000006', dec: 18 },
  USDC: { sym: 'USDC', addr: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', dec: 6 },
  USDCe: { sym: 'USDC.e', addr: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', dec: 6 },
  USDT: { sym: 'USDT', addr: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', dec: 6 },
  DAI: { sym: 'DAI', addr: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', dec: 18 },
  OP: { sym: 'OP', addr: '0x4200000000000000000000000000000000000042', dec: 18 },
  WBTC: { sym: 'WBTC', addr: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', dec: 8 },
  wstETH: { sym: 'wstETH', addr: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb', dec: 18 },
} satisfies Record<string, Tok>;

interface PoolSpec {
  id: string; name: string; dex: string; pair: string; address: string; fee: number;
  kind: 'v3' | 'slipstream' | 'algebra' | 'v2'; base: Tok; quote: Tok;
}
const POOL_SPECS: PoolSpec[] = [
  // WETH / USDC (8 pools across 5 DEXes)
  { id: 'univ3_weth_usdc_005', name: 'Uniswap V3 WETH/USDC (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0xC6962004f452bE9203591991D15f6b388e09E8D0', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'univ3_weth_usdc_030', name: 'Uniswap V3 WETH/USDC (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0xc473e2aEE3441BF9240Be85eb122aBB059A3B57c', fee: 0.30, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'univ3_weth_usdc_001', name: 'Uniswap V3 WETH/USDC (0.01%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0x6f38e884725a116C9C7fBF208e79FE8828a2595F', fee: 0.01, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'univ3_weth_usdc_100', name: 'Uniswap V3 WETH/USDC (1.00%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0x42FC852A750BA93D5bf772ecdc857e87a86403a9', fee: 1.00, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'pancake_v3_weth_usdc_005', name: 'PancakeSwap V3 WETH/USDC (0.05%)', dex: 'PancakeSwap V3', pair: 'WETH/USDC', address: '0xd9e2a1a61B6E61b275cEc326465d417e52C1b95c', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'pancake_v3_weth_usdc_001', name: 'PancakeSwap V3 WETH/USDC (0.01%)', dex: 'PancakeSwap V3', pair: 'WETH/USDC', address: '0x7fCDC35463E3770c2fB992716Cd070B63540b947', fee: 0.01, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'sushiv3_weth_usdc_005', name: 'SushiSwap V3 WETH/USDC (0.05%)', dex: 'SushiSwap V3', pair: 'WETH/USDC', address: '0xf3Eb87C1F6020982173C908E7eB31aA66c1f0296', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'sushi_weth_usdc', name: 'Sushiswap V2 WETH/USDC (0.30%)', dex: 'Sushiswap V2', pair: 'WETH/USDC', address: '0x57b85FEf094e10b5eeCDF350Af688299E9553378', fee: 0.30, kind: 'v2', base: T.WETH, quote: T.USDC },
  { id: 'camelot_v3_weth_usdc', name: 'Camelot V3 WETH/USDC', dex: 'Camelot V3', pair: 'WETH/USDC', address: '0xB1026b8e7276e7AC75410F1fcbbe21796e8f7526', fee: 0.01, kind: 'algebra', base: T.WETH, quote: T.USDC },

  // WETH / USDT (7 pools across 5 DEXes)
  { id: 'univ3_weth_usdt_005', name: 'Uniswap V3 WETH/USDT (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDT', address: '0x641C00A822e8b671738d32a431a4Fb6074E5c79d', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'univ3_weth_usdt_030', name: 'Uniswap V3 WETH/USDT (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDT', address: '0xc82819F72A9e77E2c0c3A69B3196478f44303cf4', fee: 0.30, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'univ3_weth_usdt_001', name: 'Uniswap V3 WETH/USDT (0.01%)', dex: 'Uniswap V3', pair: 'WETH/USDT', address: '0x42161084d0672e1d3F26a9B53E653bE2084ff19C', fee: 0.01, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'pancake_v3_weth_usdt_005', name: 'PancakeSwap V3 WETH/USDT (0.05%)', dex: 'PancakeSwap V3', pair: 'WETH/USDT', address: '0x0BaCc7a9717e70EA0DA5Ac075889Bd87d4C81197', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'pancake_v3_weth_usdt_001', name: 'PancakeSwap V3 WETH/USDT (0.01%)', dex: 'PancakeSwap V3', pair: 'WETH/USDT', address: '0x389938CF14Be379217570D8e4619E51fBDafaa21', fee: 0.01, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'pancake_v3_weth_usdt_025', name: 'PancakeSwap V3 WETH/USDT (0.25%)', dex: 'PancakeSwap V3', pair: 'WETH/USDT', address: '0xAEaB1336Efc2bf74bC89FCf0E33E6013f3C8587E', fee: 0.25, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'sushiv3_weth_usdt_005', name: 'SushiSwap V3 WETH/USDT (0.05%)', dex: 'SushiSwap V3', pair: 'WETH/USDT', address: '0x96aDA81328abCe21939A51D971A63077e16db26E', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'sushiv3_weth_usdt_030', name: 'SushiSwap V3 WETH/USDT (0.30%)', dex: 'SushiSwap V3', pair: 'WETH/USDT', address: '0x92d543A8a158A6bC2C7018ae17803819Cb9150B2', fee: 0.30, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'sushi_weth_usdt', name: 'Sushiswap V2 WETH/USDT (0.30%)', dex: 'Sushiswap V2', pair: 'WETH/USDT', address: '0xCB0E5bFa72bBb4d16AB5aA0c60601c438F04b4ad', fee: 0.30, kind: 'v2', base: T.WETH, quote: T.USDT },

  // WETH / USDC.e (5 pools across 4 DEXes)
  { id: 'univ3_weth_usdce_005', name: 'Uniswap V3 WETH/USDC.e (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDC.e', address: '0xC31E54c7a869B9FcBEcc14363CF510d1c41fa443', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDCe },
  { id: 'univ3_weth_usdce_030', name: 'Uniswap V3 WETH/USDC.e (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDC.e', address: '0x17c14D2c404D167802b16C450d3c99F88F2c4F4d', fee: 0.30, kind: 'v3', base: T.WETH, quote: T.USDCe },
  { id: 'sushiv3_weth_usdce_030', name: 'SushiSwap V3 WETH/USDC.e (0.30%)', dex: 'SushiSwap V3', pair: 'WETH/USDC.e', address: '0x4d1576158518dD61924218446C1057CF03138D57', fee: 0.30, kind: 'v3', base: T.WETH, quote: T.USDCe },
  { id: 'sushi_weth_usdce', name: 'Sushiswap V2 WETH/USDC.e (0.30%)', dex: 'Sushiswap V2', pair: 'WETH/USDC.e', address: '0x905dfCD5649217c42684f23958568e533C711Aa3', fee: 0.30, kind: 'v2', base: T.WETH, quote: T.USDCe },
  { id: 'camelot_v2_weth_usdce', name: 'Camelot V2 WETH/USDC.e (0.30%)', dex: 'Camelot V2', pair: 'WETH/USDC.e', address: '0x84652bb2539513BAf36e225c930Fdd8eaa63CE27', fee: 0.30, kind: 'v2', base: T.WETH, quote: T.USDCe },

  // USDC / USDT (4 pools across 3 DEXes)
  { id: 'univ3_usdc_usdt_001', name: 'Uniswap V3 USDC/USDT (0.01%)', dex: 'Uniswap V3', pair: 'USDC/USDT', address: '0xbE3aD6a5669Dc0B8b12FeBC03608860C31E2eef6', fee: 0.01, kind: 'v3', base: T.USDC, quote: T.USDT },
  { id: 'univ3_usdc_usdt_005', name: 'Uniswap V3 USDC/USDT (0.05%)', dex: 'Uniswap V3', pair: 'USDC/USDT', address: '0xbcE73c2e5A623054B0e8e2428E956f4b9d0412a5', fee: 0.05, kind: 'v3', base: T.USDC, quote: T.USDT },
  { id: 'pancake_v3_usdc_usdt_001', name: 'PancakeSwap V3 USDC/USDT (0.01%)', dex: 'PancakeSwap V3', pair: 'USDC/USDT', address: '0x7e928afb59f5dE9D2f4d162f754C6eB40c88aA8E', fee: 0.01, kind: 'v3', base: T.USDC, quote: T.USDT },
  { id: 'camelot_v3_usdc_usdt', name: 'Camelot V3 USDC/USDT', dex: 'Camelot V3', pair: 'USDC/USDT', address: '0xa17aFCAb059F3C6751F5B64347b5a503C3291868', fee: 0.01, kind: 'algebra', base: T.USDC, quote: T.USDT },

  // DAI / USDC (3 pools across 3 DEXes)
  { id: 'univ3_dai_usdc_001', name: 'Uniswap V3 DAI/USDC (0.01%)', dex: 'Uniswap V3', pair: 'DAI/USDC', address: '0x7CF803e8d82A50504180f417B8bC7a493C0a0503', fee: 0.01, kind: 'v3', base: T.DAI, quote: T.USDC },
  { id: 'pancake_v3_dai_usdc_001', name: 'PancakeSwap V3 DAI/USDC (0.01%)', dex: 'PancakeSwap V3', pair: 'DAI/USDC', address: '0xd5d1F85E65Ce58a4782852F4A845b1d6Ca71F1a2', fee: 0.01, kind: 'v3', base: T.DAI, quote: T.USDC },
  { id: 'camelot_v3_dai_usdc', name: 'Camelot V3 DAI/USDC', dex: 'Camelot V3', pair: 'DAI/USDC', address: '0x45FaE8D0D2acE73544baab452f9020925AfCCC75', fee: 0.01, kind: 'algebra', base: T.DAI, quote: T.USDC },

  // ARB / USDC (3 pools across 2 DEXes)
  { id: 'univ3_arb_usdc_005', name: 'Uniswap V3 ARB/USDC (0.05%)', dex: 'Uniswap V3', pair: 'ARB/USDC', address: '0xb0f6cA40411360c03d41C5fFc5F179b8403CdcF8', fee: 0.05, kind: 'v3', base: T.ARB, quote: T.USDC },
  { id: 'univ3_arb_usdc_030', name: 'Uniswap V3 ARB/USDC (0.30%)', dex: 'Uniswap V3', pair: 'ARB/USDC', address: '0xaEBDcA1Bc8d89177EbE2308d62af5e74885DcCc3', fee: 0.30, kind: 'v3', base: T.ARB, quote: T.USDC },
  { id: 'camelot_arb_usdc', name: 'Camelot V3 ARB/USDC', dex: 'Camelot V3', pair: 'ARB/USDC', address: '0xfaE2AE0a9f87FD35b5b0E24B47BAC796A7EEfEa1', fee: 0.05, kind: 'algebra', base: T.ARB, quote: T.USDC },

  // ARB / WETH (6 pools across 4 DEXes)
  { id: 'univ3_arb_weth_005', name: 'Uniswap V3 ARB/WETH (0.05%)', dex: 'Uniswap V3', pair: 'ARB/WETH', address: '0xC6F780497A95e246EB9449f5e4770916DCd6396A', fee: 0.05, kind: 'v3', base: T.ARB, quote: T.WETH },
  { id: 'univ3_arb_weth_030', name: 'Uniswap V3 ARB/WETH (0.30%)', dex: 'Uniswap V3', pair: 'ARB/WETH', address: '0x92c63d0e701CAAe670C9415d91C474F686298f00', fee: 0.30, kind: 'v3', base: T.ARB, quote: T.WETH },
  { id: 'univ3_arb_weth_100', name: 'Uniswap V3 ARB/WETH (1.00%)', dex: 'Uniswap V3', pair: 'ARB/WETH', address: '0x92fd143A8FA0C84e016C2765648B9733b0aa519e', fee: 1.00, kind: 'v3', base: T.ARB, quote: T.WETH },
  { id: 'sushi_arb_weth', name: 'Sushiswap V2 ARB/WETH (0.30%)', dex: 'Sushiswap V2', pair: 'ARB/WETH', address: '0xBF6CBb1F40a542aF50839CaD01b0dc1747F11e18', fee: 0.30, kind: 'v2', base: T.ARB, quote: T.WETH },
  { id: 'camelot_v2_arb_weth', name: 'Camelot V2 ARB/WETH (0.30%)', dex: 'Camelot V2', pair: 'ARB/WETH', address: '0xa6c5C7D189fA4eB5Af8ba34E63dCDD3a635D433f', fee: 0.30, kind: 'v2', base: T.ARB, quote: T.WETH },
  { id: 'camelot_v3_arb_weth', name: 'Camelot V3 ARB/WETH', dex: 'Camelot V3', pair: 'ARB/WETH', address: '0xe51635ae8136aBAc44906A8f230C2D235E9c195F', fee: 0.03, kind: 'algebra', base: T.ARB, quote: T.WETH },

  // WBTC / WETH (8 pools across 5 DEXes)
  { id: 'univ3_wbtc_weth_005', name: 'Uniswap V3 WBTC/WETH (0.05%)', dex: 'Uniswap V3', pair: 'WBTC/WETH', address: '0x2f5e87C9312fa29aed5c179E456625D79015299c', fee: 0.05, kind: 'v3', base: T.WBTC, quote: T.WETH },
  { id: 'univ3_wbtc_weth_030', name: 'Uniswap V3 WBTC/WETH (0.30%)', dex: 'Uniswap V3', pair: 'WBTC/WETH', address: '0x149e36E72726e0BceA5c59d40df2c43F60f5A22D', fee: 0.30, kind: 'v3', base: T.WBTC, quote: T.WETH },
  { id: 'univ3_wbtc_weth_100', name: 'Uniswap V3 WBTC/WETH (1.00%)', dex: 'Uniswap V3', pair: 'WBTC/WETH', address: '0x99dFc0126ED31E0169fc32dB6B89adF9FeE9a77e', fee: 1.00, kind: 'v3', base: T.WBTC, quote: T.WETH },
  { id: 'pancake_v3_wbtc_weth_001', name: 'PancakeSwap V3 WBTC/WETH (0.01%)', dex: 'PancakeSwap V3', pair: 'WBTC/WETH', address: '0x4bfc22A4dA7f31F8a912a79A7e44a822398b4390', fee: 0.01, kind: 'v3', base: T.WBTC, quote: T.WETH },
  { id: 'pancake_v3_wbtc_weth_005', name: 'PancakeSwap V3 WBTC/WETH (0.05%)', dex: 'PancakeSwap V3', pair: 'WBTC/WETH', address: '0x54076C901D4fDF76C1fA1F77FAFC3FC1022ADBE5', fee: 0.05, kind: 'v3', base: T.WBTC, quote: T.WETH },
  { id: 'sushiv3_wbtc_weth_030', name: 'SushiSwap V3 WBTC/WETH (0.30%)', dex: 'SushiSwap V3', pair: 'WBTC/WETH', address: '0x6F10667F314498649eb2f80da244e8c6E9f031d5', fee: 0.30, kind: 'v3', base: T.WBTC, quote: T.WETH },
  { id: 'sushi_wbtc_weth', name: 'Sushiswap V2 WBTC/WETH (0.30%)', dex: 'Sushiswap V2', pair: 'WBTC/WETH', address: '0x515e252b2b5c22b4b2b6Df66c2eBeeA871AA4d69', fee: 0.30, kind: 'v2', base: T.WBTC, quote: T.WETH },
  { id: 'camelot_v3_wbtc_weth', name: 'Camelot V3 WBTC/WETH', dex: 'Camelot V3', pair: 'WBTC/WETH', address: '0xd845f7D4f4DeB9Ff5bCf09D140Ef13718F6f6C71', fee: 0.01, kind: 'algebra', base: T.WBTC, quote: T.WETH },

  // WBTC / USDC (3 pools across 2 DEXes)
  { id: 'univ3_wbtc_usdc_005', name: 'Uniswap V3 WBTC/USDC (0.05%)', dex: 'Uniswap V3', pair: 'WBTC/USDC', address: '0x0E4831319A50228B9e450861297aB92dee15B44F', fee: 0.05, kind: 'v3', base: T.WBTC, quote: T.USDC },
  { id: 'univ3_wbtc_usdc_030', name: 'Uniswap V3 WBTC/USDC (0.30%)', dex: 'Uniswap V3', pair: 'WBTC/USDC', address: '0x6985cb98CE393FCE8d6272127F39013f61e36166', fee: 0.30, kind: 'v3', base: T.WBTC, quote: T.USDC },
  { id: 'pancake_v3_wbtc_usdc_005', name: 'PancakeSwap V3 WBTC/USDC (0.05%)', dex: 'PancakeSwap V3', pair: 'WBTC/USDC', address: '0x843aC8dc6D34AEB07a56812b8b36429eE46BDd07', fee: 0.05, kind: 'v3', base: T.WBTC, quote: T.USDC },

  // LINK / WETH (4 pools across 3 DEXes)
  { id: 'univ3_link_weth_030', name: 'Uniswap V3 LINK/WETH (0.30%)', dex: 'Uniswap V3', pair: 'LINK/WETH', address: '0x468b88941e7Cc0B88c1869d68ab6b570bCEF62Ff', fee: 0.30, kind: 'v3', base: T.LINK, quote: T.WETH },
  { id: 'univ3_link_weth_005', name: 'Uniswap V3 LINK/WETH (0.05%)', dex: 'Uniswap V3', pair: 'LINK/WETH', address: '0x91308bC9Ce8Ca2db82aA30C65619856cC939d907', fee: 0.05, kind: 'v3', base: T.LINK, quote: T.WETH },
  { id: 'sushi_link_weth', name: 'Sushiswap V2 LINK/WETH (0.30%)', dex: 'Sushiswap V2', pair: 'LINK/WETH', address: '0x7050A8908E2a60899D8788015148241f0993a3FD', fee: 0.30, kind: 'v2', base: T.LINK, quote: T.WETH },
  { id: 'camelot_link_weth', name: 'Camelot V3 LINK/WETH', dex: 'Camelot V3', pair: 'LINK/WETH', address: '0xe8795cF9c2309eCfe05Df028eB0F21D5D6e3a951', fee: 0.21, kind: 'algebra', base: T.LINK, quote: T.WETH },

  // GMX / WETH & GMX / USDC (5 pools across 2 DEXes)
  { id: 'univ3_gmx_weth_030', name: 'Uniswap V3 GMX/WETH (0.30%)', dex: 'Uniswap V3', pair: 'GMX/WETH', address: '0x1aEEdD3727A6431b8F070C0aFaA81Cc74f273882', fee: 0.30, kind: 'v3', base: T.GMX, quote: T.WETH },
  { id: 'univ3_gmx_weth_100', name: 'Uniswap V3 GMX/WETH (1.00%)', dex: 'Uniswap V3', pair: 'GMX/WETH', address: '0x80A9ae39310abf666A87C743d6ebBD0E8C42158E', fee: 1.00, kind: 'v3', base: T.GMX, quote: T.WETH },
  { id: 'camelot_v3_gmx_weth', name: 'Camelot V3 GMX/WETH', dex: 'Camelot V3', pair: 'GMX/WETH', address: '0xC99be44383BC8d82357F5A1D9ae9976EE9d75bee', fee: 0.72, kind: 'algebra', base: T.GMX, quote: T.WETH },
  { id: 'univ3_gmx_usdc_030', name: 'Uniswap V3 GMX/USDC (0.30%)', dex: 'Uniswap V3', pair: 'GMX/USDC', address: '0x135E49cC315fED87F989e072ee11132686CF84F3', fee: 0.30, kind: 'v3', base: T.GMX, quote: T.USDC },
  { id: 'univ3_gmx_usdc_100', name: 'Uniswap V3 GMX/USDC (1.00%)', dex: 'Uniswap V3', pair: 'GMX/USDC', address: '0x0A36952Fb8C8dc6daeFB2fADb07C5212f560880e', fee: 1.00, kind: 'v3', base: T.GMX, quote: T.USDC },

  // AAVE / WETH (3 pools across 2 DEXes)
  { id: 'univ3_aave_weth_030', name: 'Uniswap V3 AAVE/WETH (0.30%)', dex: 'Uniswap V3', pair: 'AAVE/WETH', address: '0xDD672b3B768A16b9BcB4eE1060d3e8221435BeAa', fee: 0.30, kind: 'v3', base: T.AAVE, quote: T.WETH },
  { id: 'univ3_aave_weth_005', name: 'Uniswap V3 AAVE/WETH (0.05%)', dex: 'Uniswap V3', pair: 'AAVE/WETH', address: '0x263f7B865DE80355F91C00dFb975A821Effbea24', fee: 0.05, kind: 'v3', base: T.AAVE, quote: T.WETH },
  { id: 'pancake_v3_aave_weth_005', name: 'PancakeSwap V3 AAVE/WETH (0.05%)', dex: 'PancakeSwap V3', pair: 'AAVE/WETH', address: '0x80Ceb98632409080924DCE50C26aCC25458DDe17', fee: 0.05, kind: 'v3', base: T.AAVE, quote: T.WETH },

  // PENDLE / WETH (4 pools across 3 DEXes)
  { id: 'univ3_pendle_weth_030', name: 'Uniswap V3 PENDLE/WETH (0.30%)', dex: 'Uniswap V3', pair: 'PENDLE/WETH', address: '0xdbaeB7f0DFe3a0AAFD798CCECB5b22E708f7852c', fee: 0.30, kind: 'v3', base: T.PENDLE, quote: T.WETH },
  { id: 'univ3_pendle_weth_005', name: 'Uniswap V3 PENDLE/WETH (0.05%)', dex: 'Uniswap V3', pair: 'PENDLE/WETH', address: '0xB08a8794A5D3cCCA3725D92964696858d3201909', fee: 0.05, kind: 'v3', base: T.PENDLE, quote: T.WETH },
  { id: 'camelot_v2_pendle_weth', name: 'Camelot V2 PENDLE/WETH (0.30%)', dex: 'Camelot V2', pair: 'PENDLE/WETH', address: '0xBfCa4230115DE8341F3A3d5e8845fFb3337B2Be3', fee: 0.30, kind: 'v2', base: T.PENDLE, quote: T.WETH },
  { id: 'camelot_v3_pendle_weth', name: 'Camelot V3 PENDLE/WETH', dex: 'Camelot V3', pair: 'PENDLE/WETH', address: '0xE461f84C3fE6BCDd1162Eb0Ef4284F3bB6e4CAD3', fee: 0.30, kind: 'algebra', base: T.PENDLE, quote: T.WETH },

  // UNI / WETH (2 pools across 2 DEXes)
  { id: 'univ3_uni_weth_030', name: 'Uniswap V3 UNI/WETH (0.30%)', dex: 'Uniswap V3', pair: 'UNI/WETH', address: '0xC24f7d8E51A64dc1238880BD00bb961D54cbeb29', fee: 0.30, kind: 'v3', base: T.UNI, quote: T.WETH },
  { id: 'pancake_v3_uni_weth_005', name: 'PancakeSwap V3 UNI/WETH (0.05%)', dex: 'PancakeSwap V3', pair: 'UNI/WETH', address: '0xaD198aD5f32cBa24bcafA6E9FfECe312C2dDCD6F', fee: 0.05, kind: 'v3', base: T.UNI, quote: T.WETH },

  // wstETH / WETH (2 pools across 2 DEXes; excludes Camelot V2 stable-curve pair)
  { id: 'univ3_wsteth_weth_001', name: 'Uniswap V3 wstETH/WETH (0.01%)', dex: 'Uniswap V3', pair: 'wstETH/WETH', address: '0x35218a1cbaC5Bbc3E57fd9Bd38219D37571b3537', fee: 0.01, kind: 'v3', base: T.wstETH, quote: T.WETH },
  { id: 'camelot_v3_wsteth_weth', name: 'Camelot V3 wstETH/WETH', dex: 'Camelot V3', pair: 'wstETH/WETH', address: '0xdEb89DE4bb6ecf5BFeD581EB049308b52d9b2Da7', fee: 0.01, kind: 'algebra', base: T.wstETH, quote: T.WETH },

  // Expanded factory-verified Arbitrum V3 pools (PancakeSwap V3 / SushiSwap V3 / Uniswap V3)
  { id: 'pancake_v3_arb_usdc_005', name: 'PancakeSwap V3 ARB/USDC (0.05%)', dex: 'PancakeSwap V3', pair: 'ARB/USDC', address: '0x9fFCA51D23Ac7F7df82da414865Ef1055E5aFCc3', fee: 0.05, kind: 'v3', base: T.ARB, quote: T.USDC },
  { id: 'sushiv3_arb_weth_030', name: 'SushiSwap V3 ARB/WETH (0.30%)', dex: 'SushiSwap V3', pair: 'ARB/WETH', address: '0xB3942c9FFA04efBC1Fa746e146bE7565c76E3dC1', fee: 0.30, kind: 'v3', base: T.ARB, quote: T.WETH },
  { id: 'pancake_v3_link_weth_005', name: 'PancakeSwap V3 LINK/WETH (0.05%)', dex: 'PancakeSwap V3', pair: 'LINK/WETH', address: '0x977f5D9a39049c73bc26eDb3FA15d5f7C0Ac82E9', fee: 0.05, kind: 'v3', base: T.LINK, quote: T.WETH },
  { id: 'pancake_v3_pendle_weth_005', name: 'PancakeSwap V3 PENDLE/WETH (0.05%)', dex: 'PancakeSwap V3', pair: 'PENDLE/WETH', address: '0x042691F78269BA3d6325c945044239758aecC275', fee: 0.05, kind: 'v3', base: T.PENDLE, quote: T.WETH },
  { id: 'sushiv3_usdc_usdt_001', name: 'SushiSwap V3 USDC/USDT (0.01%)', dex: 'SushiSwap V3', pair: 'USDC/USDT', address: '0xD1E1Ac29B31B35646EaBD77163E212b76fE3b6A2', fee: 0.01, kind: 'v3', base: T.USDC, quote: T.USDT },
  { id: 'univ3_usdc_usdce_001', name: 'Uniswap V3 USDC/USDC.e (0.01%)', dex: 'Uniswap V3', pair: 'USDC/USDC.e', address: '0x8e295789c9465487074a65b1ae9Ce0351172393f', fee: 0.01, kind: 'v3', base: T.USDC, quote: T.USDCe },
  { id: 'pancake_v3_usdc_usdce_001', name: 'PancakeSwap V3 USDC/USDC.e (0.01%)', dex: 'PancakeSwap V3', pair: 'USDC/USDC.e', address: '0xE8BB56ee968333bf18f9CBbE8eEef350540F9607', fee: 0.01, kind: 'v3', base: T.USDC, quote: T.USDCe },
  { id: 'univ3_wbtc_usdt_005', name: 'Uniswap V3 WBTC/USDT (0.05%)', dex: 'Uniswap V3', pair: 'WBTC/USDT', address: '0x5969EFddE3cF5C0D9a88aE51E47d721096A97203', fee: 0.05, kind: 'v3', base: T.WBTC, quote: T.USDT },
  { id: 'univ3_wbtc_usdt_030', name: 'Uniswap V3 WBTC/USDT (0.30%)', dex: 'Uniswap V3', pair: 'WBTC/USDT', address: '0x53C6ca2597711Ca7a73b6921fAf4031EeDf71339', fee: 0.30, kind: 'v3', base: T.WBTC, quote: T.USDT },
  { id: 'pancake_v3_wbtc_usdt_005', name: 'PancakeSwap V3 WBTC/USDT (0.05%)', dex: 'PancakeSwap V3', pair: 'WBTC/USDT', address: '0xaA89ba37D1975Ae294974eBB33dB9D4b5324f2F2', fee: 0.05, kind: 'v3', base: T.WBTC, quote: T.USDT },
  { id: 'univ3_usdce_usdt_001', name: 'Uniswap V3 USDC.e/USDT (0.01%)', dex: 'Uniswap V3', pair: 'USDC.e/USDT', address: '0x8c9D230D45d6CfeE39a6680Fb7CB7E8DE7Ea8E71', fee: 0.01, kind: 'v3', base: T.USDCe, quote: T.USDT },
  { id: 'univ3_usdce_usdt_005', name: 'Uniswap V3 USDC.e/USDT (0.05%)', dex: 'Uniswap V3', pair: 'USDC.e/USDT', address: '0x13398E27a21Be1218b6900cbEDF677571df42A48', fee: 0.05, kind: 'v3', base: T.USDCe, quote: T.USDT },
  { id: 'univ3_usdce_dai_005', name: 'Uniswap V3 USDC.e/DAI (0.05%)', dex: 'Uniswap V3', pair: 'USDC.e/DAI', address: '0xd37Af656Abf91c7f548FfFC0133175b5e4d3d5e6', fee: 0.05, kind: 'v3', base: T.USDCe, quote: T.DAI },
  { id: 'univ3_usdt_dai_001', name: 'Uniswap V3 USDT/DAI (0.01%)', dex: 'Uniswap V3', pair: 'USDT/DAI', address: '0x7f580f8A02b759C350E6b8340e7c2d4b8162b6a9', fee: 0.01, kind: 'v3', base: T.USDT, quote: T.DAI },
  { id: 'univ3_usdt_dai_005', name: 'Uniswap V3 USDT/DAI (0.05%)', dex: 'Uniswap V3', pair: 'USDT/DAI', address: '0x6387b0D5853184645cC9a77D6Db133355d2eb4E4', fee: 0.05, kind: 'v3', base: T.USDT, quote: T.DAI },
  { id: 'univ3_arb_usdce_005', name: 'Uniswap V3 ARB/USDC.e (0.05%)', dex: 'Uniswap V3', pair: 'ARB/USDC.e', address: '0xcDa53B1F66614552F834cEeF361A8D12a0B8DaD8', fee: 0.05, kind: 'v3', base: T.ARB, quote: T.USDCe },
  { id: 'univ3_arb_usdt_030', name: 'Uniswap V3 ARB/USDT (0.30%)', dex: 'Uniswap V3', pair: 'ARB/USDT', address: '0x97bca422Ec0Ee4851F2110eA743C1cd0a14835a1', fee: 0.30, kind: 'v3', base: T.ARB, quote: T.USDT },
  { id: 'univ3_arb_usdt_005', name: 'Uniswap V3 ARB/USDT (0.05%)', dex: 'Uniswap V3', pair: 'ARB/USDT', address: '0xB791Ad21ba45C76629003b4A2f04c0d544406e37', fee: 0.05, kind: 'v3', base: T.ARB, quote: T.USDT },
  { id: 'univ3_pendle_usdc_030', name: 'Uniswap V3 PENDLE/USDC (0.30%)', dex: 'Uniswap V3', pair: 'PENDLE/USDC', address: '0xc6aF8e73e2261264eF95466B97B13e03Bd88165e', fee: 0.30, kind: 'v3', base: T.PENDLE, quote: T.USDC },
  { id: 'univ3_pendle_usdt_030', name: 'Uniswap V3 PENDLE/USDT (0.30%)', dex: 'Uniswap V3', pair: 'PENDLE/USDT', address: '0x50e7B9293aeF80c304234e86C84a01bE8401C530', fee: 0.30, kind: 'v3', base: T.PENDLE, quote: T.USDT },
  { id: 'univ3_aave_usdc_030', name: 'Uniswap V3 AAVE/USDC (0.30%)', dex: 'Uniswap V3', pair: 'AAVE/USDC', address: '0x3Db70832F48F8c01ee041671f7BB1cfaA2677584', fee: 0.30, kind: 'v3', base: T.AAVE, quote: T.USDC },
  { id: 'univ3_uni_usdc_030', name: 'Uniswap V3 UNI/USDC (0.30%)', dex: 'Uniswap V3', pair: 'UNI/USDC', address: '0x05477c22a5349ceE601500Da0489daD137fd6BfA', fee: 0.30, kind: 'v3', base: T.UNI, quote: T.USDC },
  { id: 'univ3_link_usdt_030', name: 'Uniswap V3 LINK/USDT (0.30%)', dex: 'Uniswap V3', pair: 'LINK/USDT', address: '0x32A5746bA6826828716Cc1A394bC33301eBC7656', fee: 0.30, kind: 'v3', base: T.LINK, quote: T.USDT },
];

// ---- Monitored Base L2 pools (95 verified on-chain pools across 6 DEXes with >= $5K depth) ----
const BASE_POOL_SPECS: PoolSpec[] = [
  // WETH / USDC (15 pools across 6 DEXes)
  { id: 'base_univ3_weth_usdc_005', name: 'Uniswap V3 WETH/USDC (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0xd0b53D9277642d899DF5C87A3966A349A798F224', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_univ3_weth_usdc_001', name: 'Uniswap V3 WETH/USDC (0.01%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0xb4CB800910B228ED3d0834cF79D697127BBB00e5', fee: 0.01, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_univ3_weth_usdc_030', name: 'Uniswap V3 WETH/USDC (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0x6c561B446416E1A00E8E93E221854d6eA4171372', fee: 0.30, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_univ3_weth_usdc_100', name: 'Uniswap V3 WETH/USDC (1.00%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69', fee: 1.00, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_pancake_v3_weth_usdc_001', name: 'PancakeSwap V3 WETH/USDC (0.01%)', dex: 'PancakeSwap V3', pair: 'WETH/USDC', address: '0x72AB388E2E2F6FaceF59E3C3FA2C4E29011c2D38', fee: 0.01, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_pancake_v3_weth_usdc_005', name: 'PancakeSwap V3 WETH/USDC (0.05%)', dex: 'PancakeSwap V3', pair: 'WETH/USDC', address: '0xB775272E537cc670C65DC852908aD47015244EaF', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_pancake_v3_weth_usdc_025', name: 'PancakeSwap V3 WETH/USDC (0.25%)', dex: 'PancakeSwap V3', pair: 'WETH/USDC', address: '0xE9d76696f8A35e2E2520e3125875C3af23f1E69c', fee: 0.25, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_sushiv3_weth_usdc_005', name: 'SushiSwap V3 WETH/USDC (0.05%)', dex: 'SushiSwap V3', pair: 'WETH/USDC', address: '0x57713F7716e0b0F65ec116912F834E49805480d2', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_sushiv3_weth_usdc_030', name: 'SushiSwap V3 WETH/USDC (0.30%)', dex: 'SushiSwap V3', pair: 'WETH/USDC', address: '0x41595326AaBe6132FC6C7aE71Af087A3A9DBC9F6', fee: 0.30, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_sushiv3_weth_usdc_001', name: 'SushiSwap V3 WETH/USDC (0.01%)', dex: 'SushiSwap V3', pair: 'WETH/USDC', address: '0x482Fe995c4a52bc79271aB29A53591363Ee30a89', fee: 0.01, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_univ2_weth_usdc', name: 'Uniswap V2 WETH/USDC (0.30%)', dex: 'Uniswap V2', pair: 'WETH/USDC', address: '0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C', fee: 0.30, kind: 'v2', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_baseswap_weth_usdc', name: 'BaseSwap V2 WETH/USDC (0.30%)', dex: 'BaseSwap V2', pair: 'WETH/USDC', address: '0xab067c01C7F5734da168C699Ae9d23a4512c9FdB', fee: 0.30, kind: 'v2', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_aero_slip_weth_usdc_ts1', name: 'Aerodrome Slipstream WETH/USDC (CL-1)', dex: 'Aerodrome Slipstream', pair: 'WETH/USDC', address: '0xdbc6998296caA1652A810dc8D3BaF4A8294330f1', fee: 0.01, kind: 'slipstream', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_aero_slip_weth_usdc_ts100', name: 'Aerodrome Slipstream WETH/USDC (CL-100)', dex: 'Aerodrome Slipstream', pair: 'WETH/USDC', address: '0xb2cc224c1c9feE385f8ad6a55b4d94E92359DC59', fee: 0.014, kind: 'slipstream', base: BASE_T.WETH, quote: BASE_T.USDC },
  { id: 'base_aero_slip_weth_usdc_ts2000', name: 'Aerodrome Slipstream WETH/USDC (CL-2000)', dex: 'Aerodrome Slipstream', pair: 'WETH/USDC', address: '0x0652202C4b2D09CB93aEDeFAdc14B36869483a98', fee: 0.043, kind: 'slipstream', base: BASE_T.WETH, quote: BASE_T.USDC },

  // WETH / USDT (3 pools across 2 DEXes)
  { id: 'base_univ3_weth_usdt_030', name: 'Uniswap V3 WETH/USDT (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDT', address: '0xcE1d8c90A5F0ef28fe0F457e5Ad615215899319a', fee: 0.30, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDT },
  { id: 'base_univ3_weth_usdt_005', name: 'Uniswap V3 WETH/USDT (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDT', address: '0xd92E0767473D1E3FF11Ac036f2b1DB90aD0aE55F', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDT },
  { id: 'base_aero_slip_weth_usdt_ts100', name: 'Aerodrome Slipstream WETH/USDT (CL-100)', dex: 'Aerodrome Slipstream', pair: 'WETH/USDT', address: '0x9785eF59E2b499fB741674ecf6fAF912Df7b3C1b', fee: 0.0409, kind: 'slipstream', base: BASE_T.WETH, quote: BASE_T.USDT },

  // WETH / USDbC (3 pools across 2 DEXes)
  { id: 'base_univ3_weth_usdbc_005', name: 'Uniswap V3 WETH/USDbC (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDbC', address: '0x4C36388bE6F416A29C8d8Eee81C771cE6bE14B18', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDbC },
  { id: 'base_univ3_weth_usdbc_030', name: 'Uniswap V3 WETH/USDbC (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDbC', address: '0x3DdF264AC95D19e81f8c25f4c300C4e59e424d43', fee: 0.30, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDbC },
  { id: 'base_baseswap_weth_usdbc', name: 'BaseSwap V2 WETH/USDbC (0.30%)', dex: 'BaseSwap V2', pair: 'WETH/USDbC', address: '0x41d160033C222E6f3722EC97379867324567d883', fee: 0.30, kind: 'v2', base: BASE_T.WETH, quote: BASE_T.USDbC },

  // cbETH / WETH (8 pools across 5 DEXes)
  { id: 'base_univ3_cbeth_weth_001', name: 'Uniswap V3 cbETH/WETH (0.01%)', dex: 'Uniswap V3', pair: 'cbETH/WETH', address: '0xA9DaFa443a02FBc907Cb0093276B3E6F4ef02A46', fee: 0.01, kind: 'v3', base: BASE_T.cbETH, quote: BASE_T.WETH },
  { id: 'base_univ3_cbeth_weth_005', name: 'Uniswap V3 cbETH/WETH (0.05%)', dex: 'Uniswap V3', pair: 'cbETH/WETH', address: '0x10648BA41B8565907Cfa1496765fA4D95390aa0d', fee: 0.05, kind: 'v3', base: BASE_T.cbETH, quote: BASE_T.WETH },
  { id: 'base_univ3_cbeth_weth_030', name: 'Uniswap V3 cbETH/WETH (0.30%)', dex: 'Uniswap V3', pair: 'cbETH/WETH', address: '0x7B9636266734270DE5bE02544c04E27046903ff8', fee: 0.30, kind: 'v3', base: BASE_T.cbETH, quote: BASE_T.WETH },
  { id: 'base_pancake_v3_cbeth_weth_001', name: 'PancakeSwap V3 cbETH/WETH (0.01%)', dex: 'PancakeSwap V3', pair: 'cbETH/WETH', address: '0x257FCbAE4Ac6B26A02E4FC5e1a11e4174B5ce395', fee: 0.01, kind: 'v3', base: BASE_T.cbETH, quote: BASE_T.WETH },
  { id: 'base_pancake_v3_cbeth_weth_005', name: 'PancakeSwap V3 cbETH/WETH (0.05%)', dex: 'PancakeSwap V3', pair: 'cbETH/WETH', address: '0xc0efC182479319ff258EcA420e2647cD82D3790c', fee: 0.05, kind: 'v3', base: BASE_T.cbETH, quote: BASE_T.WETH },
  { id: 'base_sushiv3_cbeth_weth_005', name: 'SushiSwap V3 cbETH/WETH (0.05%)', dex: 'SushiSwap V3', pair: 'cbETH/WETH', address: '0xb81B9Aef36c76d740850C31C45697c83468DCB54', fee: 0.05, kind: 'v3', base: BASE_T.cbETH, quote: BASE_T.WETH },
  { id: 'base_baseswap_cbeth_weth', name: 'BaseSwap V2 cbETH/WETH (0.30%)', dex: 'BaseSwap V2', pair: 'cbETH/WETH', address: '0x07CFA5Df24fB17486AF0CBf6C910F24253a674D3', fee: 0.30, kind: 'v2', base: BASE_T.cbETH, quote: BASE_T.WETH },
  { id: 'base_aero_slip_cbeth_weth_ts1', name: 'Aerodrome Slipstream cbETH/WETH (CL-1)', dex: 'Aerodrome Slipstream', pair: 'cbETH/WETH', address: '0x47cA96Ea59C13F72745928887f84C9F52C3D7348', fee: 0.01, kind: 'slipstream', base: BASE_T.cbETH, quote: BASE_T.WETH },

  // cbETH / USDC (2 pools across 1 DEX)
  { id: 'base_univ3_cbeth_usdc_100', name: 'Uniswap V3 cbETH/USDC (1.00%)', dex: 'Uniswap V3', pair: 'cbETH/USDC', address: '0xe65ef07833bE37659919Bbe7eC366a2EC889c884', fee: 1.00, kind: 'v3', base: BASE_T.cbETH, quote: BASE_T.USDC },
  { id: 'base_univ3_cbeth_usdc_030', name: 'Uniswap V3 cbETH/USDC (0.30%)', dex: 'Uniswap V3', pair: 'cbETH/USDC', address: '0xa8E4C55D6dAf4D768aeBa2378c1AD94c112Ef48a', fee: 0.30, kind: 'v3', base: BASE_T.cbETH, quote: BASE_T.USDC },

  // wstETH / WETH (3 pools across 2 DEXes)
  { id: 'base_univ3_wsteth_weth_001', name: 'Uniswap V3 wstETH/WETH (0.01%)', dex: 'Uniswap V3', pair: 'wstETH/WETH', address: '0x20E068D76f9E90b90604500B84c7e19dCB923e7e', fee: 0.01, kind: 'v3', base: BASE_T.wstETH, quote: BASE_T.WETH },
  { id: 'base_univ3_wsteth_weth_005', name: 'Uniswap V3 wstETH/WETH (0.05%)', dex: 'Uniswap V3', pair: 'wstETH/WETH', address: '0x6f4482cBF7b43599078fcb012732e20480015644', fee: 0.05, kind: 'v3', base: BASE_T.wstETH, quote: BASE_T.WETH },
  { id: 'base_aero_slip_wsteth_weth_ts1', name: 'Aerodrome Slipstream wstETH/WETH (CL-1)', dex: 'Aerodrome Slipstream', pair: 'wstETH/WETH', address: '0x861A2922bE165a5Bd41b1E482B49216b465e1B5F', fee: 0.009, kind: 'slipstream', base: BASE_T.wstETH, quote: BASE_T.WETH },

  // ezETH / WETH (2 pools across 2 DEXes)
  { id: 'base_univ3_ezeth_weth_005', name: 'Uniswap V3 ezETH/WETH (0.05%)', dex: 'Uniswap V3', pair: 'ezETH/WETH', address: '0x58603091b4Da10685e114d85E330Cab36e655627', fee: 0.05, kind: 'v3', base: BASE_T.ezETH, quote: BASE_T.WETH },
  { id: 'base_pancake_v3_ezeth_weth_001', name: 'PancakeSwap V3 ezETH/WETH (0.01%)', dex: 'PancakeSwap V3', pair: 'ezETH/WETH', address: '0x4c98E9C2439C0d4621C62FeE2fED6D042fa8c570', fee: 0.01, kind: 'v3', base: BASE_T.ezETH, quote: BASE_T.WETH },

  // cbBTC / WETH (8 pools across 3 DEXes)
  { id: 'base_univ3_cbbtc_weth_005', name: 'Uniswap V3 cbBTC/WETH (0.05%)', dex: 'Uniswap V3', pair: 'cbBTC/WETH', address: '0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1', fee: 0.05, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.WETH },
  { id: 'base_univ3_cbbtc_weth_030', name: 'Uniswap V3 cbBTC/WETH (0.30%)', dex: 'Uniswap V3', pair: 'cbBTC/WETH', address: '0x8c7080564B5A792A33Ef2FD473fbA6364d5495e5', fee: 0.30, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.WETH },
  { id: 'base_univ3_cbbtc_weth_100', name: 'Uniswap V3 cbBTC/WETH (1.00%)', dex: 'Uniswap V3', pair: 'cbBTC/WETH', address: '0x233571eAE953D9d59eEFc0769F71Dc19287DDCCB', fee: 1.00, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.WETH },
  { id: 'base_pancake_v3_cbbtc_weth_001', name: 'PancakeSwap V3 cbBTC/WETH (0.01%)', dex: 'PancakeSwap V3', pair: 'cbBTC/WETH', address: '0xC211e1f853A898Bd1302385CCdE55f33a8C4B3f3', fee: 0.01, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.WETH },
  { id: 'base_pancake_v3_cbbtc_weth_005', name: 'PancakeSwap V3 cbBTC/WETH (0.05%)', dex: 'PancakeSwap V3', pair: 'cbBTC/WETH', address: '0xd974D59e30054cf1aBedeD0C9947B0D8Baf90029', fee: 0.05, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.WETH },
  { id: 'base_pancake_v3_cbbtc_weth_025', name: 'PancakeSwap V3 cbBTC/WETH (0.25%)', dex: 'PancakeSwap V3', pair: 'cbBTC/WETH', address: '0x5b3613ef9a535b48e82e2800aCb77053DFeC93b1', fee: 0.25, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.WETH },
  { id: 'base_aero_slip_cbbtc_weth_ts1', name: 'Aerodrome Slipstream cbBTC/WETH (CL-1)', dex: 'Aerodrome Slipstream', pair: 'cbBTC/WETH', address: '0x22AEe3699b6A0fEd71490C103Bd4E5f3309891D5', fee: 0.01, kind: 'slipstream', base: BASE_T.cbBTC, quote: BASE_T.WETH },
  { id: 'base_aero_slip_cbbtc_weth_ts100', name: 'Aerodrome Slipstream cbBTC/WETH (CL-100)', dex: 'Aerodrome Slipstream', pair: 'cbBTC/WETH', address: '0x70aCDF2Ad0bf2402C957154f944c19Ef4e1cbAE1', fee: 0.25, kind: 'slipstream', base: BASE_T.cbBTC, quote: BASE_T.WETH },

  // cbBTC / USDC (8 pools across 3 DEXes)
  { id: 'base_univ3_cbbtc_usdc_005', name: 'Uniswap V3 cbBTC/USDC (0.05%)', dex: 'Uniswap V3', pair: 'cbBTC/USDC', address: '0xfBB6Eed8e7aa03B138556eeDaF5D271A5E1e43ef', fee: 0.05, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.USDC },
  { id: 'base_univ3_cbbtc_usdc_030', name: 'Uniswap V3 cbBTC/USDC (0.30%)', dex: 'Uniswap V3', pair: 'cbBTC/USDC', address: '0xeC558e484cC9f2210714E345298fdc53B253c27D', fee: 0.30, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.USDC },
  { id: 'base_univ3_cbbtc_usdc_100', name: 'Uniswap V3 cbBTC/USDC (1.00%)', dex: 'Uniswap V3', pair: 'cbBTC/USDC', address: '0x3e7586D52A9D07F8611B8ecf6CCc8a689c34a659', fee: 1.00, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.USDC },
  { id: 'base_pancake_v3_cbbtc_usdc_001', name: 'PancakeSwap V3 cbBTC/USDC (0.01%)', dex: 'PancakeSwap V3', pair: 'cbBTC/USDC', address: '0xb94b22332ABf5f89877A14Cc88f2aBC48c34B3Df', fee: 0.01, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.USDC },
  { id: 'base_pancake_v3_cbbtc_usdc_005', name: 'PancakeSwap V3 cbBTC/USDC (0.05%)', dex: 'PancakeSwap V3', pair: 'cbBTC/USDC', address: '0x26e263efdc91f0d3279E2Ec2Bd58A7Ca5C2fCE62', fee: 0.05, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.USDC },
  { id: 'base_pancake_v3_cbbtc_usdc_025', name: 'PancakeSwap V3 cbBTC/USDC (0.25%)', dex: 'PancakeSwap V3', pair: 'cbBTC/USDC', address: '0x748Bb91Fc5F4200302D9A79185bC161260a1B461', fee: 0.25, kind: 'v3', base: BASE_T.cbBTC, quote: BASE_T.USDC },
  { id: 'base_aero_slip_cbbtc_usdc_ts100', name: 'Aerodrome Slipstream cbBTC/USDC (CL-100)', dex: 'Aerodrome Slipstream', pair: 'cbBTC/USDC', address: '0x4e962BB3889Bf030368F56810A9c96B83CB3E778', fee: 0.05, kind: 'slipstream', base: BASE_T.cbBTC, quote: BASE_T.USDC },
  { id: 'base_aero_slip_cbbtc_usdc_ts2000', name: 'Aerodrome Slipstream cbBTC/USDC (CL-2000)', dex: 'Aerodrome Slipstream', pair: 'cbBTC/USDC', address: '0x3e66e55e97ce60096f74b7C475e8249f2D31a9fb', fee: 0.033, kind: 'slipstream', base: BASE_T.cbBTC, quote: BASE_T.USDC },

  // AERO / USDC & AERO / WETH (8 pools across 3 DEXes)
  { id: 'base_univ3_aero_usdc_005', name: 'Uniswap V3 AERO/USDC (0.05%)', dex: 'Uniswap V3', pair: 'AERO/USDC', address: '0xE5B5f522E98B5a2baAe212d4dA66b865B781DB97', fee: 0.05, kind: 'v3', base: BASE_T.AERO, quote: BASE_T.USDC },
  { id: 'base_univ3_aero_usdc_030', name: 'Uniswap V3 AERO/USDC (0.30%)', dex: 'Uniswap V3', pair: 'AERO/USDC', address: '0x2426DC0A657BD481ab48f86C1616431905901238', fee: 0.30, kind: 'v3', base: BASE_T.AERO, quote: BASE_T.USDC },
  { id: 'base_aero_slip_aero_usdc_ts200', name: 'Aerodrome Slipstream AERO/USDC (CL-200)', dex: 'Aerodrome Slipstream', pair: 'AERO/USDC', address: '0xCCd9cC53b63662088c738B8BC06E9078Fb8D9ad4', fee: 0.30, kind: 'slipstream', base: BASE_T.AERO, quote: BASE_T.USDC },
  { id: 'base_aero_slip_aero_usdc_ts2000', name: 'Aerodrome Slipstream AERO/USDC (CL-2000)', dex: 'Aerodrome Slipstream', pair: 'AERO/USDC', address: '0xBE00fF35AF70E8415D0eB605a286D8A45466A4c1', fee: 1.00, kind: 'slipstream', base: BASE_T.AERO, quote: BASE_T.USDC },
  { id: 'base_univ3_aero_weth_030', name: 'Uniswap V3 AERO/WETH (0.30%)', dex: 'Uniswap V3', pair: 'AERO/WETH', address: '0x3d5D143381916280ff91407FeBEB52f2b60f33Cf', fee: 0.30, kind: 'v3', base: BASE_T.AERO, quote: BASE_T.WETH },
  { id: 'base_univ3_aero_weth_100', name: 'Uniswap V3 AERO/WETH (1.00%)', dex: 'Uniswap V3', pair: 'AERO/WETH', address: '0x0D5959a52E7004b601f0bE70618D01aC3cDce976', fee: 1.00, kind: 'v3', base: BASE_T.AERO, quote: BASE_T.WETH },
  { id: 'base_pancake_v3_aero_weth_005', name: 'PancakeSwap V3 AERO/WETH (0.05%)', dex: 'PancakeSwap V3', pair: 'AERO/WETH', address: '0x20CB8f872ae894F7c9e32e621C186e5AFCe82Fd0', fee: 0.05, kind: 'v3', base: BASE_T.AERO, quote: BASE_T.WETH },
  { id: 'base_aero_slip_aero_weth_ts200', name: 'Aerodrome Slipstream AERO/WETH (CL-200)', dex: 'Aerodrome Slipstream', pair: 'AERO/WETH', address: '0x82321f3BEB69f503380D6B233857d5C43562e2D0', fee: 0.32, kind: 'slipstream', base: BASE_T.AERO, quote: BASE_T.WETH },

  // DEGEN / WETH (3 pools across 2 DEXes)
  { id: 'base_univ3_degen_weth_030', name: 'Uniswap V3 DEGEN/WETH (0.30%)', dex: 'Uniswap V3', pair: 'DEGEN/WETH', address: '0xc9034c3E7F58003E6ae0C8438e7c8f4598d5ACAA', fee: 0.30, kind: 'v3', base: BASE_T.DEGEN, quote: BASE_T.WETH },
  { id: 'base_univ3_degen_weth_100', name: 'Uniswap V3 DEGEN/WETH (1.00%)', dex: 'Uniswap V3', pair: 'DEGEN/WETH', address: '0x0cA6485b7e9cF814A3Fd09d81672B07323535b64', fee: 1.00, kind: 'v3', base: BASE_T.DEGEN, quote: BASE_T.WETH },
  { id: 'base_aero_slip_degen_weth_ts200', name: 'Aerodrome Slipstream DEGEN/WETH (CL-200)', dex: 'Aerodrome Slipstream', pair: 'DEGEN/WETH', address: '0xaFB62448929664Bfccb0aAe22f232520e765bA88', fee: 0.24, kind: 'slipstream', base: BASE_T.DEGEN, quote: BASE_T.WETH },

  // VIRTUAL / WETH & VIRTUAL / USDC (8 pools across 4 DEXes)
  { id: 'base_univ3_virtual_weth_005', name: 'Uniswap V3 VIRTUAL/WETH (0.05%)', dex: 'Uniswap V3', pair: 'VIRTUAL/WETH', address: '0x9c087Eb773291e50CF6c6a90ef0F4500e349B903', fee: 0.05, kind: 'v3', base: BASE_T.VIRTUAL, quote: BASE_T.WETH },
  { id: 'base_univ3_virtual_weth_030', name: 'Uniswap V3 VIRTUAL/WETH (0.30%)', dex: 'Uniswap V3', pair: 'VIRTUAL/WETH', address: '0x1D4daB3f27C7F656b6323C1D6Ef713b48A8f72F1', fee: 0.30, kind: 'v3', base: BASE_T.VIRTUAL, quote: BASE_T.WETH },
  { id: 'base_univ3_virtual_weth_100', name: 'Uniswap V3 VIRTUAL/WETH (1.00%)', dex: 'Uniswap V3', pair: 'VIRTUAL/WETH', address: '0x8e0A7d4018fb2674346d5742055174f899Fe1826', fee: 1.00, kind: 'v3', base: BASE_T.VIRTUAL, quote: BASE_T.WETH },
  { id: 'base_univ2_virtual_weth', name: 'Uniswap V2 VIRTUAL/WETH (0.30%)', dex: 'Uniswap V2', pair: 'VIRTUAL/WETH', address: '0xE31c372a7Af875b3B5E0F3713B17ef51556da667', fee: 0.30, kind: 'v2', base: BASE_T.VIRTUAL, quote: BASE_T.WETH },
  { id: 'base_aero_slip_virtual_weth_ts200', name: 'Aerodrome Slipstream VIRTUAL/WETH (CL-200)', dex: 'Aerodrome Slipstream', pair: 'VIRTUAL/WETH', address: '0xC200F21EfE67c7F41B81A854c26F9cdA80593065', fee: 0.06, kind: 'slipstream', base: BASE_T.VIRTUAL, quote: BASE_T.WETH },
  { id: 'base_aero_slip_virtual_weth_ts100', name: 'Aerodrome Slipstream VIRTUAL/WETH (CL-100)', dex: 'Aerodrome Slipstream', pair: 'VIRTUAL/WETH', address: '0x3f0296BF652e19bca772EC3dF08b32732F93014A', fee: 0.0146, kind: 'slipstream', base: BASE_T.VIRTUAL, quote: BASE_T.WETH },
  { id: 'base_univ3_virtual_usdc_030', name: 'Uniswap V3 VIRTUAL/USDC (0.30%)', dex: 'Uniswap V3', pair: 'VIRTUAL/USDC', address: '0x529d2863a1521d0b57db028168fdE2E97120017C', fee: 0.30, kind: 'v3', base: BASE_T.VIRTUAL, quote: BASE_T.USDC },
  { id: 'base_pancake_v3_virtual_usdc_005', name: 'PancakeSwap V3 VIRTUAL/USDC (0.05%)', dex: 'PancakeSwap V3', pair: 'VIRTUAL/USDC', address: '0x7CB770D0513c30e0CB45E4899e4a2CbEEd6F9830', fee: 0.05, kind: 'v3', base: BASE_T.VIRTUAL, quote: BASE_T.USDC },

  // MORPHO / WETH (4 pools across 2 DEXes)
  { id: 'base_univ3_morpho_weth_030', name: 'Uniswap V3 MORPHO/WETH (0.30%)', dex: 'Uniswap V3', pair: 'MORPHO/WETH', address: '0x2F42Df4aF5312B492E9d7F7b2110D9c7bf2D9e4F', fee: 0.30, kind: 'v3', base: BASE_T.MORPHO, quote: BASE_T.WETH },
  { id: 'base_univ3_morpho_weth_100', name: 'Uniswap V3 MORPHO/WETH (1.00%)', dex: 'Uniswap V3', pair: 'MORPHO/WETH', address: '0x3444bF60B93BD30f701601356Ac136aD6a9b7A79', fee: 1.00, kind: 'v3', base: BASE_T.MORPHO, quote: BASE_T.WETH },
  { id: 'base_univ3_morpho_weth_001', name: 'Uniswap V3 MORPHO/WETH (0.01%)', dex: 'Uniswap V3', pair: 'MORPHO/WETH', address: '0x9EaaaBE267A8B3c1bA081A2866Fa9Ea22F84680d', fee: 0.01, kind: 'v3', base: BASE_T.MORPHO, quote: BASE_T.WETH },
  { id: 'base_aero_slip_morpho_weth_ts200', name: 'Aerodrome Slipstream MORPHO/WETH (CL-200)', dex: 'Aerodrome Slipstream', pair: 'MORPHO/WETH', address: '0xB5F0b4aE66C14F7EFaA9aA1468E8FC536A3E288c', fee: 0.3034, kind: 'slipstream', base: BASE_T.MORPHO, quote: BASE_T.WETH },

  // Stablecoin pairs: USDC/USDT, USDC/DAI, USDC/USDbC (20 pools across 4 DEXes)
  { id: 'base_univ3_usdc_usdt_001', name: 'Uniswap V3 USDC/USDT (0.01%)', dex: 'Uniswap V3', pair: 'USDC/USDT', address: '0xD56da2B74bA826f19015E6B7Dd9Dae1903E85DA1', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDT },
  { id: 'base_univ3_usdc_usdt_005', name: 'Uniswap V3 USDC/USDT (0.05%)', dex: 'Uniswap V3', pair: 'USDC/USDT', address: '0xB7F084c7f7f1c680d08780e2b2ef4F2133DB0Df8', fee: 0.05, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDT },
  { id: 'base_univ3_usdc_usdt_030', name: 'Uniswap V3 USDC/USDT (0.30%)', dex: 'Uniswap V3', pair: 'USDC/USDT', address: '0x82ccD0de0293CCBD2184901a69fdc2dd8073320E', fee: 0.30, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDT },
  { id: 'base_pancake_v3_usdc_usdt_001', name: 'PancakeSwap V3 USDC/USDT (0.01%)', dex: 'PancakeSwap V3', pair: 'USDC/USDT', address: '0x5f07bb9fEE6062e9D09A52E6d587c64bAD6bA706', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDT },
  { id: 'base_pancake_v3_usdc_usdt_005', name: 'PancakeSwap V3 USDC/USDT (0.05%)', dex: 'PancakeSwap V3', pair: 'USDC/USDT', address: '0x2dB0FFf9f1aFcEf3A77e673DfBA9883C036ebD53', fee: 0.05, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDT },
  { id: 'base_pancake_v3_usdc_usdt_100', name: 'PancakeSwap V3 USDC/USDT (1.00%)', dex: 'PancakeSwap V3', pair: 'USDC/USDT', address: '0x0BFFF3A8f90FBdd39a5dDD1eE9eb2F9a11E79b86', fee: 1.00, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDT },
  { id: 'base_sushiv3_usdc_usdt_001', name: 'SushiSwap V3 USDC/USDT (0.01%)', dex: 'SushiSwap V3', pair: 'USDC/USDT', address: '0xfeAf8296CE905884a528DA784A52964d9F614F00', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDT },
  { id: 'base_aero_slip_usdc_usdt_ts1', name: 'Aerodrome Slipstream USDC/USDT (CL-1)', dex: 'Aerodrome Slipstream', pair: 'USDC/USDT', address: '0xa41Bc0AFfbA7Fd420d186b84899d7ab2aC57fcD1', fee: 0.0008, kind: 'slipstream', base: BASE_T.USDC, quote: BASE_T.USDT },

  { id: 'base_univ3_usdc_dai_005', name: 'Uniswap V3 USDC/DAI (0.05%)', dex: 'Uniswap V3', pair: 'USDC/DAI', address: '0x19a8B1542B807Cd6a76fcbb5fF5F53c6169F36d7', fee: 0.05, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.DAI },
  { id: 'base_univ3_usdc_dai_001', name: 'Uniswap V3 USDC/DAI (0.01%)', dex: 'Uniswap V3', pair: 'USDC/DAI', address: '0xC18F50d6A832f12F6DcAaeEe8D0c87A65B96787E', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.DAI },
  { id: 'base_pancake_v3_usdc_dai_001', name: 'PancakeSwap V3 USDC/DAI (0.01%)', dex: 'PancakeSwap V3', pair: 'USDC/DAI', address: '0x345825A980BD94e1480bC4f20FE4e3DAE2F23Dd3', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.DAI },
  { id: 'base_pancake_v3_usdc_dai_005', name: 'PancakeSwap V3 USDC/DAI (0.05%)', dex: 'PancakeSwap V3', pair: 'USDC/DAI', address: '0x486D1e5e5F97F44ea8dB217598c1e61e21f54084', fee: 0.05, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.DAI },
  { id: 'base_sushiv3_usdc_dai_001', name: 'SushiSwap V3 USDC/DAI (0.01%)', dex: 'SushiSwap V3', pair: 'USDC/DAI', address: '0x3BD740dc10864f35001AAB7771C56a85C48c901B', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.DAI },

  { id: 'base_univ3_usdc_usdbc_001', name: 'Uniswap V3 USDC/USDbC (0.01%)', dex: 'Uniswap V3', pair: 'USDC/USDbC', address: '0x06959273E9A65433De71F5A452D529544E07dDD0', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDbC },
  { id: 'base_univ3_usdc_usdbc_005', name: 'Uniswap V3 USDC/USDbC (0.05%)', dex: 'Uniswap V3', pair: 'USDC/USDbC', address: '0x92722287D2819012dD8EC07b4e426AC00Dd11103', fee: 0.05, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDbC },
  { id: 'base_pancake_v3_usdc_usdbc_001', name: 'PancakeSwap V3 USDC/USDbC (0.01%)', dex: 'PancakeSwap V3', pair: 'USDC/USDbC', address: '0x29Ed55B18Af0Add137952CB3E29FB77B32fCE426', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDbC },
  { id: 'base_pancake_v3_usdc_usdbc_025', name: 'PancakeSwap V3 USDC/USDbC (0.25%)', dex: 'PancakeSwap V3', pair: 'USDC/USDbC', address: '0xa002b68292131d2f70518d7dFf63bd9D99d189F2', fee: 0.25, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDbC },
  { id: 'base_sushiv3_usdc_usdbc_001', name: 'SushiSwap V3 USDC/USDbC (0.01%)', dex: 'SushiSwap V3', pair: 'USDC/USDbC', address: '0xD3f749adA01aF29a713545Fb6b8E782B49A75a20', fee: 0.01, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDbC },
  { id: 'base_sushiv3_usdc_usdbc_005', name: 'SushiSwap V3 USDC/USDbC (0.05%)', dex: 'SushiSwap V3', pair: 'USDC/USDbC', address: '0x27D8d938d9cfb97A85CA70DefA4D44762A2e1884', fee: 0.05, kind: 'v3', base: BASE_T.USDC, quote: BASE_T.USDbC },
  { id: 'base_aero_slip_usdc_usdbc_ts1', name: 'Aerodrome Slipstream USDC/USDbC (CL-1)', dex: 'Aerodrome Slipstream', pair: 'USDC/USDbC', address: '0x98c7A2338336d2d354663246F64676009c7bDa97', fee: 0.01, kind: 'slipstream', base: BASE_T.USDC, quote: BASE_T.USDbC },

  // Expanded factory-verified Base V3 pools (PancakeSwap V3 / SushiSwap V3 / Uniswap V3)
  { id: 'base_pancake_v3_weth_usdt_001', name: 'PancakeSwap V3 WETH/USDT (0.01%)', dex: 'PancakeSwap V3', pair: 'WETH/USDT', address: '0x526d54cD4FAc2e6B2ddCb6bC98b9292603061f85', fee: 0.01, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDT },
  { id: 'base_pancake_v3_weth_usdbc_005', name: 'PancakeSwap V3 WETH/USDbC (0.05%)', dex: 'PancakeSwap V3', pair: 'WETH/USDbC', address: '0xe58b73fF901325b8b2056B29712C50237242F520', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDbC },
  { id: 'base_sushiv3_weth_usdbc_005', name: 'SushiSwap V3 WETH/USDbC (0.05%)', dex: 'SushiSwap V3', pair: 'WETH/USDbC', address: '0x22ca6d83aB887A535ae1C6011cc36eA9D1255C31', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.USDbC },
  { id: 'base_univ3_usdbc_dai_001', name: 'Uniswap V3 USDbC/DAI (0.01%)', dex: 'Uniswap V3', pair: 'USDbC/DAI', address: '0x22F9623817F152148B4E080E98Af66FBE9C5AdF8', fee: 0.01, kind: 'v3', base: BASE_T.USDbC, quote: BASE_T.DAI },
  { id: 'base_pancake_v3_usdbc_dai_001', name: 'PancakeSwap V3 USDbC/DAI (0.01%)', dex: 'PancakeSwap V3', pair: 'USDbC/DAI', address: '0xe4eFf19c7AcE186ba39fD3eD639B2D34171f7efF', fee: 0.01, kind: 'v3', base: BASE_T.USDbC, quote: BASE_T.DAI },
  { id: 'base_univ3_weth_dai_005', name: 'Uniswap V3 WETH/DAI (0.05%)', dex: 'Uniswap V3', pair: 'WETH/DAI', address: '0x93e8542E6CA0eFFfb9D57a270b76712b968A38f5', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.DAI },
  { id: 'base_pancake_v3_weth_dai_005', name: 'PancakeSwap V3 WETH/DAI (0.05%)', dex: 'PancakeSwap V3', pair: 'WETH/DAI', address: '0x9BFa331679b307Cf358438F45f6413a205FD3EBf', fee: 0.05, kind: 'v3', base: BASE_T.WETH, quote: BASE_T.DAI },
  { id: 'base_univ3_usdt_dai_001', name: 'Uniswap V3 USDT/DAI (0.01%)', dex: 'Uniswap V3', pair: 'USDT/DAI', address: '0xd64e7bF24eE5CC10B5Ab92525D256300Ad3FB81E', fee: 0.01, kind: 'v3', base: BASE_T.USDT, quote: BASE_T.DAI },
];

// ---- Monitored Optimism Mainnet pools (verified on-chain via factory getPool with >= $5K depth) ----
const OP_POOL_SPECS: PoolSpec[] = [
  // WETH / USDC (4 pools across 3 DEXes)
  { id: 'op_univ3_weth_usdc_005', name: 'Uniswap V3 WETH/USDC (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0x1fb3cf6e48F1E7B10213E7b6d87D4c073C7Fdb7b', fee: 0.05, kind: 'v3', base: OP_T.WETH, quote: OP_T.USDC },
  { id: 'op_univ3_weth_usdc_030', name: 'Uniswap V3 WETH/USDC (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0xc1738D90E2E26C35784A0d3E3d8A9f795074bcA4', fee: 0.30, kind: 'v3', base: OP_T.WETH, quote: OP_T.USDC },
  { id: 'op_sushiv3_weth_usdc_005', name: 'SushiSwap V3 WETH/USDC (0.05%)', dex: 'SushiSwap V3', pair: 'WETH/USDC', address: '0x146EDa2f1D35efb5eEf5703aCeC701c68E1503d8', fee: 0.05, kind: 'v3', base: OP_T.WETH, quote: OP_T.USDC },
  { id: 'op_velo_slip_weth_usdc_ts100', name: 'Velodrome Slipstream WETH/USDC (CL-100)', dex: 'Velodrome Slipstream', pair: 'WETH/USDC', address: '0x478946BcD4a5a22b316470F5486fAfb928C0bA25', fee: 0.035, kind: 'slipstream', base: OP_T.WETH, quote: OP_T.USDC },

  // WETH / USDC.e (2 pools)
  { id: 'op_univ3_weth_usdce_005', name: 'Uniswap V3 WETH/USDC.e (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDC.e', address: '0x85149247691df622eaF1a8Bd0CaFd40BC45154a9', fee: 0.05, kind: 'v3', base: OP_T.WETH, quote: OP_T.USDCe },
  { id: 'op_univ3_weth_usdce_030', name: 'Uniswap V3 WETH/USDC.e (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDC.e', address: '0xB589969D38CE76D3d7AA319De7133bC9755fD840', fee: 0.30, kind: 'v3', base: OP_T.WETH, quote: OP_T.USDCe },

  // WETH / USDT (4 pools across 3 DEXes)
  { id: 'op_univ3_weth_usdt_005', name: 'Uniswap V3 WETH/USDT (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDT', address: '0xc858A329Bf053BE78D6239C4A4343B8FbD21472b', fee: 0.05, kind: 'v3', base: OP_T.WETH, quote: OP_T.USDT },
  { id: 'op_univ3_weth_usdt_030', name: 'Uniswap V3 WETH/USDT (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDT', address: '0xdd0c6bAe8Ad5998c358b823df15A2A4181Da1b80', fee: 0.30, kind: 'v3', base: OP_T.WETH, quote: OP_T.USDT },
  { id: 'op_sushiv3_weth_usdt_030', name: 'SushiSwap V3 WETH/USDT (0.30%)', dex: 'SushiSwap V3', pair: 'WETH/USDT', address: '0x806919878D049c8d6E1AF3B4a66FB1B05d1b2315', fee: 0.30, kind: 'v3', base: OP_T.WETH, quote: OP_T.USDT },

  // WETH / DAI (2 pools)
  { id: 'op_univ3_weth_dai_005', name: 'Uniswap V3 WETH/DAI (0.05%)', dex: 'Uniswap V3', pair: 'WETH/DAI', address: '0x95d9D28606ee55De7667f0F176eBfc3215CFD9C0', fee: 0.05, kind: 'v3', base: OP_T.WETH, quote: OP_T.DAI },
  { id: 'op_univ3_weth_dai_030', name: 'Uniswap V3 WETH/DAI (0.30%)', dex: 'Uniswap V3', pair: 'WETH/DAI', address: '0x03aF20bDAaFfB4cC0A521796a223f7D85e2aAc31', fee: 0.30, kind: 'v3', base: OP_T.WETH, quote: OP_T.DAI },

  // OP / WETH (3 pools across 2 DEXes)
  { id: 'op_univ3_op_weth_005', name: 'Uniswap V3 OP/WETH (0.05%)', dex: 'Uniswap V3', pair: 'OP/WETH', address: '0xFC1f3296458F9b2a27a0B91dd7681C4020E09D05', fee: 0.05, kind: 'v3', base: OP_T.OP, quote: OP_T.WETH },
  { id: 'op_univ3_op_weth_030', name: 'Uniswap V3 OP/WETH (0.30%)', dex: 'Uniswap V3', pair: 'OP/WETH', address: '0x68F5C0A2DE713a54991E01858Fd27a3832401849', fee: 0.30, kind: 'v3', base: OP_T.OP, quote: OP_T.WETH },
  { id: 'op_velo_slip_op_weth_ts50', name: 'Velodrome Slipstream OP/WETH (CL-50)', dex: 'Velodrome Slipstream', pair: 'OP/WETH', address: '0x84a67CD00EB244edCa2288346ADD251A783243c8', fee: 0.04, kind: 'slipstream', base: OP_T.OP, quote: OP_T.WETH },

  // WBTC / WETH (4 pools across 3 DEXes)
  { id: 'op_univ3_wbtc_weth_005', name: 'Uniswap V3 WBTC/WETH (0.05%)', dex: 'Uniswap V3', pair: 'WBTC/WETH', address: '0x85C31FFA3706d1cce9d525a00f1C7D4A2911754c', fee: 0.05, kind: 'v3', base: OP_T.WBTC, quote: OP_T.WETH },
  { id: 'op_univ3_wbtc_weth_030', name: 'Uniswap V3 WBTC/WETH (0.30%)', dex: 'Uniswap V3', pair: 'WBTC/WETH', address: '0x73B14a78a0D396C521f954532d43fd5fFe385216', fee: 0.30, kind: 'v3', base: OP_T.WBTC, quote: OP_T.WETH },
  { id: 'op_sushiv3_wbtc_weth_030', name: 'SushiSwap V3 WBTC/WETH (0.30%)', dex: 'SushiSwap V3', pair: 'WBTC/WETH', address: '0x689A850F62B41d89B5e5C3465Cd291374B215813', fee: 0.30, kind: 'v3', base: OP_T.WBTC, quote: OP_T.WETH },
  { id: 'op_velo_slip_wbtc_weth_ts100', name: 'Velodrome Slipstream WBTC/WETH (CL-100)', dex: 'Velodrome Slipstream', pair: 'WBTC/WETH', address: '0x319C0DD36284ac24A6b2beE73929f699b9f48c38', fee: 0.032, kind: 'slipstream', base: OP_T.WBTC, quote: OP_T.WETH },

  // WBTC / USDC (2 pools)
  { id: 'op_univ3_wbtc_usdc_005', name: 'Uniswap V3 WBTC/USDC (0.05%)', dex: 'Uniswap V3', pair: 'WBTC/USDC', address: '0x394A9fcBab8599437d9Ec4e5A4a0EB7cb1fd2F69', fee: 0.05, kind: 'v3', base: OP_T.WBTC, quote: OP_T.USDC },
  { id: 'op_univ3_wbtc_usdc_030', name: 'Uniswap V3 WBTC/USDC (0.30%)', dex: 'Uniswap V3', pair: 'WBTC/USDC', address: '0xaDAb76dD2dcA7aE080A796F0ce86170e482AfB4a', fee: 0.30, kind: 'v3', base: OP_T.WBTC, quote: OP_T.USDC },

  // wstETH / WETH (3 pools across 3 DEXes)
  { id: 'op_univ3_wsteth_weth_001', name: 'Uniswap V3 wstETH/WETH (0.01%)', dex: 'Uniswap V3', pair: 'wstETH/WETH', address: '0x04F6C85A1B00F6D9B75f91FD23835974Cc07E65c', fee: 0.01, kind: 'v3', base: OP_T.wstETH, quote: OP_T.WETH },
  { id: 'op_sushiv3_wsteth_weth_005', name: 'SushiSwap V3 wstETH/WETH (0.05%)', dex: 'SushiSwap V3', pair: 'wstETH/WETH', address: '0x6DbB06Aa024F4f23883a39eFc263aa490529033a', fee: 0.05, kind: 'v3', base: OP_T.wstETH, quote: OP_T.WETH },
  { id: 'op_velo_slip_wsteth_weth_ts1', name: 'Velodrome Slipstream wstETH/WETH (CL-1)', dex: 'Velodrome Slipstream', pair: 'wstETH/WETH', address: '0xbF30Ff33CF9C6b0c48702Ff17891293b002DfeA4', fee: 0.011, kind: 'slipstream', base: OP_T.wstETH, quote: OP_T.WETH },

  // USDC / USDT (3 pools across 3 DEXes)
  { id: 'op_univ3_usdc_usdt_001', name: 'Uniswap V3 USDC/USDT (0.01%)', dex: 'Uniswap V3', pair: 'USDC/USDT', address: '0xA73C628eaf6e283E26A7b1f8001CF186aa4c0E8E', fee: 0.01, kind: 'v3', base: OP_T.USDC, quote: OP_T.USDT },
  { id: 'op_sushiv3_usdc_usdt_001', name: 'SushiSwap V3 USDC/USDT (0.01%)', dex: 'SushiSwap V3', pair: 'USDC/USDT', address: '0x962E23cd3F58f887a5238082A75d223f71890629', fee: 0.01, kind: 'v3', base: OP_T.USDC, quote: OP_T.USDT },
  { id: 'op_velo_slip_usdc_usdt_ts1', name: 'Velodrome Slipstream USDC/USDT (CL-1)', dex: 'Velodrome Slipstream', pair: 'USDC/USDT', address: '0x84Ce89B4f6F67E523A81A82f9f2F14D84B726F6B', fee: 0.01, kind: 'slipstream', base: OP_T.USDC, quote: OP_T.USDT },
];

const POOL_SPECS_BY_CHAIN: Record<SupportedArbChain, PoolSpec[]> = {
  ethereum: ETH_POOL_SPECS,
  polygon: POLYGON_POOL_SPECS,
  bsc: BSC_POOL_SPECS,
  avalanche: AVALANCHE_POOL_SPECS,
  arbitrum: POOL_SPECS,
  base: BASE_POOL_SPECS,
  optimism: OP_POOL_SPECS,
  linea: LINEA_POOL_SPECS,
  scroll: SCROLL_POOL_SPECS,
  apechain: APECHAIN_POOL_SPECS,
};

const SUPPORTED_SCAN_CHAINS: SupportedArbChain[] = ALL_SUPPORTED_ARB_CHAINS;

function initChainRecord<T>(factory: () => T): Record<SupportedArbChain, T> {
  return Object.fromEntries(ALL_SUPPORTED_ARB_CHAINS.map((c) => [c, factory()])) as Record<SupportedArbChain, T>;
}

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
const multicallIface = new ethers.Interface([
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])',
]);

class LiveMevAgent {
  public isRunning: boolean = true;
  public scanCount: number = 0;
  public latestBlock: number = 0;
  public lastScanTimestamp: number = Date.now();
  public pools: MonitoredPoolState[] = [];
  public opportunities: LiveArbitrageOpportunity[] = [];
  public executedTrades: ExecutedAgentTrade[] = [];
  public poolsByChain: Record<SupportedArbChain, MonitoredPoolState[]> = initChainRecord<MonitoredPoolState[]>(() => []);
  public opportunitiesByChain: Record<SupportedArbChain, LiveArbitrageOpportunity[]> = initChainRecord<LiveArbitrageOpportunity[]>(() => []);
  public latestBlockByChain: Record<SupportedArbChain, number> = initChainRecord<number>(() => 0);
  public lastErrorByChain: Record<SupportedArbChain, string | null> = initChainRecord<string | null>(() => null);
  public lastSuccessfulScanByChain: Record<SupportedArbChain, number> = initChainRecord<number>(() => 0);
  public lastAttemptedScanByChain: Record<SupportedArbChain, number> = initChainRecord<number>(() => 0);
  private activeUiChain: SupportedArbChain = 'arbitrum';
  private activeUiAllMode: boolean = false;
  private lastStatusRequestAt: number = 0;
  private bgChainCursor: number = 0;
  private loopTimer: NodeJS.Timeout | null = null;
  public isScanning: boolean = false;
  private consecutiveFailures: number = 0;
  public lastSuccessfulScan: number = Date.now();
  public agentState: 'IDLE' | 'SCANNING' | 'OPPORTUNITY_FOUND' | 'EXECUTING' | 'TRADE_CONFIRMED' | 'AWAITING_GAS_SIGNER' = 'SCANNING';
  public lastConfirmedTxHash: string | null = null;
  public lastConfirmedBlock: number | null = null;

  // Dynamic Parameter & Profit Guard Settings (Minimum $0.01 floor, NO maximum cap / unbounded upside)
  public minProfitThresholdUsd: number = 0.01; // Strict Profit Guard threshold ($0.01 min net profit, no maximum limit)
  public maxProfitCap: null = null; // No upper bound or ceiling on profit (unbounded upside)
  public gasOptimizationMode: 'ECO' | 'HYPER_ALPHA' | 'AGGRESSIVE' = 'ECO';
  public autoOptimizeSize: boolean = true; // Dynamically scale loan amount to pool liquidity (S*)
  public minClipUsd: number = 1; // L2-calibrated lower notional bound ($1+) so small S* routes are never clamped into loss
  public maxLoanEthEquivalent: number = 150; // Unlock deep $5M-$86M pools up to 150 ETH equivalents
  public fixedClipUsd: number = 10000; // Used only when autoOptimizeSize is false
  public isAutonomousExecutionEnabled: boolean = false; // Auto-executes live on-chain when profit guard cleared
  public lastExecutionTimestamp: number = 0;
  public lastExecutionNotice: string | null = null;
  private routeInputsByOppId = new Map<string, RouteExecutionInput>();
  private failedSimCooldownByOppId = new Map<string, number>();
  private chainInfraCache = new Map<SupportedArbChain, {
    contractAddr: string;
    contractHasExec: boolean;
    contractOwner: string | null;
    contractSupportsAlgebra: boolean;
    contractSupportsCamelotV2: boolean;
    camelotV3Adapter: string | null;
    hasBalancerVault: boolean;
    vaultBalances: Record<string, bigint>;
    fetchedAt: number;
  }>();

  public invalidateChainInfraCache(chain?: SupportedArbChain) {
    if (chain) this.chainInfraCache.delete(chain);
    else this.chainInfraCache.clear();
  }

  public async getChainInfra(chain: SupportedArbChain, forceRefresh = false): Promise<{
    contractAddr: string;
    contractHasExec: boolean;
    contractOwner: string | null;
    contractSupportsAlgebra: boolean;
    contractSupportsCamelotV2: boolean;
    camelotV3Adapter: string | null;
    hasBalancerVault: boolean;
    vaultBalances: Record<string, bigint>;
    fetchedAt: number;
  }> {
    const contractAddr = DEPLOYED_CONTRACTS[chain] || '';
    const configuredAdapter = (chain === 'arbitrum' ? DEPLOYED_CAMELOT_ADAPTERS.arbitrum : '') || '';
    const existing = this.chainInfraCache.get(chain);
    if (
      !forceRefresh &&
      existing &&
      existing.contractAddr.toLowerCase() === contractAddr.toLowerCase() &&
      (existing.camelotV3Adapter || '').toLowerCase() === configuredAdapter.toLowerCase() &&
      Date.now() - existing.fetchedAt < 300_000
    ) {
      return existing;
    }

    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const tokens = Object.values(CHAIN_TOKENS[chain] || {});
    const hasVaultConfigured =
      Boolean(rpcInfo.balancerVault) &&
      rpcInfo.balancerVault.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
    const paddedVault = hasVaultConfigured
      ? rpcInfo.balancerVault.toLowerCase().replace('0x', '').padStart(64, '0')
      : '';
    const hasContract = Boolean(contractAddr && /^0x[a-fA-F0-9]{40}$/.test(contractAddr));
    const hasAdapter = Boolean(configuredAdapter && /^0x[a-fA-F0-9]{40}$/.test(configuredAdapter));
    const mcCalls: Array<{ target: string; allowFailure: boolean; callData: string }> = [
      ...(hasContract
        ? [
            { target: contractAddr, allowFailure: true, callData: '0x8da5cb5b' }, // owner()
            { target: contractAddr, allowFailure: true, callData: '0x459a01ae' }, // routerCapabilities()
          ]
        : []),
      ...(hasVaultConfigured
        ? tokens.map((t) => ({
            target: t.addr,
            allowFailure: true,
            callData: `0x70a08231${paddedVault}`,
          }))
        : []),
    ];

    const [codeResp, adapterCodeResp, mcResp] = await Promise.all([
      hasContract
        ? fetchRpcSingleWithFailover(chain, 'eth_getCode', [contractAddr, 'latest'], true).catch(() => ({ result: '0x' }))
        : Promise.resolve({ result: '0x' }),
      hasAdapter
        ? fetchRpcSingleWithFailover(chain, 'eth_getCode', [configuredAdapter, 'latest'], true).catch(() => ({ result: '0x' }))
        : Promise.resolve({ result: '0x' }),
      mcCalls.length > 0
        ? fetchRpcSingleWithFailover(
            chain,
            'eth_call',
            [{ to: MULTICALL3_ADDRESS, data: multicallIface.encodeFunctionData('aggregate3', [mcCalls]) }, 'latest'],
            false
          ).catch(() => ({ result: '0x' }))
        : Promise.resolve({ result: '0x' }),
    ]);

    const code = String(codeResp?.result || '0x').toLowerCase();
    const contractHasExec = code !== '0x' && code.length > 2 && code.includes('23b3aa6b');
    const adapterCode = String(adapterCodeResp?.result || '0x').toLowerCase();
    const camelotV3Adapter =
      hasAdapter && adapterCode !== '0x' && adapterCode.length > 2 && adapterCode.includes('414bf389')
        ? configuredAdapter
        : null;

    let contractOwner: string | null = null;
    let contractSupportsAlgebra = false;
    let contractSupportsCamelotV2 = false;
    const vaultBalances: Record<string, bigint> = {};
    if (typeof mcResp?.result === 'string' && mcResp.result !== '0x') {
      try {
        const [decoded] = multicallIface.decodeFunctionResult('aggregate3', mcResp.result);
        const offset = hasContract ? 2 : 0;
        if (hasContract) {
          if (decoded[0]?.success && decoded[0]?.returnData?.length >= 66) {
            contractOwner = ethers.getAddress(`0x${decoded[0].returnData.slice(-40)}`);
          }
          if (decoded[1]?.success && decoded[1]?.returnData?.length >= 66) {
            const capMask = BigInt(decoded[1].returnData.slice(0, 66));
            contractSupportsAlgebra = (capMask & 2n) !== 0n;
            contractSupportsCamelotV2 = (capMask & 4n) !== 0n;
          }
        }
        if (hasVaultConfigured) {
          tokens.forEach((t, idx) => {
            const entry = decoded[offset + idx];
            if (entry?.success && typeof entry.returnData === 'string' && entry.returnData.length >= 66) {
              vaultBalances[t.addr.toLowerCase()] = BigInt(entry.returnData.slice(0, 66));
            }
          });
        }
      } catch {
        // ignore malformed multicall response
      }
    }

    const hasBalancerVault = hasVaultConfigured && Object.values(vaultBalances).some((b) => b > 0n);

    const fresh = {
      contractAddr,
      contractHasExec,
      contractOwner,
      contractSupportsAlgebra,
      contractSupportsCamelotV2,
      camelotV3Adapter,
      hasBalancerVault,
      vaultBalances,
      fetchedAt: Date.now(),
    };
    this.chainInfraCache.set(chain, fresh);
    return fresh;
  }

  public getCachedChainCapabilities(chain: SupportedArbChain) {
    const cached = this.chainInfraCache.get(chain);
    const configuredAdapter = (chain === 'arbitrum' ? DEPLOYED_CAMELOT_ADAPTERS.arbitrum : '') || '';
    const signerKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    let signerAddress: string | null = null;
    if (signerKey) {
      try {
        signerAddress = new ethers.Wallet(signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`).address;
      } catch {}
    }
    const contractOwner = cached?.contractOwner ?? null;
    const ownerMatchesSigner = Boolean(
      contractOwner && signerAddress && contractOwner.toLowerCase() === signerAddress.toLowerCase()
    );
    return {
      contractAddr: DEPLOYED_CONTRACTS[chain] || '',
      contractOwner,
      signerAddress,
      ownerMatchesSigner,
      supportsAlgebra: cached?.contractSupportsAlgebra ?? false,
      supportsCamelotV2: cached?.contractSupportsCamelotV2 ?? false,
      camelotV3Adapter: cached?.camelotV3Adapter ?? (configuredAdapter || null),
    };
  }

  public applyOptimalParametersPreset() {
    this.minProfitThresholdUsd = 0.01;
    this.gasOptimizationMode = 'ECO';
    this.autoOptimizeSize = true;
    this.minClipUsd = 1;
    this.maxLoanEthEquivalent = 150;
  }

  constructor() {
    this.start();
  }

  public start() {
    this.stop();
    this.isRunning = true;
    this.agentState =
      this.isAutonomousExecutionEnabled && !process.env.FLASH_ARB_SIGNER_KEY
        ? 'AWAITING_GAS_SIGNER'
        : 'SCANNING';
    this.scheduleNextScan(100);
  }

  public stop() {
    this.isRunning = false;
    this.agentState = 'IDLE';
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  public getActiveUiChain(): SupportedArbChain {
    return this.activeUiChain;
  }

  public markUiChainActive(requestedChain: string) {
    this.lastStatusRequestAt = Date.now();
    const key = (requestedChain || 'arbitrum').toLowerCase();
    if (key === 'all') {
      this.activeUiAllMode = true;
      return;
    }
    this.activeUiAllMode = false;
    const c = parseSupportedChain(key);
    this.activeUiChain = c;
    const stale = Date.now() - (this.lastAttemptedScanByChain[c] || 0) > 4000;
    if (!this.isScanning && ((this.poolsByChain[c] || []).length === 0 || stale)) {
      void this.scan(c);
    }
  }

  private async scanSmartCycle() {
    const now = Date.now();
    const uiRecentlyActive = this.lastStatusRequestAt > 0 && now - this.lastStatusRequestAt < 60_000;
    const deployedChains = SUPPORTED_SCAN_CHAINS.filter((c) => Boolean(DEPLOYED_CONTRACTS[c]));

    if (this.scanCount === 0) {
      // Initial boot warmup: prioritize arbitrum + active UI chain immediately without 10-chain blast
      const bootChains = Array.from(new Set<SupportedArbChain>(['arbitrum', this.activeUiChain]));
      await this.scan(bootChains.length === 1 ? bootChains[0] : bootChains);
      return;
    }

    const targets = new Set<SupportedArbChain>();
    if (uiRecentlyActive) {
      if (this.activeUiAllMode) {
        // Rotate 2 chains per tick when user is on 'all' view
        for (let step = 0; step < 2; step++) {
          const c = SUPPORTED_SCAN_CHAINS[(this.bgChainCursor + step) % SUPPORTED_SCAN_CHAINS.length];
          if (now - (this.lastAttemptedScanByChain[c] || 0) >= 8_000) targets.add(c);
        }
        this.bgChainCursor = (this.bgChainCursor + 2) % SUPPORTED_SCAN_CHAINS.length;
      } else {
        if (now - (this.lastAttemptedScanByChain[this.activeUiChain] || 0) >= 4_500) {
          targets.add(this.activeUiChain);
        }
        if (this.isAutonomousExecutionEnabled) {
          for (const c of deployedChains) {
            if (c !== this.activeUiChain && now - (this.lastAttemptedScanByChain[c] || 0) >= 12_000) {
              targets.add(c);
            }
          }
        }
        // Keep background chains fresh via single round-robin probe every 45s
        const bgChain = SUPPORTED_SCAN_CHAINS[this.bgChainCursor % SUPPORTED_SCAN_CHAINS.length];
        this.bgChainCursor = (this.bgChainCursor + 1) % SUPPORTED_SCAN_CHAINS.length;
        if (!targets.has(bgChain) && now - (this.lastAttemptedScanByChain[bgChain] || 0) >= 45_000) {
          targets.add(bgChain);
        }
      }
    } else if (this.isAutonomousExecutionEnabled) {
      // UI idle/backgrounded but continuous autonomous trading armed: keep deployed chains scanned at 8s cadence
      for (const c of deployedChains) {
        if (now - (this.lastAttemptedScanByChain[c] || 0) >= 8_000) {
          targets.add(c);
        }
      }
      if (!targets.has(this.activeUiChain) && now - (this.lastAttemptedScanByChain[this.activeUiChain] || 0) >= 12_000) {
        targets.add(this.activeUiChain);
      }
    } else {
      // Completely idle: rotate at most 1 chain per 25s tick so warm cache doesn't burn RPC quota
      const idleChain = SUPPORTED_SCAN_CHAINS[this.bgChainCursor % SUPPORTED_SCAN_CHAINS.length];
      this.bgChainCursor = (this.bgChainCursor + 1) % SUPPORTED_SCAN_CHAINS.length;
      if (now - (this.lastAttemptedScanByChain[idleChain] || 0) >= 45_000) {
        targets.add(idleChain);
      }
    }

    if (targets.size > 0) {
      await this.scan(Array.from(targets));
    }
  }

  private scheduleNextScan(delayMs: number) {
    if (!this.isRunning) return;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(async () => {
      if (!this.isRunning) return;
      try {
        await this.scanSmartCycle();
      } catch {
        // Handled internally in scan()
      }
      if (this.isRunning) {
        const uiRecentlyActive = this.lastStatusRequestAt > 0 && Date.now() - this.lastStatusRequestAt < 60_000;
        const baseInterval = this.isAutonomousExecutionEnabled ? 4_500 : uiRecentlyActive ? 5_000 : 20_000;
        const nextDelay = this.consecutiveFailures > 0
          ? Math.min(45_000, baseInterval * (1.5 ** Math.min(this.consecutiveFailures, 5)))
          : baseInterval;
        this.scheduleNextScan(nextDelay);
      }
    }, delayMs);
  }

  /**
   * Dynamic Parameter Optimizer:
   * Solves for optimal loan size S* to maximize net profit after pool slippage,
   * while calibrating exact gas limits to consume the absolute minimum gas.
   */
  public calculateOptimalParameters(params: {
    chain: SupportedArbChain;
    blockNumber: number;
    pair: string;
    buyDex: string;
    buyPool: string;
    sellDex: string;
    sellPool: string;
    buyPrice: number;
    sellPrice: number;
    feeTierA: number; // e.g. 0.05
    feeTierB: number; // e.g. 0.30
    depthA: number; // real in-range USD depth of the buy pool
    depthB: number; // real in-range USD depth of the sell pool
    routeType: number;
    loanToken: string;
    ethUsd: number; // real WETH/USDC price from chain
    nativeUsd?: number; // live USD price of chain native gas token (POL, BNB, AVAX, APE, or ETH)
    gasPriceGwei: number; // real eth_gasPrice from the chain RPC
    lighterRoute: boolean; // both legs concentrated-liquidity pools
    maxTradeUsd?: number; // real physical pool reserve / Balancer Vault liquidity cap
  }): LiveArbitrageOpportunity | null {
    const grossSpreadUsd = Math.max(0, params.sellPrice - params.buyPrice);
    const grossSpreadBps = Number(((grossSpreadUsd / params.buyPrice) * 10000).toFixed(2));
    const dexFeeBps = Math.round((params.feeTierA + params.feeTierB) * 100);
    const netEdgeBps = grossSpreadBps - dexFeeBps;

    // Calibrate lowest safe gas limit based on route architecture and L2/L1 fee mechanics
    const baseGasLimit = params.lighterRoute ? 135000 : 148500;
    const isFcfsChain = params.chain === 'arbitrum' || params.chain === 'apechain';
    const isL1Priority = params.chain === 'ethereum';

    let gasMultiplier = 0.96;
    let tipGwei = isFcfsChain ? 0.002 : isL1Priority ? 0.25 : 0.005;
    if (this.gasOptimizationMode === 'ECO') {
      gasMultiplier = 0.90;
      tipGwei = isFcfsChain ? 0 : isL1Priority ? 0.05 : 0.001;
    } else if (this.gasOptimizationMode === 'AGGRESSIVE') {
      gasMultiplier = 1.10;
      tipGwei = isFcfsChain ? 0.01 : isL1Priority ? 1.0 : 0.05;
    }

    const optimalGasLimit = Math.round(baseGasLimit * gasMultiplier);
    const gasSavingsPercent = Number((((300000 - optimalGasLimit) / 300000) * 100).toFixed(1));
    const effectiveGwei = params.gasPriceGwei + tipGwei;
    const gasNative = (optimalGasLimit * effectiveGwei) / 1e9;
    const gasUnitUsd =
      typeof params.nativeUsd === 'number' && params.nativeUsd > 0 ? params.nativeUsd : params.ethUsd;
    const gasCostUsd = Number((gasNative * gasUnitUsd).toFixed(4));

    // ---- Sizing from MEASURED depth (model + rationale in server/arbSizing.ts) ----------------------------
    // Calibrated for L2s: min notional floor scales safely from $1 (not $900) so S* never clamps into slippage loss,
    // while deep pools can scale up to maxLoanEthEquivalent (default 100 ETH eq) bounded by 5% shallow virtual depth
    // and single-sided physical pool / Balancer Vault caps.
    const minNotionalUsd = Math.max(this.minClipUsd, gasCostUsd * 1.5);
    const adaptiveDepthFraction = computeAdaptiveDepthFraction(netEdgeBps);
    const sized = sizeArbitrage({
      netEdgeBps,
      depthBuyUsd: params.depthA,
      depthSellUsd: params.depthB,
      buyPrice: params.buyPrice,
      gasCostUsd,
      autoOptimize: this.autoOptimizeSize,
      fixedClipUsd: this.fixedClipUsd,
      minLoanUnits: minNotionalUsd / params.buyPrice,
      maxLoanUnits: (this.maxLoanEthEquivalent * params.ethUsd) / params.buyPrice,
      maxDepthFraction: adaptiveDepthFraction,
      maxTradeUsd: params.maxTradeUsd,
    });
    if (!sized) return null; // depth not measured: no opportunity is invented

    const optimalLoanWeth = sized.loanUnits;
    const priceImpactBps = sized.priceImpactBps;
    const netProfitUsd = sized.netProfitUsd;
    const dexFeeUsd = Number((sized.tradeUsd * (dexFeeBps / 10000)).toFixed(4));
    const slippageCostUsd = Number((sized.tradeUsd * (priceImpactBps / 10000)).toFixed(4));
    let isProfitable = false;
    let profitGuardStatus: 'PROFIT_SECURED' | 'REVERT_PROTECTION_BLOCKED' = 'REVERT_PROTECTION_BLOCKED';
    let profitGuardReason = '';

    if (netEdgeBps <= 0) {
      profitGuardReason = `Execution Blocked by Profit Guard: gross spread (${grossSpreadBps} bps) is below combined DEX market swap fees (${dexFeeBps} bps / -$${dexFeeUsd.toFixed(2)}). Modelled loss $${Math.abs(netProfitUsd).toFixed(2)}.`;
    } else if (sized.overDepth) {
      profitGuardReason = `Execution Blocked by Profit Guard: minimum clip ($${sized.tradeUsd.toFixed(0)}) exceeds ${(adaptiveDepthFraction * 100).toFixed(1)}% of the shallower pool's measured depth ($${sized.shallowDepthUsd.toFixed(0)}), so the impact model is not reliable.`;
    } else if (netProfitUsd >= this.minProfitThresholdUsd) {
      isProfitable = true;
      profitGuardStatus = 'PROFIT_SECURED';
      profitGuardReason = `Profit Guard Passed: modelled net profit +$${netProfitUsd.toFixed(2)} (after -$${dexFeeUsd.toFixed(2)} DEX fees, -$${slippageCostUsd.toFixed(2)} slippage, and -$${gasCostUsd.toFixed(3)} gas) meets min threshold ($${this.minProfitThresholdUsd.toFixed(2)}).`;
    } else {
      profitGuardReason = `Execution Blocked by Profit Guard: modelled net profit $${netProfitUsd.toFixed(2)} (after -$${dexFeeUsd.toFixed(2)} DEX fees, -$${slippageCostUsd.toFixed(2)} slippage, -$${gasCostUsd.toFixed(3)} gas) is below minimum threshold ($${this.minProfitThresholdUsd.toFixed(2)}).`;
    }

    const cleanBuy = params.buyDex.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanSell = params.sellDex.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanPair = params.pair.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const priceDecimals = params.buyPrice < 10 ? 4 : 2;
    const spreadDecimals = grossSpreadUsd < 1 ? 4 : 2;

    return {
      id: `opp-${params.chain}-${cleanPair}-${cleanBuy}-${cleanSell}-${params.blockNumber}-${params.routeType}`,
      chain: params.chain,
      timestamp: Date.now(),
      blockNumber: params.blockNumber,
      pair: params.pair,
      buyDex: params.buyDex,
      buyPool: params.buyPool,
      buyPrice: Number(params.buyPrice.toFixed(priceDecimals)),
      sellDex: params.sellDex,
      sellPool: params.sellPool,
      sellPrice: Number(params.sellPrice.toFixed(priceDecimals)),
      grossSpreadUsd: Number(grossSpreadUsd.toFixed(spreadDecimals)),
      grossSpreadBps,
      dexFeeBps,
      dexFeeUsd,
      slippageCostUsd,
      estNetProfitUsd: netProfitUsd,
      isProfitable,
      isActionable: isProfitable,
      profitGuardStatus,
      profitGuardReason,
      loanToken: params.loanToken,
      loanAmount: optimalLoanWeth,
      optimalLoanAmount: optimalLoanWeth,
      optimalGasLimit,
      gasCostUsd,
      gasSavingsPercent,
      priceImpactBps,
      routeType: params.routeType,
    };
  }

  /**
   * Simulates an opportunity against live Arbitrum chain state via eth_estimateGas and,
   * only when simulation proves non-revert + positive profit >= minProfit, signs and
   * broadcasts FlashArbOptimized.executeOptimizedArbitrage(...) with 100% profit swept
   * to FLASH_ARB_PROFIT_WALLET.
   */
  public async verifyAndExecuteOpportunity(
    opp: LiveArbitrageOpportunity,
    options?: { forceTestExecution?: boolean; chain?: SupportedArbChain }
  ): Promise<{
    ok: boolean;
    statusCode: number;
    blockedByProfitGuard?: boolean;
    simulationFailed?: boolean;
    requiresWallet?: boolean;
    error?: string;
    requiresContractUpgradeOrAdapter?: boolean;
    camelotSetupRequired?: boolean;
    canDeployAdapter?: boolean;
    recommendUpgradeFlashArb?: boolean;
    ownerMismatch?: boolean;
    activeContract?: string;
    activeContractOwner?: string | null;
    signerAddress?: string | null;
    txHash?: string;
    explorerUrl?: string;
    trade?: ExecutedAgentTrade;
    txPayload?: { to: string; data: string; gas: string };
    candidateLabel?: string;
    gasEstimate?: string;
    sweptAmount?: string;
    sweptToken?: string;
    recipient?: string;
    gasSavedUsd?: number;
    loanFeeSavedUsd?: number;
    gasSavedEthSwept?: string;
    gasSweepTxHash?: string;
    gasSweepNote?: string;
  }> {
    const chain = options?.chain || opp.chain || 'arbitrum';
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const contractAddr = DEPLOYED_CONTRACTS[chain];

    if (!contractAddr || !/^0x[a-fA-F0-9]{40}$/.test(contractAddr)) {
      return {
        ok: false,
        statusCode: 400,
        error: `No valid deployed FlashArbOptimized contract configured for ${rpcInfo.name}.`,
      };
    }

    const profitWallet = profitWalletEnv();
    if (!profitWallet || !/^0x[a-fA-F0-9]{40}$/.test(profitWallet)) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Profit Vault destination address is missing or invalid. Configure your 42-char EVM Profit Vault address first.',
      };
    }

    if (!opp.isProfitable && !options?.forceTestExecution) {
      return {
        ok: false,
        statusCode: 400,
        blockedByProfitGuard: true,
        error: opp.profitGuardReason || 'Execution blocked by Profit Guard: net profit below configured threshold.',
      };
    }

    const routeInput = this.routeInputsByOppId.get(opp.id);
    if (!routeInput) {
      return {
        ok: false,
        statusCode: 400,
        error: 'Opportunity expired or route parameters unavailable. Trigger a fresh scan and retry.',
      };
    }

    const infra = await this.getChainInfra(chain).catch(() => null);
    const routerCaps: RouterCapabilityOptions | undefined = infra
      ? {
          supportsAlgebra: infra.contractSupportsAlgebra,
          supportsCamelotV2: infra.contractSupportsCamelotV2,
          camelotV3Adapter: infra.camelotV3Adapter,
        }
      : undefined;

    const signerKeyRaw = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    let currentSignerAddress: string | null = null;
    if (signerKeyRaw) {
      try {
        currentSignerAddress = new ethers.Wallet(signerKeyRaw.startsWith('0x') ? signerKeyRaw : `0x${signerKeyRaw}`).address;
      } catch {}
    }
    const ownerMismatch = Boolean(
      infra?.contractOwner && currentSignerAddress && infra.contractOwner.toLowerCase() !== currentSignerAddress.toLowerCase()
    );

    // Check raw unscaled route router support first
    const baseRoutersCheck = resolveArbitrageCandidates({ ...routeInput, chain }, profitWallet, 1, routerCaps);
    if (baseRoutersCheck.length === 0) {
      const involvesCamelotV3 = routeInput.buyDex === 'Camelot V3' || routeInput.sellDex === 'Camelot V3';
      const involvesCamelotV2 = routeInput.buyDex === 'Camelot V2' || routeInput.sellDex === 'Camelot V2';
      const setupNeeded = involvesCamelotV3 || involvesCamelotV2;
      let errMsg = `Route ${routeInput.buyDex} -> ${routeInput.sellDex} on ${rpcInfo.name} uses an unsupported router. Pick a FlashArbOptimized-supported pool pair (Uniswap V3, PancakeSwap V3, SushiSwap V3, Uniswap V2, Sushiswap V2, BaseSwap V2).`;
      if (involvesCamelotV3) {
        errMsg = ownerMismatch
          ? `Route ${routeInput.buyDex} -> ${routeInput.sellDex} requires upgrading FlashArbOptimized on ${rpcInfo.name} in the Contract panel (active contract ${contractAddr} is owned by ${infra?.contractOwner}, whereas active signer is ${currentSignerAddress}; upgrading adds native Camelot V3 & V2 support and sets your active signer as owner).`
          : `Route ${routeInput.buyDex} -> ${routeInput.sellDex} requires either upgrading FlashArbOptimized on ${rpcInfo.name} or deploying the CamelotV3SwapAdapter in the Contract panel.`;
      } else if (involvesCamelotV2) {
        errMsg = `Route ${routeInput.buyDex} -> ${routeInput.sellDex} requires upgrading FlashArbOptimized on ${rpcInfo.name} in the Contract panel (adds native Camelot V2 support).`;
      }
      return {
        ok: false,
        statusCode: 422,
        simulationFailed: true,
        requiresContractUpgradeOrAdapter: setupNeeded,
        camelotSetupRequired: setupNeeded,
        canDeployAdapter: involvesCamelotV3 && !involvesCamelotV2 && !ownerMismatch,
        recommendUpgradeFlashArb: setupNeeded && (ownerMismatch || involvesCamelotV2),
        ownerMismatch,
        activeContract: contractAddr,
        activeContractOwner: infra?.contractOwner || null,
        signerAddress: currentSignerAddress,
        error: errMsg,
      };
    }

    const balancerVaultBalances =
      infra && Object.keys(infra.vaultBalances).length > 0 ? infra.vaultBalances : undefined;

    const candidates = buildScaledArbitrageCandidates(
      { ...routeInput, chain },
      profitWallet,
      balancerVaultBalances,
      [10, 5, 3, 2, 1.5, 1, 0.75, 0.5, 0.25, 0.1, 0.03],
      routerCaps
    );
    if (candidates.length === 0) {
      return {
        ok: false,
        statusCode: 422,
        simulationFailed: true,
        error: `Balancer V2 Vault has insufficient liquidity in both ${routeInput.baseToken.sym} and ${routeInput.quoteToken.sym} on ${rpcInfo.name} for this flash loan.`,
      };
    }

    // Verify deployed contract exists and actually implements executeOptimizedArbitrage (0x23b3aa6b)
    const { result: codeRaw } = await fetchRpcSingleWithFailover(chain, 'eth_getCode', [contractAddr, 'latest'], true);
    const code = String(codeRaw || '0x').toLowerCase();
    if (code === '0x' || code.length <= 2) {
      return {
        ok: false,
        statusCode: 400,
        error: `Contract ${contractAddr} is not deployed on ${rpcInfo.name}. Deploy FlashArbOptimized first.`,
      };
    }
    if (!code.includes('23b3aa6b')) {
      return {
        ok: false,
        statusCode: 400,
        error: `Contract ${contractAddr} is an older sweep-only deployment without executeOptimizedArbitrage(). Switch to 0xeee31ff9e69904b43c124095b6f33aa61505bcc2 or redeploy FlashArbOptimized.sol.`,
      };
    }

    // Read contract owner()
    let contractOwner: string | null = null;
    try {
      const { result: ownerRaw } = await fetchRpcSingleWithFailover(
        chain,
        'eth_call',
        [{ to: contractAddr, data: '0x8da5cb5b' }, 'latest'],
        true
      );
      if (typeof ownerRaw === 'string' && ownerRaw.length >= 66) {
        contractOwner = ethers.getAddress(`0x${ownerRaw.slice(-40)}`);
      }
    } catch {
      // ignore if owner() call fails
    }

    const signerKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    if (!signerKey) {
      return {
        ok: false,
        statusCode: 409,
        requiresWallet: true,
        error: 'No server signer key configured. Configure FLASH_ARB_SIGNER_KEY in Signer Key Config to broadcast live arbitrage.',
        txPayload: {
          to: contractAddr,
          data: candidates[0].calldata,
          gas: '0x7a120', // 500k gas ceiling
        },
      };
    }

    const cleanKey = signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`;
    const signerAddress = new ethers.Wallet(cleanKey).address;
    if (contractOwner && contractOwner.toLowerCase() !== signerAddress.toLowerCase()) {
      return {
        ok: false,
        statusCode: 400,
        error: `Signer wallet ${signerAddress} is not the owner of contract ${contractAddr} (owner is ${contractOwner}). Switch signer key or deploy a new contract with this signer.`,
      };
    }

    // Step 1: Profit-maximization batch eth_call across ALL scaled candidates (both Base & Quote borrow directions)
    // Using minProfit = MaxUint256 exposes exact on-chain output via InsufficientProfit(actualWei, MaxUint256).
    const chainPoolsPre = this.poolsByChain[chain] || this.pools;
    const chainMetaPre = CHAIN_LAYER_META[chain];
    const ethUsdPre =
      getLiveTokenUsdPrice('WETH', chain) ||
      chainPoolsPre.find((p) => p.pair === 'WETH/USDC')?.priceUsd ||
      cachedPriceFeed?.ethUsd ||
      2500;
    const nativeUsdPre =
      chainMetaPre.nativeSymbol === 'ETH'
        ? ethUsdPre
        : getLiveTokenUsdPrice(chainMetaPre.wrappedNativeSymbol, chain) ||
          getLiveTokenUsdPrice(chainMetaPre.nativeSymbol, chain) ||
          ethUsdPre;
    const quoteUsdPrice =
      routeInput.buyPriceQuotePerBase > 0 && routeInput.buyPriceUsd > 0
        ? routeInput.buyPriceUsd / routeInput.buyPriceQuotePerBase
        : 1;
    const tokenUsdPrice = (sym: string): number => {
      const upper = sym.toUpperCase();
      if (upper === routeInput.baseToken.sym.toUpperCase() && routeInput.buyPriceUsd > 0) return routeInput.buyPriceUsd;
      if (upper === routeInput.quoteToken.sym.toUpperCase() && quoteUsdPrice > 0) return quoteUsdPrice;
      if (['USDC', 'USDC.E', 'USDBC', 'USDT', 'DAI', 'FRAX', 'USDE', 'APEUSD'].includes(upper)) return 1;
      if (upper === 'WETH' || upper === 'ETH' || upper === 'APEETH') return ethUsdPre;
      if (upper === chainMetaPre.wrappedNativeSymbol.toUpperCase() || upper === chainMetaPre.nativeSymbol.toUpperCase()) {
        return nativeUsdPre;
      }
      return getLiveTokenUsdPrice(sym, chain) || (quoteUsdPrice > 0 ? quoteUsdPrice : 1);
    };

    const orderedCandidates: EncodedArbitrageCandidate[] = [];
    let bestProbeRevertReason: string | null = null;
    try {
      const probeBatch = candidates.map((cand, idx) => ({
        jsonrpc: '2.0',
        id: idx + 1,
        method: 'eth_call',
        params: [
          {
            from: signerAddress,
            to: contractAddr,
            data: buildMaxProfitProbeCalldata(cand),
          },
          'latest',
        ],
      }));
      const { results: probeResults } = await fetchRpcBatchWithFailover(chain, probeBatch);
      const scored: Array<{ cand: EncodedArbitrageCandidate; netProfitUsd: number; actualProfitUsd: number; actualProfitWei: bigint }> = [];

      const estGasUsd = opp.gasCostUsd || 0;
      for (const item of probeResults) {
        const idx = Number(item?.id) - 1;
        const cand = candidates[idx];
        if (!cand || !item?.error) continue;
        const ins = parseInsufficientProfitError(item.error);
        if (ins && ins.actual > 0n) {
          const tokPrice = tokenUsdPrice(cand.borrowedToken.sym);
          const actualHuman = Number(ethers.formatUnits(ins.actual, cand.borrowedToken.dec));
          const actualProfitUsd = actualHuman * tokPrice;
          const minRequiredUsd = options?.forceTestExecution ? 0 : this.minProfitThresholdUsd + estGasUsd;
          if (actualProfitUsd >= minRequiredUsd) {
            // Set minProfit to max(gas+profitFloor, 75% of probed output), capped strictly below actual output
            // so MEV sandwich / slippage spikes cannot drain execution profit while Profit Guard stays intact.
            const floorWei =
              minRequiredUsd > 0 && tokPrice > 0
                ? toTokenUnits(minRequiredUsd / tokPrice, cand.borrowedToken.dec)
                : 1n;
            const seventyFivePctActual = (ins.actual * 75n) / 100n;
            const desiredMin = floorWei > seventyFivePctActual ? floorWei : seventyFivePctActual;
            const maxSafeMin = ins.actual > 1n ? ins.actual - 1n : 1n;
            const tightenedMinProfit = desiredMin > maxSafeMin ? maxSafeMin : desiredMin > 1n ? desiredMin : 1n;
            scored.push({
              cand: rebuildCandidateWithMinProfit(cand, tightenedMinProfit),
              netProfitUsd: actualProfitUsd - estGasUsd,
              actualProfitUsd,
              actualProfitWei: ins.actual,
            });
          } else {
            bestProbeRevertReason = `InsufficientProfit(actualUsd=$${actualProfitUsd.toFixed(4)}, minRequired=$${minRequiredUsd.toFixed(4)})`;
          }
        } else if (!bestProbeRevertReason) {
          bestProbeRevertReason = decodeFlashArbRevertError(item.error);
        }
      }

      scored.sort((a, b) => b.netProfitUsd - a.netProfitUsd);
      for (const s of scored) orderedCandidates.push(s.cand);
    } catch {
      // If batch probe RPC call fails transiently, fall back to standard candidate order
    }

    const executionQueue = orderedCandidates.length > 0 ? orderedCandidates : candidates;

    // Step 2: Pre-flight eth_estimateGas verification on highest-profit candidates (0 gas spent on revert)
    let verifiedCandidate: EncodedArbitrageCandidate | null = null;
    let estimatedGas = 0n;
    let lastRevertReason = bestProbeRevertReason || 'Pool price converged / insufficient on-chain arbitrage margin';

    for (const candidate of executionQueue) {
      try {
        const { result: gasHex } = await fetchRpcSingleWithFailover(
          chain,
          'eth_estimateGas',
          [{ from: signerAddress, to: contractAddr, data: candidate.calldata }, 'latest'],
          true
        );
        if (typeof gasHex === 'string' && gasHex.startsWith('0x')) {
          estimatedGas = BigInt(gasHex);
          verifiedCandidate = candidate;
          break;
        }
      } catch (simErr: any) {
        lastRevertReason = decodeFlashArbRevertError(simErr);
      }
    }

    if (!verifiedCandidate || estimatedGas <= 0n) {
      this.agentState = 'SCANNING';
      this.lastExecutionNotice = `Pre-flight eth_estimateGas aborted tx (0 gas spent): ${lastRevertReason}`;
      return {
        ok: false,
        statusCode: 422,
        simulationFailed: true,
        error: `Pre-flight eth_estimateGas reverted on-chain (0 gas spent, zero-loss protection worked): ${lastRevertReason}`,
      };
    }

    this.agentState = 'EXECUTING';
    const gasLimitWithHeadroom = (estimatedGas * 125n) / 100n;
    const { txHash: sentTxHash, receipt } = await broadcastSignedTxAndWait({
      chain,
      cleanKey,
      to: contractAddr,
      data: verifiedCandidate.calldata,
      gasLimit: gasLimitWithHeadroom,
      allowAutoSpeedUp: false,
      minBalanceWei: 100000000000000n,
    });
    const isSuccess = receipt.status === 1;
    const gasCostEth =
      receipt.effectiveGasPrice !== null
        ? Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18
        : null;

    const decodedSwap = decodeArbitrageSwapsExecutedLogs(receipt.logs, contractAddr);
    const sweptAmount = decodedSwap
      ? ethers.formatUnits(decodedSwap.netProfitSwept, verifiedCandidate.borrowedToken.dec)
      : '0';
    const sweptRecipient = decodedSwap ? decodedSwap.recipient : profitWallet;
    const chainPools = this.poolsByChain[chain] || this.pools;
    const ethUsd = chainPools.find((p) => p.pair === 'WETH/USDC')?.priceUsd || opp.buyPrice;
    const borrowedSym = verifiedCandidate.borrowedToken.sym;
    const realizedUsd =
      !decodedSwap
        ? 0
        : borrowedSym === 'USDC' || borrowedSym === 'USDC.e' || borrowedSym === 'USDbC' || borrowedSym === 'USDT' || borrowedSym === 'DAI'
        ? Number(sweptAmount)
        : borrowedSym === 'WETH'
        ? Number(sweptAmount) * ethUsd
        : opp.buyPrice > 0
        ? Number(sweptAmount) * opp.buyPrice
        : 0;

    const borrowedHuman = Number(ethers.formatUnits(verifiedCandidate.amountUnits, verifiedCandidate.borrowedToken.dec));
    const borrowedTokenPriceUsd =
      ['USDC', 'USDC.E', 'USDBC', 'USDT', 'DAI'].includes(borrowedSym.toUpperCase())
        ? 1
        : borrowedSym.toUpperCase() === 'WETH'
        ? ethUsd
        : getLiveTokenUsdPrice(borrowedSym, chain) || opp.buyPrice;
    const actualLoanNotionalUsd = borrowedHuman * (borrowedTokenPriceUsd > 0 ? borrowedTokenPriceUsd : opp.buyPrice);

    const extraMetrics = computeTradeGasAndFinancingExtra({
      gasUsed: receipt.gasUsed,
      effectiveGasPriceWei: receipt.effectiveGasPrice,
      ethPriceUsd: ethUsd,
      loanNotionalUsd: actualLoanNotionalUsd,
      loanFeePercent: 0,
    });

    let gasSavedEthSwept = '0';
    let gasSweepTxHash: string | undefined;
    let gasSweepNote: string | undefined;
    let gasForwardedUsd = 0;

    if (isSuccess && signerAddress.toLowerCase() !== profitWallet.toLowerCase() && extraMetrics.gasSavedWei > 0n) {
      try {
        const gasSweep = await sweepGasWalletEthSurplus({
          chain,
          cleanKey,
          signerAddress,
          recipient: profitWallet,
          maxSendWei: extraMetrics.gasSavedWei,
        });
        if (gasSweep.swept && gasSweep.txHash) {
          gasSavedEthSwept = gasSweep.sentEthFormatted;
          gasSweepTxHash = gasSweep.txHash;
          gasForwardedUsd = Number((Number(gasSweep.sentEthFormatted) * ethUsd).toFixed(4));
        } else if (gasSweep.reason) {
          gasSweepNote = gasSweep.reason;
        }
      } catch (sweepErr: any) {
        gasSweepNote = sweepErr?.message || 'Gas surplus sweep skipped';
      }
    }

    const totalNetProfitUsd = isSuccess ? Number((realizedUsd + gasForwardedUsd).toFixed(4)) : 0;

    const executedTrade: ExecutedAgentTrade = {
      id: `arb-${Date.now()}-${sentTxHash.slice(2, 8)}`,
      chain,
      txHash: sentTxHash,
      timestamp: Date.now(),
      blockNumber: receipt.blockNumber,
      pair: opp.pair,
      buyDex: opp.buyDex,
      sellDex: opp.sellDex,
      grossSpreadUsd: opp.grossSpreadUsd,
      netProfitUsd: totalNetProfitUsd,
      gasCostEth,
      gasSavedUsd: extraMetrics.gasSavedUsd,
      loanFeeSavedUsd: extraMetrics.loanFeeSavedUsd,
      gasSavedEthSwept: gasSweepTxHash ? gasSavedEthSwept : null,
      gasSweepTxHash: gasSweepTxHash || null,
      status: isSuccess ? 'CONFIRMED' : 'REVERTED',
      explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
      profitRecipient: sweptRecipient,
    };

    this.executedTrades.push(executedTrade);
    this.lastExecutionTimestamp = Date.now();

    if (isSuccess) {
      this.lastConfirmedTxHash = sentTxHash;
      this.lastConfirmedBlock = receipt.blockNumber;
      this.agentState = 'TRADE_CONFIRMED';
      const gasSuffix = gasSweepTxHash ? ` + ${gasSavedEthSwept} ETH gas surplus` : '';
      this.lastExecutionNotice = `Confirmed ${verifiedCandidate.label}: swept ${sweptAmount} ${verifiedCandidate.borrowedToken.sym}${gasSuffix} to ${sweptRecipient}`;
      return {
        ok: true,
        statusCode: 200,
        txHash: sentTxHash,
        explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
        trade: executedTrade,
        candidateLabel: verifiedCandidate.label,
        gasEstimate: estimatedGas.toString(),
        sweptAmount,
        sweptToken: verifiedCandidate.borrowedToken.sym,
        recipient: sweptRecipient,
        gasSavedUsd: extraMetrics.gasSavedUsd,
        loanFeeSavedUsd: extraMetrics.loanFeeSavedUsd,
        gasSavedEthSwept,
        gasSweepTxHash,
        gasSweepNote,
      };
    }

    this.agentState = 'SCANNING';
    this.lastExecutionNotice = `Broadcast tx ${sentTxHash} reverted on-chain (state changed before inclusion).`;
    return {
      ok: false,
      statusCode: 500,
      txHash: sentTxHash,
      explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
      trade: executedTrade,
      error: `Transaction ${sentTxHash} reverted on-chain after pool state moved ahead of inclusion.`,
    };
  }

  /**
   * Real on-chain pre-flight `eth_call` (`minProfit = MaxUint256`) + optional `executeOptimizedArbitrage`
   * broadcast for user-selected Simulator routes. Never returns hypothetical arithmetic as on-chain profit.
   */
  public async probeOrExecuteSimulatorRoute(params: {
    chain: SupportedArbChain;
    tokenSymbol: string;
    quoteSymbol?: string;
    loanAmount: number;
    buyDex: string;
    sellDex: string;
    minProfitUsd?: number;
    gasOptimizationMode?: 'ECO' | 'HYPER_ALPHA' | 'AGGRESSIVE';
    execute?: boolean;
  }): Promise<{
    ok: boolean;
    statusCode: number;
    chain: SupportedArbChain;
    pair: string;
    baseToken: string;
    quoteToken: string;
    buyDex: string;
    sellDex: string;
    buyFeePercent: number;
    sellFeePercent: number;
    contractAddress: string;
    contractDeployed: boolean;
    verifiedOnChain: boolean;
    executable: boolean;
    onChainProfitable: boolean;
    actualGrossProfitUsd: number;
    actualProfitTokens: string;
    borrowedToken: string;
    gasEstimateUnits: number;
    gasCostUsd: number;
    netOnChainProfitUsd: number;
    revertReason: string | null;
    requiresWallet?: boolean;
    simulationFailed?: boolean;
    error?: string;
    txHash?: string;
    explorerUrl?: string;
    sweptAmount?: string;
    sweptToken?: string;
    recipient?: string;
    gasSavedUsd?: number;
    loanFeeSavedUsd?: number;
    gasSavedEthSwept?: string;
    gasSweepTxHash?: string;
    trade?: ExecutedAgentTrade;
    checkedCandidates: Array<{
      label: string;
      borrowedToken: string;
      amountFormatted: string;
      actualProfitFormatted: string;
      actualProfitUsd: number;
      status: 'PROFITABLE' | 'NO_PROFIT' | 'REVERTED';
      detail: string;
    }>;
  }> {
    const chain: SupportedArbChain = parseSupportedChain(params.chain);
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const contractAddr = DEPLOYED_CONTRACTS[chain] || '';
    const profitWallet = profitWalletEnv();
    const minProfitUsd =
      typeof params.minProfitUsd === 'number' && Number.isFinite(params.minProfitUsd) && params.minProfitUsd >= 0
        ? params.minProfitUsd
        : this.minProfitThresholdUsd;

    const buyParsed = parseSimulatorDexSelection(params.buyDex);
    const sellParsed = parseSimulatorDexSelection(params.sellDex);

    const chainTokenList = getChainTokens(chain);
    const isTokenArbCompatible = (addr: string) => {
      const found = chainTokenList.find((t) => t.addr.toLowerCase() === addr.toLowerCase());
      return found ? found.arbCompatible !== false : true;
    };
    const baseToken =
      chainTokenList.find((t) => t.sym.toLowerCase() === String(params.tokenSymbol || 'WETH').trim().toLowerCase()) ||
      CHAIN_TOKENS[chain]?.WETH ||
      chainTokenList[0];

    // Pick best quote token with live pool & Balancer compatibility on this chain
    const specs = POOL_SPECS_BY_CHAIN[chain] || [];
    const matchingSpecs = specs.filter(
      (s) =>
        (s.base.sym.toUpperCase() === baseToken.sym.toUpperCase() ||
          s.quote.sym.toUpperCase() === baseToken.sym.toUpperCase()) &&
        isTokenArbCompatible(s.base.addr) &&
        isTokenArbCompatible(s.quote.addr)
    );
    let quoteToken: ArbitrumTokenInfo | undefined;
    if (params.quoteSymbol) {
      const q = chainTokenList.find(
        (t) => t.sym.toLowerCase() === String(params.quoteSymbol).trim().toLowerCase()
      );
      if (q && q.addr.toLowerCase() !== baseToken.addr.toLowerCase() && isTokenArbCompatible(q.addr)) {
        quoteToken = q;
      }
    }
    if (!quoteToken && matchingSpecs.length > 0) {
      const preferredOrder = ['USDC', 'USDT', 'WETH', 'WMATIC', 'WBNB', 'WAVAX', 'ApeUSD', 'WAPE', 'USDC.E', 'USDBC', 'DAI'];
      for (const pref of preferredOrder) {
        if (pref === baseToken.sym.toUpperCase()) continue;
        const foundSpec = matchingSpecs.find(
          (s) =>
            (s.base.sym.toUpperCase() === baseToken.sym.toUpperCase() && s.quote.sym.toUpperCase() === pref) ||
            (s.quote.sym.toUpperCase() === baseToken.sym.toUpperCase() && s.base.sym.toUpperCase() === pref)
        );
        if (foundSpec) {
          quoteToken =
            foundSpec.base.sym.toUpperCase() === baseToken.sym.toUpperCase()
              ? foundSpec.quote
              : foundSpec.base;
          break;
        }
      }
      if (!quoteToken) {
        const s0 = matchingSpecs[0];
        quoteToken =
          s0.base.sym.toUpperCase() === baseToken.sym.toUpperCase() ? s0.quote : s0.base;
      }
    }
    if (!quoteToken) {
      const isUsdBase = ['USDC', 'USDC.E', 'USDBC', 'USDT', 'DAI', 'FRAX', 'USDE'].includes(
        baseToken.sym.toUpperCase()
      );
      quoteToken = isUsdBase
        ? CHAIN_TOKENS[chain]?.WETH || chainTokenList.find((t) => t.addr.toLowerCase() !== baseToken.addr.toLowerCase())!
        : CHAIN_TOKENS[chain]?.USDC || CHAIN_TOKENS[chain]?.WETH || chainTokenList.find((t) => t.addr.toLowerCase() !== baseToken.addr.toLowerCase())!;
    }

    // Collect all candidate DEX fee tiers from live pool specs when dropdown didn't lock a single tick tier
    const resolvePoolFees = (dex: string, fallbackFee: number, explicit: boolean): number[] => {
      if (explicit) return [fallbackFee];
      const matchingFees = specs
        .filter(
          (s) =>
            s.dex === dex &&
            ((s.base.addr.toLowerCase() === baseToken.addr.toLowerCase() &&
              s.quote.addr.toLowerCase() === quoteToken!.addr.toLowerCase()) ||
              (s.quote.addr.toLowerCase() === baseToken.addr.toLowerCase() &&
                s.base.addr.toLowerCase() === quoteToken!.addr.toLowerCase()))
        )
        .map((s) => s.fee)
        .filter((f) => Number.isFinite(f) && f > 0);
      if (matchingFees.length === 0) return [fallbackFee];
      return Array.from(new Set(matchingFees)).slice(0, 3);
    };
    const buyFees = resolvePoolFees(buyParsed.dex, buyParsed.feePercent, buyParsed.explicitFee);
    const sellFees = resolvePoolFees(sellParsed.dex, sellParsed.feePercent, sellParsed.explicitFee);
    const buyFeePercent = buyFees[0];
    const sellFeePercent = sellFees[0];
    const pair = `${baseToken.sym}/${quoteToken.sym}`;

    const baseFailResult = (
      statusCode: number,
      reason: string,
      opts?: {
        verifiedOnChain?: boolean;
        requiresWallet?: boolean;
        simulationFailed?: boolean;
        requiresContractUpgradeOrAdapter?: boolean;
        camelotSetupRequired?: boolean;
        canDeployAdapter?: boolean;
        recommendUpgradeFlashArb?: boolean;
        ownerMismatch?: boolean;
        activeContract?: string;
        activeContractOwner?: string | null;
        signerAddress?: string | null;
      }
    ) => ({
      ok: false,
      statusCode,
      chain,
      pair,
      baseToken: baseToken.sym,
      quoteToken: quoteToken!.sym,
      buyDex: buyParsed.dex,
      sellDex: sellParsed.dex,
      buyFeePercent,
      sellFeePercent,
      contractAddress: contractAddr,
      contractDeployed: Boolean(contractAddr),
      verifiedOnChain: opts?.verifiedOnChain ?? false,
      executable: false,
      onChainProfitable: false,
      actualGrossProfitUsd: 0,
      actualProfitTokens: '0',
      borrowedToken: baseToken.sym,
      gasEstimateUnits: 0,
      gasCostUsd: 0,
      netOnChainProfitUsd: 0,
      revertReason: reason,
      requiresWallet: opts?.requiresWallet,
      simulationFailed: opts?.simulationFailed ?? true,
      requiresContractUpgradeOrAdapter: opts?.requiresContractUpgradeOrAdapter,
      camelotSetupRequired: opts?.camelotSetupRequired,
      canDeployAdapter: opts?.canDeployAdapter,
      recommendUpgradeFlashArb: opts?.recommendUpgradeFlashArb,
      ownerMismatch: opts?.ownerMismatch,
      activeContract: opts?.activeContract,
      activeContractOwner: opts?.activeContractOwner,
      signerAddress: opts?.signerAddress,
      error: reason,
      checkedCandidates: [] as Array<{
        label: string;
        borrowedToken: string;
        amountFormatted: string;
        actualProfitFormatted: string;
        actualProfitUsd: number;
        status: 'PROFITABLE' | 'NO_PROFIT' | 'REVERTED';
        detail: string;
      }>,
    });

    if (!contractAddr || !/^0x[a-fA-F0-9]{40}$/.test(contractAddr)) {
      return baseFailResult(400, `No deployed FlashArbOptimized contract configured on ${rpcInfo.name}.`);
    }
    if (!profitWallet || !/^0x[a-fA-F0-9]{40}$/.test(profitWallet)) {
      return baseFailResult(400, 'Profit Vault destination address is missing or invalid.');
    }
    if (!isTokenArbCompatible(baseToken.addr)) {
      return baseFailResult(422, `${baseToken.sym} (${baseToken.ercStandard || 'token'}) is excluded from flash-arb swaps on ${rpcInfo.name}.`);
    }
    if (!Number.isFinite(params.loanAmount) || params.loanAmount <= 0) {
      return baseFailResult(400, 'Loan amount must be a positive number.');
    }

    const infra = await this.getChainInfra(chain).catch(() => null);
    if (!infra || !infra.contractHasExec) {
      return baseFailResult(400, `Contract ${contractAddr} on ${rpcInfo.name} is not deployed or lacks executeOptimizedArbitrage().`);
    }

    const routerCaps: RouterCapabilityOptions = {
      supportsAlgebra: infra.contractSupportsAlgebra,
      supportsCamelotV2: infra.contractSupportsCamelotV2,
      camelotV3Adapter: infra.camelotV3Adapter,
    };
    const routers = getEffectiveChainDexRouters(chain, routerCaps);
    if (!routers[buyParsed.dex]?.supported || !routers[sellParsed.dex]?.supported) {
      const badDex = !routers[buyParsed.dex]?.supported ? buyParsed.dex : sellParsed.dex;
      const involvesCamelotV3 = buyParsed.dex === 'Camelot V3' || sellParsed.dex === 'Camelot V3';
      const involvesCamelotV2 = buyParsed.dex === 'Camelot V2' || sellParsed.dex === 'Camelot V2';
      let currentSignerAddress: string | null = null;
      const signerKeyRaw = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
      if (signerKeyRaw) {
        try {
          currentSignerAddress = new ethers.Wallet(signerKeyRaw.startsWith('0x') ? signerKeyRaw : `0x${signerKeyRaw}`).address;
        } catch {}
      }
      const ownerMismatch = Boolean(
        infra.contractOwner && currentSignerAddress && infra.contractOwner.toLowerCase() !== currentSignerAddress.toLowerCase()
      );
      const setupMsg = involvesCamelotV3
        ? ownerMismatch
          ? `Route ${buyParsed.dex} -> ${sellParsed.dex} requires upgrading FlashArbOptimized on ${rpcInfo.name} in the Contract panel (active contract ${contractAddr} is owned by ${infra.contractOwner}, whereas active signer is ${currentSignerAddress}).`
          : `Route ${buyParsed.dex} -> ${sellParsed.dex} requires either upgrading FlashArbOptimized on ${rpcInfo.name} or deploying the CamelotV3SwapAdapter in the Contract panel.`
        : involvesCamelotV2
        ? `Route ${buyParsed.dex} -> ${sellParsed.dex} requires upgrading FlashArbOptimized on ${rpcInfo.name} in the Contract panel (adds native Camelot V2 support).`
        : `Venue "${badDex}" is monitor-only on ${rpcInfo.name} and cannot be routed atomically by FlashArbOptimized.`;
      return baseFailResult(422, setupMsg, {
        requiresContractUpgradeOrAdapter: involvesCamelotV3 || involvesCamelotV2,
        camelotSetupRequired: involvesCamelotV3 || involvesCamelotV2,
        canDeployAdapter: involvesCamelotV3 && !involvesCamelotV2 && !ownerMismatch,
        recommendUpgradeFlashArb: (involvesCamelotV3 || involvesCamelotV2) && (ownerMismatch || involvesCamelotV2),
        ownerMismatch,
        activeContract: contractAddr,
        activeContractOwner: infra.contractOwner || null,
        signerAddress: currentSignerAddress,
      });
    }

    // Ensure live token price feed & gas price are available
    if (!cachedPriceFeed) {
      await getLiveTokenPriceFeed(false).catch(() => null);
    }
    const chainPools = this.poolsByChain[chain] || [];
    const chainMeta = CHAIN_LAYER_META[chain];
    const ethUsd = getLiveTokenUsdPrice('WETH', chain) || chainPools.find((p) => p.pair === 'WETH/USDC')?.priceUsd || 2500;
    const nativeUsd =
      chainMeta.nativeSymbol === 'ETH'
        ? ethUsd
        : getLiveTokenUsdPrice(chainMeta.wrappedNativeSymbol, chain) ||
          getLiveTokenUsdPrice(chainMeta.nativeSymbol, chain) ||
          ethUsd;
    const baseUsd = getLiveTokenUsdPrice(baseToken.sym, chain) || (baseToken.sym === 'WETH' ? ethUsd : 1);
    const quoteUsd = getLiveTokenUsdPrice(quoteToken.sym, chain) || (quoteToken.sym === 'WETH' ? ethUsd : 1);
    const buyPriceQuotePerBase = quoteUsd > 0 ? baseUsd / quoteUsd : 1;

    let gasPriceWei = 100000000n; // 0.1 gwei fallback
    try {
      const { result: gpHex } = await fetchRpcSingleWithFailover(chain, 'eth_gasPrice', [], false);
      if (typeof gpHex === 'string' && gpHex.startsWith('0x')) {
        const parsed = BigInt(gpHex);
        if (parsed > 0n) gasPriceWei = parsed;
      }
    } catch {}

    const vaultBalances = Object.keys(infra.vaultBalances).length > 0 ? infra.vaultBalances : undefined;
    const candidateMap = new Map<string, EncodedArbitrageCandidate>();
    for (const bf of buyFees) {
      for (const sf of sellFees) {
        const comboCands = buildScaledArbitrageCandidates(
          {
            chain,
            baseToken,
            quoteToken,
            buyDex: buyParsed.dex,
            buyFeePercent: bf,
            sellDex: sellParsed.dex,
            sellFeePercent: sf,
            optimalLoanBaseUnits: params.loanAmount,
            buyPriceQuotePerBase,
            buyPriceUsd: baseUsd,
            estNetProfitUsd: Math.max(0.01, minProfitUsd),
          },
          profitWallet,
          vaultBalances,
          [5, 3, 2, 1.5, 1, 0.5, 0.25, 0.1],
          routerCaps
        );
        for (const c of comboCands) {
          const dedupKey = `${c.borrowedToken.addr.toLowerCase()}:${c.amountUnits.toString()}:${c.feeA}:${c.feeB}:${c.routeType}`;
          if (!candidateMap.has(dedupKey)) {
            const feeTag = buyFees.length > 1 || sellFees.length > 1 ? ` [${(c.feeA / 10000).toFixed(2)}%/${(c.feeB / 10000).toFixed(2)}%]` : '';
            candidateMap.set(dedupKey, feeTag ? { ...c, label: `${c.label}${feeTag}` } : c);
          }
        }
      }
    }
    const candidates = Array.from(candidateMap.values());

    if (candidates.length === 0) {
      return baseFailResult(
        422,
        `Balancer V2 Vault on ${rpcInfo.name} holds 0 ${baseToken.sym} and 0 ${quoteToken.sym} liquidity for this flash loan.`
      );
    }

    const signerKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    let signerAddress = '';
    let cleanKey = '';
    if (signerKey) {
      try {
        cleanKey = signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`;
        signerAddress = new ethers.Wallet(cleanKey).address;
      } catch {
        signerAddress = '';
      }
    }
    const probeSender = infra.contractOwner || signerAddress || profitWallet;

    const tokenUsdPrice = (sym: string): number => {
      const u = sym.toUpperCase();
      if (u === baseToken.sym.toUpperCase()) return baseUsd;
      if (u === quoteToken!.sym.toUpperCase()) return quoteUsd;
      if (['USDC', 'USDC.E', 'USDBC', 'USDT', 'DAI', 'FRAX', 'USDE', 'APEUSD'].includes(u)) return 1;
      if (u === 'WETH' || u === 'ETH' || u === 'APEETH') return ethUsd;
      if (u === chainMeta.wrappedNativeSymbol.toUpperCase() || u === chainMeta.nativeSymbol.toUpperCase()) return nativeUsd;
      return getLiveTokenUsdPrice(sym, chain) || 1;
    };

    const probeBatch = candidates.map((cand, idx) => ({
      jsonrpc: '2.0',
      id: idx + 1,
      method: 'eth_call',
      params: [
        {
          from: probeSender,
          to: contractAddr,
          data: buildMaxProfitProbeCalldata(cand),
        },
        'latest',
      ],
    }));

    const { results: probeResults } = await fetchRpcBatchWithFailover(chain, probeBatch);

    const defaultGasUnits = 185000;
    const defaultGasCostUsd = Number((((defaultGasUnits * Number(gasPriceWei)) / 1e18) * nativeUsd).toFixed(4));

    const checkedCandidates: Array<{
      label: string;
      borrowedToken: string;
      amountFormatted: string;
      actualProfitFormatted: string;
      actualProfitUsd: number;
      status: 'PROFITABLE' | 'NO_PROFIT' | 'REVERTED';
      detail: string;
    }> = [];

    let bestPositive: {
      cand: EncodedArbitrageCandidate;
      actualWei: bigint;
      actualFmt: string;
      actualUsd: number;
    } | null = null;
    let firstRevertReason: string | null = null;

    for (const item of probeResults) {
      const idx = Number(item?.id) - 1;
      const cand = candidates[idx];
      if (!cand) continue;
      const amtFmt = ethers.formatUnits(cand.amountUnits, cand.borrowedToken.dec);

      const ins = item?.error ? parseInsufficientProfitError(item.error) : null;
      if (ins) {
        const actualFmt = ethers.formatUnits(ins.actual, cand.borrowedToken.dec);
        const actualUsd = Number((Number(actualFmt) * tokenUsdPrice(cand.borrowedToken.sym)).toFixed(4));
        const isPos = ins.actual > 0n;
        checkedCandidates.push({
          label: cand.label,
          borrowedToken: cand.borrowedToken.sym,
          amountFormatted: amtFmt,
          actualProfitFormatted: actualFmt,
          actualProfitUsd: actualUsd,
          status: isPos ? 'PROFITABLE' : 'NO_PROFIT',
          detail: isPos
            ? `On-chain round-trip returned +${actualFmt} ${cand.borrowedToken.sym} (+$${actualUsd.toFixed(2)})`
            : `InsufficientProfit(actual=0): live ${buyParsed.dex} -> ${sellParsed.dex} pool spread is negative after DEX fees & price impact (0 profit on-chain).`,
        });
        const bestNetUsd = bestPositive ? bestPositive.actualUsd - defaultGasCostUsd : -Infinity;
        if (isPos && (!bestPositive || (actualUsd - defaultGasCostUsd) > bestNetUsd)) {
          bestPositive = { cand, actualWei: ins.actual, actualFmt, actualUsd };
        }
      } else {
        const reason = item?.error ? decodeFlashArbRevertError(item.error) : 'No revert / unexpected state';
        if (!firstRevertReason) firstRevertReason = reason;
        checkedCandidates.push({
          label: cand.label,
          borrowedToken: cand.borrowedToken.sym,
          amountFormatted: amtFmt,
          actualProfitFormatted: '0',
          actualProfitUsd: 0,
          status: 'REVERTED',
          detail: reason,
        });
      }
    }

    // Check eth_estimateGas if a positive profit candidate was found
    let verifiedCandidate: EncodedArbitrageCandidate | null = null;
    let estimatedGas = 0n;
    let gasCostUsd = defaultGasCostUsd;
    let revertReason: string | null = null;

    if (bestPositive) {
      const tokPx = tokenUsdPrice(bestPositive.cand.borrowedToken.sym);
      const minRequiredUsd = minProfitUsd + defaultGasCostUsd;
      const floorWei =
        minRequiredUsd > 0 && tokPx > 0 ? toTokenUnits(minRequiredUsd / tokPx, bestPositive.cand.borrowedToken.dec) : 1n;
      const seventyFivePctActual = (bestPositive.actualWei * 75n) / 100n;
      const desiredMin = floorWei > seventyFivePctActual ? floorWei : seventyFivePctActual;
      const maxSafeMin = bestPositive.actualWei > 1n ? bestPositive.actualWei - 1n : 1n;
      const tightenedMin = desiredMin > maxSafeMin ? maxSafeMin : desiredMin > 1n ? desiredMin : 1n;

      const tightenedCand = rebuildCandidateWithMinProfit(bestPositive.cand, tightenedMin);
      try {
        const { result: gasHex } = await fetchRpcSingleWithFailover(
          chain,
          'eth_estimateGas',
          [{ from: probeSender, to: contractAddr, data: tightenedCand.calldata }, 'latest'],
          true
        );
        if (typeof gasHex === 'string' && gasHex.startsWith('0x')) {
          estimatedGas = BigInt(gasHex);
          gasCostUsd = Number((((Number(estimatedGas) * Number(gasPriceWei)) / 1e18) * nativeUsd).toFixed(4));
          if (bestPositive.actualUsd >= minProfitUsd + gasCostUsd) {
            verifiedCandidate = tightenedCand;
          } else {
            revertReason = `On-chain profit ($${bestPositive.actualUsd.toFixed(4)}) is below Min Profit ($${minProfitUsd.toFixed(2)}) + Gas ($${gasCostUsd.toFixed(4)}).`;
          }
        }
      } catch (gasErr: any) {
        revertReason = decodeFlashArbRevertError(gasErr);
      }
    } else {
      revertReason =
        checkedCandidates.find((c) => c.status === 'NO_PROFIT')?.detail ||
        firstRevertReason ||
        `No positive on-chain arbitrage spread across ${buyParsed.dex} <-> ${sellParsed.dex} for ${pair} at current pool prices.`;
    }

    const actualGrossProfitUsd = bestPositive ? bestPositive.actualUsd : 0;
    const netOnChainProfitUsd = Number((actualGrossProfitUsd - (bestPositive ? gasCostUsd : 0)).toFixed(4));
    const onChainProfitable = Boolean(verifiedCandidate && netOnChainProfitUsd >= minProfitUsd);

    if (!params.execute) {
      return {
        ok: true,
        statusCode: 200,
        chain,
        pair,
        baseToken: baseToken.sym,
        quoteToken: quoteToken.sym,
        buyDex: buyParsed.dex,
        sellDex: sellParsed.dex,
        buyFeePercent,
        sellFeePercent,
        contractAddress: contractAddr,
        contractDeployed: true,
        verifiedOnChain: true,
        executable: onChainProfitable,
        onChainProfitable,
        actualGrossProfitUsd,
        actualProfitTokens: bestPositive ? bestPositive.actualFmt : '0',
        borrowedToken: bestPositive ? bestPositive.cand.borrowedToken.sym : baseToken.sym,
        gasEstimateUnits: estimatedGas > 0n ? Number(estimatedGas) : defaultGasUnits,
        gasCostUsd,
        netOnChainProfitUsd,
        revertReason: onChainProfitable ? null : revertReason,
        checkedCandidates,
      };
    }

    // Execute path: strictly require valid signer key, matching contract owner, AND verified positive on-chain profit
    if (!signerKey || !signerAddress) {
      return {
        ...baseFailResult(409, 'Configure FLASH_ARB_SIGNER_KEY in Signer Key Config before broadcasting.', {
          verifiedOnChain: true,
          requiresWallet: true,
        }),
        checkedCandidates,
      };
    }
    if (infra.contractOwner && infra.contractOwner.toLowerCase() !== signerAddress.toLowerCase()) {
      return {
        ...baseFailResult(
          400,
          `Signer wallet ${signerAddress} is not owner of ${contractAddr} (owner is ${infra.contractOwner}).`,
          { verifiedOnChain: true }
        ),
        checkedCandidates,
      };
    }
    if (!verifiedCandidate || estimatedGas <= 0n || !onChainProfitable) {
      return {
        ...baseFailResult(
          422,
          `Broadcast aborted by On-Chain Pre-Flight Profit Guard (0 gas spent): ${revertReason || 'No net-profitable arbitrage spread exists on-chain for this route right now.'}`,
          { verifiedOnChain: true, simulationFailed: true }
        ),
        actualGrossProfitUsd,
        gasCostUsd,
        netOnChainProfitUsd,
        checkedCandidates,
      };
    }

    this.agentState = 'EXECUTING';
    const gasLimitWithHeadroom = (estimatedGas * 125n) / 100n;
    const { txHash: sentTxHash, receipt } = await broadcastSignedTxAndWait({
      chain,
      cleanKey,
      to: contractAddr,
      data: verifiedCandidate.calldata,
      gasLimit: gasLimitWithHeadroom,
      allowAutoSpeedUp: false,
      minBalanceWei: 100000000000000n,
    });
    const isSuccess = receipt.status === 1;
    const decodedSwap = decodeArbitrageSwapsExecutedLogs(receipt.logs || [], contractAddr);
    const sweptAmount = decodedSwap
      ? ethers.formatUnits(decodedSwap.netProfitSwept, verifiedCandidate.borrowedToken.dec)
      : '0';
    const sweptRecipient = decodedSwap ? decodedSwap.recipient : profitWallet;
    const realizedUsd = decodedSwap
      ? Number((Number(sweptAmount) * tokenUsdPrice(verifiedCandidate.borrowedToken.sym)).toFixed(4))
      : 0;

    const borrowedHuman = Number(
      ethers.formatUnits(verifiedCandidate.amountUnits, verifiedCandidate.borrowedToken.dec)
    );
    const actualLoanNotionalUsd = borrowedHuman * tokenUsdPrice(verifiedCandidate.borrowedToken.sym);
    const extraMetrics = computeTradeGasAndFinancingExtra({
      gasUsed: receipt.gasUsed,
      effectiveGasPriceWei: receipt.effectiveGasPrice,
      ethPriceUsd: ethUsd,
      loanNotionalUsd: actualLoanNotionalUsd,
      loanFeePercent: 0,
    });

    let gasSavedEthSwept = '0';
    let gasSweepTxHash: string | undefined;
    let gasForwardedUsd = 0;
    if (isSuccess && signerAddress.toLowerCase() !== profitWallet.toLowerCase() && extraMetrics.gasSavedWei > 0n) {
      try {
        const gasSweep = await sweepGasWalletEthSurplus({
          chain,
          cleanKey,
          signerAddress,
          recipient: profitWallet,
          maxSendWei: extraMetrics.gasSavedWei,
        });
        if (gasSweep.swept && gasSweep.txHash) {
          gasSavedEthSwept = gasSweep.sentEthFormatted;
          gasSweepTxHash = gasSweep.txHash;
          gasForwardedUsd = Number((Number(gasSweep.sentEthFormatted) * ethUsd).toFixed(4));
        }
      } catch {}
    }

    const totalNetProfitUsd = isSuccess ? Number((realizedUsd + gasForwardedUsd).toFixed(4)) : 0;
    const gasCostEth =
      receipt.effectiveGasPrice !== null ? Number(receipt.gasUsed * receipt.effectiveGasPrice) / 1e18 : null;

    const executedTrade: ExecutedAgentTrade = {
      id: `arb-${Date.now()}-${sentTxHash.slice(2, 8)}`,
      chain,
      txHash: sentTxHash,
      timestamp: Date.now(),
      blockNumber: receipt.blockNumber,
      pair,
      buyDex: buyParsed.dex,
      sellDex: sellParsed.dex,
      grossSpreadUsd: actualGrossProfitUsd,
      netProfitUsd: totalNetProfitUsd,
      gasCostEth,
      gasSavedUsd: extraMetrics.gasSavedUsd,
      loanFeeSavedUsd: extraMetrics.loanFeeSavedUsd,
      gasSavedEthSwept: gasSweepTxHash ? gasSavedEthSwept : null,
      gasSweepTxHash: gasSweepTxHash || null,
      status: isSuccess ? 'CONFIRMED' : 'REVERTED',
      explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
      profitRecipient: sweptRecipient,
    };

    this.executedTrades.push(executedTrade);
    this.lastExecutionTimestamp = Date.now();
    this.agentState = isSuccess ? 'TRADE_CONFIRMED' : 'SCANNING';

    if (!isSuccess) {
      return {
        ...baseFailResult(500, `Transaction ${sentTxHash} reverted on-chain after pool state changed.`, {
          verifiedOnChain: true,
        }),
        txHash: sentTxHash,
        explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
        trade: executedTrade,
        checkedCandidates,
      };
    }

    this.lastConfirmedTxHash = sentTxHash;
    this.lastConfirmedBlock = receipt.blockNumber;
    this.lastExecutionNotice = `Confirmed ${verifiedCandidate.label}: swept ${sweptAmount} ${verifiedCandidate.borrowedToken.sym} to ${sweptRecipient}`;

    return {
      ok: true,
      statusCode: 200,
      chain,
      pair,
      baseToken: baseToken.sym,
      quoteToken: quoteToken.sym,
      buyDex: buyParsed.dex,
      sellDex: sellParsed.dex,
      buyFeePercent,
      sellFeePercent,
      contractAddress: contractAddr,
      contractDeployed: true,
      verifiedOnChain: true,
      executable: true,
      onChainProfitable: totalNetProfitUsd > 0,
      actualGrossProfitUsd: realizedUsd,
      actualProfitTokens: sweptAmount,
      borrowedToken: verifiedCandidate.borrowedToken.sym,
      gasEstimateUnits: Number(estimatedGas),
      gasCostUsd,
      netOnChainProfitUsd: totalNetProfitUsd,
      revertReason: null,
      txHash: sentTxHash,
      explorerUrl: `${rpcInfo.explorer}/tx/${sentTxHash}`,
      sweptAmount,
      sweptToken: verifiedCandidate.borrowedToken.sym,
      recipient: sweptRecipient,
      gasSavedUsd: extraMetrics.gasSavedUsd,
      loanFeeSavedUsd: extraMetrics.loanFeeSavedUsd,
      gasSavedEthSwept,
      gasSweepTxHash,
      trade: executedTrade,
      checkedCandidates,
    };
  }

  /**
   * Autonomous Execution Engine:
   * Only executes if isAutonomousExecutionEnabled is true AND an executable opportunity is strictly profitable.
   */
  public async attemptAutonomousExecution() {
    if (!this.isAutonomousExecutionEnabled) {
      if (this.agentState === 'AWAITING_GAS_SIGNER' || this.agentState === 'EXECUTING') {
        this.agentState = 'SCANNING';
      }
      return;
    }

    if (!process.env.FLASH_ARB_SIGNER_KEY) {
      this.agentState = 'AWAITING_GAS_SIGNER';
      return;
    }

    const now = Date.now();
    if (now - this.lastExecutionTimestamp < 15000) {
      return;
    }

    for (const [id, until] of this.failedSimCooldownByOppId.entries()) {
      if (until <= now) this.failedSimCooldownByOppId.delete(id);
    }

    const allOpps = SUPPORTED_SCAN_CHAINS.flatMap((c) => this.opportunitiesByChain[c] || []);
    const candidates = allOpps
      .filter((o) => o.isProfitable && o.contractExecutable && (this.failedSimCooldownByOppId.get(o.id) ?? 0) <= now)
      .sort((a, b) => {
        const netDelta = b.estNetProfitUsd - a.estNetProfitUsd;
        if (Math.abs(netDelta) >= 0.05) return netDelta;
        const ratioA = a.estNetProfitUsd / Math.max(0.002, a.gasCostUsd);
        const ratioB = b.estNetProfitUsd / Math.max(0.002, b.gasCostUsd);
        return ratioB - ratioA;
      })
      .slice(0, 5);

    if (candidates.length === 0) {
      if (this.agentState === 'AWAITING_GAS_SIGNER') this.agentState = 'SCANNING';
      return;
    }

    this.agentState = 'OPPORTUNITY_FOUND';
    for (const candidate of candidates) {
      try {
        const result = await this.verifyAndExecuteOpportunity(candidate, { chain: candidate.chain });
        if (result.txHash) {
          this.lastExecutionTimestamp = Date.now();
          return;
        }
        this.failedSimCooldownByOppId.set(candidate.id, Date.now() + 15000);
      } catch (err: any) {
        this.failedSimCooldownByOppId.set(candidate.id, Date.now() + 15000);
        this.lastExecutionNotice = err?.message || 'Autonomous execution cycle failed';
      }
    }
    this.agentState = 'SCANNING';
  }

  // Last scan error (null when the latest scan fully succeeded)
  public lastError: string | null = null;

  public getRouteExecutionInput(oppId: string): RouteExecutionInput | undefined {
    return this.routeInputsByOppId.get(oppId);
  }

  public getStatusForChain(requestedChain: string) {
    const key = (requestedChain || 'arbitrum').toLowerCase();
    if (key === 'all') {
      const mergedPools = SUPPORTED_SCAN_CHAINS.flatMap((c) => this.poolsByChain[c] || []);
      const mergedOpps = SUPPORTED_SCAN_CHAINS.flatMap((c) => this.opportunitiesByChain[c] || []);
      mergedOpps.sort((a, b) => {
        const profitFlagDelta = Number(b.isProfitable) - Number(a.isProfitable);
        if (profitFlagDelta !== 0) return profitFlagDelta;
        const execDelta = Number(Boolean(b.contractExecutable)) - Number(Boolean(a.contractExecutable));
        if (execDelta !== 0) return execDelta;
        const posEdgeDelta = Number(b.grossSpreadBps > b.dexFeeBps) - Number(a.grossSpreadBps > a.dexFeeBps);
        if (posEdgeDelta !== 0) return posEdgeDelta;
        return b.estNetProfitUsd - a.estNetProfitUsd;
      });
      return {
        chain: 'all' as const,
        latestBlock: this.latestBlockByChain.arbitrum || 0,
        pools: mergedPools,
        opportunities: mergedOpps,
        activeContract: DEPLOYED_CONTRACTS.arbitrum,
        scanError: this.lastErrorByChain.arbitrum,
      };
    }
    const c: SupportedArbChain = parseSupportedChain(key);
    return {
      chain: c,
      latestBlock: this.latestBlockByChain[c] || 0,
      pools: this.poolsByChain[c] || [],
      opportunities: this.opportunitiesByChain[c] || [],
      activeContract: DEPLOYED_CONTRACTS[c] || '',
      scanError: this.lastErrorByChain[c],
    };
  }

  /**
   * Reads real pool state for a single L2 chain (`arbitrum` | `base` | `optimism`) over JSON-RPC Multicall3
   * and builds arbitrage opportunities from measured on-chain depth and live fee tiers.
   */
  public async scanChain(chain: SupportedArbChain): Promise<{
    pools: MonitoredPoolState[];
    opportunities: LiveArbitrageOpportunity[];
    routeInputs: Map<string, RouteExecutionInput>;
    blockNumber: number;
  }> {
    const specs = POOL_SPECS_BY_CHAIN[chain] || [];
    const infra = await this.getChainInfra(chain).catch(() => null);
    const chainRouters = getEffectiveChainDexRouters(
      chain,
      infra
        ? {
            supportsAlgebra: infra.contractSupportsAlgebra,
            supportsCamelotV2: infra.contractSupportsCamelotV2,
            camelotV3Adapter: infra.camelotV3Adapter,
          }
        : undefined
    );
    const rpcLabel = RPC_ENDPOINTS[chain]?.name || chain;

    interface SubCallRef { poolIdx: number; kind: 'state' | 'liquidity' | 'fee' | 'balBase' | 'balQuote' }
    const subCalls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
    const subRefs: SubCallRef[] = [];
    const stateCallIdxByPool = new Array<number>(specs.length).fill(-1);
    const liqCallIdxByPool = new Array<number>(specs.length).fill(-1);
    const feeCallIdxByPool = new Array<number>(specs.length).fill(-1);
    const balBaseCallIdxByPool = new Array<number>(specs.length).fill(-1);
    const balQuoteCallIdxByPool = new Array<number>(specs.length).fill(-1);

    specs.forEach((p, i) => {
      const stateSel =
        p.kind === 'algebra' ? '0xe76c01e4' : p.kind === 'v2' ? '0x0902f1ac' : '0x3850c7bd';
      stateCallIdxByPool[i] = subCalls.length;
      subCalls.push({ target: p.address, allowFailure: true, callData: stateSel });
      subRefs.push({ poolIdx: i, kind: 'state' });
      if (p.kind !== 'v2') {
        liqCallIdxByPool[i] = subCalls.length;
        subCalls.push({ target: p.address, allowFailure: true, callData: '0x1a686502' });
        subRefs.push({ poolIdx: i, kind: 'liquidity' });

        // Query actual ERC-20 token balances inside V3/Algebra/Slipstream pools so narrow out-of-market
        // concentrated ticks with ~$1 real liquidity never create phantom multi-thousand-bps spreads.
        const paddedPool = p.address.toLowerCase().replace('0x', '').padStart(64, '0');
        const balCallData = `0x70a08231${paddedPool}`;
        balBaseCallIdxByPool[i] = subCalls.length;
        subCalls.push({ target: p.base.addr, allowFailure: true, callData: balCallData });
        subRefs.push({ poolIdx: i, kind: 'balBase' });
        balQuoteCallIdxByPool[i] = subCalls.length;
        subCalls.push({ target: p.quote.addr, allowFailure: true, callData: balCallData });
        subRefs.push({ poolIdx: i, kind: 'balQuote' });
      }
      if (p.kind === 'slipstream') {
        feeCallIdxByPool[i] = subCalls.length;
        subCalls.push({ target: p.address, allowFailure: true, callData: '0xddca3f43' });
        subRefs.push({ poolIdx: i, kind: 'fee' });
      }
    });

    const CHUNK_SIZE = 70;
    const rpcBatch: any[] = [
      { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
      { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 2 },
    ];
    const chunkRanges: Array<{ rpcId: number; start: number; end: number }> = [];
    for (let start = 0; start < subCalls.length; start += CHUNK_SIZE) {
      const end = Math.min(subCalls.length, start + CHUNK_SIZE);
      const rpcId = 10 + chunkRanges.length;
      const callData = multicallIface.encodeFunctionData('aggregate3', [subCalls.slice(start, end)]);
      rpcBatch.push({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: MULTICALL3_ADDRESS, data: callData }, 'latest'],
        id: rpcId,
      });
      chunkRanges.push({ rpcId, start, end });
    }

    const { results } = await fetchRpcBatchWithFailover(chain, rpcBatch);

    const byId = new Map<number, string>();
    for (const item of results) {
      if (item && item.id !== undefined && typeof item.result === 'string' && item.result !== '0x') byId.set(item.id, item.result);
    }

    const block = parseInt(byId.get(1) || '', 16);
    const gasPriceWei = byId.get(2) ? Number(BigInt(byId.get(2)!)) : NaN;
    if (!Number.isFinite(block) || !Number.isFinite(gasPriceWei)) {
      throw new Error(`${rpcLabel} RPC returned no block/gas price`);
    }
    this.latestBlockByChain[chain] = block;
    if (chain === 'arbitrum') this.latestBlock = block;

    const returnDatas = new Array<string | null>(subCalls.length).fill(null);
    for (const chunk of chunkRanges) {
      const raw = byId.get(chunk.rpcId);
      if (!raw) continue;
      try {
        const [decoded] = multicallIface.decodeFunctionResult('aggregate3', raw);
        for (let offset = 0; offset < decoded.length; offset++) {
          const entry = decoded[offset];
          if (entry?.success && typeof entry.returnData === 'string' && entry.returnData !== '0x') {
            returnDatas[chunk.start + offset] = entry.returnData;
          }
        }
      } catch {
        // ignore malformed chunk
      }
    }

    const word = (hex: string, i: number) => BigInt('0x' + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
    const Q96 = 2 ** 96;

    interface Read {
      spec: PoolSpec;
      basePerQuote: number;
      depthQuote: number; /* virtual in-range, in quote units */
      actualBaseHuman: number | null;
      actualQuoteHuman: number | null;
      liveFeePercent: number;
    }
    const reads: Read[] = [];
    specs.forEach((p, i) => {
      const state = returnDatas[stateCallIdxByPool[i]];
      if (!state) return;
      const [t0, t1] = p.base.addr.toLowerCase() < p.quote.addr.toLowerCase() ? [p.base, p.quote] : [p.quote, p.base];
      let token1PerToken0: number;
      let depthQuote: number;
      let liveFeePercent = p.fee;
      let actualBaseHuman: number | null = null;
      let actualQuoteHuman: number | null = null;
      try {
        if (p.kind === 'v2') {
          if (state.length < 130) return;
          const r0 = Number(word(state, 0)) / 10 ** t0.dec;
          const r1 = Number(word(state, 1)) / 10 ** t1.dec;
          if (!(r0 > 0 && r1 > 0)) return;
          token1PerToken0 = r1 / r0;
          depthQuote = 2 * (p.quote === t0 ? r0 : r1);
        } else {
          if (state.length < 66) return;
          const sqrt = Number(word(state, 0)) / Q96;
          const liqHex = liqCallIdxByPool[i] >= 0 ? returnDatas[liqCallIdxByPool[i]] : null;
          if (!(sqrt > 0) || !liqHex) return;
          const L = Number(BigInt(liqHex));
          if (!(L > 0)) return;
          if (p.kind === 'algebra' && state.length >= 194) {
            // globalState() word 2 = current dynamic fee in 1e-6 units -> feePercent = rawFee / 10_000
            const algebraFee = Number(word(state, 2));
            if (Number.isFinite(algebraFee) && algebraFee > 0 && algebraFee <= 50000) {
              liveFeePercent = Number((algebraFee / 10000).toFixed(4));
            }
          } else if (p.kind === 'slipstream' && feeCallIdxByPool[i] >= 0) {
            const feeHex = returnDatas[feeCallIdxByPool[i]];
            if (feeHex && feeHex.length >= 66) {
              const slipFee = Number(BigInt(feeHex.slice(0, 66)));
              if (Number.isFinite(slipFee) && slipFee > 0 && slipFee <= 100000) {
                liveFeePercent = Number((slipFee / 10000).toFixed(4));
              }
            }
          }
          const balBaseHex = balBaseCallIdxByPool[i] >= 0 ? returnDatas[balBaseCallIdxByPool[i]] : null;
          const balQuoteHex = balQuoteCallIdxByPool[i] >= 0 ? returnDatas[balQuoteCallIdxByPool[i]] : null;
          if (balBaseHex && balBaseHex.length >= 66) {
            actualBaseHuman = Number(BigInt(balBaseHex.slice(0, 66))) / 10 ** p.base.dec;
          }
          if (balQuoteHex && balQuoteHex.length >= 66) {
            actualQuoteHuman = Number(BigInt(balQuoteHex.slice(0, 66))) / 10 ** p.quote.dec;
          }

          token1PerToken0 = sqrt * sqrt * 10 ** (t0.dec - t1.dec);
          // virtual in-range reserve of the quote token, in raw units -> whole tokens
          const quoteRaw = p.quote === t1 ? L * sqrt : L / sqrt;
          depthQuote = 2 * (quoteRaw / 10 ** p.quote.dec);
        }
      } catch {
        return;
      }
      const quotePerBase = p.base === t0 ? token1PerToken0 : 1 / token1PerToken0;
      if (!Number.isFinite(quotePerBase) || quotePerBase <= 0) return;
      reads.push({ spec: p, basePerQuote: quotePerBase, depthQuote, actualBaseHuman, actualQuoteHuman, liveFeePercent });
    });

    // Reference token USD prices on this chain (WETH, native gas token, WBTC/BTCB, stables)
    const chainMeta = CHAIN_LAYER_META[chain];
    const isStableSym = (s: string) =>
      ['USDC', 'USDC.E', 'USDBC', 'USDT', 'DAI', 'FRAX', 'USDE', 'APEUSD'].includes(s.toUpperCase());
    const findDirectPairRate = (baseSym: string): number | null => {
      const m = reads.find(
        (r) =>
          r.spec.base.sym.toUpperCase() === baseSym.toUpperCase() &&
          isStableSym(r.spec.quote.sym) &&
          r.basePerQuote > 0
      );
      if (m) return m.basePerQuote;
      const rev = reads.find(
        (r) =>
          r.spec.quote.sym.toUpperCase() === baseSym.toUpperCase() &&
          isStableSym(r.spec.base.sym) &&
          r.basePerQuote > 0
      );
      if (rev) return 1 / rev.basePerQuote;
      return null;
    };

    const ethRef =
      reads.find((r) => r.spec.pair === 'WETH/USDC' && r.spec.dex === 'Uniswap V3' && Math.abs(r.spec.fee - 0.05) < 0.001) ||
      reads.find((r) => (r.spec.pair === 'WETH/USDC' || r.spec.pair === 'WETH/USDT') && r.spec.base.sym === 'WETH');
    const ethUsd =
      (ethRef ? ethRef.basePerQuote : null) ||
      findDirectPairRate('WETH') ||
      findDirectPairRate('ApeETH') ||
      getLiveTokenUsdPrice('WETH', chain) ||
      cachedPriceFeed?.ethUsd ||
      null;

    const nativeWrapped = chainMeta.wrappedNativeSymbol;
    let nativeUsd: number | null = chainMeta.nativeSymbol === 'ETH' ? ethUsd : findDirectPairRate(nativeWrapped);
    if (!nativeUsd && chainMeta.nativeSymbol !== 'ETH' && ethUsd) {
      const vsWeth = reads.find(
        (r) =>
          (r.spec.base.sym.toUpperCase() === nativeWrapped.toUpperCase() && r.spec.quote.sym.toUpperCase() === 'WETH') ||
          (r.spec.quote.sym.toUpperCase() === nativeWrapped.toUpperCase() && r.spec.base.sym.toUpperCase() === 'WETH')
      );
      if (vsWeth) {
        nativeUsd = vsWeth.spec.base.sym.toUpperCase() === nativeWrapped.toUpperCase()
          ? vsWeth.basePerQuote * ethUsd
          : ethUsd / vsWeth.basePerQuote;
      } else {
        const vsApeEth = reads.find(
          (r) => r.spec.base.sym === 'ApeETH' && r.spec.quote.sym === 'WAPE' && r.basePerQuote > 0
        );
        if (vsApeEth) nativeUsd = ethUsd / vsApeEth.basePerQuote;
      }
    }
    if (!nativeUsd) {
      nativeUsd =
        getLiveTokenUsdPrice(nativeWrapped, chain) ||
        getLiveTokenUsdPrice(chainMeta.nativeSymbol, chain) ||
        (chainMeta.nativeSymbol === 'ETH' ? ethUsd : null);
    }

    const wbtcRefUsd = findDirectPairRate('WBTC') || findDirectPairRate('BTCB') || getLiveTokenUsdPrice('WBTC', chain);
    const quoteUsd = (q: Tok): number | null => {
      const u = q.sym.toUpperCase();
      if (isStableSym(u)) return 1;
      if (u === 'WETH' || u === 'ETH' || u === 'APEETH') return ethUsd;
      if (u === nativeWrapped.toUpperCase() || u === chainMeta.nativeSymbol.toUpperCase()) return nativeUsd;
      if (u === 'WBTC' || u === 'BTCB' || u === 'CBBTC') return wbtcRefUsd;
      return getLiveTokenUsdPrice(q.sym, chain);
    };

    const now = Date.now();
    const chainTokenList = Object.values(CHAIN_TOKENS[chain] || {});
    const isTokenArbCompatible = (addr: string) => {
      const found = chainTokenList.find((t) => t.addr.toLowerCase() === addr.toLowerCase());
      return found ? found.arbCompatible !== false : true;
    };

    const priced: Array<Read & { priceUsd: number; depthUsd: number; actualBaseUsd?: number; actualQuoteUsd?: number }> = [];
    for (const r of reads) {
      const qUsd = quoteUsd(r.spec.quote);
      if (qUsd === null) continue; // needs ETH/USD and it is unavailable: omit, do not guess
      const priceUsd = r.basePerQuote * qUsd;
      const depthUsd = r.depthQuote * qUsd; // Keep true virtual in-range L*sqrtP depth for V3 marginal slippage slope

      let actualBaseUsd: number | undefined;
      let actualQuoteUsd: number | undefined;
      if (r.spec.kind !== 'v2' && r.actualBaseHuman !== null && r.actualQuoteHuman !== null) {
        actualBaseUsd = r.actualBaseHuman * priceUsd;
        actualQuoteUsd = r.actualQuoteHuman * qUsd;
        const actualTvlUsd = actualBaseUsd + actualQuoteUsd;
        // Require real two-sided ERC-20 TVL in V3/Slipstream/Algebra pools (>= $5K total & >= $250 on each side)
        // to reject abandoned / single-sided narrow concentrated ticks with illusory virtual L depth.
        if (actualTvlUsd < 5000 || Math.min(actualBaseUsd, actualQuoteUsd) < 250) {
          continue;
        }
      }

      if (depthUsd < 5000) continue; // exclude dust/dormant pools
      priced.push({ ...r, priceUsd, depthUsd, actualBaseUsd, actualQuoteUsd });
    }

    const fmtUsd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`);
    const chainPools: MonitoredPoolState[] = priced.map((r) => ({
      id: r.spec.id,
      chain,
      name: r.spec.name,
      dex: r.spec.dex,
      pair: r.spec.pair,
      poolAddress: r.spec.address,
      feeTierPercent: r.liveFeePercent,
      priceUsd: Number(r.priceUsd.toFixed(r.priceUsd < 0.1 ? 6 : r.priceUsd < 10 ? 4 : 2)),
      blockNumber: block,
      lastUpdated: now,
      depthSummary: `${fmtUsd(r.depthUsd)} in-range liquidity (on-chain)`,
    }));

    // Opportunities: evaluate every unordered pool pair (i < j) per token pair
    const opps: LiveArbitrageOpportunity[] = [];
    const chainRouteInputs = new Map<string, RouteExecutionInput>();
    if (ethUsd !== null) {
      const gasPriceGwei = gasPriceWei / 1e9;
      const groups = new Map<string, typeof priced>();
      for (const r of priced) groups.set(r.spec.pair, [...(groups.get(r.spec.pair) || []), r]);
      let routeType = 0;
      for (const [pair, group] of groups) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const a = group[i];
            const b = group[j];
            if (a.spec.address.toLowerCase() === b.spec.address.toLowerCase()) continue;
            routeType++;
            const aIsBuy = a.priceUsd <= b.priceUsd;
            const buy = aIsBuy ? a : b;
            const sell = aIsBuy ? b : a;

            // Physical reserve boundary: buying BASE on `buy` pulls BASE out; selling BASE on `sell` pulls QUOTE out.
            const buyOutCapUsd = buy.actualBaseUsd ?? buy.depthUsd * 0.5;
            const sellOutCapUsd = sell.actualQuoteUsd ?? sell.depthUsd * 0.5;
            const physicalPoolCapUsd = 0.35 * Math.min(buyOutCapUsd, sellOutCapUsd);

            const qUsd = quoteUsd(buy.spec.quote) ?? 1;
            const baseVaultBal = infra?.vaultBalances?.[buy.spec.base.addr.toLowerCase()];
            const quoteVaultBal = infra?.vaultBalances?.[buy.spec.quote.addr.toLowerCase()];
            const hasVaultInfo = Boolean(infra && Object.keys(infra.vaultBalances).length > 0);
            const baseVaultUsd =
              baseVaultBal !== undefined ? (Number(baseVaultBal) / 10 ** buy.spec.base.dec) * buy.priceUsd : 0;
            const quoteVaultUsd =
              quoteVaultBal !== undefined ? (Number(quoteVaultBal) / 10 ** buy.spec.quote.dec) * qUsd : 0;
            const vaultCapUsd = hasVaultInfo ? 0.85 * Math.max(baseVaultUsd, quoteVaultUsd) : Infinity;

            const maxTradeUsd =
              Number.isFinite(vaultCapUsd) && vaultCapUsd > 0
                ? Math.min(physicalPoolCapUsd, vaultCapUsd)
                : physicalPoolCapUsd;

            const opp = this.calculateOptimalParameters({
              chain,
              blockNumber: block,
              pair,
              buyDex: buy.spec.name,
              buyPool: buy.spec.address,
              sellDex: sell.spec.name,
              sellPool: sell.spec.address,
              buyPrice: buy.priceUsd,
              sellPrice: sell.priceUsd,
              feeTierA: buy.liveFeePercent,
              feeTierB: sell.liveFeePercent,
              depthA: buy.depthUsd,
              depthB: sell.depthUsd,
              routeType,
              loanToken: buy.spec.base.sym,
              ethUsd,
              nativeUsd: nativeUsd ?? ethUsd,
              gasPriceGwei,
              lighterRoute: buy.spec.kind !== 'v2' && sell.spec.kind !== 'v2',
              maxTradeUsd,
            });
            if (opp) {
              const buyRouterOk = Boolean(chainRouters[buy.spec.dex]?.supported);
              const sellRouterOk = Boolean(chainRouters[sell.spec.dex]?.supported);
              const contractDeployedOk = Boolean(infra?.contractHasExec);
              const balancerVaultPresent = Boolean(infra?.hasBalancerVault);
              const tokensCompatibleOk =
                isTokenArbCompatible(buy.spec.base.addr) && isTokenArbCompatible(buy.spec.quote.addr);
              const balancerFundedOk = hasVaultInfo
                ? (baseVaultBal ?? 0n) > 0n || (quoteVaultBal ?? 0n) > 0n
                : false;
              opp.contractExecutable =
                buyRouterOk && sellRouterOk && contractDeployedOk && balancerVaultPresent && tokensCompatibleOk && balancerFundedOk;
              opps.push(opp);
              chainRouteInputs.set(opp.id, {
                chain,
                baseToken: buy.spec.base,
                quoteToken: buy.spec.quote,
                buyDex: buy.spec.dex,
                buyFeePercent: buy.liveFeePercent,
                sellDex: sell.spec.dex,
                sellFeePercent: sell.liveFeePercent,
                optimalLoanBaseUnits: opp.optimalLoanAmount,
                buyPriceQuotePerBase: buy.basePerQuote,
                buyPriceUsd: buy.priceUsd,
                estNetProfitUsd: opp.estNetProfitUsd,
              });
            }
          }
        }
      }
    }

    opps.sort((a, b) => {
      const profitFlagDelta = Number(b.isProfitable) - Number(a.isProfitable);
      if (profitFlagDelta !== 0) return profitFlagDelta;
      const execDelta = Number(Boolean(b.contractExecutable)) - Number(Boolean(a.contractExecutable));
      if (execDelta !== 0) return execDelta;
      const posEdgeDelta = Number(b.grossSpreadBps > b.dexFeeBps) - Number(a.grossSpreadBps > a.dexFeeBps);
      if (posEdgeDelta !== 0) return posEdgeDelta;
      const netDelta = b.estNetProfitUsd - a.estNetProfitUsd;
      if (Math.abs(netDelta) > 1e-6) return netDelta;
      return b.grossSpreadBps - a.grossSpreadBps;
    });

    this.poolsByChain[chain] = chainPools;
    this.opportunitiesByChain[chain] = opps;
    this.lastErrorByChain[chain] = null;
    this.lastSuccessfulScanByChain[chain] = now;
    const prefix = `opp-${chain}-`;
    for (const existingKey of this.routeInputsByOppId.keys()) {
      if (existingKey.startsWith(prefix) && !chainRouteInputs.has(existingKey)) {
        this.routeInputsByOppId.delete(existingKey);
      }
    }
    for (const [oppId, routeInput] of chainRouteInputs.entries()) {
      this.routeInputsByOppId.set(oppId, routeInput);
    }

    return {
      pools: chainPools,
      opportunities: opps,
      routeInputs: chainRouteInputs,
      blockNumber: block,
    };
  }

  /**
   * Scans specified chains (or all configured chains) in parallel via Multicall3.
   */
  public async scan(targetChain?: SupportedArbChain | SupportedArbChain[]) {
    if (this.isScanning) return;
    this.isScanning = true;
    try {
      this.scanCount++;
      this.lastScanTimestamp = Date.now();
      const chainsToScan: SupportedArbChain[] = Array.isArray(targetChain)
        ? targetChain
        : targetChain
        ? [targetChain]
        : SUPPORTED_SCAN_CHAINS;
      for (const c of chainsToScan) {
        this.lastAttemptedScanByChain[c] = this.lastScanTimestamp;
      }

      const results = await Promise.allSettled(
        chainsToScan.map((c) => this.scanChain(c))
      );

      let anySucceeded = false;
      results.forEach((r, idx) => {
        const c = chainsToScan[idx];
        if (r.status === 'fulfilled') {
          anySucceeded = true;
        } else {
          const msg = r.reason?.message || String(r.reason);
          this.lastErrorByChain[c] = msg;
          if (Date.now() - (this.lastSuccessfulScanByChain[c] || 0) > 60000) {
            this.poolsByChain[c] = [];
            this.opportunitiesByChain[c] = [];
          }
          console.warn(`Flash-arb ${c} scan notice (recovering with failover/backoff):`, msg);
        }
      });

      this.pools = this.poolsByChain.arbitrum;
      this.opportunities = this.opportunitiesByChain.arbitrum;
      this.latestBlock = this.latestBlockByChain.arbitrum || this.latestBlock;
      this.lastError = this.lastErrorByChain.arbitrum;

      // Prune stale routeInputs to avoid unbounded growth across scans
      const activeOppIds = new Set<string>(
        SUPPORTED_SCAN_CHAINS.flatMap((c) => (this.opportunitiesByChain[c] || []).map((o) => o.id))
      );
      for (const existingKey of this.routeInputsByOppId.keys()) {
        if (!activeOppIds.has(existingKey)) {
          this.routeInputsByOppId.delete(existingKey);
        }
      }

      if (anySucceeded) {
        this.consecutiveFailures = 0;
        this.lastSuccessfulScan = Date.now();
        await this.attemptAutonomousExecution();
      } else {
        this.consecutiveFailures++;
      }
    } catch (err: any) {
      this.consecutiveFailures++;
      this.lastError = err?.message || String(err);
      if (Date.now() - this.lastSuccessfulScan > 60000) {
        this.pools = [];
        this.opportunities = [];
      }
      console.warn('Flash-arb scan notice (recovering with failover/backoff):', this.lastError);
    } finally {
      this.isScanning = false;
    }
  }
}

// Global Agent Singleton Instance
const liveAgent = new LiveMevAgent();

/**
 * GET /api/flash-arb/agent/status
 * Returns real-time autonomous agent status, live on-chain pool prices, and detected opportunities
 */
flashArbRouter.get('/agent/status', (req: Request, res: Response) => {
  const chainParam = String(req.query.chain || 'arbitrum').toLowerCase();
  liveAgent.markUiChainActive(chainParam);
  const statusView = liveAgent.getStatusForChain(chainParam);
  res.json({
    success: true,
    chain: statusView.chain,
    isRunning: liveAgent.isRunning,
    scanCount: liveAgent.scanCount,
    latestBlock: statusView.latestBlock,
    lastScanTimestamp: liveAgent.lastScanTimestamp,
    poolsCount: statusView.pools.length,
    pools: statusView.pools,
    opportunities: statusView.opportunities,
    executedTrades: liveAgent.executedTrades.slice(-20),
    activeContract: statusView.activeContract,
    arbitrumCapabilities: liveAgent.getCachedChainCapabilities('arbitrum'),
    countsByChain: Object.fromEntries(SUPPORTED_SCAN_CHAINS.map((c) => [c, (liveAgent.poolsByChain[c] || []).length])),
    oppsCountByChain: Object.fromEntries(SUPPORTED_SCAN_CHAINS.map((c) => [c, (liveAgent.opportunitiesByChain[c] || []).length])),
    blocksByChain: liveAgent.latestBlockByChain,
    errorsByChain: liveAgent.lastErrorByChain,
    chainMeta: CHAIN_LAYER_META,
    gasWallet: gasWalletEnv(),
    profitWallet: profitWalletEnv(),
    agentState: liveAgent.agentState,
    isSignerConfigured: Boolean(process.env.FLASH_ARB_SIGNER_KEY),
    lastConfirmedTxHash: liveAgent.lastConfirmedTxHash,
    lastConfirmedBlock: liveAgent.lastConfirmedBlock,
    lastExecutionNotice: liveAgent.lastExecutionNotice,
    scanError: statusView.scanError,
    config: {
      minProfitThresholdUsd: liveAgent.minProfitThresholdUsd,
      maxProfitCap: null, // No maximum profit cap (unbounded upside)
      gasOptimizationMode: liveAgent.gasOptimizationMode,
      autoOptimizeSize: liveAgent.autoOptimizeSize,
      minClipUsd: liveAgent.minClipUsd,
      maxLoanEthEquivalent: liveAgent.maxLoanEthEquivalent,
      fixedClipUsd: liveAgent.fixedClipUsd,
      isAutonomousExecutionEnabled: liveAgent.isAutonomousExecutionEnabled,
      profitGuardActive: true,
    },
  });
});

/**
 * GET /api/flash-arb/agent/config
 * Retrieves current parameter optimizer and profit guard configurations
 */
flashArbRouter.get('/agent/config', (_req: Request, res: Response) => {
  res.json({
    success: true,
    minProfitThresholdUsd: liveAgent.minProfitThresholdUsd,
    maxProfitCap: null, // No maximum profit cap (unbounded upside)
    gasOptimizationMode: liveAgent.gasOptimizationMode,
    autoOptimizeSize: liveAgent.autoOptimizeSize,
    minClipUsd: liveAgent.minClipUsd,
    maxLoanEthEquivalent: liveAgent.maxLoanEthEquivalent,
    fixedClipUsd: liveAgent.fixedClipUsd,
    isAutonomousExecutionEnabled: liveAgent.isAutonomousExecutionEnabled,
    profitGuardActive: true,
  });
});

/**
 * POST /api/flash-arb/agent/config
 * Updates dynamic optimizer parameters and strict profit guard threshold
 */
flashArbRouter.post('/agent/config', (req: Request, res: Response) => {
  try {
    const {
      minProfitThresholdUsd,
      gasOptimizationMode,
      autoOptimizeSize,
      minClipUsd,
      maxLoanEthEquivalent,
      fixedClipUsd,
      isAutonomousExecutionEnabled,
      optimizePreset,
    } = req.body || {};

    if (optimizePreset === true) {
      liveAgent.applyOptimalParametersPreset();
    }
    if (typeof minProfitThresholdUsd === 'number' && Number.isFinite(minProfitThresholdUsd) && minProfitThresholdUsd >= 0) {
      liveAgent.minProfitThresholdUsd = minProfitThresholdUsd;
    }
    if (['ECO', 'HYPER_ALPHA', 'AGGRESSIVE'].includes(gasOptimizationMode)) {
      liveAgent.gasOptimizationMode = gasOptimizationMode;
    }
    if (typeof autoOptimizeSize === 'boolean') {
      liveAgent.autoOptimizeSize = autoOptimizeSize;
    }
    if (typeof minClipUsd === 'number' && Number.isFinite(minClipUsd) && minClipUsd >= 0.5 && minClipUsd <= 10000) {
      liveAgent.minClipUsd = minClipUsd;
    }
    if (typeof maxLoanEthEquivalent === 'number' && Number.isFinite(maxLoanEthEquivalent) && maxLoanEthEquivalent >= 1 && maxLoanEthEquivalent <= 500) {
      liveAgent.maxLoanEthEquivalent = maxLoanEthEquivalent;
    }
    if (typeof fixedClipUsd === 'number' && Number.isFinite(fixedClipUsd) && fixedClipUsd >= 10 && fixedClipUsd <= 500000) {
      liveAgent.fixedClipUsd = fixedClipUsd;
    }
    if (typeof isAutonomousExecutionEnabled === 'boolean') {
      liveAgent.isAutonomousExecutionEnabled = isAutonomousExecutionEnabled;
      if (isAutonomousExecutionEnabled) {
        if (!liveAgent.isRunning) {
          liveAgent.start();
        } else {
          liveAgent.agentState = !process.env.FLASH_ARB_SIGNER_KEY ? 'AWAITING_GAS_SIGNER' : 'SCANNING';
        }
      } else if (
        liveAgent.agentState === 'AWAITING_GAS_SIGNER' ||
        liveAgent.agentState === 'EXECUTING' ||
        liveAgent.agentState === 'OPPORTUNITY_FOUND'
      ) {
        liveAgent.agentState = liveAgent.isRunning ? 'SCANNING' : 'IDLE';
      }
    }

    if (liveAgent.isAutonomousExecutionEnabled) {
      const deployedAndActive = Array.from(
        new Set<SupportedArbChain>([
          ...SUPPORTED_SCAN_CHAINS.filter((c) => Boolean(DEPLOYED_CONTRACTS[c])),
          liveAgent.getActiveUiChain(),
        ])
      );
      void liveAgent.scan(deployedAndActive);
    } else {
      void liveAgent.scan(liveAgent.getActiveUiChain());
    }

    return res.json({
      success: true,
      message: 'Agent optimizer parameters and profit guard updated successfully',
      isRunning: liveAgent.isRunning,
      agentState: liveAgent.agentState,
      config: {
        minProfitThresholdUsd: liveAgent.minProfitThresholdUsd,
        maxProfitCap: null,
        gasOptimizationMode: liveAgent.gasOptimizationMode,
        autoOptimizeSize: liveAgent.autoOptimizeSize,
        minClipUsd: liveAgent.minClipUsd,
        maxLoanEthEquivalent: liveAgent.maxLoanEthEquivalent,
        fixedClipUsd: liveAgent.fixedClipUsd,
        isAutonomousExecutionEnabled: liveAgent.isAutonomousExecutionEnabled,
        profitGuardActive: true,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/flash-arb/agent/optimize
 * Applies the L2-calibrated optimal parameter profile (ECO 0-tip FCFS/1-milligwei OP-stack,
 * closed-form S* depth sizing from $1 to 100 ETH eq, $0.01 strict Profit Guard) and runs a fresh live scan.
 */
flashArbRouter.post('/agent/optimize', async (_req: Request, res: Response) => {
  try {
    liveAgent.applyOptimalParametersPreset();
    await liveAgent.scan();
    const allOpps = SUPPORTED_SCAN_CHAINS.flatMap((c) => liveAgent.opportunitiesByChain[c] || []);
    const profitableOpps = allOpps.filter((o) => o.isProfitable);
    const positiveEdgeCount = allOpps.filter((o) => o.grossSpreadBps > o.dexFeeBps).length;
    const topBest = [...allOpps]
      .sort((a, b) => {
        const profitFlagDelta = Number(b.isProfitable) - Number(a.isProfitable);
        if (profitFlagDelta !== 0) return profitFlagDelta;
        const execDelta = Number(Boolean(b.contractExecutable)) - Number(Boolean(a.contractExecutable));
        if (execDelta !== 0) return execDelta;
        const posEdgeDelta = Number(b.grossSpreadBps > b.dexFeeBps) - Number(a.grossSpreadBps > a.dexFeeBps);
        if (posEdgeDelta !== 0) return posEdgeDelta;
        const netDelta = b.estNetProfitUsd - a.estNetProfitUsd;
        if (Math.abs(netDelta) > 1e-6) return netDelta;
        return b.grossSpreadBps - a.grossSpreadBps;
      })
      .slice(0, 5);

    return res.json({
      success: true,
      message: `Optimized parameters applied (ECO L2 gas, Dynamic S* $1–${liveAgent.maxLoanEthEquivalent} ETH eq, Profit Guard $${liveAgent.minProfitThresholdUsd.toFixed(2)}). Found ${profitableOpps.length} profitable / ${positiveEdgeCount} positive-edge routes across ${allOpps.length} evaluated.`,
      config: {
        minProfitThresholdUsd: liveAgent.minProfitThresholdUsd,
        maxProfitCap: null,
        gasOptimizationMode: liveAgent.gasOptimizationMode,
        autoOptimizeSize: liveAgent.autoOptimizeSize,
        minClipUsd: liveAgent.minClipUsd,
        maxLoanEthEquivalent: liveAgent.maxLoanEthEquivalent,
        fixedClipUsd: liveAgent.fixedClipUsd,
        isAutonomousExecutionEnabled: liveAgent.isAutonomousExecutionEnabled,
        profitGuardActive: true,
      },
      summary: {
        evaluatedRoutes: allOpps.length,
        positiveEdgeRoutes: positiveEdgeCount,
        profitableRoutes: profitableOpps.length,
        executableProfitableRoutes: profitableOpps.filter((o) => o.contractExecutable).length,
        topRoutes: topBest.map((o) => ({
          chain: o.chain,
          pair: o.pair,
          buyDex: o.buyDex,
          sellDex: o.sellDex,
          loanAmount: o.optimalLoanAmount,
          loanToken: o.loanToken,
          grossSpreadBps: o.grossSpreadBps,
          dexFeeBps: o.dexFeeBps,
          gasCostUsd: o.gasCostUsd,
          estNetProfitUsd: o.estNetProfitUsd,
          isProfitable: o.isProfitable,
          contractExecutable: Boolean(o.contractExecutable),
        })),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/flash-arb/agent/verify-v3
 * Read-only on-chain verification of executable V3 routes across Arbitrum, Base, and Optimism
 * using real deployed FlashArbOptimized contracts (`eth_call` with minProfit=1n / MaxUint256, 0 gas spent).
 */
flashArbRouter.post('/agent/verify-v3', async (req: Request, res: Response) => {
  try {
    const rawChain = String(req.body?.chain || req.query?.chain || 'deployed').toLowerCase();
    const chainsToCheck: SupportedArbChain[] = isSupportedArbChain(rawChain)
      ? [rawChain]
      : rawChain === 'deployed'
      ? SUPPORTED_SCAN_CHAINS.filter((c) => Boolean(DEPLOYED_CONTRACTS[c]))
      : SUPPORTED_SCAN_CHAINS;

    const now = Date.now();
    const staleChains = chainsToCheck.filter(
      (c) =>
        (liveAgent.poolsByChain[c] || []).length === 0 ||
        now - (liveAgent.lastAttemptedScanByChain[c] || 0) > 8_000
    );
    if (staleChains.length > 0) {
      await liveAgent.scan(staleChains);
    }

    const report: Array<{
      chain: SupportedArbChain;
      contractAddress: string;
      contractDeployed: boolean;
      contractOwner: string | null;
      testedRoutes: Array<{
        pair: string;
        buyDex: string;
        sellDex: string;
        routeType: number;
        spreadBps: number;
        dexFeeBps: number;
        candidateLabel: string;
        borrowedToken: string;
        amountFormatted: string;
        onChainSwapsExecuted: boolean;
        actualProfitFormatted: string | null;
        status: 'PROFITABLE' | 'EXECUTED_PROFIT_GUARD_OK' | 'REVERTED' | 'SKIPPED';
        detail: string;
      }>;
    }> = [];

    for (const c of chainsToCheck) {
      const infra = await liveAgent.getChainInfra(c, true);
      const chainOpps = (liveAgent.opportunitiesByChain[c] || []).filter((o) => o.contractExecutable);
      const testedRoutes: (typeof report)[0]['testedRoutes'] = [];

      if (!infra.contractHasExec || !infra.contractOwner) {
        report.push({
          chain: c,
          contractAddress: infra.contractAddr,
          contractDeployed: infra.contractHasExec,
          contractOwner: infra.contractOwner,
          testedRoutes,
        });
        continue;
      }

      const maxPerChain = Math.max(1, Math.min(15, Number(req.body?.maxRoutesPerChain || 6) || 6));
      // Pick top routes first, ensuring DEX/routeType diversity across UniV3, PancakeV3, SushiV3, and V3<->V2
      const selectedOpps: LiveArbitrageOpportunity[] = [];
      const seenOppIds = new Set<string>();
      const pushOpp = (o: LiveArbitrageOpportunity) => {
        if (seenOppIds.has(o.id) || selectedOpps.length >= maxPerChain) return;
        seenOppIds.add(o.id);
        selectedOpps.push(o);
      };
      for (const o of chainOpps.slice(0, Math.min(3, maxPerChain))) pushOpp(o);
      const dexHighlights = ['Camelot V3', 'PancakeSwap V3', 'SushiSwap V3', 'Sushiswap V2', 'Uniswap V2', 'BaseSwap V2', 'Camelot V2'];
      for (const dexTag of dexHighlights) {
        const match = chainOpps.find((o) => !seenOppIds.has(o.id) && (o.buyDex.includes(dexTag) || o.sellDex.includes(dexTag)));
        if (match) pushOpp(match);
      }
      for (const o of chainOpps) {
        if (selectedOpps.length >= maxPerChain) break;
        pushOpp(o);
      }

      const recipient = profitWalletEnv() || infra.contractOwner;
      const routerCaps: RouterCapabilityOptions = {
        supportsAlgebra: infra.contractSupportsAlgebra,
        supportsCamelotV2: infra.contractSupportsCamelotV2,
        camelotV3Adapter: infra.camelotV3Adapter,
      };
      const allBatchCalls: any[] = [];
      const callMeta: Array<{ oppIdx: number; opp: LiveArbitrageOpportunity; cand: EncodedArbitrageCandidate }> = [];

      selectedOpps.forEach((opp, oppIdx) => {
        const routeInput = liveAgent.getRouteExecutionInput(opp.id);
        if (!routeInput) return;
        const cands = buildScaledArbitrageCandidates(
          { ...routeInput, chain: c },
          recipient,
          infra.vaultBalances,
          [1, 0.25],
          routerCaps
        );
        // Pick up to 1 candidate per borrow direction (Base & Quote) so zero-balance/tight-vault directions are bypassed automatically
        const seenDirs = new Set<string>();
        for (const cand of cands) {
          const dirKey = cand.borrowedToken.addr.toLowerCase();
          if (seenDirs.has(dirKey)) continue;
          seenDirs.add(dirKey);
          allBatchCalls.push({
            jsonrpc: '2.0',
            id: allBatchCalls.length + 1,
            method: 'eth_call',
            params: [
              {
                from: infra.contractOwner,
                to: infra.contractAddr,
                data: buildMaxProfitProbeCalldata(cand),
              },
              'latest',
            ],
          });
          callMeta.push({ oppIdx, opp, cand });
        }
      });

      if (allBatchCalls.length > 0) {
        const { results } = await fetchRpcBatchWithFailover(c, allBatchCalls);
        const bestByOpp = new Map<number, (typeof report)[0]['testedRoutes'][0] & { _score: number }>();

        for (const item of results) {
          const meta = callMeta[Number(item?.id) - 1];
          if (!meta) continue;
          const { oppIdx, opp, cand } = meta;
          const ins = item?.error ? parseInsufficientProfitError(item.error) : null;
          if (ins) {
            const actualFmt = ethers.formatUnits(ins.actual, cand.borrowedToken.dec);
            const score = ins.actual > 0n ? 2 + Number(actualFmt) : 1;
            const entry: (typeof report)[0]['testedRoutes'][0] & { _score: number } = {
              _score: score,
              pair: opp.pair,
              buyDex: opp.buyDex,
              sellDex: opp.sellDex,
              routeType: cand.routeType,
              spreadBps: opp.grossSpreadBps,
              dexFeeBps: opp.dexFeeBps,
              candidateLabel: cand.label,
              borrowedToken: cand.borrowedToken.sym,
              amountFormatted: ethers.formatUnits(cand.amountUnits, cand.borrowedToken.dec),
              onChainSwapsExecuted: true,
              actualProfitFormatted: actualFmt,
              status: ins.actual > 0n ? 'PROFITABLE' : 'EXECUTED_PROFIT_GUARD_OK',
              detail:
                ins.actual > 0n
                  ? `Positive on-chain return: +${actualFmt} ${cand.borrowedToken.sym}`
                  : 'Flash loan + both V3/V2 router swaps executed cleanly; Profit Guard enforced (0 loss).',
            };
            const prev = bestByOpp.get(oppIdx);
            if (!prev || entry._score > prev._score) bestByOpp.set(oppIdx, entry);
          } else if (!bestByOpp.has(oppIdx)) {
            const reason = item?.error ? decodeFlashArbRevertError(item.error) : 'Unexpected return';
            bestByOpp.set(oppIdx, {
              _score: 0,
              pair: opp.pair,
              buyDex: opp.buyDex,
              sellDex: opp.sellDex,
              routeType: cand.routeType,
              spreadBps: opp.grossSpreadBps,
              dexFeeBps: opp.dexFeeBps,
              candidateLabel: cand.label,
              borrowedToken: cand.borrowedToken.sym,
              amountFormatted: ethers.formatUnits(cand.amountUnits, cand.borrowedToken.dec),
              onChainSwapsExecuted: false,
              actualProfitFormatted: null,
              status: 'REVERTED',
              detail: reason,
            });
          }
        }

        for (let idx = 0; idx < selectedOpps.length; idx++) {
          const hit = bestByOpp.get(idx);
          if (hit) {
            const { _score: _unused, ...clean } = hit;
            testedRoutes.push(clean);
          }
        }
      }

      report.push({
        chain: c,
        contractAddress: infra.contractAddr,
        contractDeployed: infra.contractHasExec,
        contractOwner: infra.contractOwner,
        testedRoutes,
      });
    }

    return res.json({
      success: true,
      timestamp: Date.now(),
      report,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/flash-arb/agent/start
 * Starts the live continuous background MEV agent
 */
flashArbRouter.post('/agent/start', (req: Request, res: Response) => {
  if (typeof req.body?.enableAutonomous === 'boolean') {
    liveAgent.isAutonomousExecutionEnabled = req.body.enableAutonomous;
  }
  liveAgent.start();
  if (liveAgent.isAutonomousExecutionEnabled) {
    const deployedAndActive = Array.from(
      new Set<SupportedArbChain>([
        ...SUPPORTED_SCAN_CHAINS.filter((c) => Boolean(DEPLOYED_CONTRACTS[c])),
        liveAgent.getActiveUiChain(),
      ])
    );
    void liveAgent.scan(deployedAndActive);
  }
  res.json({
    success: true,
    message: liveAgent.isAutonomousExecutionEnabled
      ? 'Live Continuous Scanner & Autonomous Execution Agent activated'
      : 'Live Continuous MEV Scanner Agent activated',
    isRunning: liveAgent.isRunning,
    isAutonomousExecutionEnabled: liveAgent.isAutonomousExecutionEnabled,
    agentState: liveAgent.agentState,
  });
});

/**
 * POST /api/flash-arb/agent/stop
 * Pauses the live background MEV agent
 */
flashArbRouter.post('/agent/stop', (req: Request, res: Response) => {
  if (req.body?.disableAutonomous === true) {
    liveAgent.isAutonomousExecutionEnabled = false;
  }
  liveAgent.stop();
  res.json({
    success: true,
    message: 'Live Autonomous Arbitrage Agent paused',
    isRunning: liveAgent.isRunning,
    isAutonomousExecutionEnabled: liveAgent.isAutonomousExecutionEnabled,
    agentState: liveAgent.agentState,
  });
});

/**
 * POST /api/flash-arb/agent/trigger
 * Executes an immediate live on-chain flash arb trade with strict Profit Guard and minimal gas
 */
flashArbRouter.post('/agent/trigger', async (req: Request, res: Response) => {
  try {
    const targetChain: SupportedArbChain = parseSupportedChain(req.body?.chain);

    // 1. Run fresh scan on target chain
    await liveAgent.scan(targetChain);
    const chainOpps = liveAgent.opportunitiesByChain[targetChain] || [];
    const sortedOpps = [...chainOpps].sort((a, b) => {
      const readyA = Boolean(a.isProfitable && a.contractExecutable);
      const readyB = Boolean(b.isProfitable && b.contractExecutable);
      if (readyA !== readyB) return Number(readyB) - Number(readyA);
      const execDelta = Number(Boolean(b.contractExecutable)) - Number(Boolean(a.contractExecutable));
      if (execDelta !== 0) return execDelta;
      return b.estNetProfitUsd - a.estNetProfitUsd;
    });
    const opp = req.body?.opportunityId
      ? chainOpps.find((o) => o.id === req.body.opportunityId) || sortedOpps[0]
      : sortedOpps[0];

    if (!opp) {
      return res.status(400).json({ success: false, error: `No live pool route found to execute on ${RPC_ENDPOINTS[targetChain]?.name || targetChain}.` });
    }

    const result = await liveAgent.verifyAndExecuteOpportunity(opp, {
      forceTestExecution: Boolean(req.body?.forceTestExecution),
      chain: targetChain,
    });

    if (!result.ok) {
      return res.status(result.statusCode).json({
        success: false,
        blockedByProfitGuard: result.blockedByProfitGuard,
        simulationFailed: result.simulationFailed,
        requiresWallet: result.requiresWallet,
        requiresContractUpgradeOrAdapter: result.requiresContractUpgradeOrAdapter,
        camelotSetupRequired: result.camelotSetupRequired,
        canDeployAdapter: result.canDeployAdapter,
        recommendUpgradeFlashArb: result.recommendUpgradeFlashArb,
        ownerMismatch: result.ownerMismatch,
        activeContract: result.activeContract,
        activeContractOwner: result.activeContractOwner,
        signerAddress: result.signerAddress,
        txPayload: result.txPayload,
        txHash: result.txHash,
        explorerUrl: result.explorerUrl,
        error: result.error,
        opportunity: opp,
      });
    }

    return res.json({
      success: true,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
      trade: result.trade,
      candidateLabel: result.candidateLabel,
      gasEstimate: result.gasEstimate,
      sweptAmount: result.sweptAmount,
      sweptToken: result.sweptToken,
      recipient: result.recipient,
      gasSavedUsd: result.gasSavedUsd,
      loanFeeSavedUsd: result.loanFeeSavedUsd,
      gasSavedEthSwept: result.gasSavedEthSwept,
      gasSweepTxHash: result.gasSweepTxHash,
      gasSweepNote: result.gasSweepNote,
      opportunity: opp,
    });
  } catch (err: any) {
    liveAgent.agentState = 'SCANNING';
    return res.status(err?.timedOut ? 504 : 500).json({
      success: false,
      timedOut: Boolean(err?.timedOut),
      pendingInMempool: Boolean(err?.pendingInMempool),
      txHash: err?.txHash,
      explorerUrl: err?.explorerUrl,
      nonce: err?.nonce ?? null,
      error: err.message,
    });
  }
});

/**
 * POST /api/flash-arb/simulator/probe
 * Read-only on-chain eth_call (minProfit=MaxUint256) + eth_estimateGas pre-flight check for the Simulator tab.
 */
flashArbRouter.post('/simulator/probe', async (req: Request, res: Response) => {
  try {
    const chain: SupportedArbChain = parseSupportedChain(req.body?.chain);
    const result = await liveAgent.probeOrExecuteSimulatorRoute({
      chain,
      tokenSymbol: String(req.body?.tokenSymbol || 'WETH'),
      quoteSymbol: req.body?.quoteSymbol ? String(req.body.quoteSymbol) : undefined,
      loanAmount: Number(req.body?.loanAmount ?? 1),
      buyDex: String(req.body?.buyDex || 'Uniswap V3 (0.05% Tick)'),
      sellDex: String(req.body?.sellDex || 'PancakeSwap V3'),
      minProfitUsd: req.body?.minProfitUsd !== undefined ? Number(req.body.minProfitUsd) : undefined,
      execute: false,
    });
    return res.status(result.statusCode).json({
      success: result.ok,
      ...result,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Simulator on-chain probe failed' });
  }
});

/**
 * POST /api/flash-arb/simulator/execute
 * Executes FlashArbOptimized.executeOptimizedArbitrage() on-chain ONLY if eth_call + eth_estimateGas prove positive profit.
 */
flashArbRouter.post('/simulator/execute', async (req: Request, res: Response) => {
  try {
    const chain: SupportedArbChain = parseSupportedChain(req.body?.chain);
    const result = await liveAgent.probeOrExecuteSimulatorRoute({
      chain,
      tokenSymbol: String(req.body?.tokenSymbol || 'WETH'),
      quoteSymbol: req.body?.quoteSymbol ? String(req.body.quoteSymbol) : undefined,
      loanAmount: Number(req.body?.loanAmount ?? 1),
      buyDex: String(req.body?.buyDex || 'Uniswap V3 (0.05% Tick)'),
      sellDex: String(req.body?.sellDex || 'PancakeSwap V3'),
      minProfitUsd: req.body?.minProfitUsd !== undefined ? Number(req.body.minProfitUsd) : undefined,
      execute: true,
    });
    return res.status(result.statusCode).json({
      success: result.ok,
      ...result,
    });
  } catch (err: any) {
    liveAgent.agentState = 'SCANNING';
    return res.status(err?.timedOut ? 504 : 500).json({
      success: false,
      timedOut: Boolean(err?.timedOut),
      pendingInMempool: Boolean(err?.pendingInMempool),
      txHash: err?.txHash,
      explorerUrl: err?.explorerUrl,
      nonce: err?.nonce ?? null,
      error: err.message || 'Simulator execution failed',
    });
  }
});

/**
 * POST /api/flash-arb/agent/verify-receipt
 * Polls on-chain JSON-RPC for a transaction receipt and records confirmed trades
 */
flashArbRouter.post('/agent/verify-receipt', async (req: Request, res: Response) => {
  try {
    const { txHash, chain = 'arbitrum', pair, buyDex, sellDex, netProfitUsd, recipient } = req.body;
    if (!txHash || !/^0x[a-fA-F0-9]{64}$/i.test(txHash.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid transaction hash format' });
    }

    const cleanHash = txHash.trim();
    const rpcInfo = RPC_ENDPOINTS[String(chain).toLowerCase()] || RPC_ENDPOINTS.arbitrum;

    // Direct JSON-RPC call with failover across receipt-capable nodes
    const { result: receipt } = await fetchRpcSingleWithFailover(
      String(chain).toLowerCase(),
      'eth_getTransactionReceipt',
      [cleanHash],
      true
    );

    if (!receipt) {
      return res.json({
        success: true,
        isMined: false,
        status: 'PENDING',
        txHash: cleanHash,
        message: 'Transaction is currently pending in the network mempool / block builder.',
        explorerUrl: `${rpcInfo.explorer}/tx/${cleanHash}`,
      });
    }

    const isSuccess = receipt.status === '0x1' || receipt.status === 1;
    const blockNumber = parseInt(receipt.blockNumber, 16);
    const gasUsed = parseInt(receipt.gasUsed, 16);
    const effectiveGasPriceWei = receipt.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice) : null;
    if (!pair || !buyDex || !sellDex) {
      return res.status(400).json({ success: false, error: 'pair, buyDex and sellDex are required to record a trade.' });
    }

    const executedTrade: ExecutedAgentTrade = {
      id: `verified-trade-${Date.now()}`,
      txHash: cleanHash,
      timestamp: Date.now(),
      blockNumber,
      pair,
      buyDex,
      sellDex,
      // Profit figures are only recorded if the caller supplies them; they are never estimated here.
      grossSpreadUsd: null,
      netProfitUsd: typeof netProfitUsd === 'number' ? netProfitUsd : null,
      // Real cost from the receipt (gasUsed x effectiveGasPrice)
      gasCostEth: effectiveGasPriceWei === null ? null : Number(BigInt(gasUsed) * effectiveGasPriceWei) / 1e18,
      status: isSuccess ? 'CONFIRMED' : 'REVERTED',
      explorerUrl: `${rpcInfo.explorer}/tx/${cleanHash}`,
      profitRecipient: recipient || profitWalletEnv(),
    };

    liveAgent.executedTrades.push(executedTrade);
    liveAgent.lastConfirmedTxHash = cleanHash;
    liveAgent.lastConfirmedBlock = blockNumber;
    liveAgent.agentState = 'TRADE_CONFIRMED';

    return res.json({
      success: true,
      isMined: true,
      status: isSuccess ? 'CONFIRMED' : 'REVERTED',
      receipt: {
        blockNumber,
        gasUsed,
        status: isSuccess ? 1 : 0,
        txHash: cleanHash,
        explorerUrl: `${rpcInfo.explorer}/tx/${cleanHash}`,
      },
      trade: executedTrade,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/flash-arb/tx-status?chain=ethereum&txHash=0x...
 * Checks receipt + mempool state + pending signer nonce for any transaction hash
 */
flashArbRouter.get('/tx-status', async (req: Request, res: Response) => {
  try {
    const chain = parseSupportedChain(req.query.chain);
    const txHash = String(req.query.txHash || '').trim();
    if (!/^0x[a-fA-F0-9]{64}$/i.test(txHash)) {
      return res.status(400).json({ success: false, error: 'Valid 66-character 0x txHash is required.' });
    }
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const signerAddress = (process.env.FLASH_ARB_SIGNER_KEY || '').trim()
      ? (() => {
          try {
            const k = process.env.FLASH_ARB_SIGNER_KEY!.trim();
            return new ethers.Wallet(k.startsWith('0x') ? k : `0x${k}`).address;
          } catch {
            return gasWalletEnv();
          }
        })()
      : gasWalletEnv();

    const [receiptResp, txResp, latestNonceResp, pendingNonceResp] = await Promise.all([
      fetchRpcSingleWithFailover(chain, 'eth_getTransactionReceipt', [txHash], true).catch(() => ({ result: null })),
      fetchRpcSingleWithFailover(chain, 'eth_getTransactionByHash', [txHash], true).catch(() => ({ result: null })),
      signerAddress
        ? fetchRpcSingleWithFailover(chain, 'eth_getTransactionCount', [signerAddress, 'latest'], true).catch(() => ({ result: null }))
        : Promise.resolve({ result: null }),
      signerAddress
        ? fetchRpcSingleWithFailover(chain, 'eth_getTransactionCount', [signerAddress, 'pending'], true).catch(() => ({ result: null }))
        : Promise.resolve({ result: null }),
    ]);

    const receipt = receiptResp?.result;
    const txObj = txResp?.result;
    const latestNonce = typeof latestNonceResp?.result === 'string' ? parseInt(latestNonceResp.result, 16) : null;
    const pendingNonce = typeof pendingNonceResp?.result === 'string' ? parseInt(pendingNonceResp.result, 16) : null;

    if (receipt && receipt.blockNumber) {
      const ok = receipt.status === '0x1' || receipt.status === 1;
      const effGasGwei = receipt.effectiveGasPrice ? Number(BigInt(receipt.effectiveGasPrice)) / 1e9 : null;
      return res.json({
        success: true,
        chain,
        txHash,
        status: ok ? 'CONFIRMED' : 'REVERTED',
        isMined: true,
        blockNumber: parseInt(receipt.blockNumber, 16),
        gasUsed: receipt.gasUsed ? BigInt(receipt.gasUsed).toString() : null,
        effectiveGasPriceGwei: effGasGwei !== null ? Number(effGasGwei.toFixed(6)) : null,
        nonce: txObj?.nonce ? parseInt(txObj.nonce, 16) : null,
        signerLatestNonce: latestNonce,
        signerPendingNonce: pendingNonce,
        explorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
      });
    }

    if (txObj) {
      const maxFeeGwei = txObj.maxFeePerGas ? Number(BigInt(txObj.maxFeePerGas)) / 1e9 : null;
      const priorityGwei = txObj.maxPriorityFeePerGas ? Number(BigInt(txObj.maxPriorityFeePerGas)) / 1e9 : null;
      return res.json({
        success: true,
        chain,
        txHash,
        status: 'PENDING',
        isMined: false,
        nonce: txObj.nonce ? parseInt(txObj.nonce, 16) : null,
        maxFeePerGasGwei: maxFeeGwei !== null ? Number(maxFeeGwei.toFixed(6)) : null,
        maxPriorityFeePerGasGwei: priorityGwei !== null ? Number(priorityGwei.toFixed(6)) : null,
        signerLatestNonce: latestNonce,
        signerPendingNonce: pendingNonce,
        explorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
      });
    }

    return res.json({
      success: true,
      chain,
      txHash,
      status: 'NOT_FOUND',
      isMined: false,
      signerLatestNonce: latestNonce,
      signerPendingNonce: pendingNonce,
      explorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed to inspect tx status' });
  }
});

/**
 * POST /api/flash-arb/tx-speedup
 * Replaces a pending signer transaction on the same nonce with bumped EIP-1559 fees (RBF)
 */
flashArbRouter.post('/tx-speedup', async (req: Request, res: Response) => {
  try {
    const chain = parseSupportedChain(req.body?.chain);
    const txHash = String(req.body?.txHash || '').trim();
    const cancel = Boolean(req.body?.cancel);
    const rawKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    if (!rawKey) {
      return res.status(409).json({ success: false, requiresWallet: true, error: 'FLASH_ARB_SIGNER_KEY is not configured.' });
    }
    const cleanKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;
    const signerAddress = new ethers.Wallet(cleanKey).address;
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;

    if (!/^0x[a-fA-F0-9]{64}$/i.test(txHash)) {
      return res.status(400).json({ success: false, error: 'Valid 66-character 0x txHash is required.' });
    }

    const [receiptResp, txResp] = await Promise.all([
      fetchRpcSingleWithFailover(chain, 'eth_getTransactionReceipt', [txHash], true).catch(() => ({ result: null })),
      fetchRpcSingleWithFailover(chain, 'eth_getTransactionByHash', [txHash], true).catch(() => ({ result: null })),
    ]);

    if (receiptResp?.result?.blockNumber) {
      return res.json({
        success: true,
        alreadyMined: true,
        txHash,
        status: receiptResp.result.status === '0x1' ? 'CONFIRMED' : 'REVERTED',
        blockNumber: parseInt(receiptResp.result.blockNumber, 16),
        explorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
      });
    }

    const pendingTx = txResp?.result;
    if (!pendingTx) {
      return res.status(404).json({
        success: false,
        error: `Transaction ${txHash} was not found in ${rpcInfo.name} mempool (may already be dropped or replaced).`,
      });
    }
    if (String(pendingTx.from || '').toLowerCase() !== signerAddress.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: `Transaction sender ${pendingTx.from} does not match configured signer ${signerAddress}.`,
      });
    }

    const nonce = parseInt(pendingTx.nonce, 16);
    const gasLimit = cancel ? 21000n : pendingTx.gas ? BigInt(pendingTx.gas) : 300000n;
    const prevMaxFee = pendingTx.maxFeePerGas ? BigInt(pendingTx.maxFeePerGas) : pendingTx.gasPrice ? BigInt(pendingTx.gasPrice) : 0n;
    const prevPriority = pendingTx.maxPriorityFeePerGas ? BigInt(pendingTx.maxPriorityFeePerGas) : 0n;

    const { txHash: replacementHash, receipt } = await broadcastSignedTxAndWait({
      chain,
      cleanKey,
      to: cancel ? signerAddress : pendingTx.to,
      data: cancel ? '0x' : pendingTx.input || '0x',
      valueWei: cancel ? 0n : pendingTx.value ? BigInt(pendingTx.value) : 0n,
      gasLimit,
      nonceOverride: nonce,
      urgencyMultiplierPct: prevMaxFee > 0n || prevPriority > 0n ? 150 : 135,
      allowAutoSpeedUp: true,
    });

    return res.json({
      success: receipt.status === 1,
      replacedTxHash: txHash,
      txHash: replacementHash,
      nonce,
      cancelled: cancel,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      explorerUrl: `${rpcInfo.explorer}/tx/${replacementHash}`,
      error: receipt.status === 1 ? undefined : `Replacement tx ${replacementHash} reverted on-chain.`,
    });
  } catch (err: any) {
    return res.status(err?.timedOut ? 504 : 500).json({
      success: false,
      timedOut: Boolean(err?.timedOut),
      txHash: err?.txHash,
      explorerUrl: err?.explorerUrl,
      error: err.message || 'Transaction speed-up failed',
    });
  }
});

const CHAIN_ID_HEX_MAP: Record<SupportedArbChain, string> = Object.fromEntries(
  ALL_SUPPORTED_ARB_CHAINS.map((c) => [c, CHAIN_LAYER_META[c].chainIdHex])
) as Record<SupportedArbChain, string>;

const ercProbeIface = new ethers.Interface([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function asset() view returns (address)',
  'function granularity() view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
]);

function normalizeExtraAddresses(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const s = String(item || '').trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(s)) {
      const lower = s.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        out.push(ethers.getAddress(s));
      }
    }
  }
  return out;
}

function normalizeExtraTokenSpecs(input: unknown): ExtraTokenSpec[] {
  if (!Array.isArray(input)) return [];
  const out: ExtraTokenSpec[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    const parsed = parseExtraTokenSpec(item);
    if (!parsed) continue;
    const key = `${parsed.address.toLowerCase()}:${parsed.tokenId ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(parsed);
    }
  }
  return out;
}

function decodeBoolFlag(entry: any): boolean {
  if (!entry?.success || typeof entry?.returnData !== 'string' || entry.returnData.length < 66) return false;
  try {
    return BigInt(entry.returnData.slice(0, 66)) === 1n;
  } catch {
    return false;
  }
}

function decodeStringOrBytes32(hex: string | undefined): string | null {
  if (!hex || hex === '0x') return null;
  try {
    const [sym] = ercProbeIface.decodeFunctionResult('symbol', hex);
    if (sym && String(sym).trim()) return String(sym).trim();
  } catch {
    // MKR-style bytes32 symbol fallback
    if (hex.length === 66) {
      try {
        const s = ethers.decodeBytes32String(hex).trim();
        if (s) return s;
      } catch {}
    }
  }
  return null;
}

export interface LiveTokenPriceEntry {
  symbol: string;
  priceUsd: number;
  source: string;
  updatedAt: number;
  change24h?: number;
}

export interface LiveTokenPriceFeedResult {
  prices: Record<string, LiveTokenPriceEntry>;
  byChain: Record<SupportedArbChain, Record<string, LiveTokenPriceEntry>>;
  ethUsd: number | null;
  tokenCount: number;
  updatedAt: number;
  sources: string[];
}

export const EXTRA_LLAMA_TOKEN_KEYS: Record<string, { key: string; symbol: string }> = {
  ETH: { key: 'coingecko:ethereum', symbol: 'ETH' },
  BTC: { key: 'coingecko:bitcoin', symbol: 'BTC' },
  SOL: { key: 'coingecko:solana', symbol: 'SOL' },
  TBTC: { key: 'arbitrum:0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40', symbol: 'tBTC' },
  RETH: { key: 'arbitrum:0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8', symbol: 'rETH' },
  WEETH: { key: 'coingecko:wrapped-eeth', symbol: 'weETH' },
  LDO: { key: 'arbitrum:0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60', symbol: 'LDO' },
  CRVUSD: { key: 'coingecko:crvusd', symbol: 'crvUSD' },
  SPA: { key: 'coingecko:sperax', symbol: 'SPA' },
  PEPE: { key: 'coingecko:pepe', symbol: 'PEPE' },
  SHIB: { key: 'coingecko:shiba-inu', symbol: 'SHIB' },
  VELO: { key: 'optimism:0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db', symbol: 'VELO' },
  AERO: { key: 'base:0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO' },
  OP: { key: 'optimism:0x4200000000000000000000000000000000000042', symbol: 'OP' },
  SUSDE: { key: 'coingecko:ethena-staked-usde', symbol: 'sUSDe' },
  POL: { key: 'coingecko:matic-network', symbol: 'POL' },
  BNB: { key: 'coingecko:binancecoin', symbol: 'BNB' },
  AVAX: { key: 'coingecko:avalanche-2', symbol: 'AVAX' },
  APE: { key: 'coingecko:apecoin', symbol: 'APE' },
  SCR: { key: 'coingecko:scroll', symbol: 'SCR' },
  JOE: { key: 'coingecko:joe', symbol: 'JOE' },
  CAKE: { key: 'coingecko:pancakeswap-token', symbol: 'CAKE' },
};

export function buildLlamaPriceQueryKeys(): {
  allKeys: string[];
  chainEntries: Array<{ key: string; chain: SupportedArbChain; sym: string }>;
  extraEntries: Array<{ key: string; symbol: string }>;
} {
  const keySet = new Set<string>();
  const chainEntries: Array<{ key: string; chain: SupportedArbChain; sym: string }> = [];
  const extraEntries: Array<{ key: string; symbol: string }> = [];

  for (const chain of SUPPORTED_SCAN_CHAINS) {
    for (const tok of Object.values(CHAIN_TOKENS[chain])) {
      const key = `${chain}:${tok.addr}`;
      keySet.add(key);
      chainEntries.push({ key, chain, sym: tok.sym });
    }
  }
  for (const extra of Object.values(EXTRA_LLAMA_TOKEN_KEYS)) {
    keySet.add(extra.key);
    extraEntries.push(extra);
  }
  return {
    allKeys: Array.from(keySet),
    chainEntries,
    extraEntries,
  };
}

let cachedPriceFeed: LiveTokenPriceFeedResult | null = null;
let cachedPriceFeedExpiry = 0;
let inFlightPriceFeedPromise: Promise<LiveTokenPriceFeedResult> | null = null;

export async function getLiveTokenPriceFeed(forceRefresh = false): Promise<LiveTokenPriceFeedResult> {
  const now = Date.now();
  if (!forceRefresh && cachedPriceFeed && now < cachedPriceFeedExpiry) {
    return cachedPriceFeed;
  }
  if (inFlightPriceFeedPromise) {
    return inFlightPriceFeedPromise;
  }

  inFlightPriceFeedPromise = (async () => {
    const updatedAt = Date.now();
    const prices: Record<string, LiveTokenPriceEntry> = {};
    const byChain: Record<SupportedArbChain, Record<string, LiveTokenPriceEntry>> = initChainRecord<Record<string, LiveTokenPriceEntry>>(() => ({}));
    const sourcesUsed = new Set<string>();

    const upsertGlobal = (sym: string, entry: LiveTokenPriceEntry, prefer = false) => {
      const upper = sym.toUpperCase();
      if (prefer || !prices[sym]) prices[sym] = entry;
      if (prefer || !prices[upper]) prices[upper] = entry;
    };

    // 1. Live CEX tickers (Binance US / Kraken / Coinbase / NonKYC)
    const cexResult = await fetchLiveTickers().catch(() => null);
    if (cexResult && Array.isArray(cexResult.tickers) && cexResult.tickers.length > 0) {
      sourcesUsed.add('CEX_TICKERS');
      for (const t of cexResult.tickers) {
        if (!(t.price > 0)) continue;
        const baseSym = t.symbol.split('/')[0].toUpperCase();
        const entry: LiveTokenPriceEntry = {
          symbol: baseSym,
          priceUsd: t.price,
          source: cexResult.source || 'CEX',
          updatedAt: t.lastUpdated || updatedAt,
          change24h: t.change24h,
        };
        upsertGlobal(baseSym, entry);
        if (baseSym === 'ETH') upsertGlobal('WETH', { ...entry, symbol: 'WETH' });
        if (baseSym === 'BTC') {
          upsertGlobal('WBTC', { ...entry, symbol: 'WBTC' });
          upsertGlobal('cbBTC', { ...entry, symbol: 'cbBTC' });
        }
      }
    }

    // 2. Live DeFiLlama multi-chain contract & CoinGecko feed (resolves all 41 chain tokens + Sizer tokens)
    const { allKeys, chainEntries, extraEntries } = buildLlamaPriceQueryKeys();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5500);
      const url = `https://coins.llama.fi/prices/current/${allKeys.map((k) => encodeURIComponent(k)).join(',')}`;
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const json: any = await resp.json();
        const coins: Record<string, { price?: number; timestamp?: number; symbol?: string }> = json?.coins || {};
        if (Object.keys(coins).length > 0) {
          sourcesUsed.add('DEFILLAMA');
        }
        const findCoin = (key: string) => coins[key] || coins[key.toLowerCase()];

        for (const item of chainEntries) {
          const c = findCoin(item.key);
          if (c && typeof c.price === 'number' && c.price > 0) {
            const entry: LiveTokenPriceEntry = {
              symbol: item.sym,
              priceUsd: c.price,
              source: 'DEFILLAMA_ONCHAIN',
              updatedAt: c.timestamp ? c.timestamp * 1000 : updatedAt,
            };
            byChain[item.chain][item.sym] = entry;
            byChain[item.chain][item.sym.toUpperCase()] = entry;
            upsertGlobal(item.sym, entry, true);
          }
        }
        for (const extra of extraEntries) {
          const c = findCoin(extra.key);
          if (c && typeof c.price === 'number' && c.price > 0) {
            const entry: LiveTokenPriceEntry = {
              symbol: extra.symbol,
              priceUsd: c.price,
              source: extra.key.startsWith('coingecko:') ? 'DEFILLAMA_CG' : 'DEFILLAMA_ONCHAIN',
              updatedAt: c.timestamp ? c.timestamp * 1000 : updatedAt,
            };
            upsertGlobal(extra.symbol, entry, !prices[extra.symbol]);
          }
        }
      }
    } catch {
      // keep CEX & on-chain pool prices if DeFiLlama transiently times out
    }

    // 3. Live on-chain DEX pool reads (liveAgent.poolsByChain) override/enrich chain prices
    for (const chain of SUPPORTED_SCAN_CHAINS) {
      const chainPools = liveAgent.poolsByChain[chain] || [];
      for (const pool of chainPools) {
        if (!(pool.priceUsd > 0)) continue;
        const baseSym = pool.pair.split('/')[0];
        if (!baseSym) continue;
        sourcesUsed.add('ONCHAIN_DEX');
        const entry: LiveTokenPriceEntry = {
          symbol: baseSym,
          priceUsd: pool.priceUsd,
          source: `ONCHAIN_${pool.dex.toUpperCase().replace(/\s+/g, '_')}`,
          updatedAt: pool.lastUpdated || updatedAt,
        };
        byChain[chain][baseSym] = entry;
        byChain[chain][baseSym.toUpperCase()] = entry;
        if (!prices[baseSym] || baseSym === 'WETH' || baseSym === 'ETH') {
          upsertGlobal(baseSym, entry, baseSym === 'WETH');
        }
      }
    }

    if (prices['WETH']?.priceUsd > 0 && !prices['ETH']) {
      upsertGlobal('ETH', { ...prices['WETH'], symbol: 'ETH' });
    }

    const ethUsd =
      byChain.arbitrum['WETH']?.priceUsd ||
      prices['WETH']?.priceUsd ||
      prices['ETH']?.priceUsd ||
      null;

    const uniqueSymbols = new Set(Object.values(prices).map((v) => v.symbol.toUpperCase()));
    const result: LiveTokenPriceFeedResult = {
      prices,
      byChain,
      ethUsd,
      tokenCount: uniqueSymbols.size,
      updatedAt,
      sources: Array.from(sourcesUsed),
    };

    cachedPriceFeed = result;
    cachedPriceFeedExpiry = Date.now() + 15000;
    return result;
  })().finally(() => {
    inFlightPriceFeedPromise = null;
  });

  return inFlightPriceFeedPromise;
}

flashArbRouter.get('/token-prices', async (req: Request, res: Response) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const feed = await getLiveTokenPriceFeed(force);
    return res.json({
      success: true,
      ...feed,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed fetching live token prices' });
  }
});

function getLiveTokenUsdPrice(symbol: string, chain: SupportedArbChain = 'arbitrum'): number | null {
  const sym = symbol.toUpperCase();
  const preferredPools = liveAgent.poolsByChain[chain] || [];
  const allPools = [
    ...preferredPools,
    ...SUPPORTED_SCAN_CHAINS.flatMap((c) => (c === chain ? [] : liveAgent.poolsByChain[c] || [])),
  ];
  const ethPool = allPools.find((p) => p.pair === 'WETH/USDC' || p.pair === 'WETH/USDT');
  const cachedChainPrice = cachedPriceFeed?.byChain?.[chain]?.[sym]?.priceUsd;
  if (typeof cachedChainPrice === 'number' && cachedChainPrice > 0) return cachedChainPrice;
  const cachedGlobalPrice = cachedPriceFeed?.prices?.[sym]?.priceUsd;
  if (typeof cachedGlobalPrice === 'number' && cachedGlobalPrice > 0) return cachedGlobalPrice;

  if (['USDC', 'USDC.E', 'USDBC', 'USDT', 'DAI', 'FRAX', 'USDE', 'APEUSD'].includes(sym)) return 1.0;
  const ethUsd = ethPool?.priceUsd || cachedPriceFeed?.ethUsd || null;
  if (sym === 'ETH' || sym === 'WETH' || sym === 'APEETH') return ethUsd;
  if (sym === 'WMATIC') return cachedPriceFeed?.prices?.POL?.priceUsd ?? cachedPriceFeed?.prices?.WMATIC?.priceUsd ?? null;
  if (sym === 'WBNB') return cachedPriceFeed?.prices?.BNB?.priceUsd ?? cachedPriceFeed?.prices?.WBNB?.priceUsd ?? null;
  if (sym === 'WAVAX') return cachedPriceFeed?.prices?.AVAX?.priceUsd ?? cachedPriceFeed?.prices?.WAVAX?.priceUsd ?? null;
  if (sym === 'WAPE') return cachedPriceFeed?.prices?.APE?.priceUsd ?? cachedPriceFeed?.prices?.WAPE?.priceUsd ?? null;
  if (sym === 'BTCB' || sym === 'BTC.B') return cachedPriceFeed?.prices?.WBTC?.priceUsd ?? cachedPriceFeed?.prices?.BTC?.priceUsd ?? null;
  const directPool = allPools.find((p) => p.pair.toUpperCase().startsWith(`${sym}/`));
  if (directPool && directPool.priceUsd > 0) return directPool.priceUsd;
  return null;
}

async function resolveVerifiedTokenList(
  chain: SupportedArbChain,
  extraSpecsInput: Array<string | ExtraTokenSpec> = []
): Promise<ArbitrumTokenInfo[]> {
  const baseList = [...getChainTokens(chain)];
  const knownKeys = new Set(baseList.map((t) => `${t.addr.toLowerCase()}:${t.tokenId ?? ''}`));
  const parsedExtras: ExtraTokenSpec[] = [];
  for (const item of extraSpecsInput) {
    const spec = typeof item === 'string' ? parseExtraTokenSpec(item) : item;
    if (!spec) continue;
    const k = `${spec.address.toLowerCase()}:${spec.tokenId ?? ''}`;
    if (!knownKeys.has(k)) {
      knownKeys.add(k);
      parsedExtras.push(spec);
    }
  }
  if (parsedExtras.length === 0) return baseList;

  const uniqueAddrs = Array.from(new Set(parsedExtras.map((s) => s.address)));
  const PROBES_PER_ADDR = 8;
  const calls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
  for (const addr of uniqueAddrs) {
    calls.push({ target: addr, allowFailure: true, callData: ercProbeIface.encodeFunctionData('symbol') });
    calls.push({ target: addr, allowFailure: true, callData: ercProbeIface.encodeFunctionData('decimals') });
    calls.push({ target: addr, allowFailure: true, callData: ercProbeIface.encodeFunctionData('totalSupply') });
    calls.push({ target: addr, allowFailure: true, callData: ercProbeIface.encodeFunctionData('supportsInterface', [ERC165_INTERFACE_IDS.ERC1155]) });
    calls.push({ target: addr, allowFailure: true, callData: ercProbeIface.encodeFunctionData('supportsInterface', [ERC165_INTERFACE_IDS.ERC721]) });
    calls.push({ target: addr, allowFailure: true, callData: ercProbeIface.encodeFunctionData('asset') });
    calls.push({ target: addr, allowFailure: true, callData: ercProbeIface.encodeFunctionData('granularity') });
    calls.push({ target: addr, allowFailure: true, callData: ercProbeIface.encodeFunctionData('DOMAIN_SEPARATOR') });
  }

  const resolvedByAddr = new Map<string, Omit<ArbitrumTokenInfo, 'tokenId'>>();
  try {
    const mcData = multicallIface.encodeFunctionData('aggregate3', [calls]);
    const { result } = await fetchRpcSingleWithFailover(chain, 'eth_call', [{ to: MULTICALL3_ADDRESS, data: mcData }, 'latest'], false);
    if (typeof result === 'string' && result !== '0x') {
      const [decoded] = multicallIface.decodeFunctionResult('aggregate3', result);
      uniqueAddrs.forEach((addr, idx) => {
        const base = idx * PROBES_PER_ADDR;
        const symRes = decoded[base];
        const decRes = decoded[base + 1];
        const supplyRes = decoded[base + 2];
        const erc1155Res = decoded[base + 3];
        const erc721Res = decoded[base + 4];
        const assetRes = decoded[base + 5];
        const granRes = decoded[base + 6];
        const permitRes = decoded[base + 7];

        const classification = classifyDetectedErcStandard({
          isErc1155: decodeBoolFlag(erc1155Res),
          isErc721: decodeBoolFlag(erc721Res),
          isErc4626: Boolean(assetRes?.success && assetRes.returnData?.length >= 66 && supplyRes?.success),
          isErc777: Boolean(granRes?.success && granRes.returnData?.length >= 66 && supplyRes?.success),
          isErc2612: Boolean(permitRes?.success && permitRes.returnData?.length >= 66 && supplyRes?.success),
          hasErc20TotalSupply: Boolean(supplyRes?.success && supplyRes.returnData?.length >= 66),
        });

        const parsedSym = decodeStringOrBytes32(symRes?.success ? symRes.returnData : undefined);
        let parsedDec = 18;
        if (classification.ercStandard === 'ERC-721' || classification.ercStandard === 'ERC-1155') {
          parsedDec = 0;
        } else if (decRes?.success && decRes.returnData && decRes.returnData !== '0x') {
          try {
            const [d] = ercProbeIface.decodeFunctionResult('decimals', decRes.returnData);
            parsedDec = Number(d);
          } catch {}
        }

        const fallbackPrefix =
          classification.ercStandard === 'ERC-1155'
            ? 'ERC1155'
            : classification.ercStandard === 'ERC-721'
            ? 'NFT'
            : classification.ercStandard === 'UNKNOWN'
            ? 'UNSUPPORTED'
            : 'ERC20';

        resolvedByAddr.set(addr.toLowerCase(), {
          sym: parsedSym || `${fallbackPrefix}_${addr.slice(0, 6)}`,
          addr,
          dec: parsedDec,
          ercStandard: classification.ercStandard,
          arbCompatible: classification.arbCompatible,
          sweepCompatible: classification.sweepCompatible,
          walletSweepCompatible: classification.walletSweepCompatible,
          compatibilityNote: classification.compatibilityNote,
        });
      });
    }
  } catch {
    // ignore metadata resolution failure
  }

  for (const spec of parsedExtras) {
    const meta = resolvedByAddr.get(spec.address.toLowerCase()) || {
      sym: `UNVERIFIED_${spec.address.slice(0, 6)}`,
      addr: spec.address,
      dec: 18,
      ercStandard: 'UNKNOWN' as ErcStandard,
      arbCompatible: false,
      sweepCompatible: false,
      walletSweepCompatible: false,
      compatibilityNote: 'Unable to probe ERC interface on this chain',
    };
    const isNftLike = meta.ercStandard === 'ERC-1155' || meta.ercStandard === 'ERC-721';
    baseList.push({
      ...meta,
      sym: spec.tokenId ? `${meta.sym}#${spec.tokenId}` : meta.sym,
      tokenId: spec.tokenId,
      walletSweepCompatible: isNftLike ? Boolean(spec.tokenId) : meta.walletSweepCompatible,
      compatibilityNote:
        isNftLike && !spec.tokenId
          ? `${meta.ercStandard} detected · Append ":tokenId" (e.g. ${spec.address}:1) to inspect balance & sweep from Connected Wallet`
          : meta.compatibilityNote,
    });
  }
  return baseList;
}

/**
 * Helper: Query ETH + all verified chain ERC-20 & probed multi-ERC token balances for an address in one RPC batch.
 */
async function queryAllChainBalances(
  chain: SupportedArbChain,
  targetAddress: string,
  extraSpecs: Array<string | ExtraTokenSpec> = []
) {
  const tokenList = await resolveVerifiedTokenList(chain, extraSpecs);
  const padded = targetAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const erc20BalData = `0x70a08231${padded}`;

  const queryableIndices: number[] = [];
  const mcCalls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
  tokenList.forEach((tok, idx) => {
    const isNftLike = tok.ercStandard === 'ERC-1155' || tok.ercStandard === 'ERC-721';
    if (isNftLike && !tok.tokenId) {
      // Cannot query balanceOf without a tokenId; skip RPC call cleanly
      return;
    }
    queryableIndices.push(idx);
    if (tok.ercStandard === 'ERC-1155' && tok.tokenId) {
      mcCalls.push({
        target: tok.addr,
        allowFailure: true,
        callData: ercProbeIface.encodeFunctionData('balanceOf(address,uint256)', [targetAddress, BigInt(tok.tokenId)]),
      });
    } else if (tok.ercStandard === 'ERC-721' && tok.tokenId) {
      mcCalls.push({
        target: tok.addr,
        allowFailure: true,
        callData: ercProbeIface.encodeFunctionData('ownerOf(uint256)', [BigInt(tok.tokenId)]),
      });
    } else {
      mcCalls.push({
        target: tok.addr,
        allowFailure: true,
        callData: erc20BalData,
      });
    }
  });
  const mcData = multicallIface.encodeFunctionData('aggregate3', [mcCalls]);

  let ethWei = 0n;
  let decodedMcByIdx: Map<number, any> | null = null;
  try {
    const { results } = await fetchRpcBatchWithFailover(chain, [
      { jsonrpc: '2.0', method: 'eth_getBalance', params: [targetAddress, 'latest'], id: 1 },
      ...(mcCalls.length > 0
        ? [{ jsonrpc: '2.0', method: 'eth_call', params: [{ to: MULTICALL3_ADDRESS, data: mcData }, 'latest'], id: 2 }]
        : []),
    ]);
    const byId = new Map<number, string>();
    for (const item of results) {
      if (item && item.id !== undefined && typeof item.result === 'string' && item.result !== '0x') {
        byId.set(item.id, item.result);
      }
    }
    ethWei = BigInt(byId.get(1) || '0x0');
    const mcRaw = byId.get(2);
    if (mcRaw && mcRaw !== '0x') {
      const [decoded] = multicallIface.decodeFunctionResult('aggregate3', mcRaw);
      decodedMcByIdx = new Map<number, any>();
      queryableIndices.forEach((tokIdx, pos) => {
        decodedMcByIdx!.set(tokIdx, decoded[pos]);
      });
    }
  } catch {
    decodedMcByIdx = null;
  }

  // Fallback to direct RPC batch if Multicall3 failed on an endpoint
  const directByIdx = new Map<number, string>();
  if (!decodedMcByIdx) {
    const calls: any[] = [
      { jsonrpc: '2.0', method: 'eth_getBalance', params: [targetAddress, 'latest'], id: 1 },
    ];
    queryableIndices.forEach((tokIdx, pos) => {
      calls.push({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: mcCalls[pos].target, data: mcCalls[pos].callData }, 'latest'],
        id: 10 + tokIdx,
      });
    });
    const { results } = await fetchRpcBatchWithFailover(chain, calls);
    for (const item of results) {
      if (item && item.id !== undefined && typeof item.result === 'string' && item.result !== '0x') {
        if (item.id === 1) ethWei = BigInt(item.result);
        else directByIdx.set(item.id - 10, item.result);
      }
    }
  }

  const checksumTarget = ethers.getAddress(targetAddress).toLowerCase();
  const tokens: Array<{
    symbol: string;
    address: string;
    decimals: number;
    ercStandard: ErcStandard;
    tokenId?: string;
    rawBalance: bigint;
    formatted: string;
    hasBalance: boolean;
    arbCompatible: boolean;
    sweepCompatible: boolean;
    walletSweepCompatible: boolean;
    compatibilityNote: string;
    usdValue: number | null;
  }> = [];

  tokenList.forEach((tok, idx) => {
    const mcEntry = decodedMcByIdx?.get(idx);
    let hex: string | null = null;
    if (mcEntry?.success && typeof mcEntry?.returnData === 'string' && mcEntry.returnData !== '0x') {
      hex = mcEntry.returnData;
    } else if (directByIdx.has(idx)) {
      hex = directByIdx.get(idx) || null;
    }

    let rawBalance = 0n;
    let balanceReadable = true;
    const isNftLike = tok.ercStandard === 'ERC-1155' || tok.ercStandard === 'ERC-721';

    if (isNftLike && !tok.tokenId) {
      rawBalance = 0n;
    } else if (tok.ercStandard === 'ERC-721' && tok.tokenId) {
      if (hex && hex.length >= 66) {
        const tokenOwner = `0x${hex.slice(-40)}`.toLowerCase();
        rawBalance = tokenOwner === checksumTarget ? 1n : 0n;
      } else if (mcEntry && !mcEntry.success) {
        rawBalance = 0n; // non-existent / burned tokenId
      }
    } else if (hex && hex.length >= 66) {
      try {
        rawBalance = BigInt(hex.slice(0, 66));
      } catch {
        balanceReadable = false;
      }
    } else if (mcEntry && !mcEntry.success) {
      balanceReadable = false;
    }

    const formatted =
      tok.ercStandard === 'ERC-721' || tok.ercStandard === 'ERC-1155'
        ? rawBalance.toString()
        : ethers.formatUnits(rawBalance, tok.dec);
    const numBal = Number(formatted);
    const priceUsd = isNftLike ? null : getLiveTokenUsdPrice(tok.sym, chain);
    const usdValue = priceUsd !== null && Number.isFinite(numBal) ? Number((numBal * priceUsd).toFixed(4)) : null;

    tokens.push({
      symbol: tok.sym,
      address: tok.addr,
      decimals: tok.dec,
      ercStandard: tok.ercStandard || 'ERC-20',
      ...(tok.tokenId ? { tokenId: tok.tokenId } : {}),
      rawBalance,
      formatted,
      hasBalance: rawBalance > 0n,
      arbCompatible: Boolean(tok.arbCompatible) && balanceReadable,
      sweepCompatible: (tok.sweepCompatible !== false) && balanceReadable,
      walletSweepCompatible: (tok.walletSweepCompatible ?? (tok.sweepCompatible !== false)) && balanceReadable,
      compatibilityNote: !balanceReadable
        ? 'Incompatible: token contract balance query reverted on this chain'
        : tok.compatibilityNote || 'ERC-20 · Sweep Compatible',
      usdValue,
    });
  });

  const chainMeta = CHAIN_LAYER_META[chain];
  const ethFormatted = ethers.formatEther(ethWei);
  const nativePrice = getLiveTokenUsdPrice(chainMeta.nativeSymbol, chain) ?? getLiveTokenUsdPrice(chainMeta.wrappedNativeSymbol, chain);
  const ethUsd = nativePrice !== null ? Number((Number(ethFormatted) * nativePrice).toFixed(2)) : null;

  return {
    nativeSymbol: chainMeta.nativeSymbol,
    ethWei,
    ethFormatted,
    ethUsd,
    tokens,
  };
}

/**
 * GET /api/flash-arb/wallet-balances
 * Queries real-time on-chain ETH + all verified ERC-20 token balances of the Profit Vault
 */
flashArbRouter.get('/wallet-balances', async (req: Request, res: Response) => {
  try {
    const chain: SupportedArbChain = parseSupportedChain(req.query.chain);
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const address = String(req.query.address || profitWalletEnv()).trim();
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return res.status(400).json({ success: false, error: 'Invalid EVM address' });
    }
    const extraTokens = normalizeExtraTokenSpecs(
      typeof req.query.extraTokens === 'string' ? req.query.extraTokens.split(',') : []
    );
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const extraKey = extraTokens.map((e) => `${e.address.toLowerCase()}:${e.tokenId ?? ''}`).join(',');
    const cacheKey = `${chain}:${address.toLowerCase()}:${extraKey}`;
    const cached = walletBalancesResponseCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < SHORT_BALANCE_CACHE_TTL_MS) {
      return res.json(cached.payload);
    }

    const balInfo = await queryAllChainBalances(chain, address, extraTokens);
    const ethBalance = Number(balInfo.ethFormatted);
    const findBal = (sym: string) => {
      const entry = balInfo.tokens.find((t) => t.symbol.toUpperCase() === sym.toUpperCase());
      return entry ? Number(entry.formatted) : 0;
    };
    const wethBalance = findBal('WETH');
    const usdcBalance = findBal('USDC');
    const usdtBalance = findBal('USDT');

    const tokenUsdTotal = balInfo.tokens.reduce((sum, t) => sum + (t.hasBalance && t.usdValue ? t.usdValue : 0), 0);
    const totalUsd = (balInfo.ethUsd ?? 0) + tokenUsdTotal;

    const payload = {
      success: true,
      address,
      chain: rpcInfo.name,
      chainKey: chain,
      balances: {
        eth: ethBalance,
        ethFormatted: `${ethBalance.toFixed(6)} ETH`,
        weth: wethBalance,
        wethFormatted: `${wethBalance.toFixed(6)} WETH`,
        usdc: usdcBalance,
        usdcFormatted: `${usdcBalance.toFixed(2)} USDC`,
        usdt: usdtBalance,
        usdtFormatted: `${usdtBalance.toFixed(2)} USDT`,
      },
      tokens: balInfo.tokens.map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        ercStandard: t.ercStandard,
        tokenId: t.tokenId,
        balance: t.formatted,
        hasBalance: t.hasBalance,
        arbCompatible: t.arbCompatible,
        sweepCompatible: t.sweepCompatible,
        walletSweepCompatible: t.walletSweepCompatible,
        compatibilityNote: t.compatibilityNote,
        usdValue: t.usdValue,
      })),
      nonZeroTokens: balInfo.tokens
        .filter((t) => t.hasBalance)
        .map((t) => ({
          symbol: t.symbol,
          address: t.address,
          ercStandard: t.ercStandard,
          tokenId: t.tokenId,
          balance: t.formatted,
          usdValue: t.usdValue,
          arbCompatible: t.arbCompatible,
          sweepCompatible: t.sweepCompatible,
          walletSweepCompatible: t.walletSweepCompatible,
        })),
      totalUsd: Number(totalUsd.toFixed(2)),
      explorerUrl: `${rpcInfo.explorer}/address/${address}`,
      timestamp: Date.now(),
    };
    walletBalancesResponseCache.set(cacheKey, { payload, fetchedAt: Date.now() });
    return res.json(payload);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/flash-arb/contract-balances
 * Queries live ETH + all verified ERC-20 token balances sitting on the active FlashArb contract,
 * plus inspects contract owner() and selector support (executeOptimizedArbitrage / rescueTokensTo / rescueTokens).
 */
flashArbRouter.get('/contract-balances', async (req: Request, res: Response) => {
  try {
    const chain: SupportedArbChain = parseSupportedChain(req.query.chain);
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const rawQueryAddr = typeof req.query.address === 'string' ? req.query.address.trim() : '';
    const resolved = resolveAndValidateSweepContracts({
      chain,
      requestedContract: rawQueryAddr,
      deployedContract: DEPLOYED_CONTRACTS[chain],
      hasWalletSweepTarget: true,
    });
    if (!resolved.ok) {
      return res.status(400).json({ success: false, error: resolved.error || 'Invalid contract address' });
    }
    const contractAddr = resolved.primaryContract;
    if (!contractAddr) {
      return res.json({
        success: true,
        chain,
        chainName: rpcInfo.name,
        contractAddress: null,
        isDeployed: false,
        owner: null,
        supportsOptimizedArbitrage: false,
        supportsRescueTokensTo: false,
        supportsRescueTokens: false,
        supportsDirectSweep: false,
        eth: '0',
        ethWei: '0',
        ethUsd: 0,
        tokens: [],
        nonZeroCount: 0,
        explorerUrl: rpcInfo.explorer,
        timestamp: Date.now(),
      });
    }
    const extraTokens = normalizeExtraTokenSpecs(
      typeof req.query.extraTokens === 'string' ? req.query.extraTokens.split(',') : []
    );
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const extraKey = extraTokens.map((e) => `${e.address.toLowerCase()}:${e.tokenId ?? ''}`).join(',');
    const cacheKey = `${chain}:${contractAddr.toLowerCase()}:${extraKey}`;
    const cachedContract = contractBalancesResponseCache.get(cacheKey);
    if (!forceRefresh && cachedContract && Date.now() - cachedContract.fetchedAt < SHORT_BALANCE_CACHE_TTL_MS) {
      return res.json(cachedContract.payload);
    }

    const [balInfo, codeResp, ownerResp] = await Promise.all([
      queryAllChainBalances(chain, contractAddr, extraTokens),
      fetchRpcSingleWithFailover(chain, 'eth_getCode', [contractAddr, 'latest'], true),
      fetchRpcSingleWithFailover(chain, 'eth_call', [{ to: contractAddr, data: '0x8da5cb5b' }, 'latest'], true).catch(() => ({ result: null })),
    ]);

    const code = String(codeResp.result || '0x').toLowerCase();
    const isDeployed = code !== '0x' && code.length > 2;
    const contractOwner =
      typeof ownerResp.result === 'string' && ownerResp.result.length >= 66
        ? ethers.getAddress(`0x${ownerResp.result.slice(-40)}`)
        : null;

    const payload = {
      success: true,
      chain,
      chainName: rpcInfo.name,
      contractAddress: contractAddr,
      isDeployed,
      owner: contractOwner,
      supportsOptimizedArbitrage: code.includes('23b3aa6b'),
      supportsRescueTokensTo: code.includes('a7070692'),
      supportsRescueTokens: code.includes('ae3bf8'),
      supportsDirectSweep: code.includes('7804d9ac'),
      eth: balInfo.ethFormatted,
      ethWei: balInfo.ethWei.toString(),
      ethUsd: balInfo.ethUsd,
      tokens: balInfo.tokens.map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        ercStandard: t.ercStandard,
        tokenId: t.tokenId,
        balance: t.formatted,
        hasBalance: t.hasBalance,
        arbCompatible: t.arbCompatible,
        sweepCompatible: t.sweepCompatible,
        compatibilityNote: t.compatibilityNote,
        usdValue: t.usdValue,
      })),
      nonZeroCount: (balInfo.ethWei > 0n ? 1 : 0) + balInfo.tokens.filter((t) => t.rawBalance > 0n).length,
      explorerUrl: `${rpcInfo.explorer}/address/${contractAddr}`,
      timestamp: Date.now(),
    };
    contractBalancesResponseCache.set(cacheKey, { payload, fetchedAt: Date.now() });
    return res.json(payload);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/flash-arb/holdings-overview
 * Connects and inspects ALL token holdings across active & legacy FlashArb contracts, Gas Wallet,
 * optional Connected Web3 Wallet, and Profit Destination Vault, including contract compatibility flags.
 */
flashArbRouter.get('/holdings-overview', async (req: Request, res: Response) => {
  try {
    const chain: SupportedArbChain = parseSupportedChain(req.query.chain);
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;

    const rawContracts = typeof req.query.contracts === 'string' ? req.query.contracts.split(',') : [];
    const defaultExtras = KNOWN_FLASH_ARB_CONTRACTS[chain] || [];
    const contractAddrs = normalizeExtraAddresses([
      DEPLOYED_CONTRACTS[chain],
      ...rawContracts,
      ...defaultExtras,
    ]);

    const gasWallet = String(req.query.gasWallet || gasWalletEnv() || '').trim();
    const profitWallet = String(req.query.profitWallet || profitWalletEnv() || '').trim();
    const connectedWallet = String(req.query.connectedWallet || '').trim();
    const extraTokens = normalizeExtraTokenSpecs(
      typeof req.query.extraTokens === 'string' ? req.query.extraTokens.split(',') : []
    );
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const overviewCacheKey = [
      chain,
      gasWallet.toLowerCase(),
      profitWallet.toLowerCase(),
      connectedWallet.toLowerCase(),
      contractAddrs.map((c) => c.toLowerCase()).join(','),
      extraTokens.map((e) => `${e.address.toLowerCase()}:${e.tokenId ?? ''}`).join(','),
    ].join(':');
    const cachedOverview = holdingsOverviewResponseCache.get(overviewCacheKey);
    if (!forceRefresh && cachedOverview && Date.now() - cachedOverview.fetchedAt < SHORT_BALANCE_CACHE_TTL_MS) {
      return res.json(cachedOverview.payload);
    }

    const signerKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    const signerAddress = signerKey
      ? new ethers.Wallet(signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`).address
      : null;

    const contracts: any[] = [];
    for (const addr of contractAddrs) {
      const [balInfo, codeResp, ownerResp] = await Promise.all([
        queryAllChainBalances(chain, addr, extraTokens),
        fetchRpcSingleWithFailover(chain, 'eth_getCode', [addr, 'latest'], true),
        fetchRpcSingleWithFailover(chain, 'eth_call', [{ to: addr, data: '0x8da5cb5b' }, 'latest'], true).catch(() => ({ result: null })),
      ]);
      const code = String(codeResp.result || '0x').toLowerCase();
      const isDeployed = code !== '0x' && code.length > 2;
      const contractOwner =
        typeof ownerResp.result === 'string' && ownerResp.result.length >= 66
          ? ethers.getAddress(`0x${ownerResp.result.slice(-40)}`)
          : null;
      const ownerMatchesSigner = Boolean(
        signerAddress && contractOwner && contractOwner.toLowerCase() === signerAddress.toLowerCase()
      );
      const ownerMatchesConnectedWallet = Boolean(
        /^0x[a-fA-F0-9]{40}$/.test(connectedWallet) &&
          contractOwner &&
          contractOwner.toLowerCase() === connectedWallet.toLowerCase()
      );
      const nonZeroTokens = balInfo.tokens.filter((t) => t.hasBalance);
      const compatibleNonZeroTokens = nonZeroTokens.filter((t) => t.sweepCompatible);

      contracts.push({
        address: addr,
        isPrimary: addr.toLowerCase() === (DEPLOYED_CONTRACTS[chain] || '').toLowerCase(),
        isDeployed,
        owner: contractOwner,
        ownerMatchesSigner,
        ownerMatchesConnectedWallet,
        accessibleForSweep: isDeployed && (ownerMatchesSigner || ownerMatchesConnectedWallet),
        supportsOptimizedArbitrage: code.includes('23b3aa6b'),
        supportsRescueTokensTo: code.includes('a7070692'),
        supportsRescueTokens: code.includes('ae3bf8'),
        supportsDirectSweep: code.includes('7804d9ac'),
        eth: balInfo.ethFormatted,
        ethWei: balInfo.ethWei.toString(),
        ethUsd: balInfo.ethUsd,
        nonZeroTokens: nonZeroTokens.map((t) => ({
          symbol: t.symbol,
          address: t.address,
          decimals: t.decimals,
          ercStandard: t.ercStandard,
          tokenId: t.tokenId,
          balance: t.formatted,
          arbCompatible: t.arbCompatible,
          sweepCompatible: t.sweepCompatible,
          compatibilityNote: t.compatibilityNote,
          usdValue: t.usdValue,
        })),
        compatibleNonZeroCount: (balInfo.ethWei > 0n ? 1 : 0) + compatibleNonZeroTokens.length,
        explorerUrl: `${rpcInfo.explorer}/address/${addr}`,
      });
    }

    const walletInspect = async (addr: string) => {
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return null;
      const balInfo = await queryAllChainBalances(chain, addr, extraTokens);
      const nonZeroTokens = balInfo.tokens.filter((t) => t.hasBalance);
      return {
        address: ethers.getAddress(addr),
        eth: balInfo.ethFormatted,
        ethWei: balInfo.ethWei.toString(),
        ethUsd: balInfo.ethUsd,
        nonZeroTokens: nonZeroTokens.map((t) => ({
          symbol: t.symbol,
          address: t.address,
          decimals: t.decimals,
          ercStandard: t.ercStandard,
          tokenId: t.tokenId,
          balance: t.formatted,
          arbCompatible: t.arbCompatible,
          sweepCompatible: t.sweepCompatible,
          walletSweepCompatible: t.walletSweepCompatible,
          compatibilityNote: t.compatibilityNote,
          usdValue: t.usdValue,
        })),
        compatibleNonZeroCount: nonZeroTokens.filter((t) => t.walletSweepCompatible).length,
        explorerUrl: `${rpcInfo.explorer}/address/${addr}`,
      };
    };

    const distinctConnected =
      /^0x[a-fA-F0-9]{40}$/.test(connectedWallet) &&
      connectedWallet.toLowerCase() !== gasWallet.toLowerCase() &&
      connectedWallet.toLowerCase() !== profitWallet.toLowerCase()
        ? connectedWallet
        : '';

    const [gasWalletRaw, connectedWalletInfo, profitWalletInfo, gasPriceResp] = await Promise.all([
      walletInspect(gasWallet),
      distinctConnected ? walletInspect(distinctConnected) : Promise.resolve(null),
      walletInspect(profitWallet),
      fetchRpcSingleWithFailover(chain, 'eth_gasPrice', [], true).catch(() => ({ result: '0x5f5e100' })),
    ]);

    const currentGasPriceWei =
      typeof gasPriceResp?.result === 'string' && gasPriceResp.result.startsWith('0x')
        ? BigInt(gasPriceResp.result)
        : 100000000n;

    let gasWalletInfo: (typeof gasWalletRaw & {
      ethReserveFormatted?: string;
      sweepableEthWei?: string;
      sweepableEthFormatted?: string;
      sweepableEthUsd?: number;
    }) | null = gasWalletRaw;

    if (gasWalletRaw) {
      const gasBalWei = BigInt(gasWalletRaw.ethWei || '0');
      const alloc = computeGasSurplusAllocation({
        balanceWei: gasBalWei,
        minReserveWei: DEFAULT_MIN_GAS_RESERVE_WEI,
        transferGasUnits: 25000n,
        gasPriceWei: currentGasPriceWei,
      });
      const ethNum = Number(ethers.formatEther(gasBalWei));
      const ethPrice = ethNum > 0 && gasWalletRaw.ethUsd ? gasWalletRaw.ethUsd / ethNum : (getLiveTokenUsdPrice('WETH', chain) || 0);
      const sweepableEthNum = Number(ethers.formatEther(alloc.sendWei));
      gasWalletInfo = {
        ...gasWalletRaw,
        ethReserveFormatted: Number(ethers.formatEther(DEFAULT_MIN_GAS_RESERVE_WEI)).toFixed(4),
        sweepableEthWei: alloc.sendWei.toString(),
        sweepableEthFormatted: sweepableEthNum.toFixed(6),
        sweepableEthUsd: Number((sweepableEthNum * ethPrice).toFixed(2)),
      };
    }

    const inspectedExtras =
      extraTokens.length > 0 ? await resolveVerifiedTokenList(chain, extraTokens) : [];
    const customCheckedTokens = inspectedExtras
      .filter((t) => extraTokens.some((e) => e.address.toLowerCase() === t.addr.toLowerCase()))
      .map((t) => ({
        symbol: t.sym,
        address: t.addr,
        decimals: t.dec,
        ercStandard: t.ercStandard || 'ERC-20',
        tokenId: t.tokenId,
        arbCompatible: Boolean(t.arbCompatible),
        sweepCompatible: t.sweepCompatible !== false,
        walletSweepCompatible: t.walletSweepCompatible ?? (t.sweepCompatible !== false),
        compatibilityNote: t.compatibilityNote || 'ERC-20 · Sweep Compatible',
      }));

    const supportedTokens = getChainTokens(chain).map((t) => ({
      symbol: t.sym,
      address: t.addr,
      decimals: t.dec,
      ercStandard: t.ercStandard || 'ERC-20',
      arbCompatible: Boolean(t.arbCompatible),
      sweepCompatible: t.sweepCompatible !== false,
      walletSweepCompatible: t.walletSweepCompatible ?? (t.sweepCompatible !== false),
      compatibilityNote: t.compatibilityNote || 'ERC-20 · Sweep Compatible',
    }));

    const sweepableContractCount = contracts.reduce((sum, c) => sum + c.compatibleNonZeroCount, 0);
    const sweepableGasCount = gasWalletInfo?.compatibleNonZeroCount || 0;
    const sweepableGasEthCount =
      gasWalletInfo?.sweepableEthWei && BigInt(gasWalletInfo.sweepableEthWei) > 0n ? 1 : 0;
    const sweepableConnectedCount = connectedWalletInfo?.compatibleNonZeroCount || 0;

    const payload = {
      success: true,
      chain,
      chainName: rpcInfo.name,
      signerAddress,
      contracts,
      gasWallet: gasWalletInfo,
      connectedWallet: connectedWalletInfo,
      profitWallet: profitWalletInfo,
      supportedTokens,
      customCheckedTokens,
      summary: {
        verifiedTokensCount: supportedTokens.length,
        deployedContractsCount: contracts.filter((c) => c.isDeployed).length,
        accessibleContractsCount: contracts.filter((c) => c.accessibleForSweep).length,
        sweepableContractAssetsCount: sweepableContractCount,
        sweepableGasWalletTokensCount: sweepableGasCount,
        sweepableGasWalletEthCount: sweepableGasEthCount,
        sweepableConnectedWalletTokensCount: sweepableConnectedCount,
        totalSweepableAssetsCount:
          sweepableContractCount + sweepableGasCount + sweepableGasEthCount + sweepableConnectedCount,
      },
      timestamp: Date.now(),
    };
    holdingsOverviewResponseCache.set(overviewCacheKey, { payload, fetchedAt: Date.now() });
    return res.json(payload);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/flash-arb/sweep-all
 * Sweeps ALL compatible native ETH (executeDirectFlashArb) AND ALL compatible non-zero ERC-20 token
 * holdings from active & legacy FlashArb contracts directly to the Profit Vault recipient address.
 * Optionally sweeps compatible ERC-20 holdings from the Gas Wallet and/or Connected Web3 Wallet
 * (never drains native ETH gas reserves from user wallets).
 * Every transfer is pre-checked for token compatibility & eth_estimateGas before signing/broadcasting;
 * if no server signer key is configured, returns verified pendingWalletTxs for browser wallet signing.
 */
flashArbRouter.post('/sweep-all', async (req: Request, res: Response) => {
  try {
    const chain: SupportedArbChain = parseSupportedChain(req.body?.chain);
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const recipient = normalizeValidContractAddress(req.body?.recipient || profitWalletEnv() || '');
    const extraContracts = Array.isArray(req.body?.extraContracts) ? req.body.extraContracts : [];
    const extraTokenSpecs = normalizeExtraTokenSpecs(req.body?.extraTokenAddresses);
    const includeGasWalletTokens = Boolean(req.body?.includeGasWalletTokens);
    const includeGasWalletEthSurplus = Boolean(req.body?.includeGasWalletEthSurplus);
    const rawMinReserveEth = Number(req.body?.minGasReserveEth);
    const minGasReserveWei =
      Number.isFinite(rawMinReserveEth) && rawMinReserveEth >= 0.001
        ? ethers.parseEther(rawMinReserveEth.toFixed(6))
        : DEFAULT_MIN_GAS_RESERVE_WEI;
    const includeConnectedWalletTokens = Boolean(req.body?.includeConnectedWalletTokens);
    const connectedWalletAddress = String(req.body?.connectedWalletAddress || '').trim();
    const compatibleOnly = req.body?.compatibleOnly !== false;
    const tokenSymbolFilter = normalizeTokenSymbolFilter(req.body?.tokenSymbols);
    const skipContractEth =
      Boolean(req.body?.skipContractEth) ||
      (tokenSymbolFilter !== null && !tokenSymbolFilter.has('ETH'));

    if (!recipient) {
      return res.status(400).json({ success: false, error: 'Valid non-zero Profit Vault recipient address (0x...) is required.' });
    }

    const signerKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    const cleanKey = signerKey ? (signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`) : '';
    const signerAddress = cleanKey ? new ethers.Wallet(cleanKey).address : null;
    const validConnectedAddr = normalizeValidContractAddress(connectedWalletAddress);

    if (!signerAddress && !validConnectedAddr) {
      return res.status(409).json({
        success: false,
        requiresWallet: true,
        error: 'No server signer key configured. Configure FLASH_ARB_SIGNER_KEY in Signer Key Config.',
      });
    }

    const hasWalletSweepTarget =
      (includeGasWalletTokens && Boolean(signerAddress)) ||
      (includeGasWalletEthSurplus && Boolean(signerAddress && cleanKey)) ||
      (includeConnectedWalletTokens && Boolean(validConnectedAddr));

    const contractResolution = resolveAndValidateSweepContracts({
      chain,
      requestedContract: req.body?.contractAddress,
      deployedContract: DEPLOYED_CONTRACTS[chain],
      extraContracts,
      hasWalletSweepTarget,
    });
    if (!contractResolution.ok) {
      return res.status(400).json({
        success: false,
        error: contractResolution.error || 'Valid contractAddress is required.',
      });
    }

    const estimateSweepGas = async (fromAddr: string, to: string, data: string): Promise<bigint> => {
      const { result: gasHex } = await fetchRpcSingleWithFailover(
        chain,
        'eth_estimateGas',
        [{ from: fromAddr, to, data }, 'latest'],
        true
      );
      return typeof gasHex === 'string' && gasHex.startsWith('0x') ? BigInt(gasHex) : 150000n;
    };

    const sendSignedWithEstimate = async (to: string, data: string): Promise<{ txHash: string; gasUsed: string }> => {
      if (!signerAddress || !cleanKey) {
        throw new Error('Server signer key unavailable for direct broadcast');
      }
      const estGas = await estimateSweepGas(signerAddress, to, data);
      const gasLimit = (estGas * 130n) / 100n;
      const { txHash: sentHash, receipt } = await broadcastSignedTxAndWait({
        chain,
        cleanKey,
        to,
        data,
        gasLimit,
        allowAutoSpeedUp: true,
        minBalanceWei: 50000000000000n,
      });
      if (receipt.status !== 1) {
        throw new Error(`Sweep tx ${sentHash} reverted on-chain`);
      }
      return { txHash: sentHash, gasUsed: receipt.gasUsed.toString() };
    };

    // Deduplicate validated contract addresses to inspect
    const contractSet = new Map<string, string>();
    for (const addr of contractResolution.contracts) {
      contractSet.set(addr.toLowerCase(), addr);
    }

    const sweptAssets: Array<{
      source: string;
      asset: string;
      amount: string;
      method: string;
      txHash: string;
      explorerUrl: string;
      recipient: string;
    }> = [];
    const pendingWalletTxs: Array<{
      chain: SupportedArbChain;
      chainIdHex: string;
      to: string;
      data: string;
      gas: string;
      source: string;
      sourceLabel: string;
      asset: string;
      amount: string;
      method: string;
      recipient: string;
      signerRequired: string;
    }> = [];
    const skippedIncompatible: Array<{
      source: string;
      asset: string;
      amount?: string;
      reason: string;
    }> = [];
    const errors: Array<{ source: string; asset: string; error: string }> = [];
    const checkedContracts: Array<{
      address: string;
      nonZeroAssets: number;
      owner: string | null;
      ownerMatchesSigner: boolean;
      ownerMatchesConnectedWallet: boolean;
    }> = [];

    for (const contractAddr of contractSet.values()) {
      const { result: codeRaw } = await fetchRpcSingleWithFailover(chain, 'eth_getCode', [contractAddr, 'latest'], true);
      const code = String(codeRaw || '0x').toLowerCase();
      if (code === '0x' || code.length <= 2) continue;

      let contractOwner: string | null = null;
      try {
        const { result: ownerRaw } = await fetchRpcSingleWithFailover(
          chain,
          'eth_call',
          [{ to: contractAddr, data: '0x8da5cb5b' }, 'latest'],
          true
        );
        if (typeof ownerRaw === 'string' && ownerRaw.length >= 66) {
          contractOwner = ethers.getAddress(`0x${ownerRaw.slice(-40)}`);
        }
      } catch {
        // owner() absent
      }

      const ownerMatchesSigner = Boolean(
        signerAddress && (!contractOwner || contractOwner.toLowerCase() === signerAddress.toLowerCase())
      );
      const ownerMatchesConnected = Boolean(
        validConnectedAddr && (!contractOwner || contractOwner.toLowerCase() === validConnectedAddr.toLowerCase())
      );

      const balInfo = await queryAllChainBalances(chain, contractAddr, extraTokenSpecs);
      const nonZeroTokens = filterSweepTokensBySymbols(
        balInfo.tokens.filter((t) => t.rawBalance > 0n),
        tokenSymbolFilter
      );
      const hasSweepableEth = !skipContractEth && balInfo.ethWei > 0n;
      const nonZeroAssets = (hasSweepableEth ? 1 : 0) + nonZeroTokens.length;
      checkedContracts.push({
        address: contractAddr,
        nonZeroAssets,
        owner: contractOwner,
        ownerMatchesSigner,
        ownerMatchesConnectedWallet: ownerMatchesConnected,
      });

      if (nonZeroAssets === 0) continue;

      if (!ownerMatchesSigner && !ownerMatchesConnected) {
        errors.push({
          source: contractAddr,
          asset: 'ALL',
          error: `Neither server signer nor connected wallet owns ${contractAddr} (owner is ${contractOwner}).`,
        });
        continue;
      }

      const useServerSigner = ownerMatchesSigner && Boolean(signerAddress);
      const callerAddr = useServerSigner ? signerAddress! : validConnectedAddr!;

      // 1. Sweep native ETH via executeDirectFlashArb(recipient)
      if (!skipContractEth && balInfo.ethWei > 0n && contractAddr.toLowerCase() !== recipient.toLowerCase()) {
        if (!code.includes('7804d9ac')) {
          skippedIncompatible.push({
            source: contractAddr,
            asset: 'ETH',
            amount: balInfo.ethFormatted,
            reason: 'Contract does not expose executeDirectFlashArb(address) selector',
          });
        } else {
          try {
            const data = encodeExecuteDirectFlashArb(recipient);
            if (useServerSigner) {
              const { txHash } = await sendSignedWithEstimate(contractAddr, data);
              sweptAssets.push({
                source: contractAddr,
                asset: 'ETH',
                amount: balInfo.ethFormatted,
                method: 'executeDirectFlashArb(recipient)',
                txHash,
                explorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
                recipient,
              });
            } else {
              const estGas = await estimateSweepGas(callerAddr, contractAddr, data);
              pendingWalletTxs.push({
                chain,
                chainIdHex: CHAIN_ID_HEX_MAP[chain],
                to: contractAddr,
                data,
                gas: `0x${((estGas * 130n) / 100n).toString(16)}`,
                source: contractAddr,
                sourceLabel: `Contract ${contractAddr.slice(0, 6)}...${contractAddr.slice(-4)}`,
                asset: 'ETH',
                amount: balInfo.ethFormatted,
                method: 'executeDirectFlashArb(recipient)',
                recipient,
                signerRequired: callerAddr,
              });
            }
          } catch (err: any) {
            errors.push({
              source: contractAddr,
              asset: 'ETH',
              error: decodeFlashArbRevertError(err),
            });
          }
        }
      }

      // 2. Sweep each compatible non-zero ERC-20 token balance
      for (const tok of nonZeroTokens) {
        if (compatibleOnly && !tok.sweepCompatible) {
          skippedIncompatible.push({
            source: contractAddr,
            asset: tok.symbol,
            amount: tok.formatted,
            reason: tok.compatibilityNote || 'Token marked incompatible for contract sweep',
          });
          continue;
        }

        const hasRescueTo = code.includes('a7070692');
        const hasRescue = code.includes('ae3bf8');
        if (!hasRescueTo && !hasRescue) {
          skippedIncompatible.push({
            source: contractAddr,
            asset: tok.symbol,
            amount: tok.formatted,
            reason: 'Contract lacks rescueTokensTo/rescueTokens selectors',
          });
          continue;
        }

        try {
          if (hasRescueTo) {
            const data = encodeRescueTokensTo(tok.address, recipient);
            if (useServerSigner) {
              const { txHash } = await sendSignedWithEstimate(contractAddr, data);
              sweptAssets.push({
                source: contractAddr,
                asset: tok.symbol,
                amount: tok.formatted,
                method: 'rescueTokensTo(token, recipient)',
                txHash,
                explorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
                recipient,
              });
            } else {
              const estGas = await estimateSweepGas(callerAddr, contractAddr, data);
              pendingWalletTxs.push({
                chain,
                chainIdHex: CHAIN_ID_HEX_MAP[chain],
                to: contractAddr,
                data,
                gas: `0x${((estGas * 130n) / 100n).toString(16)}`,
                source: contractAddr,
                sourceLabel: `Contract ${contractAddr.slice(0, 6)}...${contractAddr.slice(-4)}`,
                asset: tok.symbol,
                amount: tok.formatted,
                method: 'rescueTokensTo(token, recipient)',
                recipient,
                signerRequired: callerAddr,
              });
            }
          } else {
            // Contract exposes rescueTokens(token) -> sends to owner()
            const rescueData = encodeRescueTokens(tok.address);
            if (useServerSigner) {
              const { txHash: rescueTx } = await sendSignedWithEstimate(contractAddr, rescueData);
              if (recipient.toLowerCase() !== signerAddress!.toLowerCase()) {
                // Re-read actual balance received by owner so fee-on-transfer / existing dust never overdraws
                const paddedOwner = signerAddress!.toLowerCase().replace('0x', '').padStart(64, '0');
                const { result: postBalHex } = await fetchRpcSingleWithFailover(
                  chain,
                  'eth_call',
                  [{ to: tok.address, data: `0x70a08231${paddedOwner}` }, 'latest'],
                  true
                );
                const actualOwnerBal =
                  typeof postBalHex === 'string' && postBalHex.length >= 66
                    ? BigInt(postBalHex.slice(0, 66))
                    : tok.rawBalance;
                const amountToForward = includeGasWalletTokens
                  ? actualOwnerBal
                  : (actualOwnerBal < tok.rawBalance ? actualOwnerBal : tok.rawBalance);
                if (amountToForward > 0n) {
                  const fwdData = encodeErc20Transfer(recipient, amountToForward);
                  const { txHash: fwdTx } = await sendSignedWithEstimate(tok.address, fwdData);
                  sweptAssets.push({
                    source: contractAddr,
                    asset: tok.symbol,
                    amount: ethers.formatUnits(amountToForward, tok.decimals),
                    method: 'rescueTokens(token) -> ERC20.transfer(recipient)',
                    txHash: fwdTx,
                    explorerUrl: `${rpcInfo.explorer}/tx/${fwdTx}`,
                    recipient,
                  });
                }
              } else {
                sweptAssets.push({
                  source: contractAddr,
                  asset: tok.symbol,
                  amount: tok.formatted,
                  method: 'rescueTokens(token)',
                  txHash: rescueTx,
                  explorerUrl: `${rpcInfo.explorer}/tx/${rescueTx}`,
                  recipient,
                });
              }
            } else {
              const estRescueGas = await estimateSweepGas(callerAddr, contractAddr, rescueData);
              pendingWalletTxs.push({
                chain,
                chainIdHex: CHAIN_ID_HEX_MAP[chain],
                to: contractAddr,
                data: rescueData,
                gas: `0x${((estRescueGas * 130n) / 100n).toString(16)}`,
                source: contractAddr,
                sourceLabel: `Contract ${contractAddr.slice(0, 6)}...${contractAddr.slice(-4)}`,
                asset: tok.symbol,
                amount: tok.formatted,
                method: 'rescueTokens(token)',
                recipient: contractOwner || callerAddr,
                signerRequired: callerAddr,
              });
              if (recipient.toLowerCase() !== callerAddr.toLowerCase()) {
                const fwdData = encodeErc20Transfer(recipient, tok.rawBalance);
                pendingWalletTxs.push({
                  chain,
                  chainIdHex: CHAIN_ID_HEX_MAP[chain],
                  to: tok.address,
                  data: fwdData,
                  gas: '0x186a0',
                  source: callerAddr,
                  sourceLabel: `Forward ${tok.symbol} -> Profit Vault`,
                  asset: tok.symbol,
                  amount: tok.formatted,
                  method: 'ERC20.transfer(recipient)',
                  recipient,
                  signerRequired: callerAddr,
                });
              }
            }
          }
        } catch (err: any) {
          const reason = decodeFlashArbRevertError(err);
          skippedIncompatible.push({
            source: contractAddr,
            asset: tok.symbol,
            amount: tok.formatted,
            reason: `Pre-flight check / sweep reverted: ${reason}`,
          });
        }
      }
    }

    // Phase 2: Sweep compatible leftover ERC-20/2612/4626/777/721/1155 dust on Gas/Owner Wallet -> Profit Vault (never drains ETH gas!)
    if (includeGasWalletTokens && signerAddress && recipient.toLowerCase() !== signerAddress.toLowerCase()) {
      const signerBalances = await queryAllChainBalances(chain, signerAddress, extraTokenSpecs);
      const filteredSignerTokens = filterSweepTokensBySymbols(
        signerBalances.tokens.filter((t) => t.rawBalance > 0n),
        tokenSymbolFilter
      );
      for (const tok of filteredSignerTokens) {
        if (compatibleOnly && !tok.walletSweepCompatible) {
          skippedIncompatible.push({
            source: signerAddress,
            asset: tok.symbol,
            amount: tok.formatted,
            reason: tok.compatibilityNote || 'Incompatible ERC token',
          });
          continue;
        }
        try {
          let fwdData: string;
          let methodLabel: string;
          if (tok.ercStandard === 'ERC-1155' && tok.tokenId) {
            fwdData = encodeErc1155SafeTransferFrom(signerAddress, recipient, tok.tokenId, tok.rawBalance);
            methodLabel = `ERC1155.safeTransferFrom(#${tok.tokenId})`;
          } else if (tok.ercStandard === 'ERC-721' && tok.tokenId) {
            fwdData = encodeErc721SafeTransferFrom(signerAddress, recipient, tok.tokenId);
            methodLabel = `ERC721.safeTransferFrom(#${tok.tokenId})`;
          } else {
            fwdData = encodeErc20Transfer(recipient, tok.rawBalance);
            methodLabel = 'ERC20.transfer(recipient)';
          }
          const { txHash } = await sendSignedWithEstimate(tok.address, fwdData);
          sweptAssets.push({
            source: signerAddress,
            asset: tok.symbol,
            amount: tok.formatted,
            method: methodLabel,
            txHash,
            explorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
            recipient,
          });
        } catch (err: any) {
          const reason = decodeFlashArbRevertError(err);
          skippedIncompatible.push({
            source: signerAddress,
            asset: tok.symbol,
            amount: tok.formatted,
            reason: `Transfer simulation reverted: ${reason}`,
          });
        }
      }
    }

    // Phase 2B: Sweep excess native ETH above operational reserve (`minGasReserveWei`, default 0.002 ETH)
    // from Gas Signer Wallet -> Profit Vault
    let gasSurplusStatus: {
      checked: boolean;
      sweptEth: string;
      txHash?: string;
      reserveKeptEth: string;
      note?: string;
    } | null = null;
    if (includeGasWalletEthSurplus && signerAddress && cleanKey && recipient.toLowerCase() !== signerAddress.toLowerCase()) {
      const reserveEthStr = Number(ethers.formatEther(minGasReserveWei)).toFixed(4);
      try {
        const ethSweep = await sweepGasWalletEthSurplus({
          chain,
          cleanKey,
          signerAddress,
          recipient,
          minReserveWei: minGasReserveWei,
        });
        if (ethSweep.swept && ethSweep.txHash) {
          sweptAssets.push({
            source: signerAddress,
            asset: 'ETH (Gas Surplus)',
            amount: ethSweep.sentEthFormatted,
            method: `Gas Wallet Surplus -> Profit Vault (${reserveEthStr} ETH reserve kept)`,
            txHash: ethSweep.txHash,
            explorerUrl: ethSweep.explorerUrl || `${rpcInfo.explorer}/tx/${ethSweep.txHash}`,
            recipient,
          });
          gasSurplusStatus = {
            checked: true,
            sweptEth: ethSweep.sentEthFormatted,
            txHash: ethSweep.txHash,
            reserveKeptEth: reserveEthStr,
          };
        } else {
          gasSurplusStatus = {
            checked: true,
            sweptEth: '0',
            reserveKeptEth: reserveEthStr,
            note: ethSweep.reason,
          };
        }
      } catch (err: any) {
        gasSurplusStatus = {
          checked: true,
          sweptEth: '0',
          reserveKeptEth: reserveEthStr,
          note: err?.message || 'Gas surplus sweep skipped',
        };
      }
    }

    // Phase 3: Prepare compatible ERC-20 / ERC-2612 / ERC-4626 / ERC-777 / ERC-721 / ERC-1155 sweeps
    // from Connected Web3 Wallet -> Profit Vault (never drains native ETH!)
    if (
      includeConnectedWalletTokens &&
      validConnectedAddr &&
      recipient.toLowerCase() !== validConnectedAddr.toLowerCase() &&
      validConnectedAddr.toLowerCase() !== (signerAddress || '').toLowerCase()
    ) {
      const walletBalances = await queryAllChainBalances(chain, validConnectedAddr, extraTokenSpecs);
      const filteredWalletTokens = filterSweepTokensBySymbols(
        walletBalances.tokens.filter((t) => t.rawBalance > 0n),
        tokenSymbolFilter
      );
      for (const tok of filteredWalletTokens) {
        if (compatibleOnly && !tok.walletSweepCompatible) {
          skippedIncompatible.push({
            source: validConnectedAddr,
            asset: tok.symbol,
            amount: tok.formatted,
            reason: tok.compatibilityNote || 'Incompatible token standard',
          });
          continue;
        }
        try {
          let fwdData: string;
          let methodLabel: string;
          if (tok.ercStandard === 'ERC-1155' && tok.tokenId) {
            fwdData = encodeErc1155SafeTransferFrom(validConnectedAddr, recipient, tok.tokenId, tok.rawBalance);
            methodLabel = `ERC1155.safeTransferFrom(#${tok.tokenId})`;
          } else if (tok.ercStandard === 'ERC-721' && tok.tokenId) {
            fwdData = encodeErc721SafeTransferFrom(validConnectedAddr, recipient, tok.tokenId);
            methodLabel = `ERC721.safeTransferFrom(#${tok.tokenId})`;
          } else {
            fwdData = encodeErc20Transfer(recipient, tok.rawBalance);
            methodLabel = 'ERC20.transfer(recipient)';
          }
          const estGas = await estimateSweepGas(validConnectedAddr, tok.address, fwdData);
          pendingWalletTxs.push({
            chain,
            chainIdHex: CHAIN_ID_HEX_MAP[chain],
            to: tok.address,
            data: fwdData,
            gas: `0x${((estGas * 130n) / 100n).toString(16)}`,
            source: validConnectedAddr,
            sourceLabel: `Connected Wallet ${validConnectedAddr.slice(0, 6)}...${validConnectedAddr.slice(-4)}`,
            asset: tok.symbol,
            amount: tok.formatted,
            method: methodLabel,
            recipient,
            signerRequired: validConnectedAddr,
          });
        } catch (err: any) {
          const reason = decodeFlashArbRevertError(err);
          skippedIncompatible.push({
            source: validConnectedAddr,
            asset: tok.symbol,
            amount: tok.formatted,
            reason: `Connected wallet transfer simulation reverted: ${reason}`,
          });
        }
      }
    }

    if (errors.length > 0 && sweptAssets.length === 0 && pendingWalletTxs.length === 0) {
      return res.status(400).json({
        success: false,
        error: errors[0].error,
        errors,
        skippedIncompatible,
        checkedContracts,
        recipient,
      });
    }

    const requiresWalletSigning = pendingWalletTxs.length > 0;
    const message =
      sweptAssets.length > 0 && pendingWalletTxs.length > 0
        ? `Swept ${sweptAssets.length} asset(s) via server signer and prepared ${pendingWalletTxs.length} compatible tx(s) for Web3 wallet signature -> ${recipient}.`
        : sweptAssets.length > 0
        ? `Swept ${sweptAssets.length} compatible asset(s) to Profit Vault ${recipient}.`
        : pendingWalletTxs.length > 0
        ? `Prepared ${pendingWalletTxs.length} compatible token sweep transaction(s) for your connected wallet -> ${recipient}.`
        : skippedIncompatible.length > 0
        ? `No compatible holdings swept (${skippedIncompatible.length} incompatible/blocked asset(s) safely skipped).`
        : `All inspected contract & wallet compatible token holdings are already $0.00.`;

    invalidateBalanceResponseCaches(chain);
    return res.json({
      success: true,
      chain,
      chainName: rpcInfo.name,
      recipient,
      signerAddress,
      tokenSymbols: tokenSymbolFilter ? Array.from(tokenSymbolFilter) : null,
      checkedContracts,
      sweptAssets,
      pendingWalletTxs,
      requiresWalletSigning,
      skippedIncompatible,
      errors,
      gasSurplusStatus,
      message,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// L4 CROSS-LAYER SPATIAL ARBITRAGE & LIVE L1-L4 VERIFIER
// ============================================================

const CANONICAL_L4_ASSET_MAP: Record<string, string> = {
  WETH: 'ETH',
  ETH: 'ETH',
  APEETH: 'ETH',
  WBTC: 'BTC',
  BTCB: 'BTC',
  'BTC.B': 'BTC',
  CBBTC: 'BTC',
  USDC: 'USDC',
  'USDC.E': 'USDC',
  USDBC: 'USDC',
  USDT: 'USDT',
  DAI: 'DAI',
  LINK: 'LINK',
  UNI: 'UNI',
  AAVE: 'AAVE',
  EZETH: 'ezETH',
  WSTETH: 'wstETH',
  ARB: 'ARB',
  OP: 'OP',
  WMATIC: 'POL',
  POL: 'POL',
  WBNB: 'BNB',
  BNB: 'BNB',
  WAVAX: 'AVAX',
  AVAX: 'AVAX',
  WAPE: 'APE',
  APE: 'APE',
};

function computeL4CrossLayerOpportunities(staleThresholdMs = 90000) {
  const now = Date.now();
  const byCanonicalAsset = new Map<
    string,
    Array<{
      chain: SupportedArbChain;
      layer: BlockchainLayer;
      chainName: string;
      dex: string;
      pair: string;
      poolAddress: string;
      priceUsd: number;
      feeTierPercent: number;
      depthUsdApprox: number;
      blockNumber: number;
      ageMs: number;
    }>
  >();

  for (const chain of SUPPORTED_SCAN_CHAINS) {
    const meta = CHAIN_LAYER_META[chain];
    const pools = liveAgent.poolsByChain[chain] || [];
    for (const pool of pools) {
      const ageMs = now - (pool.lastUpdated || 0);
      if (ageMs > staleThresholdMs) continue;
      const baseSym = (pool.pair.split('/')[0] || '').toUpperCase();
      const canonical = CANONICAL_L4_ASSET_MAP[baseSym];
      if (!canonical) continue;
      if (!['ETH', 'BTC', 'USDC', 'USDT', 'DAI', 'LINK', 'UNI', 'AAVE', 'ezETH', 'wstETH'].includes(canonical)) {
        continue;
      }
      if (!(pool.priceUsd > 0)) continue;
      // Parse rough measured depthUsd from depthSummary ('$12.4M' / '$250K')
      let depthUsdApprox = 0;
      const m = pool.depthSummary.match(/\$([\d.]+)([MK])?/i);
      if (m) {
        const val = parseFloat(m[1]);
        const mult = m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'K' ? 1e3 : 1;
        depthUsdApprox = val * mult;
      }
      if (depthUsdApprox < 10000) continue;

      const list = byCanonicalAsset.get(canonical) || [];
      list.push({
        chain,
        layer: meta.layer,
        chainName: meta.shortName,
        dex: pool.dex,
        pair: pool.pair,
        poolAddress: pool.poolAddress,
        priceUsd: pool.priceUsd,
        feeTierPercent: pool.feeTierPercent,
        depthUsdApprox,
        blockNumber: pool.blockNumber,
        ageMs,
      });
      byCanonicalAsset.set(canonical, list);
    }
  }

  const opportunities: Array<{
    id: string;
    asset: string;
    buyChain: SupportedArbChain;
    buyLayer: BlockchainLayer;
    buyChainName: string;
    buyDex: string;
    buyPair: string;
    buyPool: string;
    buyPriceUsd: number;
    sellChain: SupportedArbChain;
    sellLayer: BlockchainLayer;
    sellChainName: string;
    sellDex: string;
    sellPair: string;
    sellPool: string;
    sellPriceUsd: number;
    layerCorridor: string;
    grossSpreadBps: number;
    dexAndBridgeCostBps: number;
    netSpreadBps: number;
    recommendedClipUsd: number;
    estNetProfitUsd: number;
    isProfitable: boolean;
    executionMode: 'CROSS_LAYER_SOLVER_OR_PREFUNDED_INVENTORY';
    note: string;
  }> = [];

  for (const [asset, venues] of byCanonicalAsset.entries()) {
    if (venues.length < 2) continue;
    // Best single venue per chain to avoid noisy intra-chain duplicates in L4 cross-chain view
    const sortedAsc = [...venues].sort((a, b) => a.priceUsd - b.priceUsd);
    const low = sortedAsc[0];
    const highCandidates = sortedAsc.filter((v) => v.chain !== low.chain);
    if (highCandidates.length === 0) continue;
    const high = highCandidates[highCandidates.length - 1];
    if (high.priceUsd <= low.priceUsd) continue;

    const grossSpreadBps = Number((((high.priceUsd - low.priceUsd) / low.priceUsd) * 10000).toFixed(2));
    // Exclude extreme >1500 bps mis-pegged bridged assets unless explicitly flagged
    if (grossSpreadBps > 2000) continue;

    const dexFeeBps = (low.feeTierPercent + high.feeTierPercent) * 100;
    const estBridgeFeeBps = low.layer === 'L1' || high.layer === 'L1' ? 8 : 4;
    const dexAndBridgeCostBps = Number((dexFeeBps + estBridgeFeeBps).toFixed(2));
    const netSpreadBps = Number((grossSpreadBps - dexAndBridgeCostBps).toFixed(2));
    const depthBound = Math.min(low.depthUsdApprox, high.depthUsdApprox) * 0.02;
    const recommendedClipUsd = Number(Math.max(1000, Math.min(50000, depthBound)).toFixed(0));
    const l1GasUsd = low.chain === 'ethereum' || high.chain === 'ethereum' ? 6.5 : 0.25;
    const estNetProfitUsd = Number(((recommendedClipUsd * (netSpreadBps / 10000)) - l1GasUsd).toFixed(2));

    opportunities.push({
      id: `l4-${asset.toLowerCase()}-${low.chain}-${high.chain}`,
      asset,
      buyChain: low.chain,
      buyLayer: low.layer,
      buyChainName: low.chainName,
      buyDex: low.dex,
      buyPair: low.pair,
      buyPool: low.poolAddress,
      buyPriceUsd: low.priceUsd,
      sellChain: high.chain,
      sellLayer: high.layer,
      sellChainName: high.chainName,
      sellDex: high.dex,
      sellPair: high.pair,
      sellPool: high.poolAddress,
      sellPriceUsd: high.priceUsd,
      layerCorridor: `${low.layer} (${low.chainName}) -> ${high.layer} (${high.chainName})`,
      grossSpreadBps,
      dexAndBridgeCostBps,
      netSpreadBps,
      recommendedClipUsd,
      estNetProfitUsd,
      isProfitable: estNetProfitUsd > 0 && netSpreadBps > 0,
      executionMode: 'CROSS_LAYER_SOLVER_OR_PREFUNDED_INVENTORY',
      note: 'Requires asynchronous cross-domain bridge / solver settlement or pre-funded L4 inventory (non-atomic).',
    });
  }

  opportunities.sort((a, b) => b.estNetProfitUsd - a.estNetProfitUsd);
  return opportunities;
}

/**
 * GET /api/flash-arb/cross-layer-opportunities
 * L4 Cross-Layer Spatial Arbitrage & Intent Solver Corridor Scanner across all live L1/L2/L3 pools
 */
flashArbRouter.get('/cross-layer-opportunities', (_req: Request, res: Response) => {
  const opportunities = computeL4CrossLayerOpportunities();
  const activeChains = SUPPORTED_SCAN_CHAINS.filter((c) => (liveAgent.poolsByChain[c] || []).length > 0);
  return res.json({
    success: true,
    layer: 'L4',
    name: 'Cross-Layer Meta-Execution & Spatial Arbitrage',
    activeChainsCount: activeChains.length,
    activeChains,
    totalCorridorsEvaluated: opportunities.length,
    profitableCorridorsCount: opportunities.filter((o) => o.isProfitable).length,
    opportunities,
    timestamp: Date.now(),
  });
});

// Cancun EIP-1153 runtime probe initcode: PUSH1 0x01 PUSH0 TSTORE PUSH0 TLOAD PUSH0 MSTORE PUSH1 0x20 PUSH0 RETURN
// Returns 0x...01 (32-byte value 1) via eth_call ONLY when EVM supports PUSH0 + TSTORE + TLOAD.
const CANCUN_TSTORE_PROBE_INITCODE = '0x60015f5d5f5c5f5260205ff3';
const CANCUN_EXPECTED_RET = '0x0000000000000000000000000000000000000000000000000000000000000001';

/**
 * POST /api/flash-arb/verify-layers
 * Live RPC verification of L1, L2, L3 blockchains, Cancun EIP-1153 execution, Vault/Aave/Router deployments,
 * FlashArbOptimized functions & routeTypes 1..4 (UniV3->V2, V2->UniV3, UniV3->UniV3, V2->V2), plus L4 spatial corridors.
 */
flashArbRouter.post('/verify-layers', async (req: Request, res: Response) => {
  try {
    const requestedLayer = String(req.body?.layer || req.query?.layer || 'ALL').toUpperCase() as AllLayerFilter;
    const requestedChainRaw = String(req.body?.chain || '').toLowerCase();

    let chainsToVerify: SupportedArbChain[] = SUPPORTED_SCAN_CHAINS;
    if (isSupportedArbChain(requestedChainRaw)) {
      chainsToVerify = [requestedChainRaw];
    } else if (requestedLayer === 'L1' || requestedLayer === 'L2' || requestedLayer === 'L3') {
      chainsToVerify = SUPPORTED_SCAN_CHAINS.filter((c) => CHAIN_LAYER_META[c].layer === requestedLayer);
    }

    const verifySingleChain = async (chain: SupportedArbChain) => {
      const meta = CHAIN_LAYER_META[chain];
      const rpcInfo = RPC_ENDPOINTS[chain];
      const routers = getEffectiveChainDexRouters(chain);
      const contractAddr = DEPLOYED_CONTRACTS[chain] || '';
      const hasContract = Boolean(contractAddr && /^0x[a-fA-F0-9]{40}$/.test(contractAddr));
      const hasVaultAddr = meta.balancerVault.toLowerCase() !== ethers.ZeroAddress.toLowerCase();
      const hasAaveAddr = meta.aavePool.toLowerCase() !== ethers.ZeroAddress.toLowerCase();

      const routerEntries = Object.entries(routers);
      const batchCalls: any[] = [
        { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
        { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 2 },
        { jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 3 },
        { jsonrpc: '2.0', method: 'eth_call', params: [{ data: CANCUN_TSTORE_PROBE_INITCODE }, 'latest'], id: 4 },
        { jsonrpc: '2.0', method: 'eth_getCode', params: [MULTICALL3_ADDRESS, 'latest'], id: 5 },
        ...(hasVaultAddr
          ? [{ jsonrpc: '2.0', method: 'eth_getCode', params: [meta.balancerVault, 'latest'], id: 6 }]
          : []),
        ...(hasAaveAddr
          ? [{ jsonrpc: '2.0', method: 'eth_getCode', params: [meta.aavePool, 'latest'], id: 7 }]
          : []),
        ...(hasContract
          ? [
              { jsonrpc: '2.0', method: 'eth_getCode', params: [contractAddr, 'latest'], id: 8 },
              { jsonrpc: '2.0', method: 'eth_call', params: [{ to: contractAddr, data: '0x8da5cb5b' }, 'latest'], id: 9 },
              { jsonrpc: '2.0', method: 'eth_call', params: [{ to: contractAddr, data: '0x459a01ae' }, 'latest'], id: 10 },
            ]
          : []),
      ];

      routerEntries.forEach(([_, spec], idx) => {
        if (spec.router) {
          batchCalls.push({
            jsonrpc: '2.0',
            method: 'eth_getCode',
            params: [spec.router, 'latest'],
            id: 100 + idx,
          });
        }
      });

      const started = Date.now();
      let blockNumber = 0;
      let chainIdOnRpc = 0;
      let gasPriceGwei = 0;
      let cancunVerified = false;
      let multicall3Verified = false;
      let balancerVaultDeployed = false;
      let aavePoolDeployed = false;
      let contractDeployed = false;
      let contractOwner: string | null = null;
      let routerCaps: RouterCapabilityOptions = {};
      let contractFunctions = {
        executeOptimizedArbitrage: false,
        executeDirectFlashArb: false,
        rescueTokens: false,
        rescueTokensTo: false,
        owner: false,
      };
      let rpcUsed = rpcInfo.rpc;
      let rpcError: string | null = null;
      const routerBytecodeOk = new Map<number, boolean>();

      try {
        const [{ results, rpcUrl }, infra] = await Promise.all([
          fetchRpcBatchWithFailover(chain, batchCalls),
          liveAgent.getChainInfra(chain).catch(() => null),
        ]);
        rpcUsed = rpcUrl;
        const byId = new Map<number, any>();
        for (const r of results) {
          if (r && r.id !== undefined) byId.set(Number(r.id), r);
        }
        const blkRes = byId.get(1)?.result;
        const gpRes = byId.get(2)?.result;
        const cidRes = byId.get(3)?.result;
        const cancunRes = byId.get(4)?.result;
        const mcRes = byId.get(5)?.result;
        const balRes = byId.get(6)?.result;
        const aaveRes = byId.get(7)?.result;
        const ctrCodeRes = byId.get(8)?.result;
        const ownerRes = byId.get(9)?.result;
        const capsRes = byId.get(10)?.result;

        blockNumber = typeof blkRes === 'string' ? parseInt(blkRes, 16) : 0;
        chainIdOnRpc = typeof cidRes === 'string' ? parseInt(cidRes, 16) : 0;
        gasPriceGwei = typeof gpRes === 'string' ? Number((Number(BigInt(gpRes)) / 1e9).toFixed(4)) : 0;
        cancunVerified = typeof cancunRes === 'string' && cancunRes.toLowerCase() === CANCUN_EXPECTED_RET;
        multicall3Verified = typeof mcRes === 'string' && mcRes.length > 2;
        balancerVaultDeployed = hasVaultAddr && typeof balRes === 'string' && balRes.length > 2;
        aavePoolDeployed = hasAaveAddr && typeof aaveRes === 'string' && aaveRes.length > 2;

        if (typeof ctrCodeRes === 'string' && ctrCodeRes.length > 2) {
          const lower = ctrCodeRes.toLowerCase();
          contractDeployed = true;
          contractFunctions = {
            executeOptimizedArbitrage: lower.includes('23b3aa6b'),
            executeDirectFlashArb: lower.includes('7804d9ac'),
            rescueTokens: lower.includes('00ae3bf8') || lower.includes('ae3bf8'),
            rescueTokensTo: lower.includes('a7070692'),
            owner: lower.includes('8da5cb5b'),
          };
        }
        if (typeof ownerRes === 'string' && ownerRes.length >= 66) {
          contractOwner = ethers.getAddress(`0x${ownerRes.slice(-40)}`);
        }
        if (typeof capsRes === 'string' && capsRes.length >= 66) {
          const mask = BigInt(capsRes.slice(0, 66));
          routerCaps = {
            supportsAlgebra: (mask & 2n) !== 0n,
            supportsCamelotV2: (mask & 4n) !== 0n,
          };
        }
        if (infra?.camelotV3Adapter) {
          routerCaps.camelotV3Adapter = infra.camelotV3Adapter;
        }
        routerEntries.forEach((_, idx) => {
          const rCode = byId.get(100 + idx)?.result;
          routerBytecodeOk.set(idx, typeof rCode === 'string' && rCode.length > 2);
        });

        const vaultDepthTokens = infra
          ? Object.values(CHAIN_TOKENS[chain]).filter((t) => (infra.vaultBalances[t.addr.toLowerCase()] || 0n) > 0n).length
          : 0;
        const routeReadiness = verifyChainRouteTypesReadiness(
          chain,
          chain === 'arbitrum' ? routerCaps : undefined,
          profitWalletEnv() || contractOwner || '0x000000000000000000000000000000000000dEaD'
        );

        const verifiedRouters = routerEntries.map(([name, spec], idx) => ({
          dex: name,
          routerAddress: spec.router,
          isV3: spec.isV3,
          supportedByContract: spec.supported,
          bytecodeVerifiedOnChain: spec.router ? Boolean(routerBytecodeOk.get(idx)) : false,
        }));

        const poolsLive = (liveAgent.poolsByChain[chain] || []).length;
        const oppsLive = (liveAgent.opportunitiesByChain[chain] || []).length;

        return {
          chain,
          name: meta.name,
          layer: meta.layer,
          chainId: meta.chainId,
          chainIdVerified: chainIdOnRpc === meta.chainId,
          nativeSymbol: meta.nativeSymbol,
          settlementModel: meta.settlementModel,
          rpcReachable: blockNumber > 0,
          rpcUsed,
          latencyMs: Date.now() - started,
          blockNumber,
          gasPriceGwei,
          cancunEip1153Verified: cancunVerified,
          multicall3Verified,
          balancerVaultDeployed,
          balancerVaultFundedTokens: vaultDepthTokens,
          aavePoolDeployed,
          contractAddress: hasContract ? contractAddr : null,
          contractDeployed,
          contractOwner,
          contractFunctions,
          routeReadiness,
          verifiedRouters,
          monitoredPoolsCount: poolsLive,
          evaluatedOpportunitiesCount: oppsLive,
          rpcError,
        };
      } catch (err: any) {
        rpcError = err?.message || 'RPC verification failed';
        const routeReadiness = verifyChainRouteTypesReadiness(chain);
        return {
          chain,
          name: meta.name,
          layer: meta.layer,
          chainId: meta.chainId,
          chainIdVerified: false,
          nativeSymbol: meta.nativeSymbol,
          settlementModel: meta.settlementModel,
          rpcReachable: false,
          rpcUsed,
          latencyMs: Date.now() - started,
          blockNumber: 0,
          gasPriceGwei: 0,
          cancunEip1153Verified: false,
          multicall3Verified: false,
          balancerVaultDeployed: false,
          balancerVaultFundedTokens: 0,
          aavePoolDeployed: false,
          contractAddress: hasContract ? contractAddr : null,
          contractDeployed: false,
          contractOwner: null,
          contractFunctions,
          routeReadiness,
          verifiedRouters: [],
          monitoredPoolsCount: (liveAgent.poolsByChain[chain] || []).length,
          evaluatedOpportunitiesCount: (liveAgent.opportunitiesByChain[chain] || []).length,
          rpcError,
        };
      }
    };

    const chainReports = await Promise.all(chainsToVerify.map((c) => verifySingleChain(c)));
    const l4Opportunities = computeL4CrossLayerOpportunities();

    const layerSummary = {
      L1: {
        chains: chainReports.filter((c) => c.layer === 'L1').length,
        rpcOnline: chainReports.filter((c) => c.layer === 'L1' && c.rpcReachable).length,
        cancunVerified: chainReports.filter((c) => c.layer === 'L1' && c.cancunEip1153Verified).length,
      },
      L2: {
        chains: chainReports.filter((c) => c.layer === 'L2').length,
        rpcOnline: chainReports.filter((c) => c.layer === 'L2' && c.rpcReachable).length,
        cancunVerified: chainReports.filter((c) => c.layer === 'L2' && c.cancunEip1153Verified).length,
      },
      L3: {
        chains: chainReports.filter((c) => c.layer === 'L3').length,
        rpcOnline: chainReports.filter((c) => c.layer === 'L3' && c.rpcReachable).length,
        cancunVerified: chainReports.filter((c) => c.layer === 'L3' && c.cancunEip1153Verified).length,
      },
      L4: {
        activeCorridors: l4Opportunities.length,
        profitableCorridors: l4Opportunities.filter((o) => o.isProfitable).length,
        topSpreadBps: l4Opportunities[0]?.grossSpreadBps ?? 0,
      },
    };

    const routeTypeAggregate = ([1, 2, 3, 4] as const).map((rt) => {
      const supportingChains = chainReports
        .filter((c) => c.routeReadiness.routeTypes.find((r) => r.routeType === rt)?.available)
        .map((c) => c.chain);
      const sample = chainReports
        .map((c) => c.routeReadiness.routeTypes.find((r) => r.routeType === rt))
        .find((r) => r?.available);
      return {
        routeType: rt,
        codeName: sample?.codeName || `TYPE_${rt}`,
        description: sample?.description || '',
        supportingChainsCount: supportingChains.length,
        supportingChains,
      };
    });

    return res.json({
      success: true,
      requestedLayer,
      verifiedChainsCount: chainReports.filter((c) => c.rpcReachable).length,
      totalChainsChecked: chainReports.length,
      layerSummary,
      routeTypeAggregate,
      chains: chainReports,
      l4SampleOpportunities: l4Opportunities.slice(0, 10),
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Layer verification failed' });
  }
});

