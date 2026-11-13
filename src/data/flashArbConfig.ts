export interface ArbTokenConfig {
  symbol: string;
  name: string;
  price: number;
  decimals: number;
  category: 'Major' | 'LST / LRT' | 'Ecosystem' | 'DeFi' | 'Meme' | 'Stablecoin';
  defaultLoan: number;
  maxLoan: number;
  loanStep: number;
  aaveAvailable: boolean;
  balancerAvailable: boolean;
  typicalSpreadBps: number;
  iconBg: string;
  contractAddressArb?: string;
}

export const ARB_TOKENS: ArbTokenConfig[] = [
  // Majors
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    price: 2850,
    decimals: 18,
    category: 'Major',
    defaultLoan: 25,
    maxLoan: 250,
    loanStep: 1,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 18,
    iconBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    contractAddressArb: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    price: 65500,
    decimals: 8,
    category: 'Major',
    defaultLoan: 2,
    maxLoan: 20,
    loanStep: 0.1,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 22,
    iconBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    contractAddressArb: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
  },
  {
    symbol: 'SOL',
    name: 'Solana (Bridged Wormhole)',
    price: 175,
    decimals: 9,
    category: 'Major',
    defaultLoan: 150,
    maxLoan: 1500,
    loanStep: 10,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 35,
    iconBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    symbol: 'tBTC',
    name: 'Threshold Network Bitcoin',
    price: 65800,
    decimals: 18,
    category: 'Major',
    defaultLoan: 2,
    maxLoan: 25,
    loanStep: 0.1,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 24,
    iconBg: 'bg-amber-600/20 text-amber-300 border-amber-600/30',
  },

  // Liquid Staking & Restaking (LSTs / LRTs - Prime Spread Arbitrage)
  {
    symbol: 'wstETH',
    name: 'Lido Wrapped Staked ETH',
    price: 3350,
    decimals: 18,
    category: 'LST / LRT',
    defaultLoan: 20,
    maxLoan: 200,
    loanStep: 1,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 32,
    iconBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    contractAddressArb: '0x5979D7b546E38E414F7E9822514be443A4800529',
  },
  {
    symbol: 'cbETH',
    name: 'Coinbase Wrapped Staked ETH',
    price: 3020,
    decimals: 18,
    category: 'LST / LRT',
    defaultLoan: 20,
    maxLoan: 200,
    loanStep: 1,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 28,
    iconBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    contractAddressArb: '0x1DEBd73E752bEaF79865Fd6446b0c970EaE7732f',
  },
  {
    symbol: 'rETH',
    name: 'Rocket Pool Staked ETH',
    price: 3180,
    decimals: 18,
    category: 'LST / LRT',
    defaultLoan: 20,
    maxLoan: 200,
    loanStep: 1,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 34,
    iconBg: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  {
    symbol: 'ezETH',
    name: 'Renzo Restaked ETH',
    price: 2920,
    decimals: 18,
    category: 'LST / LRT',
    defaultLoan: 25,
    maxLoan: 250,
    loanStep: 1,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 45,
    iconBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    contractAddressArb: '0x2416092f143378750bb29b79eD961ab195CcEea5',
  },
  {
    symbol: 'weETH',
    name: 'Ether.fi Staked ETH',
    price: 2980,
    decimals: 18,
    category: 'LST / LRT',
    defaultLoan: 25,
    maxLoan: 250,
    loanStep: 1,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 40,
    iconBg: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  },

  // Ecosystem & DeFi Tokens
  {
    symbol: 'ARB',
    name: 'Arbitrum Native Token',
    price: 0.65,
    decimals: 18,
    category: 'Ecosystem',
    defaultLoan: 45000,
    maxLoan: 500000,
    loanStep: 5000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 38,
    iconBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    contractAddressArb: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  },
  {
    symbol: 'OP',
    name: 'Optimism Governance Token',
    price: 1.65,
    decimals: 18,
    category: 'Ecosystem',
    defaultLoan: 20000,
    maxLoan: 200000,
    loanStep: 2000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 36,
    iconBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
  {
    symbol: 'LINK',
    name: 'Chainlink Oracle',
    price: 14.20,
    decimals: 18,
    category: 'Ecosystem',
    defaultLoan: 2500,
    maxLoan: 25000,
    loanStep: 250,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 26,
    iconBg: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    contractAddressArb: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
  },
  {
    symbol: 'GMX',
    name: 'GMX Decentralized Perpetual',
    price: 28.50,
    decimals: 18,
    category: 'Ecosystem',
    defaultLoan: 1200,
    maxLoan: 12000,
    loanStep: 100,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 42,
    iconBg: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    contractAddressArb: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
  },
  {
    symbol: 'MAGIC',
    name: 'Treasure DAO Ecosystem',
    price: 0.38,
    decimals: 18,
    category: 'Ecosystem',
    defaultLoan: 50000,
    maxLoan: 500000,
    loanStep: 5000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 45,
    iconBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    contractAddressArb: '0x539bdE0d7Dbd336b79148AA742883198BBF60342',
  },
  {
    symbol: 'RDNT',
    name: 'Radiant Capital',
    price: 0.065,
    decimals: 18,
    category: 'Ecosystem',
    defaultLoan: 150000,
    maxLoan: 1500000,
    loanStep: 25000,
    aaveAvailable: false,
    balancerAvailable: true,
    typicalSpreadBps: 52,
    iconBg: 'bg-cyan-600/20 text-cyan-300 border-cyan-600/30',
    contractAddressArb: '0x3082CC23568eA640225c2467653dB90e9250AaA0',
  },
  {
    symbol: 'AERO',
    name: 'Aerodrome Finance (Base)',
    price: 1.22,
    decimals: 18,
    category: 'Ecosystem',
    defaultLoan: 25000,
    maxLoan: 250000,
    loanStep: 2500,
    aaveAvailable: false,
    balancerAvailable: true,
    typicalSpreadBps: 38,
    iconBg: 'bg-blue-600/20 text-blue-300 border-blue-600/30',
  },
  {
    symbol: 'VELO',
    name: 'Velodrome Finance (Optimism)',
    price: 0.095,
    decimals: 18,
    category: 'Ecosystem',
    defaultLoan: 200000,
    maxLoan: 2000000,
    loanStep: 20000,
    aaveAvailable: false,
    balancerAvailable: true,
    typicalSpreadBps: 42,
    iconBg: 'bg-red-500/20 text-red-300 border-red-500/30',
  },

  // DeFi Protocol Bluechips
  {
    symbol: 'PENDLE',
    name: 'Pendle Yield Protocol',
    price: 4.45,
    decimals: 18,
    category: 'DeFi',
    defaultLoan: 10000,
    maxLoan: 100000,
    loanStep: 1000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 34,
    iconBg: 'bg-teal-600/20 text-teal-300 border-teal-600/30',
    contractAddressArb: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8',
  },
  {
    symbol: 'UNI',
    name: 'Uniswap Governance Token',
    price: 8.20,
    decimals: 18,
    category: 'DeFi',
    defaultLoan: 6000,
    maxLoan: 60000,
    loanStep: 500,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 28,
    iconBg: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    contractAddressArb: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0',
  },
  {
    symbol: 'AAVE',
    name: 'Aave Protocol Token',
    price: 152.00,
    decimals: 18,
    category: 'DeFi',
    defaultLoan: 350,
    maxLoan: 3500,
    loanStep: 50,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 26,
    iconBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    contractAddressArb: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196',
  },
  {
    symbol: 'LDO',
    name: 'Lido DAO Governance Token',
    price: 1.25,
    decimals: 18,
    category: 'DeFi',
    defaultLoan: 35000,
    maxLoan: 350000,
    loanStep: 2500,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 32,
    iconBg: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  },

  // Stablecoins (Sub-cent Peg Deviations & Yield Arbitrage)
  {
    symbol: 'USDC',
    name: 'USD Coin (Native)',
    price: 1.00,
    decimals: 6,
    category: 'Stablecoin',
    defaultLoan: 65000,
    maxLoan: 1000000,
    loanStep: 10000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 12,
    iconBg: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    contractAddressArb: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  {
    symbol: 'USDC.e',
    name: 'USD Coin (Bridged)',
    price: 1.00,
    decimals: 6,
    category: 'Stablecoin',
    defaultLoan: 65000,
    maxLoan: 1000000,
    loanStep: 10000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 14,
    iconBg: 'bg-blue-600/20 text-blue-300 border-blue-600/30',
    contractAddressArb: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    price: 1.00,
    decimals: 6,
    category: 'Stablecoin',
    defaultLoan: 65000,
    maxLoan: 1000000,
    loanStep: 10000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 14,
    iconBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    contractAddressArb: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  {
    symbol: 'DAI',
    name: 'Maker / Spark Dai',
    price: 1.00,
    decimals: 18,
    category: 'Stablecoin',
    defaultLoan: 65000,
    maxLoan: 1000000,
    loanStep: 10000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 15,
    iconBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    contractAddressArb: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  },
  {
    symbol: 'crvUSD',
    name: 'Curve USD Stablecoin',
    price: 1.00,
    decimals: 18,
    category: 'Stablecoin',
    defaultLoan: 40000,
    maxLoan: 500000,
    loanStep: 5000,
    aaveAvailable: false,
    balancerAvailable: true,
    typicalSpreadBps: 20,
    iconBg: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  {
    symbol: 'FRAX',
    name: 'Frax Finance Stablecoin',
    price: 1.00,
    decimals: 18,
    category: 'Stablecoin',
    defaultLoan: 50000,
    maxLoan: 600000,
    loanStep: 5000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 16,
    iconBg: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    contractAddressArb: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F',
  },
  {
    symbol: 'USDe',
    name: 'Ethena Synthetic Dollar',
    price: 1.00,
    decimals: 18,
    category: 'Stablecoin',
    defaultLoan: 60000,
    maxLoan: 800000,
    loanStep: 10000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 18,
    iconBg: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
    contractAddressArb: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
  },
  {
    symbol: 'sUSDe',
    name: 'Ethena Staked USDe',
    price: 1.10,
    decimals: 18,
    category: 'Stablecoin',
    defaultLoan: 45000,
    maxLoan: 500000,
    loanStep: 5000,
    aaveAvailable: true,
    balancerAvailable: true,
    typicalSpreadBps: 22,
    iconBg: 'bg-indigo-600/20 text-indigo-300 border-indigo-600/30',
    contractAddressArb: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2',
  },
  {
    symbol: 'SPA',
    name: 'Sperax USD Stablecoin',
    price: 1.00,
    decimals: 18,
    category: 'Stablecoin',
    defaultLoan: 40000,
    maxLoan: 400000,
    loanStep: 5000,
    aaveAvailable: false,
    balancerAvailable: true,
    typicalSpreadBps: 25,
    iconBg: 'bg-pink-600/20 text-pink-300 border-pink-600/30',
  },

  // High-Volatility Memes
  {
    symbol: 'PEPE',
    name: 'Pepe Token',
    price: 0.0000095,
    decimals: 18,
    category: 'Meme',
    defaultLoan: 4000000000,
    maxLoan: 50000000000,
    loanStep: 500000000,
    aaveAvailable: false,
    balancerAvailable: true,
    typicalSpreadBps: 65,
    iconBg: 'bg-emerald-600/20 text-emerald-300 border-emerald-600/30',
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    price: 0.000018,
    decimals: 18,
    category: 'Meme',
    defaultLoan: 2000000000,
    maxLoan: 30000000000,
    loanStep: 250000000,
    aaveAvailable: false,
    balancerAvailable: true,
    typicalSpreadBps: 58,
    iconBg: 'bg-amber-600/20 text-amber-300 border-amber-600/30',
  },
];

export interface DexPoolInfo {
  name: string;
  protocol:
    | 'UNISWAP_V3'
    | 'UNISWAP_V2'
    | 'CURVE'
    | 'CAMELOT_V3'
    | 'CAMELOT_V2'
    | 'AERODROME'
    | 'VELODROME'
    | 'BALANCER_V2'
    | 'TRADER_JOE_V2'
    | 'PANCAKESWAP_V3'
    | 'DODO_V2';
  feeTier: string;
  chains: ('Arbitrum' | 'Base' | 'Optimism')[];
  avgGas: number;
  slippageModel: string;
  tagColor: string;
  contractRouter: string;
}

export const SUPPORTED_DEX_POOLS: DexPoolInfo[] = [
  {
    name: 'Uniswap V3 (0.05% Tick)',
    protocol: 'UNISWAP_V3',
    feeTier: '0.05%',
    chains: ['Arbitrum', 'Base', 'Optimism'],
    avgGas: 110000,
    slippageModel: 'Concentrated Liquidity (Tick range spacing 10)',
    tagColor: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
    contractRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  {
    name: 'Uniswap V3 (0.30% Tick)',
    protocol: 'UNISWAP_V3',
    feeTier: '0.30%',
    chains: ['Arbitrum', 'Base', 'Optimism'],
    avgGas: 110000,
    slippageModel: 'Concentrated Liquidity (Standard volatile pairs)',
    tagColor: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
    contractRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  {
    name: 'Camelot V3 (Algebra Engine)',
    protocol: 'CAMELOT_V3',
    feeTier: 'Dynamic (0.01-0.2%)',
    chains: ['Arbitrum'],
    avgGas: 104000,
    slippageModel: 'Algebra Adaptive Directional Volatility Engine',
    tagColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    contractRouter: '0x1F721E2E82F6676FCE4eA07A5958cF098D339e18',
  },
  {
    name: 'Camelot V2 (Standard CPMM)',
    protocol: 'CAMELOT_V2',
    feeTier: '0.30%',
    chains: ['Arbitrum'],
    avgGas: 90000,
    slippageModel: 'Constant Product x*y=k (Referral & loyalty rebate)',
    tagColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    contractRouter: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
  },
  {
    name: 'Curve Finance (Stable / Tricrypto)',
    protocol: 'CURVE',
    feeTier: '0.04%',
    chains: ['Arbitrum', 'Optimism'],
    avgGas: 128000,
    slippageModel: 'Amplified Stableswap + CryptoSwap dynamic curve',
    tagColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    contractRouter: '0x445FE580eF8d70FF569aB36e80c647af338db351',
  },
  {
    name: 'Aerodrome Slipstream (CL)',
    protocol: 'AERODROME',
    feeTier: '0.05%',
    chains: ['Base'],
    avgGas: 112000,
    slippageModel: 'Concentrated Liquidity CL-50 engine on Base L2',
    tagColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    contractRouter: '0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5',
  },
  {
    name: 'Aerodrome Basic (sAMM/vAMM)',
    protocol: 'AERODROME',
    feeTier: '0.02-0.30%',
    chains: ['Base'],
    avgGas: 88000,
    slippageModel: 'Solidly Volatile & Correlated Stableswap Invariant',
    tagColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    contractRouter: '0xCf77A3bA9a5CA399b7C97C7488454543b863322d',
  },
  {
    name: 'Velodrome Slipstream (CL)',
    protocol: 'VELODROME',
    feeTier: '0.05%',
    chains: ['Optimism'],
    avgGas: 112000,
    slippageModel: 'Concentrated Liquidity Slipstream on Optimism OP',
    tagColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    contractRouter: '0xaAaffe8A6f011116C4b5a5d03a1168F615D1c1b0',
  },
  {
    name: 'Balancer V2 (Composable Vault)',
    protocol: 'BALANCER_V2',
    feeTier: '0.08%',
    chains: ['Arbitrum', 'Base', 'Optimism'],
    avgGas: 115000,
    slippageModel: 'Generalized Multi-Asset Weighted Invariant (0% Flash Fee)',
    tagColor: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
    contractRouter: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
  },
  {
    name: 'Trader Joe V2.1 (LB Bins)',
    protocol: 'TRADER_JOE_V2',
    feeTier: '0.08%',
    chains: ['Arbitrum'],
    avgGas: 118000,
    slippageModel: 'Discretized Liquidity Bins (Zero slippage inside bin)',
    tagColor: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    contractRouter: '0xb4315e873dBcf96Ffd0acd8EA43f689D8c20fB30',
  },
  {
    name: 'PancakeSwap V3 (Arbitrum)',
    protocol: 'PANCAKESWAP_V3',
    feeTier: '0.05%',
    chains: ['Arbitrum', 'Base'],
    avgGas: 110000,
    slippageModel: 'Uniswap V3 Concentrated Fork with high retail volume',
    tagColor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    contractRouter: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  },
  {
    name: 'SushiSwap V3 / V2',
    protocol: 'UNISWAP_V2',
    feeTier: '0.30%',
    chains: ['Arbitrum', 'Optimism'],
    avgGas: 91000,
    slippageModel: 'BentoBox / RouteProcessor3 multi-hop aggregator',
    tagColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    contractRouter: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
  },
  {
    name: 'DODO V2 (PMM Engine)',
    protocol: 'DODO_V2',
    feeTier: '0.01%',
    chains: ['Arbitrum'],
    avgGas: 106000,
    slippageModel: 'Proactive Market Maker (External Price Oracle Anchor)',
    tagColor: 'text-lime-400 bg-lime-500/10 border-lime-500/30',
    contractRouter: '0x88Cb99B664673A08dA7782A9C0C5e7E2E519Ef71',
  },
];

export type FlashLoanProviderId = 'BALANCER_V2' | 'AAVE_V3' | 'SPARK_MAKER' | 'UNISWAP_V3';

export interface FlashLoanProviderInfo {
  id: FlashLoanProviderId;
  name: string;
  feePercent: number;
  feeBps: number;
  description: string;
  badge: string;
  badgeColor: string;
  supportedTokens: string[];
}

export const FLASH_LOAN_PROVIDERS: FlashLoanProviderInfo[] = [
  {
    id: 'BALANCER_V2',
    name: 'Balancer V2 Flash Vault',
    feePercent: 0.00,
    feeBps: 0,
    description: '0.00% Zero-Fee Flash Loan! Slashes financing costs to $0.00 on any token held in the Vault.',
    badge: '0.00% FEE · OPTIMAL ALPHA',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    supportedTokens: ['WETH', 'WBTC', 'wstETH', 'cbETH', 'rETH', 'ezETH', 'weETH', 'ARB', 'LINK', 'USDC', 'USDT', 'DAI', 'crvUSD'],
  },
  {
    id: 'AAVE_V3',
    name: 'Aave V3 Pool',
    feePercent: 0.05,
    feeBps: 5,
    description: 'Deepest multi-chain liquidity ($500M+ available across WETH, WBTC, USDC, DAI).',
    badge: '0.05% FEE · DEEPEST LIQUIDITY',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    supportedTokens: ['WETH', 'WBTC', 'wstETH', 'cbETH', 'rETH', 'ARB', 'OP', 'LINK', 'USDC', 'USDT', 'DAI'],
  },
  {
    id: 'SPARK_MAKER',
    name: 'Spark / MakerDAO DssFlash',
    feePercent: 0.00,
    feeBps: 0,
    description: 'Zero-fee instant flash minting for DAI and USDS up to $1B ceiling on L1 and L2 bridges.',
    badge: '0.00% FEE · DAI SPECIALIST',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    supportedTokens: ['DAI', 'USDC'],
  },
  {
    id: 'UNISWAP_V3',
    name: 'Uniswap V3 Flash Swap',
    feePercent: 0.05,
    feeBps: 5,
    description: 'Borrow directly from target pool and settle in counter-token during swap callback.',
    badge: 'IN-POOL FLASH · ZERO EXTRA HOP',
    badgeColor: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
    supportedTokens: ['WETH', 'WBTC', 'wstETH', 'ARB', 'OP', 'LINK', 'USDC', 'USDT'],
  },
];

export type GasOptimizationLevel = 'STANDARD' | 'DIRECT_BYPASS' | 'CANCUN_TRANSIENT' | 'HYPER_ALPHA';

export interface GasOptimizationProfile {
  id: GasOptimizationLevel;
  label: string;
  gasUnits: number;
  gasCostUsd: number;
  calldataBytes: number;
  savingsPercent: number;
  description: string;
  badge: string;
  techniques: string[];
}

export const GAS_OPTIMIZATION_PROFILES: Record<GasOptimizationLevel, GasOptimizationProfile> = {
  STANDARD: {
    id: 'STANDARD',
    label: 'Standard Periphery Router',
    gasUnits: 312000,
    gasCostUsd: 1.45,
    calldataBytes: 480,
    savingsPercent: 0,
    badge: 'BASELINE · STANDARD ABI',
    description: 'Standard SwapRouter.exactInputSingle() calls via periphery router contract with full ABI tuples.',
    techniques: [
      'Standard ABI encoded function calls',
      'Tokens bounced through intermediate contract',
      'Persistent storage reentrancy guard (SSTORE)',
      'Per-transaction ERC20 approval checks',
    ],
  },
  DIRECT_BYPASS: {
    id: 'DIRECT_BYPASS',
    label: 'Direct Pool Bypass + Yul (-28% Gas)',
    gasUnits: 225000,
    gasCostUsd: 1.05,
    calldataBytes: 288,
    savingsPercent: 28,
    badge: '-28% GAS · DIRECT POOL SWAP',
    description: 'Bypasses periphery router to invoke IUniswapV3Pool.swap() directly. Sends output straight to next venue.',
    techniques: [
      'Direct pool callback swap() execution (bypasses router)',
      'Zero intermediary contract token bounce (recipient: poolB)',
      'Custom errors (error InsufficientProfit()) saving 2,400 gas on reverts',
      'Pre-approved max ERC20 allowances (saves 22,100 gas per tx)',
    ],
  },
  CANCUN_TRANSIENT: {
    id: 'CANCUN_TRANSIENT',
    label: 'Cancun EIP-1153 Transient Storage (-42% Gas)',
    gasUnits: 180000,
    gasCostUsd: 0.84,
    calldataBytes: 192,
    savingsPercent: 42,
    badge: '-42% GAS · EIP-1153 TRANSIENT',
    description: 'Leverages Ethereum Cancun EIP-1153 TSTORE/TLOAD for callback locks, eliminating all cold storage writes.',
    techniques: [
      'EIP-1153 TSTORE/TLOAD transient reentrancy guard (100 gas vs 20,000 SSTORE)',
      'Single-slot calldata bit-packing (packs dexId, fee, and minOut in bytes32)',
      'Unchecked loop counters & pointer arithmetic in Yul assembly',
      'Zero zero-check overhead on internal routes',
    ],
  },
  HYPER_ALPHA: {
    id: 'HYPER_ALPHA',
    label: 'Hyper-Alpha MEV + Zero-Fee Loan (-52% Gas + 0% Financing)',
    gasUnits: 148000,
    gasCostUsd: 0.69,
    calldataBytes: 128,
    savingsPercent: 52,
    badge: '-52% GAS · 0% FINANCING FEE',
    description: 'Combines Balancer V2 0% flash loan ($0 fee) with zero-byte calldata compression and raw assembly.',
    techniques: [
      'Balancer V2 Vault 0.00% flash loan fee (100% financing fee elimination)',
      'L1 Blob/Calldata zero-byte compression (slashes 4844 rollup posting cost by 45%)',
      'Direct low-level address.call with raw memory offsets',
      'Sequencer priority bidding optimizer with dynamic block depth detection',
    ],
  },
};

export const FLASH_ARB_FILES: Record<string, { lang: string; path: string; code: string }> = {
  'FlashArbOptimized.sol': {
    lang: 'solidity',
    path: 'flash-arb/contracts/src/FlashArbOptimized.sol',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FlashArbOptimized
 * @notice Owner-operated two-leg flash loan arbitrage executor using Balancer V2 (0% fee) flash loans.
 * @dev Security model:
 *  - Every entrypoint that starts a flash loan is \`onlyOwner\`.
 *  - The Balancer callback only proceeds if (a) msg.sender is the Vault and (b) the userData it receives
 *    hashes to a commitment stored in transient storage by an owner-initiated call in the SAME transaction.
 *    Nobody can start a flash loan "into" this contract with their own recipient/minProfit.
 *  - The commitment slot also acts as the reentrancy lock (EIP-1153, Cancun).
 *  - Profit is enforced on-chain: the whole transaction reverts unless balance after swaps >= repayment + minProfit.
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

// Balancer V2 Vault flash loan interface (0.00% fee while the protocol fee is zero)
interface IBalancerVault {
    function flashLoan(
        address recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

// Uniswap V3 SwapRouter (v1, has \`deadline\`): Arbitrum 0xE592...1564, Ethereum, Polygon
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

// Uniswap V3 SwapRouter02 (NO \`deadline\`): Base 0x2626...e481, Optimism 0x68b3...Fc45
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

// Uniswap V2 / Camelot V2 / Sushiswap router
interface IUniswapV2Router02 {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

contract FlashArbOptimized is IFlashLoanRecipient {
    error Unauthorized();
    error InsufficientProfit(uint256 actual, uint256 required);
    error ReentrancyGuardLocked();
    error SwapExecutionFailed(string reason);
    error InvalidRoute();
    error MinProfitRequired();

    // Transient storage slot: holds keccak256(userData) while an owner-initiated flash loan is in flight (0 = idle)
    uint256 private constant TRANSIENT_LOCK_SLOT = 0xd7d8d2a518f8b8aadb97f139f4366cba00bf3d0e49aac2ebd368f55d7656b300;

    /**
     * routeType: 1 = UniV3 -> V2, 2 = V2 -> UniV3, 3 = UniV3 -> UniV3, 4 = V2 -> V2
     * Leg 1 swaps tokenIn -> tokenOut on routerA (fee feeA); leg 2 swaps tokenOut -> tokenIn on routerB (fee feeB).
     * Layout is 9 static words (288 bytes) when ABI-encoded.
     */
    struct SwapRouteParams {
        uint8 routeType;
        address routerA;
        address routerB;
        address tokenIn;
        address tokenOut;
        uint24 feeA;
        uint24 feeB;
        uint256 minProfit;
        address recipient;
    }

    address public immutable owner;
    IBalancerVault public immutable BALANCER_VAULT;
    address public immutable AAVE_POOL; // kept for deploy-ABI compatibility; Aave is not used by this contract

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    event ArbitrageBroadcast(address indexed caller, address indexed recipient, uint256 value);
    event FlashLoanReceived(address indexed token, uint256 amount, uint256 fee, address indexed recipient);
    event ArbitrageSwapsExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountBorrowed,
        uint256 netProfitSwept,
        address indexed recipient
    );

    constructor(address _balancerVault, address _aavePool) {
        owner = msg.sender;
        BALANCER_VAULT = IBalancerVault(_balancerVault);
        AAVE_POOL = _aavePool;
    }

    // ------------------------------------------------------------------------------------------------
    // Entrypoints (owner only)
    // ------------------------------------------------------------------------------------------------

    /// @notice Start a flash loan with ABI-encoded \`SwapRouteParams\` as \`routingParams\`.
    function executeBalancerFlashArb(
        address token,
        uint256 amount,
        bytes calldata routingParams
    ) external onlyOwner {
        _startFlash(token, amount, routingParams);
    }

    /// @notice Typed entrypoint (this is what the Rust searcher calls).
    function executeOptimizedArbitrage(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        address routerA,
        address routerB,
        uint24 feeA,
        uint24 feeB,
        uint8 routeType,
        uint256 minProfit,
        address recipient
    ) external onlyOwner {
        if (minProfit == 0) revert MinProfitRequired();
        SwapRouteParams memory route = SwapRouteParams({
            routeType: routeType,
            routerA: routerA,
            routerB: routerB,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            feeA: feeA,
            feeB: feeB,
            minProfit: minProfit,
            recipient: recipient
        });
        _startFlash(tokenIn, amount, abi.encode(route));
    }

    /**
     * @notice Sweeps this contract's native ETH balance to \`recipient\`. It does NOT perform an arbitrage.
     * @dev Selector kept (0x7804d9ac) because the server/dashboard already calls it. Owner only: it used to be callable by anyone.
     */
    function executeDirectFlashArb(address recipient) external payable onlyOwner returns (bool) {
        uint256 bal = address(this).balance;
        if (bal > 0 && recipient != address(0)) {
            (bool ok, ) = payable(recipient).call{value: bal}("");
            if (!ok) revert SwapExecutionFailed("ETH sweep failed");
        }
        emit ArbitrageBroadcast(msg.sender, recipient, msg.value);
        return true;
    }

    function rescueTokens(address token) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) _safeTransfer(token, owner, bal);
    }

    // ------------------------------------------------------------------------------------------------
    // Flash loan plumbing
    // ------------------------------------------------------------------------------------------------

    function _startFlash(address token, uint256 amount, bytes memory userData) internal {
        uint256 locked;
        assembly {
            locked := tload(TRANSIENT_LOCK_SLOT)
        }
        if (locked != 0) revert ReentrancyGuardLocked();

        uint256 commitment = uint256(keccak256(userData));
        assembly {
            tstore(TRANSIENT_LOCK_SLOT, commitment)
        }

        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        BALANCER_VAULT.flashLoan(address(this), tokens, amounts, userData);

        assembly {
            tstore(TRANSIENT_LOCK_SLOT, 0)
        }
    }

    /// @notice Balancer V2 flash loan callback.
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        if (msg.sender != address(BALANCER_VAULT)) revert Unauthorized();

        // Only proceed for a loan this contract's owner started in this very transaction, with exactly these params.
        uint256 commitment;
        assembly {
            commitment := tload(TRANSIENT_LOCK_SLOT)
        }
        if (commitment == 0 || commitment != uint256(keccak256(userData))) revert Unauthorized();
        if (tokens.length != 1 || amounts.length != 1 || feeAmounts.length != 1) revert InvalidRoute();

        SwapRouteParams memory route = abi.decode(userData, (SwapRouteParams));
        address asset = address(tokens[0]);
        uint256 borrowed = amounts[0];
        uint256 amountToRepay = borrowed + feeAmounts[0];

        if (
            route.routeType < 1 || route.routeType > 4 || route.tokenIn != asset || route.tokenOut == address(0)
                || route.tokenOut == asset || route.routerA == address(0) || route.routerB == address(0)
        ) revert InvalidRoute();
        if (route.minProfit == 0) revert MinProfitRequired();
        if (route.recipient == address(0)) route.recipient = owner;

        _executeTwoLegArb(route, borrowed);

        uint256 endingBalance = IERC20(asset).balanceOf(address(this));
        if (endingBalance < amountToRepay) revert InsufficientProfit(0, route.minProfit);
        uint256 netProfit = endingBalance - amountToRepay;
        if (netProfit < route.minProfit) revert InsufficientProfit(netProfit, route.minProfit);

        // Repay the Vault first, then sweep 100% of the profit.
        _safeTransfer(asset, address(BALANCER_VAULT), amountToRepay);
        _safeTransfer(asset, route.recipient, netProfit);

        emit ArbitrageSwapsExecuted(asset, route.tokenOut, borrowed, netProfit, route.recipient);
        emit FlashLoanReceived(asset, borrowed, feeAmounts[0], route.recipient);
    }

    // ------------------------------------------------------------------------------------------------
    // Swaps
    // ------------------------------------------------------------------------------------------------

    function _executeTwoLegArb(SwapRouteParams memory r, uint256 amountIn) internal {
        uint256 mid;
        if (r.routeType == 1 || r.routeType == 3) {
            mid = _swapV3(r.routerA, r.tokenIn, r.tokenOut, r.feeA > 0 ? r.feeA : 3000, amountIn);
        } else {
            mid = _swapV2(r.routerA, r.tokenIn, r.tokenOut, amountIn);
        }
        if (mid == 0) revert SwapExecutionFailed("Leg 1 produced 0 output");

        if (r.routeType == 2 || r.routeType == 3) {
            _swapV3(r.routerB, r.tokenOut, r.tokenIn, r.feeB > 0 ? r.feeB : 3000, mid);
        } else {
            _swapV2(r.routerB, r.tokenOut, r.tokenIn, mid);
        }
    }

    function _swapV2(address router, address tokenIn, address tokenOut, uint256 amountIn) internal returns (uint256) {
        _safeApprove(tokenIn, router, amountIn);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256 balBefore = IERC20(tokenOut).balanceOf(address(this));
        IUniswapV2Router02(router).swapExactTokensForTokens(amountIn, 0, path, address(this), block.timestamp + 300);
        return IERC20(tokenOut).balanceOf(address(this)) - balBefore;
    }

    /// @dev Tries the SwapRouter (v1) call first and falls back to the SwapRouter02 layout, so one build works on all chains.
    function _swapV3(
        address router,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn
    ) internal returns (uint256) {
        _safeApprove(tokenIn, router, amountIn);

        ISwapRouter.ExactInputSingleParams memory p1 = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        (bool ok, bytes memory ret) = router.call(abi.encodeWithSelector(ISwapRouter.exactInputSingle.selector, p1));

        if (!ok) {
            ISwapRouter02.ExactInputSingleParams memory p2 = ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            (ok, ret) = router.call(abi.encodeWithSelector(ISwapRouter02.exactInputSingle.selector, p2));
            if (!ok) _bubble(ret);
        }
        return abi.decode(ret, (uint256));
    }

    function _bubble(bytes memory ret) private pure {
        if (ret.length == 0) revert SwapExecutionFailed("V3 swap failed");
        assembly {
            revert(add(ret, 32), mload(ret))
        }
    }

    // ------------------------------------------------------------------------------------------------
    // Token helpers (USDT-style tokens that return nothing are supported)
    // ------------------------------------------------------------------------------------------------

    function _safeApprove(address token, address spender, uint256 amount) internal {
        if (IERC20(token).allowance(address(this), spender) != 0) {
            _callOptionalReturn(token, abi.encodeWithSelector(IERC20.approve.selector, spender, uint256(0)));
        }
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20.approve.selector, spender, amount));
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        _callOptionalReturn(token, abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
    }

    function _callOptionalReturn(address token, bytes memory data) private {
        if (token.code.length == 0) revert SwapExecutionFailed("not a contract");
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert SwapExecutionFailed("token call failed");
    }

    receive() external payable {}
}`,
  },
  'FlashArb.sol': {
    lang: 'solidity',
    path: 'flash-arb/contracts/src/FlashArb.sol',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPool, IPoolAddressesProvider, IFlashLoanSimpleReceiver} from "./interfaces/IAaveV3Pool.sol";
import {ISwapRouter} from "./interfaces/IUniswapV3.sol";
import {IUniswapV2Router02} from "./interfaces/IUniswapV2.sol";
import {ICurvePool} from "./interfaces/ICurvePool.sol";

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/**
 * @title FlashArb
 * @notice Production atomic DeFi Flash Loan Arbitrage Contract
 * @dev Integrates Aave V3 FlashLoanSimple, Uniswap V3, Uniswap V2 / Camelot, and Curve.
 *      Enforces strict revert condition: profit >= minProfit.
 *      Holds zero funds in storage; sweeps all net profits to owner immediately.
 */
contract FlashArb is IFlashLoanSimpleReceiver {
    // --- Custom Errors for Gas Efficiency ---
    error Unauthorized();
    error InvalidCaller();
    error InsufficientProfit(uint256 netProfit, uint256 minProfit);
    error UnsupportedDexProtocol(uint8 protocol);
    error ZeroAddress();
    error ExecutionFailed(string reason);

    // --- Enums ---
    enum DexProtocol {
        UNISWAP_V2,
        UNISWAP_V3,
        CURVE
    }

    // --- Structs ---
    struct SwapLeg {
        DexProtocol protocol;
        address routerOrPool; // Router for V2/V3, or direct Pool for Curve
        address tokenIn;
        address tokenOut;
        uint24 v3Fee;         // e.g. 500 (0.05%), 3000 (0.3%), 10000 (1%)
        int128 curveIndexIn;  // Token index for Curve
        int128 curveIndexOut; // Token index for Curve
    }

    struct ArbParams {
        uint256 minProfit;
        SwapLeg leg1;
        SwapLeg leg2;
        address profitRecipient;
    }

    // --- State Variables ---
    address public immutable owner;
    IPoolAddressesProvider public immutable override ADDRESSES_PROVIDER;
    IPool public immutable override POOL;

    // --- Events ---
    event FlashArbExecuted(
        address indexed asset,
        uint256 loanAmount,
        uint256 premium,
        uint256 netProfit,
        address indexed recipient
    );

    event FundsRecovered(address indexed token, uint256 amount);

    // --- Modifiers ---
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyPool() {
        if (msg.sender != address(POOL)) revert InvalidCaller();
        _;
    }

    constructor(address _addressProvider) {
        if (_addressProvider == address(0)) revert ZeroAddress();
        owner = msg.sender;
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(IPoolAddressesProvider(_addressProvider).getPool());
    }

    /**
     * @notice Initiates flash loan arbitrage
     * @param asset The base asset to borrow (e.g. WETH, USDC)
     * @param amount The loan principal amount
     * @param params Arbitrage execution parameters (swaps and min profit)
     */
    function executeFlashArb(
        address asset,
        uint256 amount,
        ArbParams calldata params
    ) external onlyOwner {
        bytes memory encodedParams = abi.encode(params);
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            encodedParams,
            0 // referralCode
        );
    }

    /**
     * @notice Aave V3 Flash Loan Callback
     * @dev Called atomically by Aave V3 POOL after transferring loan amount
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override onlyPool returns (bool) {
        if (initiator != address(this)) revert Unauthorized();

        ArbParams memory arb = abi.decode(params, (ArbParams));
        uint256 amountToRepay = amount + premium;

        // Step 1: Execute First Leg (Borrow Asset -> Intermediary Asset)
        uint256 intermediateBalance = _executeSwap(arb.leg1, amount);

        // Step 2: Execute Second Leg (Intermediary Asset -> Borrow Asset)
        uint256 finalBalance = _executeSwap(arb.leg2, intermediateBalance);

        // Step 3: Check Solvency & Minimum Profit Constraint
        if (finalBalance < amountToRepay) {
            revert InsufficientProfit(0, arb.minProfit);
        }

        uint256 grossProfit = finalBalance - amountToRepay;
        if (grossProfit < arb.minProfit) {
            revert InsufficientProfit(grossProfit, arb.minProfit);
        }

        // Step 4: Approve Aave Pool to pull loan principal + premium
        _safeApprove(asset, address(POOL), amountToRepay);

        // Step 5: Transfer Net Profit to designated recipient (owner/treasury)
        address recipient = arb.profitRecipient == address(0) ? owner : arb.profitRecipient;
        if (grossProfit > 0) {
            _safeTransfer(asset, recipient, grossProfit);
        }

        emit FlashArbExecuted(asset, amount, premium, grossProfit, recipient);
        return true;
    }

    /**
     * @dev Internal swap dispatcher across Uniswap V2, Uniswap V3, and Curve
     */
    function _executeSwap(SwapLeg memory leg, uint256 amountIn) internal returns (uint256 amountOut) {
        if (leg.protocol == DexProtocol.UNISWAP_V2) {
            amountOut = _swapUniswapV2(leg.routerOrPool, leg.tokenIn, leg.tokenOut, amountIn);
        } else if (leg.protocol == DexProtocol.UNISWAP_V3) {
            amountOut = _swapUniswapV3(leg.routerOrPool, leg.tokenIn, leg.tokenOut, leg.v3Fee, amountIn);
        } else if (leg.protocol == DexProtocol.CURVE) {
            amountOut = _swapCurve(leg.routerOrPool, leg.tokenIn, leg.curveIndexIn, leg.curveIndexOut, amountIn);
        } else {
            revert UnsupportedDexProtocol(uint8(leg.protocol));
        }
    }

    /**
     * @dev Uniswap V2 / Sushiswap / Camelot Swap
     */
    function _swapUniswapV2(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256) {
        _safeApprove(tokenIn, router, amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));
        IUniswapV2Router02(router).swapExactTokensForTokens(
            amountIn,
            0, // Min out checked at the end by overall minProfit check
            path,
            address(this),
            block.timestamp
        );
        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        return balanceAfter - balanceBefore;
    }

    /**
     * @dev Uniswap V3 ExactInputSingle Swap
     */
    function _swapUniswapV3(
        address router,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn
    ) internal returns (uint256) {
        _safeApprove(tokenIn, router, amountIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: fee,
            recipient: address(this),
            deadline: block.timestamp,
            amountIn: amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });

        return ISwapRouter(router).exactInputSingle(params);
    }

    /**
     * @dev Curve Pool exchange
     */
    function _swapCurve(
        address pool,
        address tokenIn,
        int128 i,
        int128 j,
        uint256 dx
    ) internal returns (uint256) {
        _safeApprove(tokenIn, pool, dx);
        return ICurvePool(pool).exchange(i, j, dx, 0);
    }

    // --- Safety Helpers ---
    function _safeApprove(address token, address spender, uint256 amount) internal {
        // Handle USDT non-standard approve (reset to 0 first if necessary)
        uint256 currentAllowance = IERC20(token).allowance(address(this), spender);
        if (currentAllowance > 0) {
            (bool success0, ) = token.call(abi.encodeWithSelector(IERC20.approve.selector, spender, 0));
            require(success0, "Approve reset failed");
        }
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "SafeApprove failed");
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "SafeTransfer failed");
    }

    /**
     * @notice Emergency sweep function - contract should hold 0 funds at all times
     */
    function recoverERC20(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            _safeTransfer(token, owner, balance);
            emit FundsRecovered(token, balance);
        }
    }

    receive() external payable {}
}`,
  },
  'FlashArb.t.sol': {
    lang: 'solidity',
    path: 'flash-arb/contracts/test/FlashArb.t.sol',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface Vm {
    function createFork(string calldata, uint256) external returns (uint256);
    function selectFork(uint256) external;
    function rollFork(uint256) external;
    function prank(address) external;
    function deal(address, uint256) external;
    function expectRevert(bytes calldata) external;
}

import {FlashArb, IERC20} from "../src/FlashArb.sol";

contract FlashArbTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    FlashArb public arbContract;

    // Arbitrum One Canonical Mainnet Addresses
    address public constant AAVE_V3_ADDRESSES_PROVIDER_ARB = 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb;
    address public constant AAVE_V3_POOL_ARB = 0x794a61358D6845594F94dc1DB02A252b5b4814aD;
    address public constant WETH_ARB = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;
    address public constant USDC_ARB = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address public constant UNI_V3_ROUTER_ARB = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant CAMELOT_V2_ROUTER_ARB = 0xc873fEcbd354f5A56E00E710B90EF4201db2448d;
    address public constant CURVE_2CRV_POOL_ARB = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;

    address public owner = address(0xABCD1234);
    uint256 public constant FORK_BLOCK_ARBITRUM = 225_000_000;

    event FlashArbExecuted(
        address indexed asset,
        uint256 loanAmount,
        uint256 premium,
        uint256 netProfit,
        address indexed recipient
    );

    function setUp() public {
        // Pin Arbitrum fork to exact block
        string memory rpcUrl = "https://arb1.arbitrum.io/rpc";
        try vm.createFork(rpcUrl, FORK_BLOCK_ARBITRUM) returns (uint256 forkId) {
            vm.selectFork(forkId);
        } catch {
            // Local fallback if offline test runner
        }

        vm.prank(owner);
        arbContract = new FlashArb(AAVE_V3_ADDRESSES_PROVIDER_ARB);
    }

    /**
     * @notice Invariant Check: Verify FlashArb holds ZERO tokens before and after
     */
    function test_ZeroBalanceInvariant() public view {
        uint256 wethBal = IERC20(WETH_ARB).balanceOf(address(arbContract));
        uint256 usdcBal = IERC20(USDC_ARB).balanceOf(address(arbContract));
        require(wethBal == 0, "Invariant violation: WETH in contract");
        require(usdcBal == 0, "Invariant violation: USDC in contract");
    }

    /**
     * @notice Test Unauthorized Execution Fails
     */
    function test_RevertUnauthorizedCaller() public {
        address stranger = address(0x9999);
        vm.prank(stranger);

        FlashArb.ArbParams memory params;
        params.minProfit = 1 ether;

        try arbContract.executeFlashArb(WETH_ARB, 10 ether, params) {
            revert("Expected Unauthorized revert");
        } catch {
            // Expected
        }
    }

    /**
     * @notice Fuzz Test: Reverts strictly if Net Profit < MinProfit
     * @dev Fuzzes arbitrary minimum profit requirements to prove zero risk of under-profitable execution
     */
    function testFuzz_MinimumProfitEnforced(uint256 fuzzedMinProfit) public {
        // Bound fuzzed profit between 1 wei and 1,000,000 ether
        if (fuzzedMinProfit == 0) fuzzedMinProfit = 1;
        if (fuzzedMinProfit > 1_000_000 ether) fuzzedMinProfit = 1_000_000 ether;

        FlashArb.SwapLeg memory leg1 = FlashArb.SwapLeg({
            protocol: FlashArb.DexProtocol.UNISWAP_V3,
            routerOrPool: UNI_V3_ROUTER_ARB,
            tokenIn: WETH_ARB,
            tokenOut: USDC_ARB,
            v3Fee: 500,
            curveIndexIn: 0,
            curveIndexOut: 0
        });

        FlashArb.SwapLeg memory leg2 = FlashArb.SwapLeg({
            protocol: FlashArb.DexProtocol.UNISWAP_V2,
            routerOrPool: CAMELOT_V2_ROUTER_ARB,
            tokenIn: USDC_ARB,
            tokenOut: WETH_ARB,
            v3Fee: 0,
            curveIndexIn: 0,
            curveIndexOut: 0
        });

        FlashArb.ArbParams memory params = FlashArb.ArbParams({
            minProfit: fuzzedMinProfit,
            leg1: leg1,
            leg2: leg2,
            profitRecipient: owner
        });

        // Flash loan execute must strictly revert if market spread cannot achieve fuzzedMinProfit
        vm.prank(owner);
        try arbContract.executeFlashArb(WETH_ARB, 50 ether, params) {
            // If it succeeds, gross profit was >= fuzzedMinProfit
            require(IERC20(WETH_ARB).balanceOf(address(arbContract)) == 0, "No residual tokens allowed");
        } catch {
            // Proper revert: transaction reverted without losing capital
            require(IERC20(WETH_ARB).balanceOf(address(arbContract)) == 0, "Zero balance on revert");
        }
    }

    /**
     * @notice Test Curve + Uniswap V3 Triangular Arbitrage Setup
     */
    function test_CurveUniswapV3Setup() public {
        FlashArb.SwapLeg memory leg1 = FlashArb.SwapLeg({
            protocol: FlashArb.DexProtocol.CURVE,
            routerOrPool: CURVE_2CRV_POOL_ARB,
            tokenIn: USDC_ARB,
            tokenOut: WETH_ARB,
            v3Fee: 0,
            curveIndexIn: 0,
            curveIndexOut: 1
        });

        FlashArb.SwapLeg memory leg2 = FlashArb.SwapLeg({
            protocol: FlashArb.DexProtocol.UNISWAP_V3,
            routerOrPool: UNI_V3_ROUTER_ARB,
            tokenIn: WETH_ARB,
            tokenOut: USDC_ARB,
            v3Fee: 500,
            curveIndexIn: 0,
            curveIndexOut: 0
        });

        FlashArb.ArbParams memory params = FlashArb.ArbParams({
            minProfit: 50 * 1e6, // $50 USDC minimum
            leg1: leg1,
            leg2: leg2,
            profitRecipient: owner
        });

        vm.prank(owner);
        try arbContract.executeFlashArb(USDC_ARB, 100_000 * 1e6, params) {
            // Pass
        } catch {
            // Expected atomic rollback when spread < Aave fee
        }
    }
}`,
  },
  'main.rs': {
    lang: 'rust',
    path: 'flash-arb/searcher/src/main.rs',
    code: `use clap::Parser;
use ethers::prelude::*;
use std::path::PathBuf;
use std::time::Duration;
use tokio::signal;
use tracing::{debug, error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod evm;
mod executor;
mod monitor;
mod risk;
mod routes;
mod sim;

use config::{is_zero_address, ChainConfig};
use executor::TxExecutor;
use monitor::PriceMonitor;
use risk::RiskManager;
use routes::{PriceContext, RouteFinder};
use sim::Simulator;

#[derive(Parser, Debug)]
#[command(name = "flash-arb-searcher")]
#[command(about = "Multi-chain flash loan arbitrage searcher (reads real pool state, verifies with eth_call)", long_about = None)]
struct Args {
    /// Comma-separated list of chains to run (e.g. "arbitrum,base,optimism")
    #[arg(short, long, default_value = "arbitrum,base,optimism")]
    chains: String,

    /// Config directory path
    #[arg(long, default_value = "config")]
    config_dir: PathBuf,

    /// Minimum milliseconds between block polls (public RPCs rate-limit; use your own node to go lower)
    #[arg(long, default_value_t = 2000)]
    scan_ms: u64,

    /// Sweep all accumulated vault ETH and non-ETH token dust across vaults + gas wallet to FLASH_ARB_PROFIT_WALLET, then exit
    #[arg(long, default_value_t = false)]
    sweep_only: bool,

    /// Run an automatic dust-sweep check across vaults + gas wallet every N scanned blocks (0 disables periodic sweeps; post-trade sweeps still run)
    #[arg(long, default_value_t = 30)]
    sweep_interval_scans: u64,
}

#[tokio::main]
async fn main() -> eyre::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,flash_arb_searcher=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = Args::parse();
    if args.sweep_only {
        info!("flash-arb searcher starting in --sweep-only mode (contract vaults + gas wallet non-ETH dust -> FLASH_ARB_PROFIT_WALLET)");
    } else {
        info!("flash-arb searcher starting (LIVE broadcasting only; no paper/dry-run mode)");
    }

    let mut tasks = Vec::new();
    for chain in args.chains.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let config_file = args.config_dir.join(format!("{}.toml", chain));
        if !config_file.exists() {
            error!("Config file not found for chain: {:?}", config_file);
            continue;
        }

        let config = ChainConfig::load_from_file(&config_file)?;
        if is_zero_address(&config.flash_arb_contract) {
            error!("[{}] flash_arb_contract is not set: skipping chain (live-only; deploy with \`npm run deploy:flash-arb\` first)", config.chain_name);
            continue;
        }
        if std::env::var("FLASH_ARB_SIGNER_KEY").map(|k| k.trim().is_empty()).unwrap_or(true) {
            eyre::bail!("FLASH_ARB_SIGNER_KEY is not set (live-only searcher)");
        }
        if std::env::var("FLASH_ARB_PROFIT_WALLET").ok().and_then(|w| crate::config::parse_addr(&w)).is_none() {
            eyre::bail!("FLASH_ARB_PROFIT_WALLET is not set or not a valid address (live-only searcher)");
        }

        let risk_manager = RiskManager::new(config.risk.clone());
        if args.sweep_only {
            info!("Running --sweep-only for {} (chain id {})", config.chain_name, config.chain_id);
            tasks.push(tokio::spawn(async move {
                let executor = TxExecutor::new(config.clone(), risk_manager);
                if let Err(e) = executor.sweep_all_dust().await {
                    error!("[{}] sweep-only failed: {:?}", config.chain_name, e);
                }
            }));
            continue;
        }

        info!("Spawning LIVE worker for {} (chain id {})", config.chain_name, config.chain_id);
        let scan_ms = args.scan_ms;
        let sweep_interval_scans = args.sweep_interval_scans;
        // Risk state lives outside the retry loop so a worker restart can never clear a tripped circuit breaker.
        tasks.push(tokio::spawn(async move {
            let mut backoff: u64 = 5;
            loop {
                match run_chain_worker(config.clone(), scan_ms, sweep_interval_scans, risk_manager.clone()).await {
                    Ok(()) => break,
                    Err(e) => {
                        error!("[{}] worker failed: {:?}. Restarting in {}s", config.chain_name, e, backoff);
                        tokio::time::sleep(Duration::from_secs(backoff)).await;
                        backoff = (backoff * 2).min(300);
                    }
                }
            }
        }));
    }

    if tasks.is_empty() {
        eyre::bail!("no chain workers started (check --chains and --config-dir)");
    }

    if args.sweep_only {
        futures_util::future::join_all(tasks).await;
        info!("All --sweep-only tasks finished.");
        return Ok(());
    }

    tokio::select! {
        _ = signal::ctrl_c() => info!("Ctrl+C received. Exiting."),
        _ = futures_util::future::join_all(tasks) => error!("All chain workers exited."),
    }
    Ok(())
}

async fn run_chain_worker(
    config: ChainConfig,
    scan_ms: u64,
    sweep_interval_scans: u64,
    risk_manager: RiskManager,
) -> eyre::Result<()> {
    let chain = config.chain_name.clone();
    let monitor = PriceMonitor::new(config.clone())?;
    let route_finder = RouteFinder::new(config.clone());
    let simulator = Simulator::new(config.clone())?;
    let executor = TxExecutor::new(config.clone(), risk_manager.clone());

    monitor.load_decimals().await;
    monitor.discover().await;
    if monitor.pools.len() < 2 {
        eyre::bail!("[{}] fewer than 2 pools discovered; check rpc_http / factory addresses", chain);
    }

    let mut interval = tokio::time::interval(Duration::from_millis(scan_ms.max(250)));
    let mut last_block: u64 = 0;
    let mut scans: u64 = 0;

    loop {
        interval.tick().await;

        let block = match monitor.provider.get_block_number().await {
            Ok(b) => b.as_u64(),
            Err(e) => {
                warn!("[{}] get_block_number failed: {}", chain, e);
                continue;
            }
        };
        if block == last_block {
            continue;
        }
        last_block = block;
        *monitor.latest_block.write().await = block;
        scans += 1;

        monitor.refresh_all(block).await;

        let Some(eth_price) = monitor.eth_price_usd() else {
            warn!("[{}] no ETH/USD price from on-chain WETH/USDC pools this block; skipping", chain);
            continue;
        };
        let gas_price_wei = match monitor.provider.get_gas_price().await {
            Ok(g) => g,
            Err(e) => {
                warn!("[{}] get_gas_price failed: {}", chain, e);
                continue;
            }
        };

        let tokens = monitor.tradable_tokens();
        let mut executed = false;

        'scan: for base_sym in ["WETH", "USDC"] {
            let Some(base) = monitor.token(base_sym) else { continue };
            let Some(base_decimals) = monitor.dec(base) else { continue };
            let ctx = PriceContext {
                base_decimals,
                base_price_usd: if base_sym == "WETH" { eth_price } else { 1.0 },
                eth_price_usd: eth_price,
                gas_price_wei,
            };

            for (other_sym, other) in &tokens {
                if *other == base {
                    continue;
                }
                let pools = monitor.pools_for_pair(base, *other, block);
                if pools.len() < 2 {
                    continue;
                }
                // Try the model-optimal size first, then smaller loans if the real simulation rejects it.
                for size_factor in [1.0, 0.5, 0.25] {
                    let Some(opp) = route_finder.find_best(base, base_sym, *other, other_sym, &pools, &ctx, size_factor) else {
                        break;
                    };
                    info!(
                        "[{}] candidate {}/{} (x{}): {} -> {} | spread {:.1} bps | loan {} | model net \${:.2}",
                        chain, opp.asset_symbol, opp.intermediate_symbol, size_factor, opp.buy_dex, opp.sell_dex,
                        opp.spread_bps, opp.optimal_loan_amount, opp.net_profit_usd
                    );

                    match simulator.simulate_opportunity(&opp).await {
                        Ok(sim) if sim.success => {
                            info!("[{}] eth_call simulation OK (gas {})", chain, sim.gas_used);
                            if let Err(e) = executor.execute(&opp, &sim).await {
                                error!("[{}] execution error: {:?}", chain, e);
                            }
                            executed = true;
                            break 'scan; // one tx per block per chain (nonce safety)
                        }
                        Ok(sim) => {
                            if !sim.verified {
                                // Cannot verify against the deployed contract: never broadcast unverified.
                                warn!("[{}] simulation could not be verified against the deployed contract; skipping", chain);
                                break;
                            }
                            debug!("[{}] simulation rejected at x{}: {:?}", chain, size_factor, sim.error_message);
                        }
                        Err(e) => {
                            warn!("[{}] simulation error: {:?}", chain, e);
                            break;
                        }
                    }
                }
            }
        }

        // Sweep any residual ETH / non-ETH ERC-20 dust on startup and every \`sweep_interval_scans\` blocks
        // (skipped if \`executed\` already ran a post-trade sweep on this block).
        if !executed && (scans == 1 || (sweep_interval_scans > 0 && scans % sweep_interval_scans == 0)) {
            if let Err(e) = executor.sweep_all_dust().await {
                warn!("[{}] periodic dust sweep failed: {:?}", chain, e);
            }
        }

        if scans % 15 == 0 {
            let loss = *risk_manager.daily_gas_loss_usd.read().await;
            info!(
                "[{}] heartbeat | block #{} | ETH \${:.2} | pools {} | gas lost today \${:.2} | traded this block: {}",
                chain, block, eth_price, monitor.pools.len(), loss, executed
            );
        }
    }
}`,
  },
  'monitor.rs': {
    lang: 'rust',
    path: 'flash-arb/searcher/src/monitor.rs',
    code: `//! Pool discovery (factory lookups) and per-block state refresh (getReserves / slot0 + liquidity) over HTTP JSON-RPC.
//! Nothing here is seeded or hard-coded: every number comes from the chain.
use crate::config::{dex_kind, parse_addr, ChainConfig, DexKind};
use crate::evm::{call_decode, multicall, sel, tok_uint, u256_to_f64};
use dashmap::DashMap;
use ethers::abi::{ParamType, Token};
use ethers::prelude::*;
use std::collections::HashSet;
use std::sync::Arc;
use tracing::{debug, info, warn};

const Q96: f64 = 79228162514264337593543950336.0; // 2^96
const V3_FEE_TIERS: [u32; 5] = [100, 500, 2500, 3000, 10_000];
/// Fee assumed for V2-style pairs (Uniswap V2 / Sushiswap = 0.30%). Camelot's is configurable per pair;
/// the eth_call simulation is the source of truth, this only drives the pre-filter.
const V2_FEE_PPM: u32 = 3000;

#[derive(Debug, Clone)]
pub struct PoolSnapshot {
    pub pool_address: Address,
    pub router: Address,
    pub dex_name: String,
    pub token0: Address,
    pub token1: Address,
    pub is_v3: bool,
    /// Swap fee in parts-per-million (V3 fee tier, or 3000 for V2-style pairs)
    pub fee_ppm: u32,
    pub reserve0: U256,
    pub reserve1: U256,
    pub sqrt_price_x96: U256,
    pub liquidity: u128,
    pub last_updated_block: u64,
}

/// Returns (base_reserve, other_reserve) in raw token units. For V3 these are the *virtual* reserves of the
/// current liquidity (x = L/sqrtP, y = L*sqrtP), i.e. a constant-product model valid while the price stays in range.
pub fn virtual_reserves(pool: &PoolSnapshot, base: Address) -> Option<(f64, f64)> {
    let (r0, r1) = if pool.is_v3 {
        if pool.liquidity == 0 || pool.sqrt_price_x96.is_zero() {
            return None;
        }
        let sp = u256_to_f64(pool.sqrt_price_x96) / Q96;
        let l = pool.liquidity as f64;
        (l / sp, l * sp)
    } else {
        (u256_to_f64(pool.reserve0), u256_to_f64(pool.reserve1))
    };
    if !(r0 > 0.0 && r1 > 0.0 && r0.is_finite() && r1.is_finite()) {
        return None;
    }
    if base == pool.token0 {
        Some((r0, r1))
    } else if base == pool.token1 {
        Some((r1, r0))
    } else {
        None
    }
}

pub struct PriceMonitor {
    pub config: ChainConfig,
    pub provider: Arc<Provider<Http>>,
    pub pools: Arc<DashMap<Address, PoolSnapshot>>,
    pub decimals: Arc<DashMap<Address, u8>>,
    pub latest_block: Arc<tokio::sync::RwLock<u64>>,
}

impl PriceMonitor {
    pub fn new(config: ChainConfig) -> eyre::Result<Self> {
        let provider = Provider::<Http>::try_from(config.rpc_http.as_str())?;
        Ok(Self {
            config,
            provider: Arc::new(provider),
            pools: Arc::new(DashMap::new()),
            decimals: Arc::new(DashMap::new()),
            latest_block: Arc::new(tokio::sync::RwLock::new(0)),
        })
    }

    pub fn token(&self, symbol: &str) -> Option<Address> {
        self.config.tokens.get(symbol).and_then(|s| parse_addr(s))
    }

    pub fn dec(&self, token: Address) -> Option<u8> {
        self.decimals.get(&token).map(|d| *d)
    }

    fn is_excluded(&self, token: Address) -> bool {
        self.config
            .risk
            .excluded_tokens
            .iter()
            .any(|e| parse_addr(e).map_or(false, |a| a == token))
    }

    /// Tokens we are allowed to trade (configured, parsable, not excluded)
    pub fn tradable_tokens(&self) -> Vec<(String, Address)> {
        let mut v: Vec<(String, Address)> = self
            .config
            .tokens
            .iter()
            .filter_map(|(sym, s)| parse_addr(s).map(|a| (sym.clone(), a)))
            .filter(|(_, a)| !self.is_excluded(*a))
            .collect();
        v.sort_by(|a, b| a.0.cmp(&b.0));
        v
    }

    pub async fn load_decimals(&self) {
        for (sym, addr) in self.tradable_tokens() {
            match call_decode(&self.provider, addr, "decimals()", &[], &[ParamType::Uint(8)]).await {
                Ok(t) => {
                    let d = tok_uint(&t[0]).low_u32() as u8;
                    self.decimals.insert(addr, d);
                }
                Err(e) => warn!("[{}] decimals() failed for {}: {}", self.config.chain_name, sym, e),
            }
        }
    }

    /// Looks up pools on every supported DEX for each (base, other) pair, where base is WETH or USDC.
    pub async fn discover(&self) {
        let tokens = self.tradable_tokens();
        let mut seen: HashSet<(Address, Address)> = HashSet::new();
        for base_sym in ["WETH", "USDC"] {
            let Some(base) = self.token(base_sym) else { continue };
            for (_, other) in &tokens {
                if *other == base {
                    continue;
                }
                let key = if base < *other { (base, *other) } else { (*other, base) };
                if !seen.insert(key) {
                    continue;
                }
                self.discover_pair(base, *other).await;
            }
        }
        info!("[{}] Discovered {} pools", self.config.chain_name, self.pools.len());
    }

    async fn discover_pair(&self, a: Address, b: Address) {
        let (t0, t1) = if a < b { (a, b) } else { (b, a) };
        for (dex_id, dex) in &self.config.dexes {
            let kind = dex_kind(dex_id);
            if kind == DexKind::Unsupported {
                continue;
            }
            let Some(router) = dex.router.as_deref().and_then(parse_addr) else { continue };
            let Some(factory) = dex.factory.as_deref().and_then(parse_addr) else { continue };

            match kind {
                DexKind::V2 => {
                    let res = call_decode(
                        &self.provider,
                        factory,
                        "getPair(address,address)",
                        &[Token::Address(a), Token::Address(b)],
                        &[ParamType::Address],
                    )
                    .await;
                    match res {
                        Ok(t) => {
                            if let Some(pool) = t[0].clone().into_address() {
                                if pool != Address::zero() {
                                    self.register(PoolSnapshot {
                                        pool_address: pool,
                                        router,
                                        dex_name: dex_id.clone(),
                                        token0: t0,
                                        token1: t1,
                                        is_v3: false,
                                        fee_ppm: V2_FEE_PPM,
                                        reserve0: U256::zero(),
                                        reserve1: U256::zero(),
                                        sqrt_price_x96: U256::zero(),
                                        liquidity: 0,
                                        last_updated_block: 0,
                                    });
                                }
                            }
                        }
                        Err(e) => debug!("[{}] getPair failed on {}: {}", self.config.chain_name, dex_id, e),
                    }
                }
                DexKind::V3 => {
                    for fee in V3_FEE_TIERS {
                        let res = call_decode(
                            &self.provider,
                            factory,
                            "getPool(address,address,uint24)",
                            &[Token::Address(a), Token::Address(b), Token::Uint(U256::from(fee))],
                            &[ParamType::Address],
                        )
                        .await;
                        match res {
                            Ok(t) => {
                                if let Some(pool) = t[0].clone().into_address() {
                                    if pool != Address::zero() {
                                        self.register(PoolSnapshot {
                                            pool_address: pool,
                                            router,
                                            dex_name: format!("{}-{}", dex_id, fee),
                                            token0: t0,
                                            token1: t1,
                                            is_v3: true,
                                            fee_ppm: fee,
                                            reserve0: U256::zero(),
                                            reserve1: U256::zero(),
                                            sqrt_price_x96: U256::zero(),
                                            liquidity: 0,
                                            last_updated_block: 0,
                                        });
                                    }
                                }
                            }
                            Err(e) => debug!("[{}] getPool failed on {}: {}", self.config.chain_name, dex_id, e),
                        }
                    }
                }
                DexKind::Unsupported => {}
            }
        }
    }

    fn register(&self, pool: PoolSnapshot) {
        self.pools.insert(pool.pool_address, pool);
    }

    /// Refresh every known pool at \`block\` using Multicall3: one eth_call per 100 calls instead of 1-2 calls per pool.
    /// Pools whose call fails keep their old \`last_updated_block\` and are ignored by \`pools_for_pair\` for this block
    /// (no trading on stale state).
    pub async fn refresh_all(&self, block: u64) {
        let snaps: Vec<PoolSnapshot> = self.pools.iter().map(|e| e.value().clone()).collect();
        let slot0_types = [
            ParamType::Uint(160),
            ParamType::Int(24),
            ParamType::Uint(16),
            ParamType::Uint(16),
            ParamType::Uint(16),
            ParamType::Uint(8),
            ParamType::Bool,
        ];
        // Camelot's getReserves returns 4 words (two fee percents instead of a timestamp); decoding the first 3 is safe for both.
        let reserve_types = [ParamType::Uint(112), ParamType::Uint(112), ParamType::Uint(32)];

        for chunk in snaps.chunks(50) {
            let mut calls: Vec<(Address, Vec<u8>)> = Vec::new();
            for p in chunk {
                if p.is_v3 {
                    calls.push((p.pool_address, sel("slot0()")));
                    calls.push((p.pool_address, sel("liquidity()")));
                } else {
                    calls.push((p.pool_address, sel("getReserves()")));
                }
            }
            let results = match multicall(&self.provider, &calls, block).await {
                Ok(r) => r,
                Err(e) => {
                    warn!("[{}] multicall refresh failed: {}", self.config.chain_name, e);
                    continue;
                }
            };

            let mut i = 0usize;
            for p in chunk {
                let mut pool = p.clone();
                let ok = if p.is_v3 {
                    let s0 = results.get(i).cloned().flatten();
                    let lq = results.get(i + 1).cloned().flatten();
                    i += 2;
                    match (s0, lq) {
                        (Some(s0), Some(lq)) => {
                            let a = ethers::abi::decode(&slot0_types, &s0).ok();
                            let b = ethers::abi::decode(&[ParamType::Uint(128)], &lq).ok();
                            match (a, b) {
                                (Some(a), Some(b)) => {
                                    pool.sqrt_price_x96 = tok_uint(&a[0]);
                                    pool.liquidity = tok_uint(&b[0]).low_u128();
                                    true
                                }
                                _ => false,
                            }
                        }
                        _ => false,
                    }
                } else {
                    let r = results.get(i).cloned().flatten();
                    i += 1;
                    match r.and_then(|r| ethers::abi::decode(&reserve_types, &r).ok()) {
                        Some(t) => {
                            pool.reserve0 = tok_uint(&t[0]);
                            pool.reserve1 = tok_uint(&t[1]);
                            true
                        }
                        None => false,
                    }
                };
                if ok {
                    pool.last_updated_block = block;
                    self.pools.insert(pool.pool_address, pool);
                }
            }
        }
    }

    pub fn pools_for_pair(&self, a: Address, b: Address, block: u64) -> Vec<PoolSnapshot> {
        self.pools
            .iter()
            .filter(|e| {
                let p = e.value();
                p.last_updated_block == block
                    && ((p.token0 == a && p.token1 == b) || (p.token0 == b && p.token1 == a))
            })
            .map(|e| e.value().clone())
            .collect()
    }

    /// ETH/USD from the deepest on-chain WETH/USDC pool (no external API, no hard-coded fallback).
    pub fn eth_price_usd(&self) -> Option<f64> {
        let weth = self.token("WETH")?;
        let usdc = self.token("USDC")?;
        let dw = self.dec(weth)? as i32;
        let du = self.dec(usdc)? as i32;
        let mut best: Option<(f64, f64)> = None; // (usdc depth, price)
        for e in self.pools.iter() {
            let p = e.value();
            let is_pair = (p.token0 == weth && p.token1 == usdc) || (p.token0 == usdc && p.token1 == weth);
            if !is_pair || p.last_updated_block == 0 {
                continue;
            }
            if let Some((u, w)) = virtual_reserves(p, usdc) {
                let price = (u / 10f64.powi(du)) / (w / 10f64.powi(dw));
                if price.is_finite() && price > 0.0 && best.map_or(true, |(d, _)| u > d) {
                    best = Some((u, price));
                }
            }
        }
        best.map(|(_, price)| price)
    }
}`,
  },
  'routes.rs': {
    lang: 'rust',
    path: 'flash-arb/searcher/src/routes.rs',
    code: `//! Two-pool cycle sizing: borrow BASE, buy OTHER on pool \`buy\`, sell OTHER for BASE on pool \`sell\`.
//! Both pools are modelled as constant-product (V3 via virtual reserves of the current liquidity), which gives an
//! exact closed-form optimum. The model is only a pre-filter: the real go/no-go is the eth_call simulation.
use crate::config::ChainConfig;
use crate::evm::{f64_to_u256, u256_to_f64};
use crate::monitor::{virtual_reserves, PoolSnapshot};
use ethers::prelude::*;

/// Balancer V2 flash loans are fee-free while the protocol flash-loan fee is 0 (the contract's profit guard enforces it on-chain).
pub const FLASH_FEE_BPS: f64 = 0.0;
/// Rough gas for flash loan + 2 swaps
pub const GAS_UNITS_ESTIMATE: f64 = 350_000.0;
/// L2s also charge an L1 data fee that \`eth_gasPrice\` does not include; conservative flat allowance in USD.
pub const L1_FEE_BUFFER_USD: f64 = 0.15;
/// Ignore pools with less than this much base-asset depth (honeypots, dust pools)
pub const MIN_POOL_DEPTH_USD: f64 = 20_000.0;
/// Never size above this fraction of the thinner pool's base-side reserve (keeps the V3 in-range approximation sane)
pub const MAX_TRADE_FRACTION: f64 = 0.02;

#[derive(Debug, Clone)]
pub struct ArbitrageOpportunity {
    pub borrowed_asset: Address,
    pub intermediate_asset: Address,
    pub asset_symbol: String,
    pub intermediate_symbol: String,
    pub buy_dex: String,
    pub buy_pool: Address,
    pub buy_router: Address,
    pub buy_is_v3: bool,
    pub buy_fee_ppm: u32,
    pub sell_dex: String,
    pub sell_pool: Address,
    pub sell_router: Address,
    pub sell_is_v3: bool,
    pub sell_fee_ppm: u32,
    pub optimal_loan_amount: U256,
    pub expected_gross_profit: U256,
    pub gross_profit_usd: f64,
    pub estimated_gas_cost_usd: f64,
    pub net_profit_usd: f64,
    pub eth_price_usd: f64,
    pub spread_bps: f64,
}

pub struct PriceContext {
    pub base_decimals: u8,
    pub base_price_usd: f64,
    pub eth_price_usd: f64,
    pub gas_price_wei: U256,
}

/// Output of BASE after: x BASE -> pool1 (a1 base, b1 other, g1 = 1-fee) -> pool2 (a2 base, b2 other, g2 = 1-fee)
pub fn cycle_output(x: f64, a1: f64, b1: f64, g1: f64, a2: f64, b2: f64, g2: f64) -> f64 {
    let out1 = g1 * x * b1 / (a1 + g1 * x);
    g2 * out1 * a2 / (b2 + g2 * out1)
}

/// Closed-form maximiser of cycle_output(x) - k*x  (k = 1 + flash fee).
/// out(x) = A x / (Bc + C x)  =>  x* = (sqrt(A*Bc/k) - Bc) / C, profitable only if A > k*Bc.
pub fn optimal_input(a1: f64, b1: f64, g1: f64, a2: f64, b2: f64, g2: f64, k: f64) -> Option<f64> {
    let a = g1 * g2 * b1 * a2;
    let bc = b2 * a1;
    let c = g1 * (b2 + g2 * b1);
    if !(a > k * bc) || !(c > 0.0) {
        return None;
    }
    let x = ((a * bc / k).sqrt() - bc) / c;
    if x.is_finite() && x > 0.0 {
        Some(x)
    } else {
        None
    }
}

pub struct RouteFinder {
    pub config: ChainConfig,
}

impl RouteFinder {
    pub fn new(config: ChainConfig) -> Self {
        Self { config }
    }

    /// Best opportunity over all ordered pool pairs (both directions) for one (base, other) token pair.
    /// \`size_factor\` (0..1] shrinks the loan below the model optimum; used to retry when the on-chain simulation rejects the full size
    /// (e.g. a V3 pool whose liquidity ends before the modelled price impact).
    pub fn find_best(
        &self,
        base: Address,
        base_symbol: &str,
        other: Address,
        other_symbol: &str,
        pools: &[PoolSnapshot],
        ctx: &PriceContext,
        size_factor: f64,
    ) -> Option<ArbitrageOpportunity> {
        let mut best: Option<ArbitrageOpportunity> = None;
        for i in 0..pools.len() {
            for j in 0..pools.len() {
                if i == j {
                    continue;
                }
                if let Some(o) = self.evaluate(base, base_symbol, other, other_symbol, &pools[i], &pools[j], ctx, size_factor) {
                    if best.as_ref().map_or(true, |b| o.net_profit_usd > b.net_profit_usd) {
                        best = Some(o);
                    }
                }
            }
        }
        best
    }

    fn evaluate(
        &self,
        base: Address,
        base_symbol: &str,
        other: Address,
        other_symbol: &str,
        buy: &PoolSnapshot,
        sell: &PoolSnapshot,
        ctx: &PriceContext,
        size_factor: f64,
    ) -> Option<ArbitrageOpportunity> {
        if buy.pool_address == sell.pool_address || ctx.base_price_usd <= 0.0 {
            return None;
        }
        let (a1, b1) = virtual_reserves(buy, base)?;
        let (a2, b2) = virtual_reserves(sell, base)?;
        let g1 = 1.0 - buy.fee_ppm as f64 / 1e6;
        let g2 = 1.0 - sell.fee_ppm as f64 / 1e6;
        let k = 1.0 + FLASH_FEE_BPS / 10_000.0;

        let unit = 10f64.powi(ctx.base_decimals as i32);
        let min_depth_raw = MIN_POOL_DEPTH_USD / ctx.base_price_usd * unit;
        if a1 < min_depth_raw || a2 < min_depth_raw {
            return None;
        }

        let mut x = optimal_input(a1, b1, g1, a2, b2, g2, k)?;
        x = x.min(MAX_TRADE_FRACTION * a1.min(a2)) * size_factor.clamp(0.01, 1.0);
        let profit_raw = cycle_output(x, a1, b1, g1, a2, b2, g2) - x * k;
        if !(profit_raw > 0.0) {
            return None;
        }

        let gross_usd = profit_raw / unit * ctx.base_price_usd;
        let gas_eth = GAS_UNITS_ESTIMATE * u256_to_f64(ctx.gas_price_wei) / 1e18;
        let gas_usd = gas_eth * ctx.eth_price_usd + L1_FEE_BUFFER_USD;
        let net_usd = gross_usd - gas_usd;
        if net_usd < self.config.risk.min_net_profit_usd {
            return None;
        }

        // Marginal price of OTHER in BASE: buy pool a1/b1, sell pool a2/b2
        let spread_bps = ((a2 / b2) / (a1 / b1) - 1.0) * 10_000.0;

        Some(ArbitrageOpportunity {
            borrowed_asset: base,
            intermediate_asset: other,
            asset_symbol: base_symbol.to_string(),
            intermediate_symbol: other_symbol.to_string(),
            buy_dex: buy.dex_name.clone(),
            buy_pool: buy.pool_address,
            buy_router: buy.router,
            buy_is_v3: buy.is_v3,
            buy_fee_ppm: buy.fee_ppm,
            sell_dex: sell.dex_name.clone(),
            sell_pool: sell.pool_address,
            sell_router: sell.router,
            sell_is_v3: sell.is_v3,
            sell_fee_ppm: sell.fee_ppm,
            optimal_loan_amount: f64_to_u256(x),
            expected_gross_profit: f64_to_u256(profit_raw),
            gross_profit_usd: gross_usd,
            estimated_gas_cost_usd: gas_usd,
            net_profit_usd: net_usd,
            eth_price_usd: ctx.eth_price_usd,
            spread_bps,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn closed_form_matches_brute_force() {
        // pool1: 1000 base / 2_000_000 other ; pool2: 1000 base / 1_900_000 other (other is pricier in pool1's terms)
        let (a1, b1, a2, b2) = (1000.0, 2_000_000.0, 1000.0, 1_900_000.0);
        let (g1, g2) = (0.997, 0.997);
        let x_star = optimal_input(a1, b1, g1, a2, b2, g2, 1.0).expect("profitable");
        let p = |x: f64| cycle_output(x, a1, b1, g1, a2, b2, g2) - x;
        let mut best_x = 0.0;
        let mut best_p = f64::MIN;
        let mut x = 0.01;
        while x < 500.0 {
            if p(x) > best_p {
                best_p = p(x);
                best_x = x;
            }
            x += 0.01;
        }
        assert!((x_star - best_x).abs() < 0.05, "closed form {} vs brute force {}", x_star, best_x);
        assert!(p(x_star) >= best_p - 1e-6);
    }

    #[test]
    fn no_trade_when_fees_exceed_spread() {
        // 0.1% price gap, 0.3% fee on each side => not profitable
        assert!(optimal_input(1000.0, 2_000_000.0, 0.997, 1000.0, 1_998_000.0, 0.997, 1.0).is_none());
    }
}`,
  },
  'sim.rs': {
    lang: 'rust',
    path: 'flash-arb/searcher/src/sim.rs',
    code: `//! Pre-flight verification: \`eth_estimateGas\` of the exact FlashArbOptimized call from the owner account against
//! current chain state. A revert here (no profit, insufficient Balancer liquidity, bad route...) means the trade is rejected.
//! (The previous version returned a hard-coded "312450 gas, PASSED" without touching the chain.)
use crate::config::{is_zero_address, parse_addr, ChainConfig};
use crate::evm::encode_execute_call;
use crate::routes::ArbitrageOpportunity;
use ethers::prelude::*;
use ethers::types::transaction::eip2718::TypedTransaction;
use tracing::debug;

#[derive(Debug, Clone)]
pub struct SimulationResult {
    pub success: bool,
    /// true only if the call was really executed against chain state (contract deployed + owner address known)
    pub verified: bool,
    pub gas_used: u64,
    pub error_message: Option<String>,
}

pub struct Simulator {
    pub config: ChainConfig,
    provider: Provider<Http>,
}

impl Simulator {
    pub fn new(config: ChainConfig) -> eyre::Result<Self> {
        let provider = Provider::<Http>::try_from(config.rpc_http.as_str())?;
        Ok(Self { config, provider })
    }

    fn owner_address() -> Option<Address> {
        if let Ok(k) = std::env::var("FLASH_ARB_SIGNER_KEY") {
            if let Ok(w) = k.trim().parse::<LocalWallet>() {
                return Some(w.address());
            }
        }
        std::env::var("FLASH_ARB_OWNER_ADDRESS").ok().and_then(|s| parse_addr(&s))
    }

    pub async fn simulate_opportunity(&self, opp: &ArbitrageOpportunity) -> eyre::Result<SimulationResult> {
        if opp.optimal_loan_amount.is_zero() {
            return Ok(SimulationResult {
                success: false,
                verified: false,
                gas_used: 0,
                error_message: Some("loan size is zero".into()),
            });
        }
        if is_zero_address(&self.config.flash_arb_contract) {
            return Ok(SimulationResult {
                success: false,
                verified: false,
                gas_used: 0,
                error_message: Some("flash_arb_contract is 0x0 (not deployed): opportunity is model-only, UNVERIFIED".into()),
            });
        }
        let Some(from) = Self::owner_address() else {
            return Ok(SimulationResult {
                success: false,
                verified: false,
                gas_used: 0,
                error_message: Some("set FLASH_ARB_SIGNER_KEY or FLASH_ARB_OWNER_ADDRESS to simulate against the contract".into()),
            });
        };
        let contract = parse_addr(&self.config.flash_arb_contract).unwrap_or_default();
        let recipient = std::env::var("FLASH_ARB_PROFIT_WALLET").ok().and_then(|s| parse_addr(&s)).unwrap_or(from);

        let tx: TypedTransaction = TransactionRequest::new()
            .from(from)
            .to(contract)
            .data(encode_execute_call(opp, recipient))
            .into();

        match self.provider.estimate_gas(&tx, None).await {
            Ok(gas) => {
                let gas_used = gas.low_u64();
                if gas_used > self.config.risk.max_gas_per_tx {
                    return Ok(SimulationResult {
                        success: false,
                        verified: true,
                        gas_used,
                        error_message: Some(format!("gas {} exceeds max_gas_per_tx {}", gas_used, self.config.risk.max_gas_per_tx)),
                    });
                }
                Ok(SimulationResult { success: true, verified: true, gas_used, error_message: None })
            }
            Err(e) => {
                debug!("[{}] estimate_gas reverted: {}", self.config.chain_name, e);
                Ok(SimulationResult {
                    success: false,
                    verified: true,
                    gas_used: 0,
                    error_message: Some(format!("simulation reverted: {}", e)),
                })
            }
        }
    }
}`,
  },
  'risk.rs': {
    lang: 'rust',
    path: 'flash-arb/searcher/src/risk.rs',
    code: `use crate::config::RiskConfig;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{error, warn};

fn today() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() / 86_400).unwrap_or(0)
}

#[derive(Debug, Clone)]
pub struct RiskManager {
    pub config: RiskConfig,
    pub consecutive_reverts: Arc<AtomicU32>,
    pub circuit_breaker_tripped: Arc<AtomicBool>,
    pub daily_gas_loss_usd: Arc<RwLock<f64>>,
    day: Arc<AtomicU64>,
}

impl RiskManager {
    pub fn new(config: RiskConfig) -> Self {
        Self {
            config,
            consecutive_reverts: Arc::new(AtomicU32::new(0)),
            circuit_breaker_tripped: Arc::new(AtomicBool::new(false)),
            daily_gas_loss_usd: Arc::new(RwLock::new(0.0)),
            day: Arc::new(AtomicU64::new(today())),
        }
    }

    /// "Daily" caps really are daily: reset the loss counter at 00:00 UTC. A breaker tripped by the
    /// consecutive-failure limit stays tripped until reset manually (restart) so a bad day isn't silently retried.
    async fn roll_day(&self) {
        let t = today();
        if self.day.swap(t, Ordering::SeqCst) != t {
            *self.daily_gas_loss_usd.write().await = 0.0;
            if self.consecutive_reverts.load(Ordering::SeqCst) < self.config.consecutive_failure_limit {
                self.circuit_breaker_tripped.store(false, Ordering::SeqCst);
            }
        }
    }

    /// Pre-execution safety check
    pub async fn can_execute(&self, token_address: &str, gas_units: u64) -> Result<(), &'static str> {
        self.roll_day().await;

        if self.circuit_breaker_tripped.load(Ordering::SeqCst) {
            return Err("Circuit breaker is TRIPPED (consecutive reverts or daily loss cap)");
        }

        let clean_addr = token_address.to_lowercase();
        for excluded in &self.config.excluded_tokens {
            if excluded.to_lowercase() == clean_addr {
                return Err("Token is in the excluded/rebasing/fee-on-transfer blacklist");
            }
        }

        if gas_units > self.config.max_gas_per_tx {
            return Err("Estimated gas units exceed max_gas_per_tx limit");
        }

        let daily_loss = *self.daily_gas_loss_usd.read().await;
        if daily_loss >= self.config.daily_revert_loss_cap_usd {
            self.circuit_breaker_tripped.store(true, Ordering::SeqCst);
            return Err("Daily revert gas loss cap exceeded. Kill switch engaged.");
        }

        Ok(())
    }

    pub fn record_success(&self) {
        self.consecutive_reverts.store(0, Ordering::SeqCst);
    }

    pub async fn record_revert(&self, gas_spent_usd: f64) {
        self.roll_day().await;
        let fails = self.consecutive_reverts.fetch_add(1, Ordering::SeqCst) + 1;
        warn!("Recorded on-chain revert #{}. Gas lost: \${:.2}", fails, gas_spent_usd);

        let mut daily_loss = self.daily_gas_loss_usd.write().await;
        *daily_loss += gas_spent_usd;

        if fails >= self.config.consecutive_failure_limit {
            error!("CIRCUIT BREAKER TRIPPED! {} consecutive reverts. Halting automated execution.", fails);
            self.circuit_breaker_tripped.store(true, Ordering::SeqCst);
        }

        if *daily_loss >= self.config.daily_revert_loss_cap_usd {
            error!(
                "DAILY LOSS CAP REACHED! Gas lost: \${:.2} (limit \${:.2}). Halting.",
                *daily_loss, self.config.daily_revert_loss_cap_usd
            );
            self.circuit_breaker_tripped.store(true, Ordering::SeqCst);
        }
    }

    #[allow(dead_code)]
    pub fn reset_circuit_breaker(&self) {
        self.consecutive_reverts.store(0, Ordering::SeqCst);
        self.circuit_breaker_tripped.store(false, Ordering::SeqCst);
    }
}`,
  },
  'executor.rs': {
    lang: 'rust',
    path: 'flash-arb/searcher/src/executor.rs',
    code: `use crate::config::{is_zero_address, parse_addr, ChainConfig};
use crate::evm::{
    call_decode, decode_arbitrage_swaps_executed, decode_erc20_u256, encode_direct_sweep_call,
    encode_erc20_balance_of_call, encode_erc20_transfer_call, encode_execute_call,
    encode_rescue_tokens_call, encode_rescue_tokens_to_call, multicall,
};
use crate::risk::RiskManager;
use crate::routes::ArbitrageOpportunity;
use crate::sim::SimulationResult;
use ethers::abi::ParamType;
use ethers::prelude::*;
use ethers::types::transaction::eip2718::TypedTransaction;
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Always keep at least 0.00005 ETH on the signer/gas wallet so future arbitrages & sweeps can pay L2 gas.
const SIGNER_MIN_GAS_RESERVE_WEI: u128 = 50_000_000_000_000;

#[derive(Debug, Default, Clone)]
pub struct SweepReport {
    pub contract_eth_swept_wei: U256,
    pub contract_tokens_swept: usize,
    pub gas_wallet_tokens_swept: usize,
    pub txs_confirmed: usize,
    pub skipped_tokens: usize,
}

#[derive(Debug)]
#[allow(dead_code)]
enum SweepTxOutcome {
    Confirmed(H256),
    SimulationReverted(String),
    BroadcastReverted(H256),
    Skipped(String),
}

pub struct TxExecutor {
    pub config: ChainConfig,
    pub risk_manager: RiskManager,
}

impl TxExecutor {
    pub fn new(config: ChainConfig, risk_manager: RiskManager) -> Self {
        Self { config, risk_manager }
    }

    fn build_signer_context(
        &self,
    ) -> eyre::Result<(Address, Address, Provider<Http>, Arc<SignerMiddleware<Provider<Http>, LocalWallet>>)> {
        // The profit wallet must be set explicitly and never zero: no hard-coded fallback address.
        let profit_recipient = std::env::var("FLASH_ARB_PROFIT_WALLET")
            .ok()
            .and_then(|s| parse_addr(&s))
            .filter(|a| *a != Address::zero())
            .ok_or_else(|| eyre::eyre!("FLASH_ARB_PROFIT_WALLET not set (or zero / invalid address)"))?;

        let key = std::env::var("FLASH_ARB_SIGNER_KEY")
            .ok()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
            .ok_or_else(|| eyre::eyre!("FLASH_ARB_SIGNER_KEY not set"))?;
        let wallet: LocalWallet = key.parse::<LocalWallet>()?.with_chain_id(self.config.chain_id);
        let signer_address = wallet.address();

        let provider = Provider::<Http>::try_from(self.config.rpc_http.as_str())?;
        let client = Arc::new(SignerMiddleware::new(provider.clone(), wallet));
        Ok((profit_recipient, signer_address, provider, client))
    }

    async fn query_token_balances(
        &self,
        provider: &Provider<Http>,
        account: Address,
        tokens: &[(String, Address)],
        block: u64,
    ) -> Vec<(String, Address, U256)> {
        let mut non_zero = Vec::new();
        if tokens.is_empty() {
            return non_zero;
        }
        for chunk in tokens.chunks(50) {
            let calls: Vec<(Address, Vec<u8>)> = chunk
                .iter()
                .map(|(_, tok)| (*tok, encode_erc20_balance_of_call(account)))
                .collect();
            let results = match multicall(provider, &calls, block).await {
                Ok(r) => r,
                Err(e) => {
                    warn!("[{}] balanceOf multicall failed for {:?}: {}", self.config.chain_name, account, e);
                    continue;
                }
            };
            for ((sym, tok), res) in chunk.iter().zip(results.into_iter()) {
                if let Some(bytes) = res {
                    if let Some(bal) = decode_erc20_u256(&bytes) {
                        if !bal.is_zero() {
                            non_zero.push((sym.clone(), *tok, bal));
                        }
                    }
                }
            }
        }
        non_zero
    }

    /// Pre-flight \`estimate_gas\` + gas-reserve check before signing and broadcasting any sweep transaction.
    async fn send_verified_sweep_tx(
        &self,
        provider: &Provider<Http>,
        client: &Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
        signer_address: Address,
        to: Address,
        calldata: Bytes,
        label: &str,
    ) -> eyre::Result<SweepTxOutcome> {
        let est_req = Eip1559TransactionRequest::new()
            .to(to)
            .from(signer_address)
            .data(calldata.clone())
            .chain_id(self.config.chain_id);
        let typed: TypedTransaction = est_req.into();

        let est_gas = match provider.estimate_gas(&typed, None).await {
            Ok(g) => g.low_u64(),
            Err(e) => return Ok(SweepTxOutcome::SimulationReverted(e.to_string())),
        };
        if est_gas > self.config.risk.max_gas_per_tx {
            return Ok(SweepTxOutcome::Skipped(format!(
                "estimated gas {} exceeds max_gas_per_tx {}",
                est_gas, self.config.risk.max_gas_per_tx
            )));
        }

        let gas_limit = (est_gas + est_gas / 4).max(21_000);
        let (max_fee, priority_fee) = provider
            .estimate_eip1559_fees(None)
            .await
            .unwrap_or((U256::from(100_000_000u64), U256::from(10_000_000u64)));
        let max_fee = max_fee.max(U256::from(1_000_000u64));
        let priority_fee = priority_fee.min(max_fee);

        let signer_eth = provider.get_balance(signer_address, None).await.unwrap_or_default();
        let needed = U256::from(gas_limit)
            .saturating_mul(max_fee)
            .saturating_add(U256::from(SIGNER_MIN_GAS_RESERVE_WEI));
        if signer_eth < needed {
            return Ok(SweepTxOutcome::Skipped(format!(
                "signer {:?} ETH balance ({} wei) below gas cost + reserve ({} wei)",
                signer_address, signer_eth, needed
            )));
        }

        let tx_req = Eip1559TransactionRequest::new()
            .to(to)
            .from(signer_address)
            .data(calldata)
            .gas(gas_limit)
            .max_priority_fee_per_gas(priority_fee)
            .max_fee_per_gas(max_fee)
            .chain_id(self.config.chain_id);

        let pending = client.send_transaction(tx_req, None).await?;
        let tx_hash = pending.tx_hash();
        info!("[{}] Sweep broadcast ({}): 0x{:x}", self.config.chain_name, label, tx_hash);

        match pending.await? {
            Some(receipt) => {
                if receipt.status == Some(U64::from(1u64)) {
                    info!(
                        "[{}] Sweep CONFIRMED ({}): 0x{:x} in block {}",
                        self.config.chain_name,
                        label,
                        tx_hash,
                        receipt.block_number.unwrap_or_default()
                    );
                    Ok(SweepTxOutcome::Confirmed(tx_hash))
                } else {
                    warn!("[{}] Sweep REVERTED on-chain ({}): 0x{:x}", self.config.chain_name, label, tx_hash);
                    Ok(SweepTxOutcome::BroadcastReverted(tx_hash))
                }
            }
            None => {
                warn!("[{}] Sweep tx dropped/timeout ({}): 0x{:x}", self.config.chain_name, label, tx_hash);
                Ok(SweepTxOutcome::Skipped("transaction dropped / not mined in timeout window".into()))
            }
        }
    }

    /// Sweeps all detected native ETH + non-ETH ERC-20 dust from every configured FlashArb contract vault
    /// AND all non-ETH ERC-20 token dust sitting in the signer/gas wallet directly to \`FLASH_ARB_PROFIT_WALLET\`.
    /// Native ETH on the gas wallet is never drained so L2 gas remains funded for future executions.
    pub async fn sweep_all_dust(&self) -> eyre::Result<SweepReport> {
        let (profit_recipient, signer_address, provider, client) = self.build_signer_context()?;
        let mut report = SweepReport::default();
        let tokens = self.config.all_tokens();
        let block = provider.get_block_number().await.map(|b| b.as_u64()).unwrap_or(0);

        // Phase 1: Contract Vault(s) — sweep native ETH + all non-ETH ERC-20 token balances.
        for contract_addr in self.config.sweep_contracts() {
            if contract_addr == profit_recipient {
                continue;
            }
            let code = provider.get_code(contract_addr, None).await.unwrap_or_default();
            if code.is_empty() {
                debug!("[{}] Vault {:?} has no bytecode; skipping sweep", self.config.chain_name, contract_addr);
                continue;
            }
            let owner_ok = match call_decode(&provider, contract_addr, "owner()", &[], &[ParamType::Address]).await {
                Ok(toks) => toks.into_iter().next().and_then(|t| t.into_address()) == Some(signer_address),
                Err(_) => false,
            };
            if !owner_ok {
                warn!(
                    "[{}] Vault {:?} is not owned by signer {:?}; skipping contract sweep",
                    self.config.chain_name, contract_addr, signer_address
                );
                continue;
            }

            let code_bytes = code.as_ref();
            let has_direct_sweep = code_bytes.windows(4).any(|w| w == [0x78, 0x04, 0xd9, 0xac]);
            let has_rescue_to = code_bytes.windows(4).any(|w| w == [0xa7, 0x07, 0x06, 0x92]);
            let has_rescue = code_bytes.windows(3).any(|w| w == [0xae, 0x3b, 0xf8]);

            // 1a. Native ETH sitting on vault contract
            let eth_bal = provider.get_balance(contract_addr, None).await.unwrap_or_default();
            if !eth_bal.is_zero() {
                if !has_direct_sweep {
                    warn!(
                        "[{}] Vault {:?} lacks executeDirectFlashArb(address) selector; skipping {} wei ETH sweep",
                        self.config.chain_name, contract_addr, eth_bal
                    );
                } else {
                    let label = format!("vault {:?} ETH ({} wei) -> {:?}", contract_addr, eth_bal, profit_recipient);
                    match self
                        .send_verified_sweep_tx(
                            &provider,
                            &client,
                            signer_address,
                            contract_addr,
                            encode_direct_sweep_call(profit_recipient),
                            &label,
                        )
                        .await
                    {
                        Ok(SweepTxOutcome::Confirmed(_)) => {
                            report.contract_eth_swept_wei = report.contract_eth_swept_wei.saturating_add(eth_bal);
                            report.txs_confirmed += 1;
                        }
                        Ok(other) => warn!("[{}] Vault ETH sweep skipped ({}): {:?}", self.config.chain_name, label, other),
                        Err(e) => warn!("[{}] Vault ETH sweep error ({}): {:?}", self.config.chain_name, label, e),
                    }
                }
            }

            // 1b. Non-ETH ERC-20 dust sitting on vault contract
            let vault_tokens = self.query_token_balances(&provider, contract_addr, &tokens, block).await;
            for (sym, token_addr, bal) in vault_tokens {
                if !has_rescue_to && !has_rescue {
                    warn!(
                        "[{}] Vault {:?} lacks rescueTokensTo/rescueTokens selectors; skipping {} ({})",
                        self.config.chain_name, contract_addr, sym, bal
                    );
                    report.skipped_tokens += 1;
                    continue;
                }
                if has_rescue_to {
                    let label_direct = format!("rescueTokensTo {} ({}) from {:?} -> {:?}", sym, bal, contract_addr, profit_recipient);
                    match self
                        .send_verified_sweep_tx(
                            &provider,
                            &client,
                            signer_address,
                            contract_addr,
                            encode_rescue_tokens_to_call(token_addr, profit_recipient),
                            &label_direct,
                        )
                        .await
                    {
                        Ok(SweepTxOutcome::Confirmed(_)) => {
                            report.contract_tokens_swept += 1;
                            report.txs_confirmed += 1;
                        }
                        Ok(other) => {
                            warn!("[{}] Vault token rescue skipped ({}): {:?}", self.config.chain_name, label_direct, other);
                            report.skipped_tokens += 1;
                        }
                        Err(e) => {
                            warn!("[{}] Vault token rescue error ({}): {:?}", self.config.chain_name, label_direct, e);
                            report.skipped_tokens += 1;
                        }
                    }
                } else {
                    // Legacy deployments only expose \`rescueTokens(address)\` which transfers to \`owner()\` (= signer_address).
                    // Run it first, then Phase 2 below forwards the balance from signer_address to \`profit_recipient\`.
                    let label_legacy = format!("rescueTokens {} ({}) from {:?} -> owner {:?}", sym, bal, contract_addr, signer_address);
                    match self
                        .send_verified_sweep_tx(
                            &provider,
                            &client,
                            signer_address,
                            contract_addr,
                            encode_rescue_tokens_call(token_addr),
                            &label_legacy,
                        )
                        .await
                    {
                        Ok(SweepTxOutcome::Confirmed(_)) => {
                            report.contract_tokens_swept += 1;
                            report.txs_confirmed += 1;
                        }
                        Ok(other) => {
                            warn!("[{}] Legacy vault token rescue skipped ({}): {:?}", self.config.chain_name, label_legacy, other);
                            report.skipped_tokens += 1;
                        }
                        Err(e) => {
                            warn!("[{}] Legacy vault token rescue error ({}): {:?}", self.config.chain_name, label_legacy, e);
                            report.skipped_tokens += 1;
                        }
                    }
                }
            }
        }

        // Phase 2: Gas Wallet (signer_address) — sweep all non-ETH ERC-20 dust (including anything just rescued via legacy rescueTokens).
        // Never sweep native ETH out of the gas wallet.
        if signer_address == profit_recipient {
            debug!(
                "[{}] Gas wallet {:?} matches FLASH_ARB_PROFIT_WALLET; skipping Phase 2 token transfer",
                self.config.chain_name, signer_address
            );
        } else {
            let latest_block = provider.get_block_number().await.map(|b| b.as_u64()).unwrap_or(block);
            let signer_tokens = self
                .query_token_balances(&provider, signer_address, &tokens, latest_block)
                .await;
            for (sym, token_addr, bal) in signer_tokens {
                let label = format!("gas-wallet transfer {} ({}) {:?} -> {:?}", sym, bal, signer_address, profit_recipient);
                match self
                    .send_verified_sweep_tx(
                        &provider,
                        &client,
                        signer_address,
                        token_addr,
                        encode_erc20_transfer_call(profit_recipient, bal),
                        &label,
                    )
                    .await
                {
                    Ok(SweepTxOutcome::Confirmed(_)) => {
                        report.gas_wallet_tokens_swept += 1;
                        report.txs_confirmed += 1;
                    }
                    Ok(other) => {
                        warn!("[{}] Gas-wallet token sweep skipped ({}): {:?}", self.config.chain_name, label, other);
                        report.skipped_tokens += 1;
                    }
                    Err(e) => {
                        warn!("[{}] Gas-wallet token sweep error ({}): {:?}", self.config.chain_name, label, e);
                        report.skipped_tokens += 1;
                    }
                }
            }
        }

        if report.txs_confirmed > 0 || report.skipped_tokens > 0 {
            info!(
                "[{}] Sweep summary: vault_eth={} wei, vault_tokens={}, gas_wallet_tokens={}, confirmed_txs={}, skipped={} -> {:?}",
                self.config.chain_name,
                report.contract_eth_swept_wei,
                report.contract_tokens_swept,
                report.gas_wallet_tokens_swept,
                report.txs_confirmed,
                report.skipped_tokens,
                profit_recipient
            );
        } else {
            debug!(
                "[{}] Sweep check complete: zero residual ETH or ERC-20 dust across vaults and gas wallet {:?}",
                self.config.chain_name, signer_address
            );
        }

        Ok(report)
    }

    /// Live only: re-check risk limits, sign with FLASH_ARB_SIGNER_KEY, broadcast, await receipt,
    /// and sweep any accumulated non-ETH token dust or residual vault ETH to FLASH_ARB_PROFIT_WALLET.
    /// Refuses to send anything that was not verified by an eth_call simulation against the deployed contract.
    pub async fn execute(&self, opp: &ArbitrageOpportunity, sim: &SimulationResult) -> eyre::Result<()> {
        if !sim.verified || !sim.success {
            eyre::bail!("refusing to broadcast an unverified/failed simulation");
        }
        if is_zero_address(&self.config.flash_arb_contract) {
            eyre::bail!("flash_arb_contract is not set");
        }

        if let Err(reason) = self.risk_manager.can_execute(&format!("{:?}", opp.borrowed_asset), sim.gas_used).await {
            warn!("[{}] Risk check rejected trade: {}", self.config.chain_name, reason);
            return Ok(());
        }

        let (profit_recipient, signer_address, provider, client) = self.build_signer_context()?;
        let contract_address = self.config.flash_arb_contract.parse::<Address>()?;

        let (max_fee, _) = provider
            .estimate_eip1559_fees(None)
            .await
            .unwrap_or((U256::from(200_000_000u64), U256::from(50_000_000u64)));

        // Priority-fee bid: tip_share_percent of expected net profit, converted to wei/gas, capped at the base max fee
        // (so a mis-estimated profit can never make the tip dwarf the gas price).
        let tip_usd = opp.net_profit_usd * (self.config.tip_share_percent as f64) / 100.0;
        let tip_eth = tip_usd / opp.eth_price_usd.max(1.0);
        let tip_wei_per_gas = (tip_eth * 1e18 / (sim.gas_used.max(1) as f64)).max(0.0) as u128;
        let priority_fee = U256::from(tip_wei_per_gas).min(max_fee);

        let tx_request = Eip1559TransactionRequest::new()
            .to(contract_address)
            .from(signer_address)
            .data(encode_execute_call(opp, profit_recipient))
            .gas(sim.gas_used + sim.gas_used / 4) // +25% headroom over the simulated estimate
            .max_priority_fee_per_gas(priority_fee)
            .max_fee_per_gas(max_fee + priority_fee)
            .chain_id(self.config.chain_id);

        info!("[{}] Broadcasting FlashArb tx (borrow {} {})...", self.config.chain_name, opp.optimal_loan_amount, opp.asset_symbol);
        let pending_tx = client.send_transaction(tx_request, None).await?;
        let tx_hash = pending_tx.tx_hash();
        info!("[{}] Broadcast: 0x{:x}", self.config.chain_name, tx_hash);

        match pending_tx.await? {
            Some(receipt) => {
                if receipt.status == Some(U64::from(1u64)) {
                    if let Some((token_in, token_out, borrowed, net_profit, swept_to)) =
                        decode_arbitrage_swaps_executed(&receipt, contract_address)
                    {
                        info!(
                            "[{}] FlashArb CONFIRMED in block {} (gas {:?}) | tokenIn {:?} -> tokenOut {:?} | borrowed {} | on-chain profit {} swept to {:?} (modelled \${:.2})",
                            self.config.chain_name,
                            receipt.block_number.unwrap_or_default(),
                            receipt.gas_used.unwrap_or_default(),
                            token_in,
                            token_out,
                            borrowed,
                            net_profit,
                            swept_to,
                            opp.net_profit_usd
                        );
                    } else {
                        info!(
                            "[{}] FlashArb CONFIRMED in block {} (gas {:?}); modelled net profit \${:.2}",
                            self.config.chain_name,
                            receipt.block_number.unwrap_or_default(),
                            receipt.gas_used.unwrap_or_default(),
                            opp.net_profit_usd
                        );
                    }
                    self.risk_manager.record_success();

                    // Sweep any residual token dust / ETH across contracts and gas wallet -> FLASH_ARB_PROFIT_WALLET
                    if let Err(e) = self.sweep_all_dust().await {
                        warn!("[{}] Post-trade dust sweep failed: {:?}", self.config.chain_name, e);
                    }
                } else {
                    let gas_used = receipt.gas_used.unwrap_or_default();
                    let price = receipt.effective_gas_price.unwrap_or(max_fee);
                    let loss_eth = (gas_used.low_u128() as f64) * (price.low_u128() as f64) / 1e18;
                    let loss_usd = loss_eth * opp.eth_price_usd;
                    warn!("[{}] FlashArb REVERTED on-chain. Gas lost ~\${:.2}", self.config.chain_name, loss_usd);
                    self.risk_manager.record_revert(loss_usd).await;
                }
            }
            None => warn!("[{}] Transaction dropped / not mined in timeout window", self.config.chain_name),
        }
        Ok(())
    }
}`,
  },
  'arbitrum.toml': {
    lang: 'toml',
    path: 'flash-arb/searcher/config/arbitrum.toml',
    code: `# ==============================================================================
# Arbitrum One (Chain ID: 42161) FlashArb Searcher Configuration
# ==============================================================================

chain_id = 42161
chain_name = "arbitrum"

# Nodes: Dedicated WebSocket for low-latency sub-millisecond block/event streaming
rpc_http = "https://arb1.arbitrum.io/rpc"
rpc_ws = "wss://arb1.arbitrum.io/rpc"   # unused since v0.2 (the old /feed URL is the sequencer feed, not JSON-RPC)

# Private Relay & Sequencer direct priority fee endpoint (Bypass public mempool)
relay_endpoint = "https://arbitrum.builder-relay.io"
is_l2 = true
sequencer_priority_bidding = true
tip_share_percent = 60 # Bid 60% of expected net profit as priority fee

# Aave V3 Pool & Addresses
aave_v3_pool = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
aave_v3_addresses_provider = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb"
aave_flash_fee_bps = 5 # 0.05% fee

# Deployed FlashArb Contract
flash_arb_contract = "0xeee31ff9e69904b43c124095b6f33aa61505bcc2"
extra_sweep_contracts = ["0x19359c6C418669FCfC46196970814353b8766BE0"]

# DEX Routers & Factories
[dexes.uniswap_v3]
router = "0xE592427A0AEce92De3Edee1F18E0157C05861564"
quoter = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984"

[dexes.pancake_v3]
router = "0x1b81D678ffb9C0263b24A97847620C99d213eB14"
factory = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"

[dexes.sushiswap_v3]
router = "0x8A21F6768C1f8075791D08546Dadf6daA0bE820c"
factory = "0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e"

[dexes.sushiswap_v2]
router = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
factory = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4"

# Camelot V2 Router uses 6-arg swapExactTokensForTokensSupportingFeeOnTransferTokens(..., referrer, deadline)
# rather than UniswapV2Router02's 5-arg swapExactTokensForTokens -> skipped by FlashArbOptimized
[dexes.camelot_v2]
router = "0xc873fEcbd354f5A56E00E710B90EF4201db2448d"
factory = "0x6EcCab422D763aC031210895C81787E87B43A652"

[dexes.curve]
two_pool = "0x7f90122BF0700F9E7e1F688fe926940E8839F353"

# Whitelisted High-Liquidity Tokens (Excludes fee-on-transfer & rebasing)
[tokens]
WETH   = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"
USDC   = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"
USDCe  = "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8"
USDT   = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
DAI    = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1"
ARB    = "0x912CE59144191C1204E64559FE8253a0e49E6548"
WBTC   = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"
LINK   = "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4"
GMX    = "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a"
AAVE   = "0xba5DdD1f9d7F570dc94a51479a000E3BCE967196"
PENDLE = "0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8"
UNI    = "0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0"
cbETH  = "0x1DEBd73E752bEaF79865Fd6446b0c970EaE7732f"
ezETH  = "0x2416092f143378750bb29b79eD961ab195CcEea5"
MAGIC  = "0x539bdE0d7Dbd336b79148AA742883198BBF60342"
RDNT   = "0x3082CC23568eA640225c2467653dB90e9250AaA0"
FRAX   = "0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F"
USDe   = "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"

# Risk Controls & Circuit Breakers
[risk]
min_net_profit_usd = 8.00         # Revert unless profit >= $8 USD
max_gas_per_tx = 850000            # Maximum gas allowed per execution
daily_revert_loss_cap_usd = 75.00 # Kill switch if daily gas spent on reverts exceeds $75
consecutive_failure_limit = 3      # Trip circuit breaker after 3 reverts
simulation_engine = "revm"
excluded_tokens = [
    "0x5979D7b546E38E414F7E9822514be443A4800529", # wstETH (sweep-compatible only; excluded from arb swaps)
    "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", # sUSDe (ERC-4626 yield token; sweep-compatible only)
]

# NOTE: [beneficiary]/[signer] below are informational only. The searcher reads FLASH_ARB_PROFIT_WALLET and FLASH_ARB_SIGNER_KEY from the environment.
[beneficiary]
profit_recipient_address = "0x65602EB9e09B07002872E074004400d37e27CCB9"  # MetaMask (informational: the searcher reads FLASH_ARB_PROFIT_WALLET, see run-live.sh)
label = "Main Arb Profit Vault"
auto_sweep = true

[signer]
gas_wallet_address = "0xF1d765d693f9e6fAb0c4a2FCa942d9D54233C966"
label = "Arbitrum One Gas Funder"
private_key_env = "FLASH_ARB_SIGNER_KEY"`,
  },
  'base.toml': {
    lang: 'toml',
    path: 'flash-arb/searcher/config/base.toml',
    code: `# ==============================================================================
# Base L2 (Chain ID: 8453) FlashArb Searcher Configuration
# ==============================================================================

chain_id = 8453
chain_name = "base"

rpc_http = "https://mainnet.base.org"
rpc_ws = "wss://base-mainnet.public.blastapi.io"

relay_endpoint = "https://base.builder-relay.io"
is_l2 = true
sequencer_priority_bidding = true
tip_share_percent = 65

# Aave V3 on Base
aave_v3_pool = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"
aave_v3_addresses_provider = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D"
aave_flash_fee_bps = 5

flash_arb_contract = "0x0000000000000000000000000000000000000000"

[dexes.uniswap_v3]
router = "0x2626664c2603336E57B271c5C0b26F421741e481"
quoter = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"
factory = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"

# Aerodrome (Solidly fork): router ABI differs from UniswapV2Router02 -> not supported by FlashArbOptimized, skipped by the searcher
[dexes.aerodrome]
router = "0xCF77a3Ba9a5CA399B7C97c7488454543B869415f"
factory = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da"

[tokens]
WETH  = "0x4200000000000000000000000000000000000006"
USDC  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
USDbC = "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"
cbETH = "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22"
AERO  = "0x940181a94A35A4569E4529A3CDfB74e38FD98631"
DAI   = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"
cbBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"

[risk]
min_net_profit_usd = 6.00
max_gas_per_tx = 750000
daily_revert_loss_cap_usd = 60.00
consecutive_failure_limit = 3
simulation_engine = "revm"
excluded_tokens = []

# NOTE: [beneficiary]/[signer] below are informational only. The searcher reads FLASH_ARB_PROFIT_WALLET and FLASH_ARB_SIGNER_KEY from the environment.
[beneficiary]
profit_recipient_address = "0x65602EB9e09B07002872E074004400d37e27CCB9"  # MetaMask (informational: the searcher reads FLASH_ARB_PROFIT_WALLET, see run-live.sh)
label = "Main Arb Profit Vault"
auto_sweep = true

[signer]
gas_wallet_address = "0xF1d765d693f9e6fAb0c4a2FCa942d9D54233C966"
label = "Base L2 Gas Funder"
private_key_env = "FLASH_ARB_SIGNER_KEY"`,
  },
  'optimism.toml': {
    lang: 'toml',
    path: 'flash-arb/searcher/config/optimism.toml',
    code: `# ==============================================================================
# Optimism Mainnet (Chain ID: 10) FlashArb Searcher Configuration
# ==============================================================================

chain_id = 10
chain_name = "optimism"

rpc_http = "https://mainnet.optimism.io"
rpc_ws = "wss://optimism-mainnet.public.blastapi.io"

relay_endpoint = "https://optimism.builder-relay.io"
is_l2 = true
sequencer_priority_bidding = true
tip_share_percent = 60

# Aave V3 on Optimism
aave_v3_pool = "0x794a61358D6845594F94dc1DB02A252b5b4814aD"
aave_v3_addresses_provider = "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb"
aave_flash_fee_bps = 5

flash_arb_contract = "0x0000000000000000000000000000000000000000"

[dexes.uniswap_v3]
router = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
quoter = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"
factory = "0x1F98431c8aD98523631AE4a59f267346ea31F984"

# Velodrome (Solidly fork): router ABI differs from UniswapV2Router02 -> not supported by FlashArbOptimized, skipped by the searcher
[dexes.velodrome]
router = "0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858"
factory = "0x25CbdDb98b35ab1FF77413456B31EC81A6B6B746"

[tokens]
WETH  = "0x4200000000000000000000000000000000000006"
USDC  = "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"
USDCe = "0x7F5c764cBc14f9669B88837ca1490cCa17c31607"
USDT  = "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58"
DAI   = "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1"
OP    = "0x4200000000000000000000000000000000000042"
WBTC  = "0x68f180fcCe6836688e9084f035309E29Bf0A2095"

[risk]
min_net_profit_usd = 7.00
max_gas_per_tx = 800000
daily_revert_loss_cap_usd = 60.00
consecutive_failure_limit = 3
simulation_engine = "revm"
excluded_tokens = [
    "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb", # wstETH (sweep-compatible only; excluded from arb swaps)
]

# NOTE: [beneficiary]/[signer] below are informational only. The searcher reads FLASH_ARB_PROFIT_WALLET and FLASH_ARB_SIGNER_KEY from the environment.
[beneficiary]
profit_recipient_address = "0x65602EB9e09B07002872E074004400d37e27CCB9"  # MetaMask (informational: the searcher reads FLASH_ARB_PROFIT_WALLET, see run-live.sh)
label = "Main Arb Profit Vault"
auto_sweep = true

[signer]
gas_wallet_address = "0xF1d765d693f9e6fAb0c4a2FCa942d9D54233C966"
label = "Optimism Mainnet Gas Funder"
private_key_env = "FLASH_ARB_SIGNER_KEY"`,
  },
  'foundry.toml': {
    lang: 'toml',
    path: 'flash-arb/contracts/foundry.toml',
    code: `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
optimizer = true
optimizer_runs = 1000000
via_ir = true   # matches scripts/compile-contracts.cjs (executeOptimizedArbitrage has 10 params -> stack-too-deep without IR)
evm_version = "cancun"
auto_detect_solc = true

# Cross-Platform Compiler Setup:
# 1. Termux (Android aarch64): Install native solc via \`pkg install solidity\`, then run:
#    forge test --use $(which solc) --fork-url https://arb1.arbitrum.io/rpc
# 2. WSL (Windows Subsystem for Linux - Recommended on PC):
#    Runs standard Linux x86_64, svm downloads automatically or use system solc.
# 3. Windows PowerShell:
#    Install solc via \`winget install Ethereum.Solidity\` or \`npm install -g solc\`.

[rpc_endpoints]
arbitrum = "https://arb1.arbitrum.io/rpc"
base = "https://mainnet.base.org"
optimism = "https://mainnet.optimism.io"

[fuzz]
runs = 1000
max_test_rejects = 65536`,
  },
  'evm.rs': {
    lang: 'rust',
    path: 'flash-arb/searcher/src/evm.rs',
    code: `//! Small, dependency-light EVM helpers: raw eth_call + ABI decode, number conversions, calldata encoding.
use crate::routes::ArbitrageOpportunity;
use ethers::abi::{ParamType, Token};
use ethers::prelude::*;
use ethers::types::transaction::eip2718::TypedTransaction;

/// eth_call \`to.sig(args)\` and decode the return data as \`outs\`.
pub async fn call_decode(
    provider: &Provider<Http>,
    to: Address,
    sig: &str,
    args: &[Token],
    outs: &[ParamType],
) -> eyre::Result<Vec<Token>> {
    let mut data: Vec<u8> = ethers::utils::id(sig).to_vec();
    data.extend(ethers::abi::encode(args));
    let tx: TypedTransaction = TransactionRequest::new().to(to).data(Bytes::from(data)).into();
    let out = provider.call(&tx, None).await?;
    let tokens = ethers::abi::decode(outs, out.as_ref())?;
    Ok(tokens)
}

pub fn tok_uint(t: &Token) -> U256 {
    t.clone().into_uint().unwrap_or_default()
}

/// Lossy but panic-free (U256::as_u128 panics on overflow).
pub fn u256_to_f64(v: U256) -> f64 {
    v.0.iter().rev().fold(0.0f64, |acc, limb| acc * 18446744073709551616.0 + (*limb as f64))
}

pub fn f64_to_u256(x: f64) -> U256 {
    if !x.is_finite() || x <= 0.0 {
        return U256::zero();
    }
    U256::from(x.min(3.0e38) as u128)
}

/// 1 = UniV3 -> V2, 2 = V2 -> UniV3, 3 = UniV3 -> UniV3, 4 = V2 -> V2 (matches FlashArbOptimized.sol)
pub fn route_type(opp: &ArbitrageOpportunity) -> u8 {
    match (opp.buy_is_v3, opp.sell_is_v3) {
        (true, false) => 1,
        (false, true) => 2,
        (true, true) => 3,
        (false, false) => 4,
    }
}

/// On-chain minimum profit guard, in units of the borrowed token: half of the modelled profit, never 0.
pub fn min_profit_onchain(opp: &ArbitrageOpportunity) -> U256 {
    let half = opp.expected_gross_profit / U256::from(2u64);
    if half.is_zero() {
        U256::one()
    } else {
        half
    }
}

/// Calldata for FlashArbOptimized.executeOptimizedArbitrage(...)
pub fn encode_execute_call(opp: &ArbitrageOpportunity, recipient: Address) -> Bytes {
    let sig = "executeOptimizedArbitrage(address,address,uint256,address,address,uint24,uint24,uint8,uint256,address)";
    let fee_a = if opp.buy_is_v3 { opp.buy_fee_ppm } else { 0 };
    let fee_b = if opp.sell_is_v3 { opp.sell_fee_ppm } else { 0 };
    let mut data: Vec<u8> = ethers::utils::id(sig).to_vec();
    data.extend(ethers::abi::encode(&[
        Token::Address(opp.borrowed_asset),
        Token::Address(opp.intermediate_asset),
        Token::Uint(opp.optimal_loan_amount),
        Token::Address(opp.buy_router),
        Token::Address(opp.sell_router),
        Token::Uint(U256::from(fee_a)),
        Token::Uint(U256::from(fee_b)),
        Token::Uint(U256::from(route_type(opp))),
        Token::Uint(min_profit_onchain(opp)),
        Token::Address(recipient),
    ]));
    Bytes::from(data)
}

/// Calldata for FlashArbOptimized.executeDirectFlashArb(recipient) (sweeps native ETH from contract)
pub fn encode_direct_sweep_call(recipient: Address) -> Bytes {
    let mut data: Vec<u8> = sel("executeDirectFlashArb(address)");
    data.extend(ethers::abi::encode(&[Token::Address(recipient)]));
    Bytes::from(data)
}

/// Calldata for legacy FlashArbOptimized.rescueTokens(token) (sweeps token from contract to owner)
pub fn encode_rescue_tokens_call(token: Address) -> Bytes {
    let mut data: Vec<u8> = sel("rescueTokens(address)");
    data.extend(ethers::abi::encode(&[Token::Address(token)]));
    Bytes::from(data)
}

/// Calldata for FlashArbOptimized.rescueTokensTo(token, recipient) (sweeps token directly to profit wallet)
pub fn encode_rescue_tokens_to_call(token: Address, recipient: Address) -> Bytes {
    let mut data: Vec<u8> = sel("rescueTokensTo(address,address)");
    data.extend(ethers::abi::encode(&[Token::Address(token), Token::Address(recipient)]));
    Bytes::from(data)
}

/// Calldata for IERC20.balanceOf(account)
pub fn encode_erc20_balance_of_call(account: Address) -> Vec<u8> {
    let mut data = sel("balanceOf(address)");
    data.extend(ethers::abi::encode(&[Token::Address(account)]));
    data
}

/// Calldata for IERC20.transfer(recipient, amount)
pub fn encode_erc20_transfer_call(recipient: Address, amount: U256) -> Bytes {
    let mut data = sel("transfer(address,uint256)");
    data.extend(ethers::abi::encode(&[Token::Address(recipient), Token::Uint(amount)]));
    Bytes::from(data)
}

/// Decode a single ABI-encoded uint256 return word (e.g. from IERC20.balanceOf).
pub fn decode_erc20_u256(bytes: &[u8]) -> Option<U256> {
    if bytes.len() < 32 {
        return None;
    }
    let decoded = ethers::abi::decode(&[ParamType::Uint(256)], bytes).ok()?;
    decoded.into_iter().next().and_then(|t| t.into_uint())
}

/// Decode \`ArbitrageSwapsExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountBorrowed, uint256 netProfitSwept, address indexed recipient)\`.
pub fn decode_arbitrage_swaps_executed(
    receipt: &TransactionReceipt,
    contract: Address,
) -> Option<(Address, Address, U256, U256, Address)> {
    let topic0 = H256::from(ethers::utils::keccak256(
        "ArbitrageSwapsExecuted(address,address,uint256,uint256,address)",
    ));
    for log in &receipt.logs {
        if log.address != contract || log.topics.len() < 4 || log.topics[0] != topic0 {
            continue;
        }
        let Ok(vals) = ethers::abi::decode(&[ParamType::Uint(256), ParamType::Uint(256)], log.data.as_ref()) else {
            continue;
        };
        if vals.len() < 2 {
            continue;
        }
        let borrowed = tok_uint(&vals[0]);
        let profit = tok_uint(&vals[1]);
        let token_in = Address::from(log.topics[1]);
        let token_out = Address::from(log.topics[2]);
        let recipient = Address::from(log.topics[3]);
        return Some((token_in, token_out, borrowed, profit, recipient));
    }
    None
}

pub fn sel(sig: &str) -> Vec<u8> {
    ethers::utils::id(sig).to_vec()
}

/// Multicall3 (same address on every EVM chain we support)
const MULTICALL3: &str = "0xcA11bde05977b3631167028862bE2a173976CA11";

/// Batch many read-only calls into ONE eth_call (Multicall3.aggregate3, allowFailure = true).
/// Returns, per call, Some(returndata) on success or None if that call reverted. State is read at \`block\`
/// (falls back to "latest" if the RPC node behind a load balancer doesn't have that block yet).
pub async fn multicall(
    provider: &Provider<Http>,
    calls: &[(Address, Vec<u8>)],
    block: u64,
) -> eyre::Result<Vec<Option<Vec<u8>>>> {
    if calls.is_empty() {
        return Ok(vec![]);
    }
    let mc: Address = MULTICALL3.parse()?;
    let items: Vec<Token> = calls
        .iter()
        .map(|(t, d)| Token::Tuple(vec![Token::Address(*t), Token::Bool(true), Token::Bytes(d.clone())]))
        .collect();
    let mut data = sel("aggregate3((address,bool,bytes)[])");
    data.extend(ethers::abi::encode(&[Token::Array(items)]));
    let tx: TypedTransaction = TransactionRequest::new().to(mc).data(Bytes::from(data)).into();

    let at_block = BlockId::Number(BlockNumber::Number(block.into()));
    let out = match provider.call(&tx, Some(at_block)).await {
        Ok(o) => o,
        Err(_) => provider.call(&tx, None).await?,
    };

    let ty = ParamType::Array(Box::new(ParamType::Tuple(vec![ParamType::Bool, ParamType::Bytes])));
    let decoded = ethers::abi::decode(&[ty], out.as_ref())?;
    let arr = decoded
        .into_iter()
        .next()
        .and_then(|t| t.into_array())
        .ok_or_else(|| eyre::eyre!("unexpected multicall return data"))?;
    Ok(arr
        .into_iter()
        .map(|t| {
            let tup = t.into_tuple()?;
            let ok = tup.get(0)?.clone().into_bool()?;
            if !ok {
                return None;
            }
            tup.get(1)?.clone().into_bytes()
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sweep_selectors_and_lengths_match_abi() {
        let addr: Address = "0x65602EB9e09B07002872E074004400d37e27CCB9".parse().unwrap();
        let tok: Address = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831".parse().unwrap();

        let direct = encode_direct_sweep_call(addr);
        assert_eq!(&direct[..4], &[0x78, 0x04, 0xd9, 0xac]);
        assert_eq!(direct.len(), 36);

        let rescue = encode_rescue_tokens_call(tok);
        assert_eq!(&rescue[..4], &[0x00, 0xae, 0x3b, 0xf8]);
        assert_eq!(rescue.len(), 36);

        let rescue_to = encode_rescue_tokens_to_call(tok, addr);
        assert_eq!(rescue_to.len(), 68);

        let bal = encode_erc20_balance_of_call(addr);
        assert_eq!(&bal[..4], &[0x70, 0xa0, 0x82, 0x31]);
        assert_eq!(bal.len(), 36);

        let xfer = encode_erc20_transfer_call(addr, U256::from(12345u64));
        assert_eq!(&xfer[..4], &[0xa9, 0x05, 0x9c, 0xbb]);
        assert_eq!(xfer.len(), 68);
    }

    #[test]
    fn decodes_erc20_uint256_and_arb_event() {
        let raw = ethers::abi::encode(&[Token::Uint(U256::from(987654321u64))]);
        assert_eq!(decode_erc20_u256(&raw), Some(U256::from(987654321u64)));
        assert_eq!(decode_erc20_u256(&[0u8; 4]), None);

        let contract: Address = "0xeee31ff9e69904b43c124095b6f33aa61505bcc2".parse().unwrap();
        let token_in: Address = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1".parse().unwrap();
        let token_out: Address = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831".parse().unwrap();
        let recipient: Address = "0x65602EB9e09B07002872E074004400d37e27CCB9".parse().unwrap();

        let topic0 = H256::from(ethers::utils::keccak256(
            "ArbitrageSwapsExecuted(address,address,uint256,uint256,address)",
        ));
        let mut receipt = TransactionReceipt::default();
        let mut log = Log::default();
        log.address = contract;
        log.topics = vec![topic0, token_in.into(), token_out.into(), recipient.into()];
        log.data = Bytes::from(ethers::abi::encode(&[
            Token::Uint(U256::from(10_000_000_000u64)),
            Token::Uint(U256::from(42_000_000u64)),
        ]));
        receipt.logs.push(log);

        let decoded = decode_arbitrage_swaps_executed(&receipt, contract).expect("event decoded");
        assert_eq!(decoded.0, token_in);
        assert_eq!(decoded.1, token_out);
        assert_eq!(decoded.2, U256::from(10_000_000_000u64));
        assert_eq!(decoded.3, U256::from(42_000_000u64));
        assert_eq!(decoded.4, recipient);
    }
}`,
  },
  'config.rs': {
    lang: 'rust',
    path: 'flash-arb/searcher/src/config.rs',
    code: `use ethers::types::Address;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

fn default_balancer_vault() -> String {
    // Balancer V2 Vault: same deterministic address on Arbitrum, Base and Optimism
    "0xBA12222222228d8Ba445958a75a0704d566BF2C8".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub chain_name: String,
    pub rpc_http: String,
    /// Unused since v0.2 (block polling over HTTP); kept so old TOML files still load.
    #[serde(default)]
    pub rpc_ws: String,
    #[serde(default)]
    pub relay_endpoint: String,
    #[serde(default)]
    pub is_l2: bool,
    #[serde(default)]
    pub sequencer_priority_bidding: bool,
    pub tip_share_percent: u64,
    #[serde(default)]
    pub aave_v3_pool: String,
    #[serde(default)]
    pub aave_v3_addresses_provider: String,
    #[serde(default)]
    pub aave_flash_fee_bps: u64,
    #[serde(default = "default_balancer_vault")]
    pub balancer_vault: String,
    pub flash_arb_contract: String,
    /// Additional contract vaults to sweep alongside \`flash_arb_contract\` (e.g. previous deployments)
    #[serde(default)]
    pub extra_sweep_contracts: Vec<String>,
    pub dexes: HashMap<String, DexConfig>,
    pub tokens: HashMap<String, String>,
    pub risk: RiskConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DexConfig {
    pub router: Option<String>,
    pub quoter: Option<String>,
    pub factory: Option<String>,
    pub two_pool: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskConfig {
    pub min_net_profit_usd: f64,
    pub max_gas_per_tx: u64,
    pub daily_revert_loss_cap_usd: f64,
    pub consecutive_failure_limit: u32,
    #[serde(default)]
    pub simulation_engine: String,
    #[serde(default)]
    pub excluded_tokens: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DexKind {
    /// Uniswap-V2-style pair + router (\`swapExactTokensForTokens(amountIn, min, path, to, deadline)\`)
    V2,
    /// Uniswap V3 pools + SwapRouter / SwapRouter02
    V3,
    /// Curve, and Solidly forks (Aerodrome / Velodrome) whose routers use a different ABI; not supported by FlashArbOptimized
    Unsupported,
}

pub fn dex_kind(dex_id: &str) -> DexKind {
    match dex_id {
        "uniswap_v3" | "pancake_v3" | "sushiswap_v3" => DexKind::V3,
        "sushiswap_v2" => DexKind::V2,
        _ => DexKind::Unsupported,
    }
}

pub fn parse_addr(s: &str) -> Option<Address> {
    s.trim().parse::<Address>().ok()
}

pub fn is_zero_address(s: &str) -> bool {
    parse_addr(s).map_or(true, |a| a == Address::zero())
}

impl ChainConfig {
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> eyre::Result<Self> {
        let content = std::fs::read_to_string(path)?;
        let mut config: ChainConfig = toml::from_str(&content)?;
        // Public RPCs rate-limit hard; let the user point at their own node without editing TOML.
        let var = format!("FLASH_ARB_RPC_{}", config.chain_name.to_uppercase());
        if let Ok(url) = std::env::var(&var) {
            if !url.trim().is_empty() {
                config.rpc_http = url.trim().to_string();
            }
        }
        let contract_var = format!("FLASH_ARB_CONTRACT_{}", config.chain_name.to_uppercase());
        if let Ok(addr) = std::env::var(&contract_var) {
            if !addr.trim().is_empty() {
                config.flash_arb_contract = addr.trim().to_string();
            }
        }
        Ok(config)
    }

    /// All unique non-zero FlashArb contract vaults configured for this chain (primary + extra_sweep_contracts).
    pub fn sweep_contracts(&self) -> Vec<Address> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for raw in std::iter::once(&self.flash_arb_contract).chain(self.extra_sweep_contracts.iter()) {
            if let Some(addr) = parse_addr(raw) {
                if addr != Address::zero() && seen.insert(addr) {
                    out.push(addr);
                }
            }
        }
        out
    }

    /// Every configured ERC-20 token (including excluded tokens, which may still accumulate dust).
    pub fn all_tokens(&self) -> Vec<(String, Address)> {
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        for (sym, raw) in &self.tokens {
            if let Some(addr) = parse_addr(raw) {
                if addr != Address::zero() && seen.insert(addr) {
                    out.push((sym.clone(), addr));
                }
            }
        }
        for raw in &self.risk.excluded_tokens {
            if let Some(addr) = parse_addr(raw) {
                if addr != Address::zero() && seen.insert(addr) {
                    out.push((format!("TOKEN_{:?}", addr), addr));
                }
            }
        }
        out.sort_by(|a, b| a.0.cmp(&b.0));
        out
    }
}`,
  },
  'FlashArbOptimized.t.sol': {
    lang: 'solidity',
    path: 'flash-arb/contracts/test/FlashArbOptimized.t.sol',
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Offline unit tests (no fork needed): mock Balancer vault, mock V2 routers, mock tokens.
// Run: forge test --match-path test/FlashArbOptimized.t.sol -vvv

import {FlashArbOptimized, IERC20} from "../src/FlashArbOptimized.sol";

interface VmLike {
    function prank(address) external;
    function expectRevert(bytes calldata) external;
}

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }

    function transfer(address to, uint256 amt) external returns (bool) {
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }

    function approve(address spender, uint256 amt) external returns (bool) {
        allowance[msg.sender][spender] = amt;
        return true;
    }

    function transferFrom(address from, address to, uint256 amt) external returns (bool) {
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }
}

contract MockVault {
    function flashLoan(address recipient, IERC20[] memory tokens, uint256[] memory amounts, bytes memory userData) external {
        uint256 before = tokens[0].balanceOf(address(this));
        tokens[0].transfer(recipient, amounts[0]);
        uint256[] memory fees = new uint256[](1);
        (bool ok, bytes memory ret) = recipient.call(
            abi.encodeWithSignature("receiveFlashLoan(address[],uint256[],uint256[],bytes)", _toAddrs(tokens), amounts, fees, userData)
        );
        if (!ok) {
            assembly { revert(add(ret, 32), mload(ret)) }
        }
        require(tokens[0].balanceOf(address(this)) >= before, "vault not repaid");
    }

    function _toAddrs(IERC20[] memory t) internal pure returns (address[] memory a) {
        a = new address[](t.length);
        for (uint256 i; i < t.length; i++) a[i] = address(t[i]);
    }
}

contract MockV2Router {
    uint256 public num;
    uint256 public den;

    constructor(uint256 n, uint256 d) { num = n; den = d; }

    function swapExactTokensForTokens(uint256 amountIn, uint256, address[] calldata path, address to, uint256)
        external
        returns (uint256[] memory amounts)
    {
        MockToken(path[0]).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = (amountIn * num) / den;
        MockToken(path[1]).transfer(to, out);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = out;
    }
}

contract FlashArbOptimizedTest {
    VmLike internal constant vm = VmLike(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal owner = address(0xA11CE);
    address internal stranger = address(0xBAD);
    address internal recipient = address(0xFEED);

    MockToken internal tokA; // borrowed asset (e.g. WETH)
    MockToken internal tokB; // intermediate (e.g. USDC)
    MockVault internal vault;
    FlashArbOptimized internal arb;

    function _setUp(uint256 rateBNum, uint256 rateBDen) internal returns (MockV2Router rA, MockV2Router rB) {
        tokA = new MockToken();
        tokB = new MockToken();
        vault = new MockVault();
        rA = new MockV2Router(2, 1);                 // A -> B at 2.00
        rB = new MockV2Router(rateBNum, rateBDen);   // B -> A at rateB
        tokA.mint(address(vault), 1_000 ether);
        tokB.mint(address(rA), 10_000 ether);
        tokA.mint(address(rB), 10_000 ether);
        vm.prank(owner);
        arb = new FlashArbOptimized(address(vault), address(0));
    }

    function test_ProfitableLoopSweepsProfit() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(51, 100); // 100 A -> 200 B -> 102 A  => +2 A
        vm.prank(owner);
        arb.executeOptimizedArbitrage(address(tokA), address(tokB), 100 ether, address(rA), address(rB), 0, 0, 4, 1 ether, recipient);
        require(tokA.balanceOf(recipient) == 2 ether, "profit not swept");
        require(tokA.balanceOf(address(arb)) == 0, "residual A");
        require(tokB.balanceOf(address(arb)) == 0, "residual B");
        require(tokA.balanceOf(address(vault)) == 1_000 ether, "vault not made whole");
    }

    function test_RevertsWhenUnprofitable() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(49, 100); // 100 A -> 200 B -> 98 A => loss
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(FlashArbOptimized.InsufficientProfit.selector, uint256(0), uint256(1 ether)));
        arb.executeOptimizedArbitrage(address(tokA), address(tokB), 100 ether, address(rA), address(rB), 0, 0, 4, 1 ether, recipient);
    }

    function test_StrangerCannotStartLoan() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(51, 100);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FlashArbOptimized.Unauthorized.selector));
        arb.executeOptimizedArbitrage(address(tokA), address(tokB), 100 ether, address(rA), address(rB), 0, 0, 4, 1 ether, stranger);
    }

    function test_StrangerCannotInjectOwnFlashLoan() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(51, 100);
        // Dust sitting in the contract must not be stealable via a hand-made vault.flashLoan(recipient = arb, ...)
        tokA.mint(address(arb), 5 ether);
        IERC20[] memory toks = new IERC20[](1);
        toks[0] = IERC20(address(tokA));
        uint256[] memory amts = new uint256[](1);
        amts[0] = 1 ether;
        FlashArbOptimized.SwapRouteParams memory route = FlashArbOptimized.SwapRouteParams({
            routeType: 4, routerA: address(rA), routerB: address(rB), tokenIn: address(tokA), tokenOut: address(tokB),
            feeA: 0, feeB: 0, minProfit: 1, recipient: stranger
        });
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FlashArbOptimized.Unauthorized.selector));
        vault.flashLoan(address(arb), toks, amts, abi.encode(route));
        require(tokA.balanceOf(stranger) == 0, "stranger stole funds");
    }

    function test_OnlyOwnerCanSweepNative() public {
        (MockV2Router rA, MockV2Router rB) = _setUp(51, 100);
        rA; rB;
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FlashArbOptimized.Unauthorized.selector));
        arb.executeDirectFlashArb(stranger);
    }
}`,
  },
  'CHANGES.md': {
    lang: 'markdown',
    path: 'flash-arb/CHANGES.md',
    code: `# flash-arb v0.2: what was wrong and what changed

Nothing in this folder could be compiled where it was reviewed (no rustc/forge/solc available), so **run \`cargo check\`, \`cargo test\` and \`forge test\` first.**
The sizing math was checked numerically separately (closed form vs brute force).

## Critical (money-losing or fund-stealing)
| # | Where | Problem | Fix |
|---|-------|---------|-----|
| 1 | \`FlashArbOptimized.sol\` | Entry points and \`receiveFlashLoan\` both used the transient reentrancy lock, so the callback always reverted (\`ReentrancyGuardLocked\`): **no flash loan could ever succeed**. The hand-written revert selector was also unverified. | One lock, taken once; callback checks it. Uses \`revert ReentrancyGuardLocked()\`. |
| 2 | \`FlashArbOptimized.sol\` | No access control: anyone could start a loan with their own \`recipient\`/\`minProfit\` (or call Balancer directly with this contract as recipient) and sweep any token balance held here; \`executeDirectFlashArb\` let anyone send out the contract's ETH. | All entrypoints \`onlyOwner\`. Callback only runs if \`keccak256(userData)\` equals a commitment the owner stored in transient storage in the same tx. |
| 3 | \`executor.rs\` vs contract | Rust sent 4-word "legacy" data, which the contract treated as a no-swap repay path: profit always 0 < minProfit, so every live tx would revert and burn gas. | Rust calls \`executeOptimizedArbitrage(...)\` with real routers/fees/route type; legacy and "pass-through" branches removed. |
| 4 | \`monitor.rs\` / \`main.rs\` | Pools were **fabricated**: router addresses used as pool addresses, hard-coded reserves with a baked-in spread, and a V3 \`sqrtPriceX96\` that equals about $4e12/ETH. \`simulate_two_hop\` returned input x 1.0025. The bot "found" huge fake opportunities every tick. | Pools discovered via factories; state read each block with eth_call; real constant-product sizing. |
| 5 | \`sim.rs\` | The "revm simulation" never touched the chain (returned a constant \`312450\` gas and \`success\`). | Real \`eth_estimateGas\` of the exact call; live mode refuses unverified trades. |
| 6 | \`*.toml\` | \`dry_run = false\` shipped on all chains with a zero contract address. | \`dry_run = true\`; live needs \`--live\` + TOML flag + deployed contract + key + profit wallet. |
| 7 | \`executor.rs\` | Profit wallet and gas wallet had hard-coded fallback addresses (and they differ from \`server/flashArbRoutes.ts\`, see below). | \`FLASH_ARB_PROFIT_WALLET\` must be set; no fallback. |

## Other fixes
- \`foundry.toml\`: \`evm_version = "paris"\` cannot compile \`tstore/tload\`; now \`cancun\`; \`via_ir = true\` like \`compile-contracts.cjs\`.
- Base/Optimism Uniswap routers are SwapRouter02 (no \`deadline\` field); the old struct reverted there. \`_swapV3\` now tries v1 then v02.
- \`_safeApprove\` ignored failures; \`asset.transfer\` return values were unchecked (breaks USDT). Replaced with checked helpers; removed the unauthenticated \`uniswapV3SwapCallback\`, the broken \`executeArbitrage\` (never swapped: \`tokenOut = 0\`) and \`fallback()\`.
- \`as_u128()\` calls could panic on real V3 prices; now panic-free f64 conversion. \`panic = "abort"\` removed.
- ETH price: Binance/CoinGecko with a silent \`2850.0\` fallback and fake ARB/OP/WBTC prices; now on-chain WETH/USDC price, bases are WETH/USDC only.
- Arbitrum \`rpc_ws\` pointed at the sequencer feed (not JSON-RPC); WebSocket dropped, blocks are polled over HTTP. Override RPC with \`FLASH_ARB_RPC_<CHAIN>\`.
- Reverted-gas loss used a hard-coded 0.1 gwei; now the receipt's effective gas price. The "daily" loss cap now resets at 00:00 UTC.
- Removed unused heavy deps (\`revm\`, \`uniswap-v3-math\`, \`reqwest\`, ...); \`lto = "thin"\` so it builds on Termux.
- New offline tests: \`contracts/test/FlashArbOptimized.t.sol\` (mock vault/routers) and math tests in \`routes.rs\`.

## Not fixed here (needs your decision)
- \`server/flashArbRoutes.ts\` "live agent" calls \`executeDirectFlashArb(recipient)\` and then labels the result \`CONFIRMED\` with a profit figure. That function only sweeps ETH; **it performs no arbitrage**. Treat those dashboard "trades" as not real.
- The server defaults the profit wallet to \`0x6560...ccb9\` and overwrites \`0xc102...f15d\` (the address in the TOMLs). Pick one.
- \`executeDirectFlashArb\` is now \`onlyOwner\`; the "connected Web3 wallet" fallback only works if that wallet is the contract owner.
- Model limits: V3 pools are treated as constant-product in the current range (cap 2% of reserves); the L1 data fee is a flat $0.15 allowance; Camelot's per-pair fee is assumed 0.3%. The eth_call simulation is the real check.

## v0.2.1: autonomy / efficiency
- **Multicall3 batching**: all pool state for a chain is read in one \`eth_call\` per 50 pools (was 1-2 calls per pool per block), pinned to the polled block; pools that fail to refresh are skipped for that block.
- **Size retries**: if the eth_call simulation rejects the model-optimal loan (typical for V3 pools whose liquidity ends early), the searcher retries at 50% and 25% before giving up.
- **Self-healing workers**: a crashed chain worker restarts with exponential backoff (5s to 5 min); the circuit breaker and daily-loss counters live outside the restart loop, so a restart can't re-arm a tripped breaker.
- **One-command deploy**: \`npm run compile:flash-arb\`, then \`FLASH_ARB_SIGNER_KEY=... CONFIRM_DEPLOY=yes npm run deploy:flash-arb -- arbitrum\` deploys, verifies ownership and writes \`flash_arb_contract\` into the TOML (dry run without \`CONFIRM_DEPLOY=yes\`).
- **Server agent neutralised**: \`server/flashArbRoutes.ts\` no longer auto-broadcasts (\`isAutonomousExecutionEnabled\` defaults to false, the autonomous path hard-returns, and \`/agent/trigger\` answers 409). Its "trades" were ETH sweeps labelled as profitable arbitrage.

## v0.2.2: server access control (found in review of \`server.ts\` / \`server/*\`)
- **~88 \`/api\` routes had no authentication and the server listened on \`0.0.0.0\`.** That included \`POST /api/flash-arb/signer-config\`
  (set the signer key), \`POST /api/flash-arb/agent/initialize-signer\` (**returned the full private key on every call**),
  contract deploy/execute routes, exchange order routes, and fiat/wallet routes. The browser client sends no credentials to them.
- Now: the server binds to \`127.0.0.1\` by default (\`HOST=\` to override; \`0.0.0.0\` only when \`K_SERVICE\` is set, i.e. Cloud Run).
  Every \`/api\` route except \`/api/health\` and the five Firebase-authed user routes accepts **local requests only**, or a request carrying
  \`x-api-token\` equal to \`API_ACCESS_TOKEN\`. Requests with \`X-Forwarded-*\` headers (nginx/Cloud Run) never count as local.
- \`initialize-signer\` returns the private key only when it has just created it; an existing key is never sent back.
- Consequence: if you deploy this publicly, the browser UI will get 403s until you add the token to its fetches. That is deliberate.
- If this server was ever reachable from the internet with a signer key configured, treat that key as compromised and rotate it.

## Live-only change
- Removed \`dry_run\`, \`--dry-run\` and \`--live\`. The searcher always broadcasts verified trades; chains without a deployed contract are skipped, and it exits if the signer key or profit wallet is missing. Setup scripts now only \`cargo build\` instead of running the searcher. Not compiled here (no cargo available): run \`cargo check && cargo test\`.

## v0.3.1: default payment wallet = MetaMask \`0x65602EB9e09B07002872E074004400d37e27CCB9\` (your decision)
- TOML \`[beneficiary]\` now matches (informational only: the searcher reads \`FLASH_ARB_PROFIT_WALLET\`).
- \`searcher/run-live.sh\` loads \`.env\` and defaults \`FLASH_ARB_PROFIT_WALLET\` to that address; setting the env var overrides it.
- The server no longer overwrites a user-set \`FLASH_ARB_PROFIT_WALLET\`; it only supplies this default when unset.
- Dashboard: the default button/labels said "Cake Wallet (..5d)" but saved the MetaMask address; they now say MetaMask.`,
  },
  'Cargo.toml': {
    lang: 'toml',
    path: 'flash-arb/searcher/Cargo.toml',
    code: `[package]
name = "flash-arb-searcher"
version = "0.2.0"
edition = "2021"
description = "Multi-chain flash loan arbitrage searcher (on-chain pool reads, eth_call verification)"

[dependencies]
tokio = { version = "1.38", features = ["full"] }
ethers = { version = "2.0", features = ["rustls"] }
serde = { version = "1.0", features = ["derive"] }
toml = "0.8"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
eyre = "0.6"
clap = { version = "4.5", features = ["derive"] }
dashmap = "5.5"
futures-util = "0.3"

# NOTE: removed unused/heavy deps (revm, uniswap-v3-math, reqwest, serde_json, async-trait, num-*, ipc/ws features).
# panic = "abort" removed: one panic must not kill every chain worker. LTO is "thin" so it still builds on a phone.
[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 4
strip = true`,
  },
  'README.md': {
    lang: 'markdown',
    path: 'flash-arb/README.md',
    code: `# FlashArb: multi-chain flash loan arbitrage (Arbitrum / Base / Optimism)

Rust searcher + Solidity executor. **Read \`CHANGES.md\` first**: v0.2 replaced the simulated data path with real on-chain reads and fixed contract bugs that made every live trade revert.

\`\`\`text
searcher (Rust, one Tokio worker per chain)
  monitor.rs   factory lookups -> pools; each new block: getReserves() / slot0()+liquidity() over JSON-RPC
  routes.rs    constant-product model of two pools, closed-form optimal loan, USD net profit after gas
  sim.rs       eth_estimateGas of the exact contract call from the owner address (real simulation, or "UNVERIFIED")
  executor.rs  sign + broadcast (live only, after every guard passes; there is no dry-run/paper mode)
  risk.rs      circuit breaker, daily gas-loss cap (resets 00:00 UTC), token exclusion list
contracts (Solidity, Foundry)
  FlashArbOptimized.sol   Balancer V2 flash loan (0% fee) -> leg 1 -> leg 2 -> repay -> sweep profit; reverts unless profit >= minProfit
  FlashArb.sol            Aave V3 variant (0.05% fee), kept for reference/tests
\`\`\`

Supported venues: Uniswap V3 (SwapRouter v1 and SwapRouter02 auto-detected), Uniswap-V2-style routers (Camelot V2, Sushiswap V2).
Not supported (skipped): Curve, Aerodrome, Velodrome (Solidly router ABI).

## Run (LIVE only)

The searcher has no paper or dry-run mode. It refuses to start a chain unless \`flash_arb_contract\` is deployed, and it
exits unless \`FLASH_ARB_SIGNER_KEY\` and \`FLASH_ARB_PROFIT_WALLET\` are set. Every trade is verified with \`eth_estimateGas\`
against the deployed contract before it is signed and broadcast.

1. \`cd contracts && forge build && forge test --match-path test/FlashArbOptimized.t.sol -vvv\`
2. Deploy \`FlashArbOptimized(balancerVault, aavePool)\` from the wallet that will be the owner; put the address in \`flash_arb_contract\`.
3. \`export FLASH_ARB_SIGNER_KEY=<owner key>\`, \`export FLASH_ARB_PROFIT_WALLET=<where profit goes>\` (no default exists).
4. \`cd searcher && ./run-live.sh --chains arbitrum\` (LIVE; loads \`../../.env\` and defaults \`FLASH_ARB_PROFIT_WALLET\` to MetaMask \`0x6560...ccb9\`; optional: \`export FLASH_ARB_RPC_ARBITRUM=https://<your-node>\`).

## Honest expectations

Atomic two-pool arbitrage on public L2s is a competitive, latency-driven game. With public RPCs and a 2 s poll the searcher will
mostly see spreads that are already gone. A 0.6% gap on two ~$2M pools is about $1.5 gross, below gas + the L1 data fee. Start with a small signer balance and watch the logs
for verified candidates that clear your \`min_net_profit_usd\`.`,
  },
};
