import { GoogleGenAI } from '@google/genai';

async function callWithTimeout<T>(fn: () => Promise<T>, timeoutMs = 30000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('GEMINI_CALL_TIMEOUT')), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- Etherscan API (V2, multichain) -------------------------------------
// The ONLY data source for this service. Key comes from ETHERSCAN_API_KEY (never hardcode it).
// Read lazily so it works regardless of when dotenv.config() runs.
const ETHERSCAN_V2_URL = 'https://api.etherscan.io/v2/api';
const getEtherscanKey = (): string => process.env.ETHERSCAN_API_KEY || '';
export const isEtherscanKeyConfigured = (): boolean => Boolean(getEtherscanKey());

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Global serialized queue so Etherscan V2 never receives >2 requests/sec (limit is 3/sec)
const MIN_REQUEST_INTERVAL_MS = 500;
let etherscanQueue: Promise<void> = Promise.resolve();
let lastEtherscanCallAt = 0;

function enqueueEtherscan<T>(task: () => Promise<T>): Promise<T> {
  const run = etherscanQueue.then(async () => {
    const elapsed = Date.now() - lastEtherscanCallAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastEtherscanCallAt = Date.now();
    return task();
  });
  etherscanQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function isEtherscanRateLimitMessage(msg: string): boolean {
  return /rate limit|max calls per sec|429|too many requests/i.test(msg);
}

async function etherscanApiOnce(params: Record<string, string | number>, chainId = 1): Promise<any> {
  const apikey = getEtherscanKey();
  if (!apikey) throw new Error('ETHERSCAN_API_KEY is not set');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const qs = new URLSearchParams({
      chainid: String(chainId),
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      apikey,
    });
    const res = await fetch(`${ETHERSCAN_V2_URL}?${qs.toString()}`, { signal: controller.signal });
    if (res.status === 429) {
      throw new Error('Etherscan error: Max calls per sec rate limit reached (HTTP 429)');
    }
    if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
    const json: any = await res.json();
    if (json?.status === '1' || (json?.jsonrpc && json.result !== undefined && !json.error)) return json.result;
    const errDetail = typeof json?.result === 'string' ? json.result : json?.message || json?.error?.message || 'unknown';
    throw new Error(`Etherscan error: ${errDetail}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function etherscanApi(params: Record<string, string | number>, chainId = 1): Promise<any> {
  const backoffMs = [1200, 2400, 4000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    try {
      return await enqueueEtherscan(() => etherscanApiOnce(params, chainId));
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (isEtherscanRateLimitMessage(msg) && attempt < backoffMs.length) {
        await sleep(backoffMs[attempt]);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// Well-known Ethereum Mainnet addresses for smart-money tracking
export const NOTABLE_WALLETS: Record<string, { label: string; category: string }> = {
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045': { label: 'Vitalik Buterin (vitalik.eth)', category: 'Whale' },
  '0xDbF5e9C5206D0bA70a90108C905a0171b69080Cf': { label: 'Wintermute Trading 1', category: 'Market Maker' },
  '0x4f868c1aA37fCf307ab38d215382e88fcA62754a': { label: 'Wintermute Trading 2', category: 'Market Maker' },
  '0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296': { label: 'Justin Sun', category: 'Whale' },
  '0xF977814e90dA44bFA03b6295A0616a897441aceC': { label: 'Binance 8 (Hot Wallet)', category: 'CEX' },
  '0x28C6c06298d514Db089934071355E5743bf21d60': { label: 'Binance 14 (Hot Wallet)', category: 'CEX' },
  '0xae2Fc483527B8EF99EB5D9B44875F005ba1FaE13': { label: 'jaredfromsubway.eth (MEV Searcher)', category: 'MEV' },
  '0x00000000006c3852cbEf3e08E8dF289169EdE581': { label: 'OpenSea: Seaport 1.1', category: 'DEX' },
  '0xE592427A0AEce92De3Edee1F18E0157C05861564': { label: 'Uniswap V3: SwapRouter', category: 'DEX' },
  '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45': { label: 'Uniswap: SwapRouter02', category: 'DEX' },
  '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D': { label: 'Uniswap V2: Router 02', category: 'DEX' },
  '0x1111111254EEB25477B68fb85Ed929f73A960582': { label: '1inch V5: Aggregator', category: 'DEX' },
};

// Known ERC20 token contracts on Ethereum Mainnet
export const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': { symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
  '0x6982508145454Ce325dDbE47a25d4ec3d2311933': { symbol: 'PEPE', name: 'Pepe', decimals: 18 },
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE': { symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 },
  '0x514910771AF9Ca656af840dff83E8264EcF986CA': { symbol: 'LINK', name: 'Chainlink', decimals: 18 },
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': { symbol: 'UNI', name: 'Uniswap', decimals: 18 },
  '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2': { symbol: 'MKR', name: 'Maker', decimals: 18 },
  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9': { symbol: 'AAVE', name: 'Aave', decimals: 18 },
  '0x0D8775F648430679A709E98d2b0Cb6250d2887EF': { symbol: 'BAT', name: 'Basic Attention Token', decimals: 18 },
};

// Builder miner addresses
export const KNOWN_BUILDERS: Record<string, string> = {
  '0x396343362be2A4dA1cE0C1C210945346fb82Aa49': 'BeaverBuild (MEV)',
  '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97': 'Titan Builder (Flashbots)',
  '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5': 'BeaverBuild 2',
  '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5': 'Flashbots Builder',
  '0x1f9090aaE28b8a3dCeaDf281B0F12828e676c326': 'rsync-builder',
};

export interface LiveOnChainTx {
  hash: string;
  blockNumber: number;
  from: string;
  fromLabel?: string;
  to: string;
  toLabel?: string;
  valueEth: number;
  valueUsd: number;
  tokenSymbol?: string;
  tokenAmount?: number;
  gasPriceGwei: number;
  gasUsed?: number;
  timestamp: number;
  etherscanUrl: string;
  patternType: 'WHALE_TRANSFER' | 'DEX_SWAP' | 'MEV_BUNDLE' | 'LIQUIDITY_ACTION' | 'SMART_ACCUMULATION';
  significance: 'HIGH' | 'CRITICAL' | 'MEDIUM';
  description: string;
}

export interface TradePatternSignal {
  id: string;
  title: string;
  type: 'WHALE_ACCUMULATION' | 'DEX_CEX_ARBITRAGE' | 'MEV_OPPORTUNITY' | 'VELOCITY_SURGE' | 'GAS_TIMING';
  targetAsset: string;
  side: 'BUY' | 'SELL';
  expectedProfitPercent: number;
  winProbability: number;
  recommendedExchange: 'NONKYC' | 'KRAKEN' | 'BINANCE' | 'COINBASE' | 'BYBIT' | 'UNISWAP_DEX';
  reason: string;
  evidenceTxHash: string;
  etherscanUrl: string;
  netExpectedProfitUsd: number;
  status: 'DETECTED' | 'EXECUTING' | 'EXECUTED' | 'EXPIRED';
  timestamp: number;
  agentAuthor: string;
}

export interface EtherscanAgentState {
  id: string;
  name: string;
  role: string;
  status: 'ACTIVE' | 'SCANNING' | 'SYNTHESIZING' | 'IDLE';
  currentFocus: string;
  lastInsight: string;
  signalsFoundCount: number;
  specialty: string;
}

export interface OnChainBlockSnapshot {
  blockNumber: number;
  baseFeeGwei: number;
  priorityFeeGwei: number;
  builderName: string;
  txCount: number;
  ethPriceUsd: number;
  lastUpdated: number;
  syncSource: string;
}

// Real ETH price + gas oracle from Etherscan, refreshed at most every 60s (rate-limit friendly).
// If a refresh fails and the last good value is older than 2 minutes it is discarded; nothing is substituted.
interface MarketData { ethUsd: number; gasSafe: number; gasPropose: number; gasFast: number; fetchedAt: number }
let market: MarketData | null = null;

async function refreshMarketData(): Promise<MarketData> {
  if (market && Date.now() - market.fetchedAt < 60_000) return market;
  try {
    // Sequential calls through the paced queue so we never burst against the 3/sec rate limit
    const price = await etherscanApi({ module: 'stats', action: 'ethprice' });
    const gas = await etherscanApi({ module: 'gastracker', action: 'gasoracle' });
    const ethUsd = parseFloat(price?.ethusd);
    const gasSafe = parseFloat(gas?.SafeGasPrice);
    const gasPropose = parseFloat(gas?.ProposeGasPrice);
    const gasFast = parseFloat(gas?.FastGasPrice);
    if (![ethUsd, gasSafe, gasPropose, gasFast].every(Number.isFinite) || ethUsd <= 0) {
      throw new Error('Etherscan returned an incomplete price/gas response');
    }
    market = { ethUsd, gasSafe, gasPropose, gasFast, fetchedAt: Date.now() };
    return market;
  } catch (err) {
    if (market && Date.now() - market.fetchedAt > 120_000) market = null;
    if (market) return market; // recent real value (<2 min old) while the API recovers
    throw err;
  }
}

class EtherscanIntelligenceService {
  // null until the first real block has been read. Nothing is pre-populated.
  private blockSnapshot: OnChainBlockSnapshot | null = null;
  private lastError: string | null = null;
  private liveTransactions: LiveOnChainTx[] = [];
  private isPolling = false;
  private activeSync: Promise<void> | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private consecutiveRateLimits = 0;
  private autoExecutionEnabled = false;
  private minProfitThresholdPercent = 0.01;

  constructor() {
    this.startLivePolling();
  }

  private scheduleNextPoll(delayMs: number): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(async () => {
      await this.syncLiveBlockAndTxs();
      const baseDelay = 12_000;
      const nextDelay =
        this.consecutiveRateLimits > 0
          ? Math.min(60_000, baseDelay * Math.pow(2, this.consecutiveRateLimits))
          : baseDelay;
      this.scheduleNextPoll(nextDelay);
    }, delayMs);
    if (typeof this.pollTimer.unref === 'function') {
      this.pollTimer.unref();
    }
  }

  private startLivePolling(): void {
    if (this.isPolling) return;
    this.isPolling = true;
    void this.syncLiveBlockAndTxs().finally(() => {
      const baseDelay = 12_000;
      const nextDelay =
        this.consecutiveRateLimits > 0
          ? Math.min(60_000, baseDelay * Math.pow(2, this.consecutiveRateLimits))
          : baseDelay;
      this.scheduleNextPoll(nextDelay);
    });
  }

  public syncLiveBlockAndTxs(): Promise<void> {
    if (this.activeSync) return this.activeSync;
    this.activeSync = this.performSync().finally(() => {
      this.activeSync = null;
    });
    return this.activeSync;
  }

  private async performSync(): Promise<void> {
    try {
      if (!isEtherscanKeyConfigured()) {
        this.lastError = 'ETHERSCAN_API_KEY is not set';
        return;
      }
      // Run block fetch and market refresh sequentially so Etherscan calls are paced safely under 3/sec
      const blockRaw = await etherscanApi({
        module: 'proxy',
        action: 'eth_getBlockByNumber',
        tag: 'latest',
        boolean: 'true',
      });
      if (!blockRaw || !blockRaw.number) throw new Error('Etherscan returned no block');

      const blockNumber = parseInt(blockRaw.number, 16);
      if (this.blockSnapshot?.blockNumber === blockNumber) {
        this.lastError = null;
        this.consecutiveRateLimits = 0;
        return;
      }

      const mk = await refreshMarketData();
      const baseFeeGwei = blockRaw.baseFeePerGas ? parseInt(blockRaw.baseFeePerGas, 16) / 1e9 : NaN;
      if (!Number.isFinite(baseFeeGwei)) throw new Error('Block has no baseFeePerGas');
      const miner = (blockRaw.miner || '').toLowerCase();
      const txs = Array.isArray(blockRaw.transactions) ? blockRaw.transactions : [];

      this.blockSnapshot = {
        blockNumber,
        baseFeeGwei: Number(baseFeeGwei.toFixed(4)),
        priorityFeeGwei: Number(Math.max(0, mk.gasPropose - baseFeeGwei).toFixed(4)),
        builderName: KNOWN_BUILDERS[miner] || `Block Builder (${miner.slice(0, 8)}...)`,
        txCount: txs.length,
        ethPriceUsd: mk.ethUsd,
        lastUpdated: Date.now(),
        syncSource: 'Etherscan API (Ethereum Mainnet)',
      };

      const blockTime = parseInt(blockRaw.timestamp, 16) * 1000;
      const newTransactions: LiveOnChainTx[] = [];
      for (const tx of txs) {
        if (!tx || typeof tx !== 'object') continue;
        const valEth = parseInt(tx.value || '0x0', 16) / 1e18;
        const fromAddr = (tx.from || '').toLowerCase();
        const toAddr = (tx.to || '').toLowerCase();
        const fromInfo = NOTABLE_WALLETS[fromAddr];
        const toInfo = NOTABLE_WALLETS[toAddr];

        const isNotable = Boolean(fromInfo || toInfo);
        const isHighValue = valEth >= 2.0;
        const isDexRouter = toInfo?.category === 'DEX'; // only calls to a KNOWN router count as DEX activity
        if (!(isNotable || isHighValue || (isDexRouter && valEth > 0.5))) continue;

        const valUsd = valEth * mk.ethUsd;
        let patternType: LiveOnChainTx['patternType'] = 'WHALE_TRANSFER';
        let significance: LiveOnChainTx['significance'] = 'MEDIUM';
        let description = `Transfer of ${valEth.toFixed(3)} ETH ($${Math.round(valUsd).toLocaleString()})`;
        if (isNotable) {
          significance = 'CRITICAL';
          patternType = isDexRouter ? 'DEX_SWAP' : 'SMART_ACCUMULATION';
          description = `${fromInfo?.label || toInfo?.label}: ${valEth.toFixed(3)} ETH ($${Math.round(valUsd).toLocaleString()})`;
        } else if (isDexRouter) {
          patternType = 'DEX_SWAP';
          significance = valEth > 10 ? 'CRITICAL' : 'HIGH';
          description = `Call to ${toInfo.label} with ${valEth.toFixed(3)} ETH ($${Math.round(valUsd).toLocaleString()})`;
        } else if (valEth >= 50) {
          significance = 'CRITICAL';
        }

        newTransactions.push({
          hash: tx.hash,
          blockNumber,
          from: fromAddr,
          fromLabel: fromInfo?.label,
          to: toAddr,
          toLabel: toInfo?.label,
          valueEth: Number(valEth.toFixed(4)),
          valueUsd: Math.round(valUsd),
          tokenSymbol: 'ETH',
          gasPriceGwei: Number((parseInt(tx.gasPrice || '0x0', 16) / 1e9).toFixed(2)),
          timestamp: blockTime,
          etherscanUrl: `https://etherscan.io/tx/${tx.hash}`,
          patternType,
          significance,
          description,
        });
        if (newTransactions.length >= 15) break;
      }

      if (newTransactions.length > 0) {
        const existing = new Set(this.liveTransactions.map((t) => t.hash));
        this.liveTransactions = [...newTransactions.filter((t) => !existing.has(t.hash)), ...this.liveTransactions].slice(0, 50);
      }
      this.lastError = null;
      this.consecutiveRateLimits = 0;
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.lastError = msg;
      if (isEtherscanRateLimitMessage(msg)) {
        this.consecutiveRateLimits = Math.min(4, this.consecutiveRateLimits + 1);
      }
      console.error('Etherscan sync failed:', this.lastError);
    }
  }

  // Agents are views over the real data above. Counts are real counts; nothing is estimated or randomized.
  private buildAgents(): EtherscanAgentState[] {
    const b = this.blockSnapshot;
    const count = (...types: LiveOnChainTx['patternType'][]) => this.liveTransactions.filter((t) => types.includes(t.patternType)).length;
    const swapCostUsd = b ? (150000 * b.baseFeeGwei * 1e-9 * b.ethPriceUsd) : null;
    return [
      {
        id: 'agent-whale',
        name: 'Whale Activity Monitor',
        role: 'Flags transfers >= 2 ETH and any transaction touching a labeled wallet',
        status: b ? 'ACTIVE' : 'IDLE',
        currentFocus: b ? `Latest block #${b.blockNumber}` : 'Waiting for first Etherscan block',
        lastInsight: `${count('WHALE_TRANSFER', 'SMART_ACCUMULATION')} whale/labeled-wallet transactions in the last ${this.liveTransactions.length} flagged txs.`,
        signalsFoundCount: count('WHALE_TRANSFER', 'SMART_ACCUMULATION'),
        specialty: 'Whale flow & labeled-wallet tracking',
      },
      {
        id: 'agent-dex',
        name: 'DEX Router Activity Monitor',
        role: 'Flags calls to known DEX routers (Uniswap V2/V3, SwapRouter02, 1inch, Seaport)',
        status: b ? 'ACTIVE' : 'IDLE',
        currentFocus: b ? `Latest block #${b.blockNumber}, builder ${b.builderName}` : 'Waiting for first Etherscan block',
        lastInsight: `${count('DEX_SWAP')} flagged router calls among recent transactions.`,
        signalsFoundCount: count('DEX_SWAP'),
        specialty: 'Router call detection',
      },
      {
        id: 'agent-gas',
        name: 'Gas Monitor',
        role: 'Reports base fee, priority fee and Etherscan gas oracle',
        status: b ? 'ACTIVE' : 'IDLE',
        currentFocus: b ? `Base fee ${b.baseFeeGwei} Gwei | priority ${b.priorityFeeGwei} Gwei` : 'Waiting for first Etherscan block',
        lastInsight: b && market
          ? `Oracle safe/propose/fast: ${market.gasSafe}/${market.gasPropose}/${market.gasFast} Gwei. A 150,000-gas swap costs about $${swapCostUsd!.toFixed(2)} at the current base fee.`
          : 'No gas data yet.',
        signalsFoundCount: 0,
        specialty: 'EIP-1559 fee tracking',
      },
    ];
  }

  // No verified signal engine exists, so there is nothing to execute. This never fabricates a receipt.
  public async executePatternTrade(_signalId: string): Promise<{
    success: boolean; receipt?: string; orderId?: string; exchange: string; targetAsset: string; executionNote: string; error?: string;
  }> {
    return {
      success: false,
      exchange: '',
      targetAsset: '',
      executionNote: 'Not executed',
      error: 'Pattern execution is not implemented: there are no verified trade signals. Place real orders through /api/exchange/* routes.',
    };
  }

  // AI commentary on the REAL data currently held. Requires GEMINI_API_KEY and block data; otherwise throws.
  public async runDeepGeminiAnalysis(userPrompt?: string): Promise<{
    summary: string;
    actionableStrategies: string[];
    timestamp: number;
  }> {
    const block = this.blockSnapshot;
    if (!block) throw new Error('No on-chain data yet; Etherscan has not returned a block.');
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');

    const txSample = this.liveTransactions.slice(0, 15).map((t) => ({
      hash: t.hash, from: t.fromLabel || t.from, to: t.toLabel || t.to, valueEth: t.valueEth, valueUsd: t.valueUsd, type: t.patternType,
    }));

    const promptText = `You are an on-chain analyst. Use ONLY the data below (real Etherscan data). Do not invent prices, flows, or opportunities that the data does not show; if the data is insufficient for a conclusion, say so.

LATEST BLOCK: #${block.blockNumber} | base fee ${block.baseFeeGwei} Gwei | priority ${block.priorityFeeGwei} Gwei | builder ${block.builderName} | ${block.txCount} txs | ETH $${block.ethPriceUsd}
FLAGGED TRANSACTIONS (whales / labeled wallets / DEX routers):
${JSON.stringify(txSample, null, 2)}

USER FOCUS: ${userPrompt || 'Summarize what the flagged activity shows and what, if anything, is actionable.'}

Respond ONLY with JSON: {"summary": string, "actionableStrategies": string[]} (strategies may be empty if nothing is supported by the data).`;

    const ai = new GoogleGenAI({});
    let response: any = null;
    let lastErr: any = null;
    for (const model of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
      try {
        response = await callWithTimeout(() =>
          ai.models.generateContent({ model, contents: promptText, config: { responseMimeType: 'application/json' } })
        );
        if (response?.text) break;
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || '');
        if (!/503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|TIMEOUT/i.test(msg)) {
          throw err;
        }
      }
    }
    if (!response?.text) {
      throw lastErr || new Error('Gemini returned empty analysis output.');
    }
    let parsed: any;
    try {
      parsed = JSON.parse(response.text || '');
    } catch {
      throw new Error('Gemini returned unparseable analysis output.');
    }
    if (typeof parsed?.summary !== 'string') throw new Error('Gemini analysis missing summary.');
    return {
      summary: parsed.summary,
      actionableStrategies: Array.isArray(parsed.actionableStrategies) ? parsed.actionableStrategies.map(String) : [],
      timestamp: Date.now(),
    };
  }

  public getState() {
    return {
      blockSnapshot: this.blockSnapshot,
      error: this.lastError,
      liveTransactions: this.liveTransactions,
      tradePatterns: [] as TradePatternSignal[], // no verified signal engine: intentionally empty
      agents: this.buildAgents(),
      autoExecutionEnabled: false,
      minProfitThresholdPercent: this.minProfitThresholdPercent,
      executedSignalsCount: 0,
      executedSignalsLog: [] as Array<{ signalId: string; targetAsset: string; exchange: string; profitEst: number; receipt: string; timestamp: number }>,
      timestamp: Date.now(),
    };
  }
}

export const etherscanService = new EtherscanIntelligenceService();
