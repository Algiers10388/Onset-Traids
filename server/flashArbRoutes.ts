import { Router, Request, Response } from 'express';
import { sizeArbitrage, MAX_DEPTH_FRACTION } from './arbSizing';

export const flashArbRouter = Router();

// Default addresses specified by user
// The server-side "agent" only models prices heuristically and its broadcast path calls executeDirectFlashArb(),
// which just sweeps ETH (no arbitrage). Real execution is done by the Rust searcher (flash-arb/searcher), which
// verifies every trade with eth_estimateGas. Server broadcasting of agent "trades" is therefore disabled.
const SERVER_EXECUTION_DISABLED_MSG =
  'Server-side agent execution is disabled: it only sweeps ETH and does not perform arbitrage. Run flash-arb/searcher (Rust) for verified execution.';

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
    rpc: ARBITRUM_RPC_POOL[0],
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

    const resp = await fetch(rpcInfo.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [address, 'latest'],
        id: 1,
      }),
    });
    const data = await resp.json();
    const code = data?.result || '0x';
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

    // Verify target contract code
    const codeCheck = await fetch(rpcInfo.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [to, 'latest'],
        id: 1,
      }),
    });
    const codeData = await codeCheck.json();
    const code = codeData?.result || '0x';
    if (code === '0x' || code.length <= 2) {
      return res.status(400).json({
        success: false,
        error: `Contract ${to} has no deployed bytecode on ${rpcInfo.name}. You must deploy FlashArbOptimized.sol first before executing flash loans.`,
        isContractUndeployed: true,
      });
    }

    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcInfo.rpc);
    const wallet = new ethers.Wallet(process.env.FLASH_ARB_SIGNER_KEY, provider);

    const balanceWei = await provider.getBalance(wallet.address);
    if (balanceWei < 100000000000000n) { // 0.0001 ETH
      return res.status(400).json({
        success: false,
        error: `Insufficient gas balance: ${wallet.address} holds ${ethers.formatEther(balanceWei)} ETH on ${rpcInfo.name}, which is below required gas threshold.`,
      });
    }

    const tx = await wallet.sendTransaction({
      to,
      data: data || '0x',
      gasLimit: gasLimit ? BigInt(gasLimit) : 300000n,
    });

    const receipt = await tx.wait(1);
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
  arbitrum: '0x19359c6C418669FCfC46196970814353b8766BE0',
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

    const provider = new ethers.JsonRpcProvider(rpcInfo.rpc);
    const cleanKey = signerKey.startsWith('0x') ? signerKey : `0x${signerKey}`;
    const wallet = new ethers.Wallet(cleanKey, provider);

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
    const txHash = deployTx ? deployTx.hash : '';

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

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
// ---- Monitored Arbitrum One pools -------------------------------------------------------------
// Token addresses are the canonical Arbitrum One tokens. Orientation (token0/token1) is derived from the
// addresses, never assumed. Pool addresses come from the original project config.
interface Tok { sym: string; addr: string; dec: number }
const T = {
  WETH: { sym: 'WETH', addr: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', dec: 18 },
  USDC: { sym: 'USDC', addr: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', dec: 6 },
  USDT: { sym: 'USDT', addr: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', dec: 6 },
  DAI: { sym: 'DAI', addr: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', dec: 18 },
  ARB: { sym: 'ARB', addr: '0x912CE59144191C1204E64559FE8253a0e49E6548', dec: 18 },
  WBTC: { sym: 'WBTC', addr: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', dec: 8 },
  LINK: { sym: 'LINK', addr: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', dec: 18 },
  GMX: { sym: 'GMX', addr: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', dec: 18 },
  wstETH: { sym: 'wstETH', addr: '0x5979D7b546E38E414F7E9822514be443A4800529', dec: 18 },
} satisfies Record<string, Tok>;

interface PoolSpec {
  id: string; name: string; dex: string; pair: string; address: string; fee: number;
  kind: 'v3' | 'algebra' | 'v2'; base: Tok; quote: Tok;
}
const POOL_SPECS: PoolSpec[] = [
  { id: 'univ3_weth_usdc_005', name: 'Uniswap V3 WETH/USDC (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0xC6962004f452bE9203591991D15f6b388e09E8D0', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'univ3_weth_usdc_030', name: 'Uniswap V3 WETH/USDC (0.30%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0xc473e2aEE3441BF9240Be85eb122aBB059A3B57c', fee: 0.30, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'univ3_weth_usdc_001', name: 'Uniswap V3 WETH/USDC (0.01%)', dex: 'Uniswap V3', pair: 'WETH/USDC', address: '0x8fe3922B7f525593033B79d618808d63164C91f8', fee: 0.01, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'sushi_weth_usdc', name: 'Sushiswap V2 WETH/USDC (0.30%)', dex: 'Sushiswap V2', pair: 'WETH/USDC', address: '0x905dfCD5649217c42684f23958568e533C711Aa3', fee: 0.30, kind: 'v2', base: T.WETH, quote: T.USDC },
  { id: 'camelot_v3_weth_usdc', name: 'Camelot V3 WETH/USDC', dex: 'Camelot V3', pair: 'WETH/USDC', address: '0x521e2d3122c60868f7F2b1dF6f0F01B6c90866a1', fee: 0.08, kind: 'algebra', base: T.WETH, quote: T.USDC },
  { id: 'pancake_v3_weth_usdc', name: 'PancakeSwap V3 WETH/USDC (0.05%)', dex: 'PancakeSwap V3', pair: 'WETH/USDC', address: '0x6a0f0B8B082Db14032ceae251141703274bE348F', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDC },
  { id: 'univ3_weth_usdt_005', name: 'Uniswap V3 WETH/USDT (0.05%)', dex: 'Uniswap V3', pair: 'WETH/USDT', address: '0x641C00A822e8b671738d32a431a4Fb6074E5c79d', fee: 0.05, kind: 'v3', base: T.WETH, quote: T.USDT },
  { id: 'sushi_weth_usdt', name: 'Sushiswap V2 WETH/USDT (0.30%)', dex: 'Sushiswap V2', pair: 'WETH/USDT', address: '0xcb0e14E6d3D9206eA2ff3c5B610F5570d7c66C52', fee: 0.30, kind: 'v2', base: T.WETH, quote: T.USDT },
  { id: 'univ3_arb_usdc_005', name: 'Uniswap V3 ARB/USDC (0.05%)', dex: 'Uniswap V3', pair: 'ARB/USDC', address: '0xb0f6cA40411360c03d41C5fFc5F179b8403CdcF8', fee: 0.05, kind: 'v3', base: T.ARB, quote: T.USDC },
  { id: 'camelot_arb_usdc', name: 'Camelot V3 ARB/USDC', dex: 'Camelot V3', pair: 'ARB/USDC', address: '0x49b3100db32eeEA402Db38D17be80d34608feB1B', fee: 0.12, kind: 'algebra', base: T.ARB, quote: T.USDC },
  { id: 'univ3_arb_weth_005', name: 'Uniswap V3 ARB/WETH (0.05%)', dex: 'Uniswap V3', pair: 'ARB/WETH', address: '0xc6f780497a95E246EB15C999e6047f378aa6BD0f', fee: 0.05, kind: 'v3', base: T.ARB, quote: T.WETH },
  { id: 'sushi_arb_weth', name: 'Sushiswap V2 ARB/WETH (0.30%)', dex: 'Sushiswap V2', pair: 'ARB/WETH', address: '0xb63Cb030A6c0b3952D7Ee46808feF3F4C65306Db', fee: 0.30, kind: 'v2', base: T.ARB, quote: T.WETH },
  { id: 'univ3_wbtc_weth_005', name: 'Uniswap V3 WBTC/WETH (0.05%)', dex: 'Uniswap V3', pair: 'WBTC/WETH', address: '0x2F5e87C931236685D116c6633Be839756C7423C1', fee: 0.05, kind: 'v3', base: T.WBTC, quote: T.WETH },
  { id: 'sushi_wbtc_weth', name: 'Sushiswap V2 WBTC/WETH (0.30%)', dex: 'Sushiswap V2', pair: 'WBTC/WETH', address: '0x0C1439e048991244e7e05Ef1a3C442e48184903F', fee: 0.30, kind: 'v2', base: T.WBTC, quote: T.WETH },
  { id: 'univ3_link_weth_030', name: 'Uniswap V3 LINK/WETH (0.30%)', dex: 'Uniswap V3', pair: 'LINK/WETH', address: '0xaa23638fB52BA8fdE26684605B2b00f114660282', fee: 0.30, kind: 'v3', base: T.LINK, quote: T.WETH },
  { id: 'camelot_link_weth', name: 'Camelot V3 LINK/WETH', dex: 'Camelot V3', pair: 'LINK/WETH', address: '0x8B30f5a91F163810c98f82F2540b991f9A149A70', fee: 0.25, kind: 'algebra', base: T.LINK, quote: T.WETH },
  { id: 'univ3_gmx_weth_030', name: 'Uniswap V3 GMX/WETH (0.30%)', dex: 'Uniswap V3', pair: 'GMX/WETH', address: '0x80a9aE39310ABf62E334124646bD211A234C2075', fee: 0.30, kind: 'v3', base: T.GMX, quote: T.WETH },
  { id: 'univ3_wsteth_weth_001', name: 'Uniswap V3 wstETH/WETH (0.01%)', dex: 'Uniswap V3', pair: 'wstETH/WETH', address: '0x35218a1cBa37f6439907359B3466D5300B54E372', fee: 0.01, kind: 'v3', base: T.wstETH, quote: T.WETH },
  { id: 'univ3_dai_usdc_001', name: 'Uniswap V3 DAI/USDC (0.01%)', dex: 'Uniswap V3', pair: 'DAI/USDC', address: '0xA7C2954DB36894C2514CDBeb6f758f6236B328a2', fee: 0.01, kind: 'v3', base: T.DAI, quote: T.USDC },
];

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

    return {
      id: `opp-${cleanPair}-${cleanBuy}-${cleanSell}-${this.latestBlock}-${params.routeType}`,
      timestamp: Date.now(),
      blockNumber: this.latestBlock,
      pair: params.pair,
      buyDex: params.buyDex,
      buyPool: params.buyPool,
      buyPrice: Number(params.buyPrice.toFixed(2)),
      sellDex: params.sellDex,
      sellPool: params.sellPool,
      sellPrice: Number(params.sellPrice.toFixed(2)),
      grossSpreadUsd: Number(grossSpreadUsd.toFixed(2)),
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
   * Autonomous Execution Engine:
   * Only executes if isAutonomousExecutionEnabled is true AND opportunity is strictly profitable.
   */
  public async attemptAutonomousExecution() {
    if (!this.isAutonomousExecutionEnabled) {
      if (this.agentState === 'AWAITING_GAS_SIGNER' || this.agentState === 'EXECUTING') {
        this.agentState = 'SCANNING';
      }
      return;
    }

    // Server-side execution is disabled (see SERVER_EXECUTION_DISABLED_MSG).
    this.agentState = 'SCANNING';
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

      // ids: 1 = block number, 2 = gas price, then 2 calls per pool (state + liquidity; liquidity unused for V2)
      const calls: any[] = [
        { jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 },
        { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 2 },
      ];
      POOL_SPECS.forEach((p, i) => {
        const stateSel = p.kind === 'v3' ? '0x3850c7bd' : p.kind === 'algebra' ? '0xe76c01e4' : '0x0902f1ac';
        calls.push({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: p.address, data: stateSel }, 'latest'], id: 10 + i * 2 });
        if (p.kind !== 'v2') {
          calls.push({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: p.address, data: '0x1a686502' }, 'latest'], id: 11 + i * 2 });
        }
      });

      const { results } = await fetchRpcBatchWithFailover('arbitrum', calls);

      const byId = new Map<number, string>();
      for (const item of results) {
        if (item && item.id !== undefined && typeof item.result === 'string' && item.result !== '0x') byId.set(item.id, item.result);
      }

      const block = parseInt(byId.get(1) || '', 16);
      const gasPriceWei = byId.get(2) ? Number(BigInt(byId.get(2)!)) : NaN;
      if (!Number.isFinite(block) || !Number.isFinite(gasPriceWei)) throw new Error('Arbitrum RPC returned no block/gas price');
      this.latestBlock = block;

      const word = (hex: string, i: number) => BigInt('0x' + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
      const Q96 = 2 ** 96;

      interface Read { spec: PoolSpec; basePerQuote: number; depthQuote: number /* in-range, in quote units */ }
      const reads: Read[] = [];
      POOL_SPECS.forEach((p, i) => {
        const state = byId.get(10 + i * 2);
        if (!state) return;
        const [t0, t1] = p.base.addr.toLowerCase() < p.quote.addr.toLowerCase() ? [p.base, p.quote] : [p.quote, p.base];
        let token1PerToken0: number;
        let depthQuote: number;
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
            const liqHex = byId.get(11 + i * 2);
            if (!(sqrt > 0) || !liqHex) return;
            const L = Number(BigInt(liqHex));
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
        reads.push({ spec: p, basePerQuote: quotePerBase, depthQuote });
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
        priced.push({ ...r, priceUsd: r.basePerQuote * qUsd, depthUsd: r.depthQuote * qUsd });
      }

      const fmtUsd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n.toFixed(0)}`);
      this.pools = priced.map((r) => ({
        id: r.spec.id,
        name: r.spec.name,
        dex: r.spec.dex,
        pair: r.spec.pair,
        poolAddress: r.spec.address,
        feeTierPercent: r.spec.fee,
        priceUsd: Number(r.priceUsd.toFixed(r.priceUsd < 10 ? 4 : 2)),
        blockNumber: this.latestBlock,
        lastUpdated: now,
        depthSummary: `${fmtUsd(r.depthUsd)} in-range liquidity (on-chain)`,
      }));

      // Opportunities: for each pair, every other real pool vs. the deepest real pool for that pair
      const opps: LiveArbitrageOpportunity[] = [];
      if (ethUsd !== null) {
        const gasPriceGwei = gasPriceWei / 1e9;
        const groups = new Map<string, typeof priced>();
        for (const r of priced) groups.set(r.spec.pair, [...(groups.get(r.spec.pair) || []), r]);
        let routeType = 0;
        for (const [pair, group] of groups) {
          if (group.length < 2) continue;
          const ref = [...group].sort((a, b) => b.depthUsd - a.depthUsd)[0];
          for (const other of group) {
            if (other === ref) continue;
            routeType++;
            const refIsBuy = ref.priceUsd <= other.priceUsd;
            const buy = refIsBuy ? ref : other;
            const sell = refIsBuy ? other : ref;
            const opp = this.calculateOptimalParameters({
                pair,
                buyDex: buy.spec.name,
                buyPool: buy.spec.address,
                sellDex: sell.spec.name,
                sellPool: sell.spec.address,
                buyPrice: buy.priceUsd,
                sellPrice: sell.priceUsd,
                feeTierA: buy.spec.fee,
                feeTierB: sell.spec.fee,
                depthA: buy.depthUsd,
                depthB: sell.depthUsd,
                routeType,
                loanToken: ref.spec.base.sym,
                ethUsd,
                gasPriceGwei,
                lighterRoute: buy.spec.kind !== 'v2' && sell.spec.kind !== 'v2',
            });
            if (opp) opps.push(opp);
          }
        }
      }
      this.opportunities = opps;
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
    const sortedOpps = [...liveAgent.opportunities].sort((a, b) => b.estNetProfitUsd - a.estNetProfitUsd);
    const opp = req.body?.opportunityId
      ? liveAgent.opportunities.find((o) => o.id === req.body.opportunityId) || sortedOpps[0]
      : sortedOpps[0];

    if (!opp) {
      return res.status(400).json({ success: false, error: 'No live pool route found to execute.' });
    }

    return res.status(409).json({ success: false, executionDisabled: true, error: SERVER_EXECUTION_DISABLED_MSG, opportunity: opp });
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

    // Direct JSON-RPC call to verify receipt
    const resp = await fetch(rpcInfo.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [cleanHash],
        id: Date.now(),
      }),
    });
    const data = await resp.json();
    const receipt = data?.result;

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
