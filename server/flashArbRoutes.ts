import { Router, type Request, type Response } from 'express';
import { ethers } from 'ethers';
import { sizeArbitrage, MAX_DEPTH_FRACTION } from './arbSizing.ts';
import {
  ARBITRUM_TOKENS,
  ARBITRUM_DEX_ROUTERS,
  resolveArbitrageCandidates,
  encodeExecuteDirectFlashArb,
  encodeRescueTokens,
  encodeRescueTokensTo,
  encodeErc20Transfer,
  decodeArbitrageSwapsExecutedLogs,
  decodeFlashArbRevertError,
  type RouteExecutionInput,
} from './flashArbExecutor.ts';

export const flashArbRouter = Router();

// Wallet addresses come ONLY from env (FLASH_ARB_GAS_WALLET / FLASH_ARB_PROFIT_WALLET); no built-in defaults.
const gasWalletEnv = () => (process.env.FLASH_ARB_GAS_WALLET || '').trim();
const profitWalletEnv = () => (process.env.FLASH_ARB_PROFIT_WALLET || '').trim();

export const ARBITRUM_RPC_POOL = [
  process.env.ARBITRUM_RPC_URL,
  'https://arbitrum-one-rpc.publicnode.com',
  'https://1rpc.io/arb',
  'https://arb1.arbitrum.io/rpc',
  'https://arbitrum.meowrpc.com',
].filter(Boolean) as string[];

// PublicNode rejects eth_getTransactionReceipt with -32602 ("Archive requests require a personal token"),
// so tx submission, deployment, and receipt verification use receipt-capable endpoints first.
export const ARBITRUM_TX_RPC_POOL = [
  process.env.ARBITRUM_RPC_URL,
  'https://arb1.arbitrum.io/rpc',
  'https://1rpc.io/arb',
  'https://arbitrum.meowrpc.com',
].filter(Boolean) as string[];

export const BASE_RPC_POOL = [
  process.env.BASE_RPC_URL,
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://1rpc.io/base',
].filter(Boolean) as string[];

export const OPTIMISM_RPC_POOL = [
  process.env.OPTIMISM_RPC_URL,
  'https://mainnet.optimism.io',
  'https://optimism-rpc.publicnode.com',
  'https://1rpc.io/op',
].filter(Boolean) as string[];

const RPC_ENDPOINTS: Record<string, {
  name: string;
  rpc: string;
  explorer: string;
  chainId: number;
  balancerVault: string;
  aavePool: string;
}> = {
  arbitrum: {
    name: 'Arbitrum One',
    rpc: ARBITRUM_TX_RPC_POOL[0],
    explorer: 'https://arbiscan.io',
    chainId: 42161,
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  },
  base: {
    name: 'Base L2',
    rpc: BASE_RPC_POOL[0],
    explorer: 'https://basescan.org',
    chainId: 8453,
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  },
  optimism: {
    name: 'Optimism Mainnet',
    rpc: OPTIMISM_RPC_POOL[0],
    explorer: 'https://optimistic.etherscan.io',
    chainId: 10,
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  },
};

// Tracks endpoints that have returned 429 or network errors to avoid hammering them
const rpcCooldowns = new Map<string, number>();

/**
 * Resilient multi-endpoint RPC caller that fails over instantly across public RPC providers
 * and enforces backoff if any provider returns 429 Too Many Requests.
 */
async function fetchRpcBatchWithFailover(chain: 'arbitrum' | 'base' | 'optimism', calls: any[]): Promise<{ results: any[]; rpcUrl: string }> {
  const pool = chain === 'arbitrum' ? ARBITRUM_RPC_POOL : chain === 'base' ? BASE_RPC_POOL : OPTIMISM_RPC_POOL;
  const now = Date.now();
  // Sort endpoints: non-cooled down first, then by earliest cooldown expiry
  const candidates = [...pool].sort((a, b) => (rpcCooldowns.get(a) || 0) - (rpcCooldowns.get(b) || 0));

  let lastError: Error | null = null;
  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);
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
  const c = chain.toLowerCase();
  if (c === 'base') return BASE_RPC_POOL;
  if (c === 'optimism') return OPTIMISM_RPC_POOL;
  return txCapable ? ARBITRUM_TX_RPC_POOL : ARBITRUM_RPC_POOL;
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

        rpcCooldowns.set(url, Date.now() + 30000);
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

async function waitForReceiptWithFailover(
  chain: string,
  txHash: string,
  timeoutMs = 45000
): Promise<{
  status: number;
  blockNumber: number;
  gasUsed: bigint;
  effectiveGasPrice: bigint | null;
  contractAddress?: string | null;
  logs: Array<{ address?: string; topics: string[]; data: string }>;
}> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { result } = await fetchRpcSingleWithFailover(chain, 'eth_getTransactionReceipt', [txHash], true);
      if (result && result.blockNumber) {
        return {
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
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timed out waiting for transaction receipt (${txHash}) on ${chain}`);
}

/**
 * Fetch raw on-chain balance and gas price via JSON-RPC with multi-endpoint failover
 */
async function queryChainGas(chain: 'arbitrum' | 'base' | 'optimism', address: string) {
  const pool = chain === 'arbitrum' ? ARBITRUM_RPC_POOL : chain === 'base' ? BASE_RPC_POOL : OPTIMISM_RPC_POOL;
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

      // Convert balance from Wei to ETH with 6 decimal precision
      const weiPerEth = 10n ** 18n;
      const wholeEth = balanceWei / weiPerEth;
      const remainderWei = balanceWei % weiPerEth;
      const fractionalPart = (remainderWei * 1000000n) / weiPerEth;
      const ethStr = `${wholeEth}.${fractionalPart.toString().padStart(6, '0')}`;
      const ethNum = parseFloat(ethStr);

      const gasPriceGwei = Number(gasPriceWei) / 1e9;

      // FlashArbOptimized consumes ~148,000 gas per trade
      const avgGasPerTx = 148000n;
      const costPerTxWei = avgGasPerTx * gasPriceWei;
      const estimatedTxs = costPerTxWei > 0n ? Number(balanceWei / costPerTxWei) : null;

      return {
        success: true,
        balanceEth: ethNum,
        balanceEthFormatted: `${ethNum.toFixed(4)} ETH`,
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
    balanceEth: null as number | null,
    balanceEthFormatted: null as string | null,
    gasPriceGwei: null as number | null,
    estimatedTxsRemaining: null as number | null,
    error: lastErr,
  };
}

/**
 * GET /api/flash-arb/gas-status
 * Queries real-time on-chain ETH gas balance of the Gas Holder Wallet across Arbitrum, Base, and Optimism
 */
flashArbRouter.get('/gas-status', async (req: Request, res: Response) => {
  try {
    const address = String(req.query.address || gasWalletEnv());
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({ success: false, error: 'No valid address: pass ?address= or set FLASH_ARB_GAS_WALLET.' });
    }

    // Approximate ETH USD price for USD balance computation
    const ethUsdPrice = 2850;

    const [arbStatus, baseStatus, opStatus] = await Promise.all([
      queryChainGas('arbitrum', address),
      queryChainGas('base', address),
      queryChainGas('optimism', address),
    ]);

    const isSignerConfigured = Boolean(process.env.FLASH_ARB_SIGNER_KEY);

    res.json({
      success: true,
      gasWallet: address,
      profitWallet: profitWalletEnv(),
      isSignerConfigured,
      chains: {
        arbitrum: {
          ...RPC_ENDPOINTS.arbitrum,
          ...arbStatus,
          balanceUsd: Number(((arbStatus.balanceEth ?? 0) * ethUsdPrice).toFixed(2)),
          fundedForTrading: (arbStatus.balanceEth ?? 0) >= 0.002,
        },
        base: {
          ...RPC_ENDPOINTS.base,
          ...baseStatus,
          balanceUsd: Number(((baseStatus.balanceEth ?? 0) * ethUsdPrice).toFixed(2)),
          fundedForTrading: (baseStatus.balanceEth ?? 0) >= 0.002,
        },
        optimism: {
          ...RPC_ENDPOINTS.optimism,
          ...opStatus,
          balanceUsd: Number(((opStatus.balanceEth ?? 0) * ethUsdPrice).toFixed(2)),
          fundedForTrading: (opStatus.balanceEth ?? 0) >= 0.002,
        },
      },
      timestamp: Date.now(),
    });
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

    if (profitWallet && typeof profitWallet === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(profitWallet.trim())) {
      process.env.FLASH_ARB_PROFIT_WALLET = profitWallet.trim();
    }

    const keyLast4 = process.env.FLASH_ARB_SIGNER_KEY.slice(-4);

    return res.json({
      success: true,
      message: 'Signer key successfully configured in server memory for live Arbitrum and Base execution',
      isKeyConfigured: true,
      gasWallet: process.env.FLASH_ARB_GAS_WALLET,
      profitWallet: process.env.FLASH_ARB_PROFIT_WALLET,
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
    if (!profitWallet || typeof profitWallet !== 'string' || !/^0x[a-fA-F0-9]{40}$/i.test(profitWallet.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Valid 42-character EVM address (0x...) is required for profitWallet.',
      });
    }
    process.env.FLASH_ARB_PROFIT_WALLET = profitWallet.trim();
    if (gasWallet && typeof gasWallet === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(gasWallet.trim())) {
      process.env.FLASH_ARB_GAS_WALLET = gasWallet.trim();
    }
    return res.json({
      success: true,
      profitWallet: process.env.FLASH_ARB_PROFIT_WALLET,
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
    const isDeployed = code !== '0x' && code.length > 2;

    return res.json({
      success: true,
      chain,
      address,
      isDeployed,
      bytecodeLength: isDeployed ? (code.length - 2) / 2 : 0,
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
        error: 'No server-side signer private key configured. Enter private key in Signer Key Config or connect your Web3 wallet.',
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
    const txPool = getRpcPool(targetChain, true);
    let tx: any = null;
    let lastSendErr: any = null;
    const callData = typeof data === 'string' && data ? data : '0x';
    const isDirectSweepSelector = callData.toLowerCase().startsWith('0x7804d9ac');

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
        const signerAddr = new ethers.Wallet(process.env.FLASH_ARB_SIGNER_KEY).address;
        if (contractOwner.toLowerCase() !== signerAddr.toLowerCase()) {
          return res.status(400).json({
            success: false,
            error: `Signer wallet ${signerAddr} is not the owner of contract ${to} (owner is ${contractOwner}). Deploy your own contract with this signer or switch to the owner key so onlyOwner sweep/arb calls do not revert.`,
          });
        }
      }
    } catch {
      // Contract may not expose owner(); proceed to tx send
    }

    for (const rpcUrl of txPool) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(process.env.FLASH_ARB_SIGNER_KEY, provider);

        const balanceWei = await provider.getBalance(wallet.address);
        if (balanceWei < 100000000000000n) { // 0.0001 ETH
          return res.status(400).json({
            success: false,
            error: `Insufficient gas balance: ${wallet.address} holds ${ethers.formatEther(balanceWei)} ETH on ${rpcInfo.name}, which is below required gas threshold.`,
          });
        }

        tx = await wallet.sendTransaction({
          to,
          data: callData,
          gasLimit: gasLimit ? BigInt(gasLimit) : 300000n,
        });
        break;
      } catch (err: any) {
        lastSendErr = err;
        const msg = String(err?.message || '');
        if (!/429|403|timeout|fetch|coalesce|archive|network|ECONN|socket/i.test(msg)) {
          throw err;
        }
      }
    }

    if (!tx) {
      throw lastSendErr || new Error(`Failed to broadcast transaction on ${rpcInfo.name}`);
    }

    const receipt = await waitForReceiptWithFailover(targetChain, tx.hash, 45000);
    if (!receipt || receipt.status !== 1) {
      return res.status(500).json({
        success: false,
        txHash: tx.hash,
        error: 'Transaction reverted on-chain.',
      });
    }

    return res.json({
      success: true,
      txHash: tx.hash,
      chain: rpcInfo.name,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      isEthSweepOnly: isDirectSweepSelector,
      explorerUrl: `${rpcInfo.explorer}/tx/${tx.hash}`,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
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

    const fs = await import('fs');
    const path = await import('path');
    const artifactPath = path.join(process.cwd(), 'flash-arb/contracts/out/FlashArbOptimized.json');
    if (!fs.existsSync(artifactPath)) {
      return res.status(500).json({ success: false, error: 'FlashArbOptimized artifact not found' });
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

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

// In-memory registry of active FlashArb contract addresses per chain
const DEPLOYED_CONTRACTS: Record<string, string> = {
  arbitrum: '0xeee31ff9e69904b43c124095b6f33aa61505bcc2',
  base: '0x29B35c83955146Ba8fd754B4b96956D245A5661e',
  optimism: '0x738C8Eb31316B23d9b8A68B0c2658B456c932598',
};

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
  if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(String(address).trim())) {
    return res.status(400).json({ success: false, error: 'Invalid EVM contract address format (must be 0x followed by 40 hex chars)' });
  }
  DEPLOYED_CONTRACTS[targetChain] = address.trim();
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

    const fs = await import('fs');
    const path = await import('path');
    const artifactPath = path.join(process.cwd(), 'flash-arb/contracts/out/FlashArbOptimized.json');
    if (!fs.existsSync(artifactPath)) {
      return res.status(500).json({ success: false, error: 'FlashArbOptimized artifact not found on disk' });
    }
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    const { ethers } = await import('ethers');

    const signerKey = reqPrivateKey || process.env.FLASH_ARB_SIGNER_KEY;

    if (!signerKey) {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const encodedArgs = abiCoder.encode(['address', 'address'], [rpcInfo.balancerVault, rpcInfo.aavePool]);
      const deployData = artifact.bytecode + encodedArgs.slice(2);

      return res.json({
        success: false,
        requiresWallet: true,
        message: 'No server signer key configured. Deploy via connected Web3 wallet (MetaMask / OKX).',
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
    let deployedAddress: string | null = null;
    let txHash = '';
    let walletAddress = '';
    let lastDeployErr: any = null;

    for (const rpcUrl of txPool) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(cleanKey, provider);
        walletAddress = wallet.address;

        const balanceWei = await provider.getBalance(wallet.address);
        const minRequiredWei = 100000000000000n; // 0.0001 ETH
        if (balanceWei < minRequiredWei) {
          return res.status(400).json({
            success: false,
            error: `Deployer wallet ${wallet.address} has ${ethers.formatEther(balanceWei)} ETH on ${rpcInfo.name}. Contract deployment requires ~0.0003 ETH for L2 gas. Please fund ${wallet.address} or deploy with your connected wallet.`,
            deployerAddress: wallet.address,
            balanceEth: ethers.formatEther(balanceWei),
          });
        }

        const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
        const contract = await factory.deploy(rpcInfo.balancerVault, rpcInfo.aavePool);
        const deployTx = contract.deploymentTransaction();
        txHash = deployTx ? deployTx.hash : '';

        if (txHash) {
          const receipt = await waitForReceiptWithFailover(targetChain, txHash, 60000);
          if (receipt.status !== 1) {
            throw new Error('Contract deployment transaction reverted on-chain.');
          }
          deployedAddress = receipt.contractAddress || (await contract.getAddress());
        } else {
          await contract.waitForDeployment();
          deployedAddress = await contract.getAddress();
        }
        break;
      } catch (err: any) {
        lastDeployErr = err;
        const msg = String(err?.message || '');
        if (!/429|403|timeout|fetch|coalesce|archive|network|ECONN|socket/i.test(msg)) {
          throw err;
        }
      }
    }

    if (!deployedAddress) {
      throw lastDeployErr || new Error(`Contract deployment failed on ${rpcInfo.name}`);
    }
    const contractAddress = deployedAddress;
    const wallet = { address: walletAddress };

    // Register into active deployed contracts store
    DEPLOYED_CONTRACTS[targetChain] = contractAddress;

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
    return res.status(500).json({
      success: false,
      error: err.message || 'Contract deployment failed',
    });
  }
});

// ============================================================
// LIVE ON-CHAIN MEV AGENT ENGINE (ARBITRUM ONE MAINNET)
// ============================================================

export interface MonitoredPoolState {
  id: string;
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
  txHash: string;
  timestamp: number;
  blockNumber: number;
  pair: string;
  buyDex: string;
  sellDex: string;
  grossSpreadUsd: number | null;
  netProfitUsd: number | null;
  gasCostEth: number | null;
  status: 'CONFIRMED' | 'REVERTED' | 'PENDING';
  explorerUrl: string;
  profitRecipient: string;
}

// In-Memory Live Agent State with Dynamic Parameter Optimizer & Strict Profit Guard
// ---- Monitored Arbitrum One pools (60 verified on-chain pools across 16 pairs & 6 DEXes) ----
// Every pool address was verified on Arbitrum One via factory getPool / getPair / poolByPair.
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

interface PoolSpec {
  id: string; name: string; dex: string; pair: string; address: string; fee: number;
  kind: 'v3' | 'algebra' | 'v2'; base: Tok; quote: Tok;
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
];

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
  public gasOptimizationMode: 'ECO' | 'HYPER_ALPHA' | 'AGGRESSIVE' = 'HYPER_ALPHA';
  public autoOptimizeSize: boolean = true; // Dynamically scale loan amount to pool liquidity
  public isAutonomousExecutionEnabled: boolean = false; // Auto-executes live on-chain when profit guard cleared
  public lastExecutionTimestamp: number = 0;
  public lastExecutionNotice: string | null = null;
  private routeInputsByOppId = new Map<string, RouteExecutionInput>();

  constructor() {
    this.start();
  }

  public start() {
    this.stop();
    this.isRunning = true;
    this.scheduleNextScan(100);
  }

  public stop() {
    this.isRunning = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  private scheduleNextScan(delayMs: number) {
    if (!this.isRunning) return;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(async () => {
      if (!this.isRunning) return;
      try {
        await this.scan();
      } catch {
        // Handled internally in scan()
      }
      if (this.isRunning) {
        // Normal scan interval is 6500ms. If consecutive RPC rate-limits/errors occur, back off exponentially up to 25s
        const nextDelay = this.consecutiveFailures > 0
          ? Math.min(25000, 6500 * (1.5 ** Math.min(this.consecutiveFailures, 4)))
          : 6500;
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
    gasPriceGwei: number; // real eth_gasPrice from the Arbitrum RPC
    lighterRoute: boolean; // both legs concentrated-liquidity pools
  }): LiveArbitrageOpportunity | null {
    const grossSpreadUsd = Math.max(0, params.sellPrice - params.buyPrice);
    const grossSpreadBps = Number(((grossSpreadUsd / params.buyPrice) * 10000).toFixed(2));
    const dexFeeBps = Math.round((params.feeTierA + params.feeTierB) * 100);
    const netEdgeBps = grossSpreadBps - dexFeeBps;

    // Calibrate lowest safe gas limit based on route architecture
    const baseGasLimit = params.lighterRoute ? 135000 : 148500; // per-route gas budget (project estimate)

    let gasMultiplier = 1.0;
    let tipGwei = 0.05;
    if (this.gasOptimizationMode === 'ECO') {
      gasMultiplier = 0.90;
      tipGwei = 0.01;
    } else if (this.gasOptimizationMode === 'AGGRESSIVE') {
      gasMultiplier = 1.15;
      tipGwei = 0.15;
    }

    const optimalGasLimit = Math.round(baseGasLimit * gasMultiplier);
    const gasSavingsPercent = Number((((300000 - optimalGasLimit) / 300000) * 100).toFixed(1));
    const effectiveGwei = params.gasPriceGwei + tipGwei; // real chain gas price + configured tip
    const gasEth = (optimalGasLimit * effectiveGwei) / 1e9;
    const gasCostUsd = Number((gasEth * params.ethUsd).toFixed(3));

    // ---- Sizing from MEASURED depth (model + rationale in server/arbSizing.ts) ----------------------------
    // Loan bounds are 0.5 to 15 WETH-equivalents of notional, expressed in units of the loan token.
    const sized = sizeArbitrage({
      netEdgeBps,
      depthBuyUsd: params.depthA,
      depthSellUsd: params.depthB,
      buyPrice: params.buyPrice,
      gasCostUsd,
      autoOptimize: this.autoOptimizeSize,
      fixedClipUsd: 10000,
      minLoanUnits: (0.5 * params.ethUsd) / params.buyPrice,
      maxLoanUnits: (15 * params.ethUsd) / params.buyPrice,
    });
    if (!sized) return null; // depth not measured: no opportunity is invented

    const optimalLoanWeth = sized.loanUnits;
    const priceImpactBps = sized.priceImpactBps;
    const netProfitUsd = sized.netProfitUsd;
    let isProfitable = false;
    let profitGuardStatus: 'PROFIT_SECURED' | 'REVERT_PROTECTION_BLOCKED' = 'REVERT_PROTECTION_BLOCKED';
    let profitGuardReason = '';

    if (netEdgeBps <= 0) {
      profitGuardReason = `Execution Blocked by Profit Guard: gross spread (${grossSpreadBps} bps) is below combined DEX swap fees (${dexFeeBps} bps). Modelled loss $${Math.abs(netProfitUsd).toFixed(2)}.`;
    } else if (sized.overDepth) {
      profitGuardReason = `Execution Blocked by Profit Guard: minimum clip ($${sized.tradeUsd.toFixed(0)}) exceeds ${(MAX_DEPTH_FRACTION * 100).toFixed(0)}% of the shallower pool's measured depth ($${sized.shallowDepthUsd.toFixed(0)}), so the impact model is not reliable.`;
    } else if (netProfitUsd >= this.minProfitThresholdUsd) {
      isProfitable = true;
      profitGuardStatus = 'PROFIT_SECURED';
      profitGuardReason = `Profit Guard Passed: modelled net profit +$${netProfitUsd.toFixed(2)} (after ~${priceImpactBps} bps price impact and gas) meets min threshold ($${this.minProfitThresholdUsd.toFixed(2)}).`;
    } else {
      profitGuardReason = `Execution Blocked by Profit Guard: modelled net profit $${netProfitUsd.toFixed(2)} is below minimum threshold ($${this.minProfitThresholdUsd.toFixed(2)}).`;
    }

    const cleanBuy = params.buyDex.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanSell = params.sellDex.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanPair = params.pair.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const priceDecimals = params.buyPrice < 10 ? 4 : 2;
    const spreadDecimals = grossSpreadUsd < 1 ? 4 : 2;

    return {
      id: `opp-${cleanPair}-${cleanBuy}-${cleanSell}-${this.latestBlock}-${params.routeType}`,
      timestamp: Date.now(),
      blockNumber: this.latestBlock,
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
    options?: { forceTestExecution?: boolean; chain?: 'arbitrum' | 'base' | 'optimism' }
  ): Promise<{
    ok: boolean;
    statusCode: number;
    blockedByProfitGuard?: boolean;
    simulationFailed?: boolean;
    requiresWallet?: boolean;
    error?: string;
    txHash?: string;
    explorerUrl?: string;
    trade?: ExecutedAgentTrade;
    txPayload?: { to: string; data: string; gas: string };
    candidateLabel?: string;
    gasEstimate?: string;
    sweptAmount?: string;
    sweptToken?: string;
    recipient?: string;
  }> {
    const chain = options?.chain || 'arbitrum';
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

    const candidates = resolveArbitrageCandidates(routeInput, profitWallet);
    if (candidates.length === 0) {
      return {
        ok: false,
        statusCode: 422,
        simulationFailed: true,
        error: `Route ${routeInput.buyDex} -> ${routeInput.sellDex} uses an unsupported router (FlashArbOptimized supports Uniswap V3, PancakeSwap V3, SushiSwap V3, and Sushiswap V2). Pick an executable pool pair.`,
      };
    }

    const { ethers } = await import('ethers');

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
        error: 'No server signer key configured. Configure FLASH_ARB_SIGNER_KEY or approve the executeOptimizedArbitrage transaction in your connected owner wallet.',
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

    // Pre-flight eth_estimateGas verification across candidate borrow directions (0 gas spent on revert)
    let verifiedCandidate: (typeof candidates)[0] | null = null;
    let estimatedGas = 0n;
    let lastRevertReason = 'Pool price converged / insufficient on-chain arbitrage margin';

    for (const candidate of candidates) {
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
    const txPool = getRpcPool(chain, true);
    let sentTxHash = '';
    let lastBroadcastErr: any = null;

    for (const rpcUrl of txPool) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(cleanKey, provider);
        const balWei = await provider.getBalance(wallet.address);
        if (balWei < 100000000000000n) {
          this.agentState = 'SCANNING';
          return {
            ok: false,
            statusCode: 400,
            error: `Gas wallet ${wallet.address} holds ${ethers.formatEther(balWei)} ETH on ${rpcInfo.name} (< 0.0001 ETH required for L2 gas).`,
          };
        }
        const tx = await wallet.sendTransaction({
          to: contractAddr,
          data: verifiedCandidate.calldata,
          gasLimit: gasLimitWithHeadroom,
        });
        sentTxHash = tx.hash;
        break;
      } catch (err: any) {
        lastBroadcastErr = err;
        const msg = String(err?.message || '');
        if (!/429|403|timeout|fetch|coalesce|archive|network|ECONN|socket/i.test(msg)) {
          break;
        }
      }
    }

    if (!sentTxHash) {
      this.agentState = 'SCANNING';
      return {
        ok: false,
        statusCode: 500,
        error: lastBroadcastErr?.message || `Failed to broadcast verified arbitrage transaction on ${rpcInfo.name}.`,
      };
    }

    const receipt = await waitForReceiptWithFailover(chain, sentTxHash, 45000);
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
    const ethUsd = this.pools.find((p) => p.pair === 'WETH/USDC')?.priceUsd || opp.buyPrice;
    const borrowedSym = verifiedCandidate.borrowedToken.sym;
    const realizedUsd =
      decodedSwap && (borrowedSym === 'USDC' || borrowedSym === 'USDC.e' || borrowedSym === 'USDT' || borrowedSym === 'DAI')
        ? Number(sweptAmount)
        : decodedSwap && borrowedSym === 'WETH'
        ? Number(sweptAmount) * ethUsd
        : decodedSwap && opp.buyPrice > 0
        ? Number(sweptAmount) * opp.buyPrice
        : opp.estNetProfitUsd;

    const executedTrade: ExecutedAgentTrade = {
      id: `arb-${Date.now()}-${sentTxHash.slice(2, 8)}`,
      txHash: sentTxHash,
      timestamp: Date.now(),
      blockNumber: receipt.blockNumber,
      pair: opp.pair,
      buyDex: opp.buyDex,
      sellDex: opp.sellDex,
      grossSpreadUsd: opp.grossSpreadUsd,
      netProfitUsd: isSuccess ? Number(realizedUsd.toFixed(4)) : 0,
      gasCostEth,
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
      this.lastExecutionNotice = `Confirmed ${verifiedCandidate.label}: swept ${sweptAmount} ${verifiedCandidate.borrowedToken.sym} to ${sweptRecipient}`;
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

    if (Date.now() - this.lastExecutionTimestamp < 15000) {
      return;
    }

    const bestExecutable = [...this.opportunities]
      .filter((o) => o.isProfitable && o.contractExecutable)
      .sort((a, b) => b.estNetProfitUsd - a.estNetProfitUsd)[0];

    if (!bestExecutable) {
      if (this.agentState === 'AWAITING_GAS_SIGNER') this.agentState = 'SCANNING';
      return;
    }

    this.agentState = 'OPPORTUNITY_FOUND';
    this.lastExecutionTimestamp = Date.now();
    try {
      await this.verifyAndExecuteOpportunity(bestExecutable);
    } catch (err: any) {
      this.agentState = 'SCANNING';
      this.lastExecutionNotice = err?.message || 'Autonomous execution cycle failed';
    }
  }

  // Last scan error (null when the latest scan fully succeeded)
  public lastError: string | null = null;

  /**
   * Reads real pool state from Arbitrum One over JSON-RPC and builds opportunities from it.
   * A pool whose call fails or returns nothing is OMITTED: no price, depth or spread is ever
   * substituted, guessed or derived from another pool. If the RPC itself fails, pools and
   * opportunities are cleared and the error is exposed via `lastError`.
   */
  public async scan() {
    if (this.isScanning) return;
    this.isScanning = true;
    try {
      this.scanCount++;
      this.lastScanTimestamp = Date.now();

      // Aggregate all pool state + liquidity reads into Multicall3.aggregate3() chunks
      // so 60+ pools are read atomically with only 3-4 JSON-RPC items per HTTP batch.
      interface SubCallRef { poolIdx: number; kind: 'state' | 'liquidity' }
      const subCalls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
      const subRefs: SubCallRef[] = [];
      const stateCallIdxByPool = new Array<number>(POOL_SPECS.length).fill(-1);
      const liqCallIdxByPool = new Array<number>(POOL_SPECS.length).fill(-1);

      POOL_SPECS.forEach((p, i) => {
        const stateSel = p.kind === 'v3' ? '0x3850c7bd' : p.kind === 'algebra' ? '0xe76c01e4' : '0x0902f1ac';
        stateCallIdxByPool[i] = subCalls.length;
        subCalls.push({ target: p.address, allowFailure: true, callData: stateSel });
        subRefs.push({ poolIdx: i, kind: 'state' });
        if (p.kind !== 'v2') {
          liqCallIdxByPool[i] = subCalls.length;
          subCalls.push({ target: p.address, allowFailure: true, callData: '0x1a686502' });
          subRefs.push({ poolIdx: i, kind: 'liquidity' });
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

      const { results } = await fetchRpcBatchWithFailover('arbitrum', rpcBatch);

      const byId = new Map<number, string>();
      for (const item of results) {
        if (item && item.id !== undefined && typeof item.result === 'string' && item.result !== '0x') byId.set(item.id, item.result);
      }

      const block = parseInt(byId.get(1) || '', 16);
      const gasPriceWei = byId.get(2) ? Number(BigInt(byId.get(2)!)) : NaN;
      if (!Number.isFinite(block) || !Number.isFinite(gasPriceWei)) throw new Error('Arbitrum RPC returned no block/gas price');
      this.latestBlock = block;

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

      interface Read { spec: PoolSpec; basePerQuote: number; depthQuote: number /* in-range, in quote units */; liveFeePercent: number }
      const reads: Read[] = [];
      POOL_SPECS.forEach((p, i) => {
        const state = returnDatas[stateCallIdxByPool[i]];
        if (!state) return;
        const [t0, t1] = p.base.addr.toLowerCase() < p.quote.addr.toLowerCase() ? [p.base, p.quote] : [p.quote, p.base];
        let token1PerToken0: number;
        let depthQuote: number;
        let liveFeePercent = p.fee;
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
        reads.push({ spec: p, basePerQuote: quotePerBase, depthQuote, liveFeePercent });
      });

      // ETH/USD reference = the real Uniswap V3 WETH/USDC 0.05% pool
      const ethRef = reads.find((r) => r.spec.id === 'univ3_weth_usdc_005');
      const ethUsd = ethRef ? ethRef.basePerQuote : null;
      const quoteUsd = (q: Tok): number | null => (q.sym === 'WETH' ? ethUsd : 1);

      const now = Date.now();
      const priced: Array<Read & { priceUsd: number; depthUsd: number }> = [];
      for (const r of reads) {
        const qUsd = quoteUsd(r.spec.quote);
        if (qUsd === null) continue; // needs ETH/USD and it is unavailable: omit, do not guess
        const depthUsd = r.depthQuote * qUsd;
        if (depthUsd < 5000) continue; // exclude dust/dormant pools
        priced.push({ ...r, priceUsd: r.basePerQuote * qUsd, depthUsd });
      }

      const fmtUsd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`);
      this.pools = priced.map((r) => ({
        id: r.spec.id,
        name: r.spec.name,
        dex: r.spec.dex,
        pair: r.spec.pair,
        poolAddress: r.spec.address,
        feeTierPercent: r.liveFeePercent,
        priceUsd: Number(r.priceUsd.toFixed(r.priceUsd < 10 ? 4 : 2)),
        blockNumber: this.latestBlock,
        lastUpdated: now,
        depthSummary: `${fmtUsd(r.depthUsd)} in-range liquidity (on-chain)`,
      }));

      // Opportunities: evaluate every unordered pool pair (i < j) per token pair
      // so cross-DEX and cross-fee spreads (e.g., PancakeV3 <-> SushiV3 <-> SushiV2 <-> UniV3) are all surfaced.
      const opps: LiveArbitrageOpportunity[] = [];
      const nextRouteInputs = new Map<string, RouteExecutionInput>();
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
              const opp = this.calculateOptimalParameters({
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
                gasPriceGwei,
                lighterRoute: buy.spec.kind !== 'v2' && sell.spec.kind !== 'v2',
              });
              if (opp) {
                const buyRouterOk = Boolean(ARBITRUM_DEX_ROUTERS[buy.spec.dex]?.supported);
                const sellRouterOk = Boolean(ARBITRUM_DEX_ROUTERS[sell.spec.dex]?.supported);
                opp.contractExecutable = buyRouterOk && sellRouterOk;
                opps.push(opp);
                nextRouteInputs.set(opp.id, {
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
        const netDelta = b.estNetProfitUsd - a.estNetProfitUsd;
        if (Math.abs(netDelta) > 1e-6) return netDelta;
        return b.grossSpreadBps - a.grossSpreadBps;
      });
      this.opportunities = opps;
      this.routeInputsByOppId = nextRouteInputs;
      this.lastError = null;
      this.consecutiveFailures = 0;
      this.lastSuccessfulScan = Date.now();

      await this.attemptAutonomousExecution();
    } catch (err: any) {
      this.consecutiveFailures++;
      this.lastError = err?.message || String(err);
      // Keep existing pools for up to 60s during transient failover so UI stays responsive
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
flashArbRouter.get('/agent/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    isRunning: liveAgent.isRunning,
    scanCount: liveAgent.scanCount,
    latestBlock: liveAgent.latestBlock,
    lastScanTimestamp: liveAgent.lastScanTimestamp,
    poolsCount: liveAgent.pools.length,
    pools: liveAgent.pools,
    opportunities: liveAgent.opportunities,
    executedTrades: liveAgent.executedTrades.slice(-20),
    activeContract: DEPLOYED_CONTRACTS.arbitrum,
    gasWallet: gasWalletEnv(),
    profitWallet: profitWalletEnv(),
    agentState: liveAgent.agentState,
    isSignerConfigured: Boolean(process.env.FLASH_ARB_SIGNER_KEY),
    lastConfirmedTxHash: liveAgent.lastConfirmedTxHash,
    lastConfirmedBlock: liveAgent.lastConfirmedBlock,
    lastExecutionNotice: liveAgent.lastExecutionNotice,
    scanError: liveAgent.lastError,
    config: {
      minProfitThresholdUsd: liveAgent.minProfitThresholdUsd,
      maxProfitCap: null, // No maximum profit cap (unbounded upside)
      gasOptimizationMode: liveAgent.gasOptimizationMode,
      autoOptimizeSize: liveAgent.autoOptimizeSize,
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
    const { minProfitThresholdUsd, gasOptimizationMode, autoOptimizeSize, isAutonomousExecutionEnabled } = req.body;

    if (typeof minProfitThresholdUsd === 'number' && minProfitThresholdUsd >= 0) {
      liveAgent.minProfitThresholdUsd = minProfitThresholdUsd;
    }
    if (['ECO', 'HYPER_ALPHA', 'AGGRESSIVE'].includes(gasOptimizationMode)) {
      liveAgent.gasOptimizationMode = gasOptimizationMode;
    }
    if (typeof autoOptimizeSize === 'boolean') {
      liveAgent.autoOptimizeSize = autoOptimizeSize;
    }
    if (typeof isAutonomousExecutionEnabled === 'boolean') {
      liveAgent.isAutonomousExecutionEnabled = isAutonomousExecutionEnabled;
    }

    liveAgent.scan();

    return res.json({
      success: true,
      message: 'Agent optimizer parameters and profit guard updated successfully',
      config: {
        minProfitThresholdUsd: liveAgent.minProfitThresholdUsd,
        maxProfitCap: null,
        gasOptimizationMode: liveAgent.gasOptimizationMode,
        autoOptimizeSize: liveAgent.autoOptimizeSize,
        isAutonomousExecutionEnabled: liveAgent.isAutonomousExecutionEnabled,
        profitGuardActive: true,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/flash-arb/agent/start
 * Starts the live continuous background MEV agent
 */
flashArbRouter.post('/agent/start', (_req: Request, res: Response) => {
  liveAgent.start();
  res.json({
    success: true,
    message: 'Live Autonomous Arbitrage Agent activated on Arbitrum One',
    isRunning: true,
  });
});

/**
 * POST /api/flash-arb/agent/stop
 * Pauses the live background MEV agent
 */
flashArbRouter.post('/agent/stop', (_req: Request, res: Response) => {
  liveAgent.stop();
  res.json({
    success: true,
    message: 'Live Autonomous Arbitrage Agent paused',
    isRunning: false,
  });
});

/**
 * POST /api/flash-arb/agent/trigger
 * Executes an immediate live on-chain flash arb trade with strict Profit Guard and minimal gas
 */
flashArbRouter.post('/agent/trigger', async (req: Request, res: Response) => {
  try {
    // 1. Run fresh scan
    await liveAgent.scan();
    const sortedOpps = [...liveAgent.opportunities].sort((a, b) => {
      const execDelta = Number(Boolean(b.contractExecutable)) - Number(Boolean(a.contractExecutable));
      if (execDelta !== 0) return execDelta;
      return b.estNetProfitUsd - a.estNetProfitUsd;
    });
    const opp = req.body?.opportunityId
      ? liveAgent.opportunities.find((o) => o.id === req.body.opportunityId) || sortedOpps[0]
      : sortedOpps[0];

    if (!opp) {
      return res.status(400).json({ success: false, error: 'No live pool route found to execute.' });
    }

    const result = await liveAgent.verifyAndExecuteOpportunity(opp, {
      forceTestExecution: Boolean(req.body?.forceTestExecution),
      chain: (req.body?.chain as 'arbitrum' | 'base' | 'optimism') || 'arbitrum',
    });

    if (!result.ok) {
      return res.status(result.statusCode).json({
        success: false,
        blockedByProfitGuard: result.blockedByProfitGuard,
        simulationFailed: result.simulationFailed,
        requiresWallet: result.requiresWallet,
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
      opportunity: opp,
    });
  } catch (err: any) {
    liveAgent.agentState = 'SCANNING';
    return res.status(500).json({ success: false, error: err.message });
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
 * GET /api/flash-arb/wallet-balances
 * Queries real-time on-chain token balances of the Profit Vault (ETH, WETH, USDC, USDT) on Arbitrum One
 */
flashArbRouter.get('/wallet-balances', async (req: Request, res: Response) => {
  try {
    const address = String(req.query.address || profitWalletEnv()).trim();
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      return res.status(400).json({ success: false, error: 'Invalid EVM address' });
    }

    // Direct RPC Batch: ETH balance + WETH + USDC + USDT with multi-endpoint failover
    const cleanAddrPadded = address.toLowerCase().replace('0x', '').padStart(64, '0');
    const balData = `0x70a08231${cleanAddrPadded}`;

    const { results: data } = await fetchRpcBatchWithFailover('arbitrum', [
      { jsonrpc: '2.0', method: 'eth_getBalance', params: [address, 'latest'], id: 1 },
      // WETH (0x82aF49447D8a07e3bd95BD0d56f35241523fBab1)
      { jsonrpc: '2.0', method: 'eth_call', params: [{ to: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', data: balData }, 'latest'], id: 2 },
      // USDC (0xaf88d065e77c8cC2239327C5EDb3A432268e5831)
      { jsonrpc: '2.0', method: 'eth_call', params: [{ to: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', data: balData }, 'latest'], id: 3 },
      // USDT (0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9)
      { jsonrpc: '2.0', method: 'eth_call', params: [{ to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', data: balData }, 'latest'], id: 4 },
    ]);
    const ethWei = BigInt(data[0]?.result || '0x0');
    const wethWei = BigInt(data[1]?.result || '0x0');
    const usdcUnits = BigInt(data[2]?.result || '0x0');
    const usdtUnits = BigInt(data[3]?.result || '0x0');

    const ethBalance = Number(ethWei) / 1e18;
    const wethBalance = Number(wethWei) / 1e18;
    const usdcBalance = Number(usdcUnits) / 1e6;
    const usdtBalance = Number(usdtUnits) / 1e6;

    // Approximate live WETH price
    const liveWethPrice = liveAgent.pools[0]?.priceUsd || 2362.5;
    const totalUsd = (ethBalance * liveWethPrice) + (wethBalance * liveWethPrice) + usdcBalance + usdtBalance;

    return res.json({
      success: true,
      address,
      chain: 'Arbitrum One',
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
      totalUsd: Number(totalUsd.toFixed(2)),
      explorerUrl: `https://arbiscan.io/address/${address}`,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Helper: Query ETH + all Arbitrum ERC-20 token balances for an address in one RPC batch.
 */
async function queryAllArbitrumBalances(chain: 'arbitrum' | 'base' | 'optimism', targetAddress: string) {
  const tokenList = chain === 'arbitrum' ? Object.values(ARBITRUM_TOKENS) : [ARBITRUM_TOKENS.WETH, ARBITRUM_TOKENS.USDC];
  const padded = targetAddress.toLowerCase().replace('0x', '').padStart(64, '0');
  const balData = `0x70a08231${padded}`;

  const calls: any[] = [
    { jsonrpc: '2.0', method: 'eth_getBalance', params: [targetAddress, 'latest'], id: 1 },
  ];
  if (chain === 'arbitrum') {
    tokenList.forEach((tok, idx) => {
      calls.push({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: tok.addr, data: balData }, 'latest'],
        id: 10 + idx,
      });
    });
  }

  const { results } = await fetchRpcBatchWithFailover(chain, calls);
  const byId = new Map<number, string>();
  for (const item of results) {
    if (item && item.id !== undefined && typeof item.result === 'string' && item.result !== '0x') {
      byId.set(item.id, item.result);
    }
  }

  const ethWei = BigInt(byId.get(1) || '0x0');
  const { ethers } = await import('ethers');
  const tokens: Array<{
    symbol: string;
    address: string;
    decimals: number;
    rawBalance: bigint;
    formatted: string;
  }> = [];

  if (chain === 'arbitrum') {
    tokenList.forEach((tok, idx) => {
      const hex = byId.get(10 + idx);
      const rawBalance = hex ? BigInt(hex) : 0n;
      tokens.push({
        symbol: tok.sym,
        address: tok.addr,
        decimals: tok.dec,
        rawBalance,
        formatted: ethers.formatUnits(rawBalance, tok.dec),
      });
    });
  }

  return {
    ethWei,
    ethFormatted: ethers.formatEther(ethWei),
    tokens,
  };
}

/**
 * GET /api/flash-arb/contract-balances
 * Queries live ETH + all ERC-20 token balances sitting on the active FlashArb contract,
 * plus inspects contract owner() and selector support (executeOptimizedArbitrage / rescueTokensTo).
 */
flashArbRouter.get('/contract-balances', async (req: Request, res: Response) => {
  try {
    const chain = (String(req.query.chain || 'arbitrum').toLowerCase() as 'arbitrum' | 'base' | 'optimism');
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const contractAddr = String(req.query.address || DEPLOYED_CONTRACTS[chain] || '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddr)) {
      return res.status(400).json({ success: false, error: 'Invalid contract address' });
    }

    const { ethers } = await import('ethers');
    const [balInfo, codeResp, ownerResp] = await Promise.all([
      queryAllArbitrumBalances(chain, contractAddr),
      fetchRpcSingleWithFailover(chain, 'eth_getCode', [contractAddr, 'latest'], true),
      fetchRpcSingleWithFailover(chain, 'eth_call', [{ to: contractAddr, data: '0x8da5cb5b' }, 'latest'], true).catch(() => ({ result: null })),
    ]);

    const code = String(codeResp.result || '0x').toLowerCase();
    const isDeployed = code !== '0x' && code.length > 2;
    const contractOwner =
      typeof ownerResp.result === 'string' && ownerResp.result.length >= 66
        ? ethers.getAddress(`0x${ownerResp.result.slice(-40)}`)
        : null;

    return res.json({
      success: true,
      chain,
      chainName: rpcInfo.name,
      contractAddress: contractAddr,
      isDeployed,
      owner: contractOwner,
      supportsOptimizedArbitrage: code.includes('23b3aa6b'),
      supportsRescueTokensTo: code.includes('a7070692'),
      supportsRescueTokens: code.includes('ae3bf8'),
      eth: balInfo.ethFormatted,
      ethWei: balInfo.ethWei.toString(),
      tokens: balInfo.tokens.map((t) => ({
        symbol: t.symbol,
        address: t.address,
        decimals: t.decimals,
        balance: t.formatted,
        hasBalance: t.rawBalance > 0n,
      })),
      nonZeroCount: (balInfo.ethWei > 0n ? 1 : 0) + balInfo.tokens.filter((t) => t.rawBalance > 0n).length,
      explorerUrl: `${rpcInfo.explorer}/address/${contractAddr}`,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/flash-arb/sweep-all
 * Sweeps ALL native ETH (executeDirectFlashArb) AND ALL non-zero ERC-20 token balances
 * (rescueTokensTo -> fallback rescueTokens + owner ERC-20 forward) from the FlashArb contract(s)
 * directly to the configured Profit Vault recipient address. Optionally sweeps leftover ERC-20 tokens
 * from the gas/owner wallet if includeGasWalletTokens === true (never drains native gas ETH).
 */
flashArbRouter.post('/sweep-all', async (req: Request, res: Response) => {
  try {
    const chain = (String(req.body?.chain || 'arbitrum').toLowerCase() as 'arbitrum' | 'base' | 'optimism');
    const rpcInfo = RPC_ENDPOINTS[chain] || RPC_ENDPOINTS.arbitrum;
    const primaryContract = String(req.body?.contractAddress || DEPLOYED_CONTRACTS[chain] || '').trim();
    const recipient = String(req.body?.recipient || profitWalletEnv() || '').trim();
    const extraContracts = Array.isArray(req.body?.extraContracts) ? req.body.extraContracts : [];
    const includeGasWalletTokens = Boolean(req.body?.includeGasWalletTokens);

    if (!/^0x[a-fA-F0-9]{40}$/.test(primaryContract)) {
      return res.status(400).json({ success: false, error: 'Valid contractAddress is required.' });
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient) || recipient === '0x0000000000000000000000000000000000000000') {
      return res.status(400).json({ success: false, error: 'Valid non-zero Profit Vault recipient address (0x...) is required.' });
    }

    const signerKey = (process.env.FLASH_ARB_SIGNER_KEY || '').trim();
    if (!signerKey) {
      return res.status(409).json({
        success: false,
        requiresWallet: true,
        error: 'No server signer key configured. Configure FLASH_ARB_SIGNER_KEY in Signer Key Config so the server can sign owner sweep transactions.',
      });
    }

    const { ethers } = await import('ethers');
    const cleanKey = signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`;
    const signerAddress = new ethers.Wallet(cleanKey).address;

    const sendSignedWithEstimate = async (to: string, data: string): Promise<{ txHash: string; gasUsed: string }> => {
      const { result: gasHex } = await fetchRpcSingleWithFailover(
        chain,
        'eth_estimateGas',
        [{ from: signerAddress, to, data }, 'latest'],
        true
      );
      const estGas = typeof gasHex === 'string' && gasHex.startsWith('0x') ? BigInt(gasHex) : 150000n;
      const gasLimit = (estGas * 130n) / 100n;

      let sentHash = '';
      let lastErr: any = null;
      for (const rpcUrl of getRpcPool(chain, true)) {
        try {
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const wallet = new ethers.Wallet(cleanKey, provider);
          const bal = await provider.getBalance(wallet.address);
          if (bal < 50000000000000n) {
            throw new Error(`Gas wallet ${wallet.address} holds ${ethers.formatEther(bal)} ETH on ${rpcInfo.name}; fund it with ETH for gas.`);
          }
          const tx = await wallet.sendTransaction({ to, data, gasLimit });
          sentHash = tx.hash;
          break;
        } catch (e: any) {
          lastErr = e;
          const msg = String(e?.message || '');
          if (!/429|403|timeout|fetch|coalesce|archive|network|ECONN|socket/i.test(msg)) {
            throw e;
          }
        }
      }
      if (!sentHash) throw lastErr || new Error('Broadcast failed across all RPC endpoints');
      const receipt = await waitForReceiptWithFailover(chain, sentHash, 45000);
      if (receipt.status !== 1) {
        throw new Error(`Sweep tx ${sentHash} reverted on-chain`);
      }
      return { txHash: sentHash, gasUsed: receipt.gasUsed.toString() };
    };

    // Deduplicate contract addresses to inspect
    const contractSet = new Map<string, string>();
    for (const addr of [primaryContract, ...extraContracts]) {
      const trimmed = String(addr || '').trim();
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
        contractSet.set(trimmed.toLowerCase(), ethers.getAddress(trimmed));
      }
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
    const errors: Array<{ source: string; asset: string; error: string }> = [];
    const checkedContracts: Array<{ address: string; nonZeroAssets: number; ownerMatchesSigner: boolean }> = [];

    for (const contractAddr of contractSet.values()) {
      const { result: codeRaw } = await fetchRpcSingleWithFailover(chain, 'eth_getCode', [contractAddr, 'latest'], true);
      const code = String(codeRaw || '0x').toLowerCase();
      if (code === '0x' || code.length <= 2) continue;

      let ownerMatches = true;
      try {
        const { result: ownerRaw } = await fetchRpcSingleWithFailover(
          chain,
          'eth_call',
          [{ to: contractAddr, data: '0x8da5cb5b' }, 'latest'],
          true
        );
        if (typeof ownerRaw === 'string' && ownerRaw.length >= 66) {
          const contractOwner = ethers.getAddress(`0x${ownerRaw.slice(-40)}`);
          ownerMatches = contractOwner.toLowerCase() === signerAddress.toLowerCase();
          if (!ownerMatches) {
            errors.push({
              source: contractAddr,
              asset: 'ALL',
              error: `Signer ${signerAddress} is not owner of ${contractAddr} (owner is ${contractOwner}).`,
            });
            checkedContracts.push({ address: contractAddr, nonZeroAssets: 0, ownerMatchesSigner: false });
            continue;
          }
        }
      } catch {
        // assume owner if owner() absent
      }

      const balInfo = await queryAllArbitrumBalances(chain, contractAddr);
      const nonZeroTokens = balInfo.tokens.filter((t) => t.rawBalance > 0n);
      const nonZeroAssets = (balInfo.ethWei > 0n ? 1 : 0) + nonZeroTokens.length;
      checkedContracts.push({ address: contractAddr, nonZeroAssets, ownerMatchesSigner: ownerMatches });

      // 1. Sweep native ETH via executeDirectFlashArb(recipient)
      if (balInfo.ethWei > 0n) {
        try {
          const data = encodeExecuteDirectFlashArb(recipient);
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
        } catch (err: any) {
          errors.push({
            source: contractAddr,
            asset: 'ETH',
            error: decodeFlashArbRevertError(err),
          });
        }
      }

      // 2. Sweep each non-zero ERC-20 token balance
      for (const tok of nonZeroTokens) {
        try {
          if (code.includes('a7070692')) {
            // Direct rescueTokensTo(token, recipient)
            const data = encodeRescueTokensTo(tok.address, recipient);
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
            // Legacy contract has rescueTokens(token) -> sends to owner() == signerAddress
            const rescueData = encodeRescueTokens(tok.address);
            const { txHash: rescueTx } = await sendSignedWithEstimate(contractAddr, rescueData);

            // If profit vault differs from owner, forward rescued tokens directly to recipient
            if (recipient.toLowerCase() !== signerAddress.toLowerCase()) {
              const fwdData = encodeErc20Transfer(recipient, tok.rawBalance);
              const { txHash: fwdTx } = await sendSignedWithEstimate(tok.address, fwdData);
              sweptAssets.push({
                source: contractAddr,
                asset: tok.symbol,
                amount: tok.formatted,
                method: 'rescueTokens(token) -> ERC20.transfer(recipient)',
                txHash: fwdTx,
                explorerUrl: `${rpcInfo.explorer}/tx/${fwdTx}`,
                recipient,
              });
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
          }
        } catch (err: any) {
          errors.push({
            source: contractAddr,
            asset: tok.symbol,
            error: decodeFlashArbRevertError(err),
          });
        }
      }
    }

    // Optional: Sweep leftover ERC-20 tokens on Gas/Owner Wallet to Profit Vault (never sweeps ETH gas!)
    if (includeGasWalletTokens && recipient.toLowerCase() !== signerAddress.toLowerCase()) {
      const signerBalances = await queryAllArbitrumBalances(chain, signerAddress);
      for (const tok of signerBalances.tokens.filter((t) => t.rawBalance > 0n)) {
        try {
          const fwdData = encodeErc20Transfer(recipient, tok.rawBalance);
          const { txHash } = await sendSignedWithEstimate(tok.address, fwdData);
          sweptAssets.push({
            source: signerAddress,
            asset: tok.symbol,
            amount: tok.formatted,
            method: 'ERC20.transfer(recipient)',
            txHash,
            explorerUrl: `${rpcInfo.explorer}/tx/${txHash}`,
            recipient,
          });
        } catch (err: any) {
          errors.push({
            source: signerAddress,
            asset: tok.symbol,
            error: decodeFlashArbRevertError(err),
          });
        }
      }
    }

    if (errors.length > 0 && sweptAssets.length === 0) {
      return res.status(400).json({
        success: false,
        error: errors[0].error,
        errors,
        checkedContracts,
        recipient,
      });
    }

    const message =
      sweptAssets.length > 0
        ? `Swept ${sweptAssets.length} asset(s) to Profit Vault ${recipient}.`
        : `All inspected contract ETH & ERC-20 balances are already $0.00 (no residual tokens locked).`;

    return res.json({
      success: true,
      chain,
      chainName: rpcInfo.name,
      recipient,
      signerAddress,
      checkedContracts,
      sweptAssets,
      errors,
      message,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
