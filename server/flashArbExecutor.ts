import { ethers } from 'ethers';

export type ErcStandard =
  | 'ERC-20'
  | 'ERC-2612'
  | 'ERC-4626'
  | 'ERC-777'
  | 'ERC-721'
  | 'ERC-1155'
  | 'UNKNOWN';

export interface ArbitrumTokenInfo {
  sym: string;
  addr: string;
  dec: number;
  ercStandard?: ErcStandard;
  tokenId?: string;
  arbCompatible?: boolean;
  sweepCompatible?: boolean;
  walletSweepCompatible?: boolean;
  compatibilityNote?: string;
}

export type BlockchainLayer = 'L1' | 'L2' | 'L3';
export type AllLayerFilter = BlockchainLayer | 'L4' | 'ALL';

export type SupportedArbChain =
  | 'ethereum'
  | 'polygon'
  | 'bsc'
  | 'avalanche'
  | 'arbitrum'
  | 'base'
  | 'optimism'
  | 'linea'
  | 'scroll'
  | 'apechain';

export const ALL_SUPPORTED_ARB_CHAINS: SupportedArbChain[] = [
  'ethereum',
  'polygon',
  'bsc',
  'avalanche',
  'arbitrum',
  'base',
  'optimism',
  'linea',
  'scroll',
  'apechain',
];

export function isSupportedArbChain(chain: unknown): chain is SupportedArbChain {
  return typeof chain === 'string' && (ALL_SUPPORTED_ARB_CHAINS as string[]).includes(chain.toLowerCase());
}

export interface ChainLayerMetadata {
  chain: SupportedArbChain;
  name: string;
  shortName: string;
  layer: BlockchainLayer;
  chainId: number;
  chainIdHex: string;
  nativeSymbol: string;
  wrappedNativeSymbol: string;
  parentChain: SupportedArbChain | null;
  settlementModel: string;
  explorer: string;
  balancerVault: string;
  aavePool: string;
  multicall3: string;
  cancunEip1153: boolean;
  defaultFlashProvider: 'BALANCER_V2' | 'AAVE_V3' | 'UNISWAP_V3_FLASH';
  isRollup: boolean;
}

const MULTICALL3_CANONICAL = '0xcA11bde05977b3631167028862bE2a173976CA11';

export const CHAIN_LAYER_META: Record<SupportedArbChain, ChainLayerMetadata> = {
  ethereum: {
    chain: 'ethereum',
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    layer: 'L1',
    chainId: 1,
    chainIdHex: '0x1',
    nativeSymbol: 'ETH',
    wrappedNativeSymbol: 'WETH',
    parentChain: null,
    settlementModel: 'L1 Sovereign Proof-of-Stake Settlement',
    explorer: 'https://etherscan.io',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'BALANCER_V2',
    isRollup: false,
  },
  polygon: {
    chain: 'polygon',
    name: 'Polygon PoS',
    shortName: 'Polygon',
    layer: 'L1',
    chainId: 137,
    chainIdHex: '0x89',
    nativeSymbol: 'POL',
    wrappedNativeSymbol: 'WMATIC',
    parentChain: 'ethereum',
    settlementModel: 'L1 High-Throughput Sidechain / Heimdall PoS',
    explorer: 'https://polygonscan.com',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'BALANCER_V2',
    isRollup: false,
  },
  bsc: {
    chain: 'bsc',
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    layer: 'L1',
    chainId: 56,
    chainIdHex: '0x38',
    nativeSymbol: 'BNB',
    wrappedNativeSymbol: 'WBNB',
    parentChain: null,
    settlementModel: 'L1 Parlia PoSA Consensus',
    explorer: 'https://bscscan.com',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x6807dc923806fE8Fd134338EABCA509979a7e0cB',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'AAVE_V3',
    isRollup: false,
  },
  avalanche: {
    chain: 'avalanche',
    name: 'Avalanche C-Chain',
    shortName: 'Avalanche',
    layer: 'L1',
    chainId: 43114,
    chainIdHex: '0xa86a',
    nativeSymbol: 'AVAX',
    wrappedNativeSymbol: 'WAVAX',
    parentChain: null,
    settlementModel: 'L1 Snowman Sub-Second Finality Consensus',
    explorer: 'https://snowtrace.io',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'BALANCER_V2',
    isRollup: false,
  },
  arbitrum: {
    chain: 'arbitrum',
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    layer: 'L2',
    chainId: 42161,
    chainIdHex: '0xa4b1',
    nativeSymbol: 'ETH',
    wrappedNativeSymbol: 'WETH',
    parentChain: 'ethereum',
    settlementModel: 'L2 Optimistic Nitro Rollup -> Ethereum L1',
    explorer: 'https://arbiscan.io',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'BALANCER_V2',
    isRollup: true,
  },
  base: {
    chain: 'base',
    name: 'Base Mainnet',
    shortName: 'Base',
    layer: 'L2',
    chainId: 8453,
    chainIdHex: '0x2105',
    nativeSymbol: 'ETH',
    wrappedNativeSymbol: 'WETH',
    parentChain: 'ethereum',
    settlementModel: 'L2 Optimistic OP-Stack Rollup -> Ethereum L1',
    explorer: 'https://basescan.org',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'BALANCER_V2',
    isRollup: true,
  },
  optimism: {
    chain: 'optimism',
    name: 'Optimism Mainnet',
    shortName: 'Optimism',
    layer: 'L2',
    chainId: 10,
    chainIdHex: '0xa',
    nativeSymbol: 'ETH',
    wrappedNativeSymbol: 'WETH',
    parentChain: 'ethereum',
    settlementModel: 'L2 Optimistic OP-Stack Bedrock -> Ethereum L1',
    explorer: 'https://optimistic.etherscan.io',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'BALANCER_V2',
    isRollup: true,
  },
  linea: {
    chain: 'linea',
    name: 'Linea zkEVM',
    shortName: 'Linea',
    layer: 'L2',
    chainId: 59144,
    chainIdHex: '0xe708',
    nativeSymbol: 'ETH',
    wrappedNativeSymbol: 'WETH',
    parentChain: 'ethereum',
    settlementModel: 'L2 Type-2 zkEVM Rollup -> Ethereum L1',
    explorer: 'https://lineascan.build',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x0000000000000000000000000000000000000000',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'UNISWAP_V3_FLASH',
    isRollup: true,
  },
  scroll: {
    chain: 'scroll',
    name: 'Scroll zkEVM',
    shortName: 'Scroll',
    layer: 'L2',
    chainId: 534352,
    chainIdHex: '0x82750',
    nativeSymbol: 'ETH',
    wrappedNativeSymbol: 'WETH',
    parentChain: 'ethereum',
    settlementModel: 'L2 Bytecode zkEVM Rollup -> Ethereum L1',
    explorer: 'https://scrollscan.com',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    aavePool: '0x11fCfe756c05AD438e312a7fd934381537D3cFfe',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'AAVE_V3',
    isRollup: true,
  },
  apechain: {
    chain: 'apechain',
    name: 'ApeChain Orbit L3',
    shortName: 'ApeChain',
    layer: 'L3',
    chainId: 33139,
    chainIdHex: '0x8173',
    nativeSymbol: 'APE',
    wrappedNativeSymbol: 'WAPE',
    parentChain: 'arbitrum',
    settlementModel: 'L3 Arbitrum Orbit App-Chain -> Arbitrum L2 -> Ethereum L1',
    explorer: 'https://apescan.io',
    balancerVault: '0x0000000000000000000000000000000000000000',
    aavePool: '0x0000000000000000000000000000000000000000',
    multicall3: MULTICALL3_CANONICAL,
    cancunEip1153: true,
    defaultFlashProvider: 'UNISWAP_V3_FLASH',
    isRollup: true,
  },
};

export const ARBITRUM_TOKENS: Record<string, ArbitrumTokenInfo> = {
  WETH: { sym: 'WETH', addr: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (WETH9) · FlashArb & Sweep Compatible' },
  USDC: { sym: 'USDC', addr: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
  USDCe: { sym: 'USDC.e', addr: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
  USDT: { sym: 'USDT', addr: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (SafeERC20) · FlashArb & Sweep Compatible' },
  DAI: { sym: 'DAI', addr: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
  ARB: { sym: 'ARB', addr: '0x912CE59144191C1204E64559FE8253a0e49E6548', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
  WBTC: { sym: 'WBTC', addr: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  LINK: { sym: 'LINK', addr: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  GMX: { sym: 'GMX', addr: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  AAVE: { sym: 'AAVE', addr: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  PENDLE: { sym: 'PENDLE', addr: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  UNI: { sym: 'UNI', addr: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
  cbETH: { sym: 'cbETH', addr: '0x1DEBd73E752bEaF79865Fd6446b0c970EaE7732f', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 LST · FlashArb & Sweep Compatible' },
  ezETH: { sym: 'ezETH', addr: '0x2416092f143378750bb29b79eD961ab195CcEea5', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 LRT · FlashArb & Sweep Compatible' },
  MAGIC: { sym: 'MAGIC', addr: '0x539bdE0d7Dbd336b79148AA742883198BBF60342', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  RDNT: { sym: 'RDNT', addr: '0x3082CC23568eA640225c2467653dB90e9250AaA0', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  FRAX: { sym: 'FRAX', addr: '0x17FC002b466eEc40DaE837Fc4bE5c67993ddBd6F', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  USDe: { sym: 'USDe', addr: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
  sUSDe: { sym: 'sUSDe', addr: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2', dec: 18, ercStandard: 'ERC-4626', arbCompatible: false, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-4626 Tokenized Vault (ERC-20) · Sweep Compatible (excluded from arb swaps)' },
  wstETH: { sym: 'wstETH', addr: '0x5979D7b546E38E414F7E9822514be443A4800529', dec: 18, ercStandard: 'ERC-2612', arbCompatible: false, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Non-rebasing LST · Sweep Compatible (excluded in arbitrum.toml)' },
};

export const CHAIN_TOKENS: Record<SupportedArbChain, Record<string, ArbitrumTokenInfo>> = {
  ethereum: {
    WETH: { sym: 'WETH', addr: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (WETH9 L1) · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    USDT: { sym: 'USDT', addr: '0xdAC17F958D2ee523a2206206994597C13D831ec7', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Non-standard approve ERC-20 (SafeERC20) · FlashArb & Sweep Compatible' },
    WBTC: { sym: 'WBTC', addr: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    DAI: { sym: 'DAI', addr: '0x6B175474E89094C44Da98b954EedeAC495271d0F', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + Permit · FlashArb & Sweep Compatible' },
    LINK: { sym: 'LINK', addr: '0x514910771AF9Ca656af840dff83E8264EcF986CA', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    UNI: { sym: 'UNI', addr: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    AAVE: { sym: 'AAVE', addr: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  },
  polygon: {
    WMATIC: { sym: 'WMATIC', addr: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (Wrapped POL) · FlashArb & Sweep Compatible' },
    WETH: { sym: 'WETH', addr: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (PoS WETH) · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Native Circle USDC · FlashArb & Sweep Compatible' },
    USDCe: { sym: 'USDC.e', addr: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Bridged USDC.e · FlashArb & Sweep Compatible' },
    USDT: { sym: 'USDT', addr: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (SafeERC20) · FlashArb & Sweep Compatible' },
    WBTC: { sym: 'WBTC', addr: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    DAI: { sym: 'DAI', addr: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    LINK: { sym: 'LINK', addr: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    AAVE: { sym: 'AAVE', addr: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  },
  bsc: {
    WBNB: { sym: 'WBNB', addr: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'BEP-20 Wrapped BNB · FlashArb & Sweep Compatible' },
    USDT: { sym: 'USDT', addr: '0x55d398326f99059fF775485246999027B3197955', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Binance-Peg BSC-USD (18 decimals) · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Binance-Peg USDC (18 decimals) · FlashArb & Sweep Compatible' },
    WETH: { sym: 'WETH', addr: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Binance-Peg ETH (18 decimals) · FlashArb & Sweep Compatible' },
    BTCB: { sym: 'BTCB', addr: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Binance-Peg BTCB (18 decimals) · FlashArb & Sweep Compatible' },
    CAKE: { sym: 'CAKE', addr: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'PancakeSwap Token · FlashArb & Sweep Compatible' },
  },
  avalanche: {
    WAVAX: { sym: 'WAVAX', addr: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 Wrapped AVAX · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Native Circle USDC · FlashArb & Sweep Compatible' },
    USDT: { sym: 'USDT', addr: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Native USDt on Avalanche · FlashArb & Sweep Compatible' },
    WETH: { sym: 'WETH', addr: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'WETH.e · FlashArb & Sweep Compatible' },
    BTCb: { sym: 'BTC.b', addr: '0x152b9d0FdC40C096757F570A51E494bd4b943E50', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Avalanche Bitcoin Bridge · FlashArb & Sweep Compatible' },
    WBTC: { sym: 'WBTC', addr: '0x50b7545627a5162F82A992c33b87aDc75187B218', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'WBTC.e · FlashArb & Sweep Compatible' },
    JOE: { sym: 'JOE', addr: '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'JoeToken · FlashArb & Sweep Compatible' },
  },
  arbitrum: ARBITRUM_TOKENS,
  base: {
    WETH: { sym: 'WETH', addr: '0x4200000000000000000000000000000000000006', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (WETH9) · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    USDbC: { sym: 'USDbC', addr: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    USDT: { sym: 'USDT', addr: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (SafeERC20) · FlashArb & Sweep Compatible' },
    cbETH: { sym: 'cbETH', addr: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 LST · FlashArb & Sweep Compatible' },
    wstETH: { sym: 'wstETH', addr: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Non-rebasing LST · FlashArb & Sweep Compatible' },
    ezETH: { sym: 'ezETH', addr: '0x2416092f143378750bb29b79eD961ab195CcEea5', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 LRT · FlashArb & Sweep Compatible' },
    AERO: { sym: 'AERO', addr: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    DAI: { sym: 'DAI', addr: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    cbBTC: { sym: 'cbBTC', addr: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    DEGEN: { sym: 'DEGEN', addr: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    VIRTUAL: { sym: 'VIRTUAL', addr: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    MORPHO: { sym: 'MORPHO', addr: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
  },
  optimism: {
    WETH: { sym: 'WETH', addr: '0x4200000000000000000000000000000000000006', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (WETH9) · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    USDCe: { sym: 'USDC.e', addr: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    USDT: { sym: 'USDT', addr: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (SafeERC20) · FlashArb & Sweep Compatible' },
    DAI: { sym: 'DAI', addr: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    OP: { sym: 'OP', addr: '0x4200000000000000000000000000000000000042', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    WBTC: { sym: 'WBTC', addr: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    wstETH: { sym: 'wstETH', addr: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb', dec: 18, ercStandard: 'ERC-2612', arbCompatible: false, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Non-rebasing LST · Sweep Compatible (excluded from arb swaps)' },
  },
  linea: {
    WETH: { sym: 'WETH', addr: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 Wrapped ETH (Linea) · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'USDC.e / Native USDC on Linea · FlashArb & Sweep Compatible' },
    USDT: { sym: 'USDT', addr: '0xA219439258ca9da29E9Cc4cE5596924745e12B93', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 USDT (Linea) · FlashArb & Sweep Compatible' },
    WBTC: { sym: 'WBTC', addr: '0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 WBTC · FlashArb & Sweep Compatible' },
    DAI: { sym: 'DAI', addr: '0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 DAI · FlashArb & Sweep Compatible' },
    ezETH: { sym: 'ezETH', addr: '0x2416092f143378750bb29b79eD961ab195CcEea5', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Renzo Restaked ETH · FlashArb & Sweep Compatible' },
    wstETH: { sym: 'wstETH', addr: '0xB5beDd42000b71FddE22D3eE8a79Bd49A568fC8F', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Lido wstETH · FlashArb & Sweep Compatible' },
  },
  scroll: {
    WETH: { sym: 'WETH', addr: '0x5300000000000000000000000000000000000004', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 Wrapped ETH (Scroll) · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 USDC (Scroll) · FlashArb & Sweep Compatible' },
    USDT: { sym: 'USDT', addr: '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df', dec: 6, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 USDT (Scroll) · FlashArb & Sweep Compatible' },
    WBTC: { sym: 'WBTC', addr: '0x3C1BCa5a656e69edCD0D4E36BEbb3FcDAcA60Cf1', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 WBTC · FlashArb & Sweep Compatible' },
    DAI: { sym: 'DAI', addr: '0xcA77eB3fEFe3725Dc33bccB54eDEFc3D9f764f97', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 DAI · FlashArb & Sweep Compatible' },
    SCR: { sym: 'SCR', addr: '0xd29687c813D741E2F938F4aC377128810E217b1b', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Scroll Governance Token · FlashArb & Sweep Compatible' },
  },
  apechain: {
    WAPE: { sym: 'WAPE', addr: '0x48b62137EdfA95a428D35C09E44256a739F6B557', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'Wrapped APE Native Gas Token (Orbit L3) · Sweep & L4 Compatible' },
    ApeUSD: { sym: 'ApeUSD', addr: '0xA2235d059F80e176D931Ef76b6C51953Eb3fBEf4', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ApeChain Stablecoin (18 dec) · Sweep & L4 Compatible' },
    ApeETH: { sym: 'ApeETH', addr: '0xcF800F4948D16F23333508191B1B1591daF70438', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ApeChain Yield-Bearing ETH · Sweep & L4 Compatible' },
  },
};

export function getChainTokens(chain: string): ArbitrumTokenInfo[] {
  const raw = String(chain || 'arbitrum').toLowerCase();
  const key = isSupportedArbChain(raw) ? raw : 'arbitrum';
  return Object.values(CHAIN_TOKENS[key]);
}

export interface DexRouterSpec {
  router: string | null;
  isV3: boolean;
  supported: boolean;
}

export const ARBITRUM_DEX_ROUTERS: Record<string, DexRouterSpec> = {
  'Uniswap V3': {
    router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    isV3: true,
    supported: true,
  },
  'PancakeSwap V3': {
    router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    isV3: true,
    supported: true,
  },
  'SushiSwap V3': {
    router: '0x8A21F6768C1f8075791D08546Dadf6daA0bE820c',
    isV3: true,
    supported: true,
  },
  'Sushiswap V2': {
    router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    isV3: false,
    supported: true,
  },
  'Camelot V2': {
    // CamelotRouter uses 6-arg swapExactTokensForTokensSupportingFeeOnTransferTokens(..., referrer, deadline),
    // so FlashArbOptimized._swapV2 (5-arg IUniswapV2Router02) is incompatible; monitored for spreads only.
    router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
    isV3: false,
    supported: false,
  },
  'Camelot V3': {
    // Algebra router omits `uint24 fee` in exactInputSingle, so FlashArbOptimized._swapV3 cannot call it.
    router: null,
    isV3: true,
    supported: false,
  },
};

export const CHAIN_DEX_ROUTERS: Record<SupportedArbChain, Record<string, DexRouterSpec>> = {
  ethereum: {
    'Uniswap V3': {
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      isV3: true,
      supported: true,
    },
    'PancakeSwap V3': {
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      isV3: true,
      supported: true,
    },
    'Uniswap V2': {
      router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      isV3: false,
      supported: true,
    },
    'Sushiswap V2': {
      router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
      isV3: false,
      supported: true,
    },
  },
  polygon: {
    'Uniswap V3': {
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      isV3: true,
      supported: true,
    },
    'SushiSwap V3': {
      router: '0x0aF89E1620b96170e2a9D0b68fEebb767eD044c3',
      isV3: true,
      supported: true,
    },
    'QuickSwap V2': {
      router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
      isV3: false,
      supported: true,
    },
    'Sushiswap V2': {
      router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      isV3: false,
      supported: true,
    },
    'QuickSwap V3': {
      // Algebra router omits `uint24 fee` in exactInputSingle; monitor-only unless contract exposes Algebra
      router: null,
      isV3: true,
      supported: false,
    },
  },
  bsc: {
    'PancakeSwap V3': {
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      isV3: true,
      supported: true,
    },
    'Uniswap V3': {
      // SwapRouter02 on BSC (supported via ISwapRouter02 fallback in FlashArbOptimized._swapV3)
      router: '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2',
      isV3: true,
      supported: true,
    },
    'PancakeSwap V2': {
      router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      isV3: false,
      supported: true,
    },
    'Sushiswap V2': {
      router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      isV3: false,
      supported: true,
    },
  },
  avalanche: {
    'Uniswap V3': {
      // SwapRouter02 on Avalanche
      router: '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE',
      isV3: true,
      supported: true,
    },
    'Trader Joe V1': {
      router: '0x60aE616a2155Ee3d9A68541Ba4544862310933d4',
      isV3: false,
      supported: true,
    },
    'Pangolin V2': {
      router: '0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106',
      isV3: false,
      supported: true,
    },
    'Sushiswap V2': {
      router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      isV3: false,
      supported: true,
    },
  },
  arbitrum: ARBITRUM_DEX_ROUTERS,
  base: {
    'Uniswap V3': {
      // Uniswap V3 SwapRouter02 on Base (supported via FlashArbOptimized._swapV3 ISwapRouter02 fallback)
      router: '0x2626664c2603336E57B271c5C0b26F421741e481',
      isV3: true,
      supported: true,
    },
    'PancakeSwap V3': {
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      isV3: true,
      supported: true,
    },
    'SushiSwap V3': {
      router: '0xFB7eF66a7e61224DD6FcD0D7d9C3be5C8B049b9f',
      isV3: true,
      supported: true,
    },
    'Uniswap V2': {
      router: '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
      isV3: false,
      supported: true,
    },
    'Sushiswap V2': {
      router: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
      isV3: false,
      supported: true,
    },
    'BaseSwap V2': {
      router: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
      isV3: false,
      supported: true,
    },
    'Aerodrome Slipstream': {
      // Slipstream router exactInputSingle takes `int24 tickSpacing` rather than `uint24 fee`; monitor-only.
      router: null,
      isV3: true,
      supported: false,
    },
  },
  optimism: {
    'Uniswap V3': {
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      isV3: true,
      supported: true,
    },
    'SushiSwap V3': {
      router: '0x8c32Fd078B89Eccb06B40289A539D84A4aA9FDA6',
      isV3: true,
      supported: true,
    },
    'Uniswap V2': {
      router: '0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2',
      isV3: false,
      supported: true,
    },
    'Sushiswap V2': {
      router: '0x2ABf469074dc0b54d793850807E6eb5Faf2625b1',
      isV3: false,
      supported: true,
    },
    'Velodrome Slipstream': {
      // Slipstream router exactInputSingle takes `int24 tickSpacing` rather than `uint24 fee`; monitor-only.
      router: null,
      isV3: true,
      supported: false,
    },
  },
  linea: {
    'Uniswap V3': {
      router: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      isV3: true,
      supported: true,
    },
    'PancakeSwap V3': {
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      isV3: true,
      supported: true,
    },
    'Lynex V3': {
      // Algebra exactInputSingle omits uint24 fee; monitor-only
      router: null,
      isV3: true,
      supported: false,
    },
  },
  scroll: {
    'Uniswap V3': {
      router: '0xfc30937f5cDe93Df8d48aCAF7e6f5D8D8A31F636',
      isV3: true,
      supported: true,
    },
    'SushiSwap V3': {
      router: '0x734583f62Bb6ACe3c9bA9bd5A53143CA2Ce8C55A',
      isV3: true,
      supported: true,
    },
    'Nuri V3': {
      router: '0xAAAE99091Fbb28D400029052821653C1C752483B',
      isV3: true,
      supported: true,
    },
  },
  apechain: {
    'Camelot V3': {
      // Algebra router on ApeChain L3
      router: null,
      isV3: true,
      supported: false,
    },
  },
};

export const CAMELOT_V3_ROUTER_ADDRESS = '0x1F721E2E82F6676FCE4eA07A5958cF098D339e18';
export const CAMELOT_V2_ROUTER_ADDRESS = '0xc873fEcbd354f5A56E00E710B90EF4201db2448d';

export interface RouterCapabilityOptions {
  supportsAlgebra?: boolean;
  supportsCamelotV2?: boolean;
  camelotV3Adapter?: string | null;
}

export function getChainDexRouters(chain?: string): Record<string, DexRouterSpec> {
  const raw = String(chain || 'arbitrum').toLowerCase();
  const key = isSupportedArbChain(raw) ? raw : 'arbitrum';
  return CHAIN_DEX_ROUTERS[key];
}

/**
 * Resolves effective DEX router specs for a chain given runtime capabilities:
 * - If deployed FlashArbOptimized exposes Algebra/Camelot V2 support (`routerCapabilities()`), enables native routers.
 * - Else if a deployed CamelotV3SwapAdapter address is configured, enables Camelot V3 via the ISwapRouter shim.
 */
export function getEffectiveChainDexRouters(
  chain?: string,
  caps?: RouterCapabilityOptions
): Record<string, DexRouterSpec> {
  const base = getChainDexRouters(chain);
  const key = (chain || 'arbitrum').toLowerCase() as SupportedArbChain;
  if (key !== 'arbitrum' || (!caps?.supportsAlgebra && !caps?.supportsCamelotV2 && !caps?.camelotV3Adapter)) {
    return base;
  }
  const out: Record<string, DexRouterSpec> = { ...base };
  if (caps.supportsAlgebra) {
    out['Camelot V3'] = {
      router: CAMELOT_V3_ROUTER_ADDRESS,
      isV3: true,
      supported: true,
    };
  } else if (caps.camelotV3Adapter && /^0x[a-fA-F0-9]{40}$/.test(caps.camelotV3Adapter)) {
    out['Camelot V3'] = {
      router: caps.camelotV3Adapter,
      isV3: true,
      supported: true,
    };
  }
  if (caps.supportsCamelotV2) {
    out['Camelot V2'] = {
      router: CAMELOT_V2_ROUTER_ADDRESS,
      isV3: false,
      supported: true,
    };
  }
  return out;
}

export interface ParsedSimulatorDexSelection {
  dex: string;
  feePercent: number;
  explicitFee: boolean;
}

/**
 * Maps Simulator UI DEX dropdown labels (e.g. "Uniswap V3 (0.05% Tick)",
 * "Uniswap V2 (CPMM)", "PancakeSwap V3") to canonical chain router keys and fee %.
 */
export function parseSimulatorDexSelection(label: string): ParsedSimulatorDexSelection {
  const raw = String(label || '').trim();
  const lower = raw.toLowerCase();
  const feeMatch = raw.match(/\((\d+(?:\.\d+)?)%\s*(?:tick)?\)/i);
  const parsedFee = feeMatch ? Number(feeMatch[1]) : NaN;

  if (lower.startsWith('uniswap v3')) {
    return {
      dex: 'Uniswap V3',
      feePercent: Number.isFinite(parsedFee) && parsedFee > 0 ? parsedFee : 0.05,
      explicitFee: Number.isFinite(parsedFee) && parsedFee > 0,
    };
  }
  if (lower.startsWith('pancakeswap v3')) {
    return {
      dex: 'PancakeSwap V3',
      feePercent: Number.isFinite(parsedFee) && parsedFee > 0 ? parsedFee : 0.05,
      explicitFee: Number.isFinite(parsedFee) && parsedFee > 0,
    };
  }
  if (lower.startsWith('sushiswap v3')) {
    return {
      dex: 'SushiSwap V3',
      feePercent: Number.isFinite(parsedFee) && parsedFee > 0 ? parsedFee : 0.05,
      explicitFee: Number.isFinite(parsedFee) && parsedFee > 0,
    };
  }
  if (lower.startsWith('sushiswap v2')) {
    return { dex: 'Sushiswap V2', feePercent: 0.30, explicitFee: true };
  }
  if (lower.startsWith('uniswap v2')) {
    return { dex: 'Uniswap V2', feePercent: 0.30, explicitFee: true };
  }
  if (lower.startsWith('pancakeswap v2')) {
    return { dex: 'PancakeSwap V2', feePercent: 0.25, explicitFee: true };
  }
  if (lower.startsWith('quickswap v3')) {
    return { dex: 'QuickSwap V3', feePercent: 0.05, explicitFee: false };
  }
  if (lower.startsWith('quickswap v2')) {
    return { dex: 'QuickSwap V2', feePercent: 0.30, explicitFee: true };
  }
  if (lower.startsWith('trader joe v1') || lower === 'trader joe v1') {
    return { dex: 'Trader Joe V1', feePercent: 0.30, explicitFee: true };
  }
  if (lower.startsWith('pangolin v2')) {
    return { dex: 'Pangolin V2', feePercent: 0.30, explicitFee: true };
  }
  if (lower.startsWith('lynex v3')) {
    return { dex: 'Lynex V3', feePercent: 0.05, explicitFee: false };
  }
  if (lower.startsWith('nuri v3')) {
    return {
      dex: 'Nuri V3',
      feePercent: Number.isFinite(parsedFee) && parsedFee > 0 ? parsedFee : 0.05,
      explicitFee: Number.isFinite(parsedFee) && parsedFee > 0,
    };
  }
  if (lower.startsWith('saru v2')) {
    return { dex: 'Saru V2', feePercent: 0.30, explicitFee: true };
  }
  if (lower.startsWith('baseswap v2')) {
    return { dex: 'BaseSwap V2', feePercent: 0.25, explicitFee: true };
  }
  if (lower.startsWith('camelot v3')) {
    return { dex: 'Camelot V3', feePercent: 0.08, explicitFee: false };
  }
  if (lower.startsWith('camelot v2')) {
    return { dex: 'Camelot V2', feePercent: 0.30, explicitFee: true };
  }
  if (lower.startsWith('aerodrome slipstream')) {
    return { dex: 'Aerodrome Slipstream', feePercent: 0.05, explicitFee: false };
  }
  if (lower.startsWith('velodrome slipstream')) {
    return { dex: 'Velodrome Slipstream', feePercent: 0.05, explicitFee: false };
  }
  if (lower.startsWith('curve')) {
    return { dex: 'Curve Finance', feePercent: 0.04, explicitFee: true };
  }
  if (lower.startsWith('balancer')) {
    return { dex: 'Balancer V2', feePercent: 0.08, explicitFee: true };
  }
  if (lower.startsWith('trader joe')) {
    return { dex: 'Trader Joe V2.1', feePercent: 0.08, explicitFee: true };
  }
  return {
    dex: raw || 'Uniswap V3',
    feePercent: Number.isFinite(parsedFee) && parsedFee > 0 ? parsedFee : 0.05,
    explicitFee: Number.isFinite(parsedFee) && parsedFee > 0,
  };
}

export const V3_QUOTER_V2_ADDRESSES: Record<SupportedArbChain, Partial<Record<string, string>>> = {
  ethereum: {
    'Uniswap V3': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    'PancakeSwap V3': '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
  },
  polygon: {
    'Uniswap V3': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  },
  bsc: {
    'PancakeSwap V3': '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    'Uniswap V3': '0x78D78E420Da98ad378D7799bE8f4AF69033EB077',
  },
  avalanche: {
    'Uniswap V3': '0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F',
  },
  arbitrum: {
    'Uniswap V3': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    'PancakeSwap V3': '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    'SushiSwap V3': '0x0524E833cCD057e4d7A296e3aaAb9f7675964Ce1',
  },
  base: {
    'Uniswap V3': '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    'PancakeSwap V3': '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    'SushiSwap V3': '0xb1E835Dc2785b52265711e17fCCb0fd018226a6e',
  },
  optimism: {
    'Uniswap V3': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  },
  linea: {
    'Uniswap V3': '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    'PancakeSwap V3': '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
  },
  scroll: {
    'Uniswap V3': '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  },
  apechain: {},
};

export const FLASH_ARB_OPTIMIZED_ABI = [
  'function owner() view returns (address)',
  'function routerCapabilities() pure returns (uint256)',
  'function executeOptimizedArbitrage(address tokenIn, address tokenOut, uint256 amount, address routerA, address routerB, uint24 feeA, uint24 feeB, uint8 routeType, uint256 minProfit, address recipient)',
  'function executeDirectFlashArb(address recipient) payable returns (bool)',
  'function rescueTokens(address token)',
  'function rescueTokensTo(address token, address recipient)',
  'error Unauthorized()',
  'error InsufficientProfit(uint256 actual, uint256 required)',
  'error ReentrancyGuardLocked()',
  'error SwapExecutionFailed(string reason)',
  'error InvalidRoute()',
  'error MinProfitRequired()',
  'event ArbitrageSwapsExecuted(address indexed tokenIn, address indexed tokenOut, uint256 amountBorrowed, uint256 netProfitSwept, address indexed recipient)',
  'event ArbitrageBroadcast(address indexed caller, address indexed recipient, uint256 value)',
];

export const ERC20_MIN_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address recipient, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

const flashArbIface = new ethers.Interface(FLASH_ARB_OPTIMIZED_ABI);
const erc20Iface = new ethers.Interface(ERC20_MIN_ABI);

/**
 * Matches FlashArbOptimized.sol SwapRouteParams.routeType:
 * 1 = UniV3 -> V2, 2 = V2 -> UniV3, 3 = UniV3 -> UniV3, 4 = V2 -> V2
 */
export function getContractRouteType(legAIsV3: boolean, legBIsV3: boolean): 1 | 2 | 3 | 4 {
  if (legAIsV3 && !legBIsV3) return 1;
  if (!legAIsV3 && legBIsV3) return 2;
  if (legAIsV3 && legBIsV3) return 3;
  return 4;
}

export function toTokenUnits(humanAmount: number, decimals: number): bigint {
  if (!Number.isFinite(humanAmount) || humanAmount <= 0) return 0n;
  const fixedDigits = Math.min(decimals, 8);
  const str = humanAmount.toFixed(fixedDigits);
  return ethers.parseUnits(str, decimals);
}

export interface RouteExecutionInput {
  chain?: SupportedArbChain;
  baseToken: ArbitrumTokenInfo;
  quoteToken: ArbitrumTokenInfo;
  buyDex: string;
  buyFeePercent: number;
  sellDex: string;
  sellFeePercent: number;
  optimalLoanBaseUnits: number;
  buyPriceQuotePerBase: number;
  buyPriceUsd: number;
  estNetProfitUsd: number;
}

export interface EncodedArbitrageCandidate {
  label: string;
  borrowedToken: ArbitrumTokenInfo;
  intermediateToken: ArbitrumTokenInfo;
  amountUnits: bigint;
  routerA: string;
  routerB: string;
  feeA: number;
  feeB: number;
  routeType: 1 | 2 | 3 | 4;
  minProfitUnits: bigint;
  recipient: string;
  calldata: string;
  scaleFactor?: number;
}

export function resolveArbitrageCandidates(
  input: RouteExecutionInput,
  recipient: string,
  scaleFactor = 1,
  routerCaps?: RouterCapabilityOptions
): EncodedArbitrageCandidate[] {
  const routers = getEffectiveChainDexRouters(input.chain, routerCaps);
  const buySpec = routers[input.buyDex];
  const sellSpec = routers[input.sellDex];
  if (!buySpec?.supported || !buySpec.router || !sellSpec?.supported || !sellSpec.router) {
    return [];
  }

  const safeScale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? Math.min(5, scaleFactor) : 1;
  const pctScale = Math.round(safeScale * 100);
  const scaleSuffix = pctScale !== 100 ? ` (${pctScale}% clip)` : '';
  const buyFeePpm = Math.round(input.buyFeePercent * 10000);
  const sellFeePpm = Math.round(input.sellFeePercent * 10000);

  const candidates: EncodedArbitrageCandidate[] = [];

  // Candidate 1: Borrow BASE token
  // Because `sell` pool prices BASE higher in QUOTE than `buy` pool,
  // Leg 1 swaps BASE -> QUOTE on `sell` pool; Leg 2 swaps QUOTE -> BASE on `buy` pool.
  const baseLoanUnits = toTokenUnits(input.optimalLoanBaseUnits * safeScale, input.baseToken.dec);
  if (baseLoanUnits > 0n) {
    const estProfitUsdPositive = input.estNetProfitUsd > 0 ? input.estNetProfitUsd * safeScale : 0;
    const estProfitBaseHuman = input.buyPriceUsd > 0 ? estProfitUsdPositive / input.buyPriceUsd : 0;
    const targetMinProfitBase = toTokenUnits(estProfitBaseHuman * 0.25, input.baseToken.dec);
    const minProfitBase = targetMinProfitBase > 1n ? targetMinProfitBase : 1n;
    const feeA = sellSpec.isV3 ? sellFeePpm : 0;
    const feeB = buySpec.isV3 ? buyFeePpm : 0;
    const routeType = getContractRouteType(sellSpec.isV3, buySpec.isV3);

    candidates.push({
      label: `Borrow ${input.baseToken.sym}: ${input.sellDex} -> ${input.buyDex}${scaleSuffix}`,
      borrowedToken: input.baseToken,
      intermediateToken: input.quoteToken,
      amountUnits: baseLoanUnits,
      routerA: sellSpec.router,
      routerB: buySpec.router,
      feeA,
      feeB,
      routeType,
      minProfitUnits: minProfitBase,
      recipient,
      scaleFactor: safeScale,
      calldata: encodeExecuteOptimizedArbitrage({
        tokenIn: input.baseToken.addr,
        tokenOut: input.quoteToken.addr,
        amount: baseLoanUnits,
        routerA: sellSpec.router,
        routerB: buySpec.router,
        feeA,
        feeB,
        routeType,
        minProfit: minProfitBase,
        recipient,
      }),
    });
  }

  // Candidate 2: Borrow QUOTE token
  // Leg 1 swaps QUOTE -> BASE on `buy` pool (where BASE is cheaper); Leg 2 swaps BASE -> QUOTE on `sell` pool.
  const quoteLoanHuman = input.optimalLoanBaseUnits * input.buyPriceQuotePerBase * safeScale;
  const quoteLoanUnits = toTokenUnits(quoteLoanHuman, input.quoteToken.dec);
  if (quoteLoanUnits > 0n) {
    const quoteUsdPrice =
      input.buyPriceQuotePerBase > 0 && input.buyPriceUsd > 0
        ? input.buyPriceUsd / input.buyPriceQuotePerBase
        : 1;
    const estProfitUsdPositive = input.estNetProfitUsd > 0 ? input.estNetProfitUsd * safeScale : 0;
    const estProfitQuoteHuman = quoteUsdPrice > 0 ? estProfitUsdPositive / quoteUsdPrice : 0;
    const targetMinProfitQuote = toTokenUnits(estProfitQuoteHuman * 0.25, input.quoteToken.dec);
    const minProfitQuote = targetMinProfitQuote > 1n ? targetMinProfitQuote : 1n;
    const feeA = buySpec.isV3 ? buyFeePpm : 0;
    const feeB = sellSpec.isV3 ? sellFeePpm : 0;
    const routeType = getContractRouteType(buySpec.isV3, sellSpec.isV3);

    candidates.push({
      label: `Borrow ${input.quoteToken.sym}: ${input.buyDex} -> ${input.sellDex}${scaleSuffix}`,
      borrowedToken: input.quoteToken,
      intermediateToken: input.baseToken,
      amountUnits: quoteLoanUnits,
      routerA: buySpec.router,
      routerB: sellSpec.router,
      feeA,
      feeB,
      routeType,
      minProfitUnits: minProfitQuote,
      recipient,
      scaleFactor: safeScale,
      calldata: encodeExecuteOptimizedArbitrage({
        tokenIn: input.quoteToken.addr,
        tokenOut: input.baseToken.addr,
        amount: quoteLoanUnits,
        routerA: buySpec.router,
        routerB: sellSpec.router,
        feeA,
        feeB,
        routeType,
        minProfit: minProfitQuote,
        recipient,
      }),
    });
  }

  return candidates;
}

/**
 * Generates execution candidates across progressive clip sizes ([100%, 50%, 25%, 10%])
 * filtered and capped against live Balancer V2 Vault ERC-20 liquidity (`max 85% of Vault balance`).
 * Prevents V3 tick-range exhaustion and Balancer zero-liquidity reverts during `eth_estimateGas`.
 */
export function buildScaledArbitrageCandidates(
  input: RouteExecutionInput,
  recipient: string,
  balancerVaultBalances?: Record<string, bigint>,
  scaleFactors: number[] = [1, 0.5, 0.25, 0.1],
  routerCaps?: RouterCapabilityOptions
): EncodedArbitrageCandidate[] {
  const full = resolveArbitrageCandidates(input, recipient, 1, routerCaps);
  if (full.length === 0) return [];

  const seenKeys = new Set<string>();
  const out: EncodedArbitrageCandidate[] = [];

  // Prioritize whichever borrow token has deeper Balancer Vault coverage for its target borrow size
  const scoredDirections = full.map((baseCand, idx) => {
    const tokenKey = baseCand.borrowedToken.addr.toLowerCase();
    const vaultBal = balancerVaultBalances?.[tokenKey];
    const maxSafe = vaultBal !== undefined ? (vaultBal * 85n) / 100n : undefined;
    const viable = maxSafe === undefined || maxSafe > 0n;
    const fullFits = maxSafe === undefined || baseCand.amountUnits <= maxSafe;
    return { baseCand, idx, tokenKey, maxSafe, viable, fullFits };
  });

  scoredDirections.sort((a, b) => {
    if (a.viable !== b.viable) return Number(b.viable) - Number(a.viable);
    if (a.fullFits !== b.fullFits) return Number(b.fullFits) - Number(a.fullFits);
    return a.idx - b.idx;
  });

  for (const dir of scoredDirections) {
    if (!dir.viable) continue;
    const baseAmount = dir.baseCand.amountUnits;
    const baseMinProfit = dir.baseCand.minProfitUnits;

    for (const scale of scaleFactors) {
      if (!(Number.isFinite(scale) && scale > 0 && scale <= 5)) continue;
      const scaleBps = BigInt(Math.max(1, Math.round(scale * 10000)));
      let scaledAmount = (baseAmount * scaleBps) / 10000n;
      if (dir.maxSafe !== undefined && scaledAmount > dir.maxSafe) {
        scaledAmount = dir.maxSafe;
      }
      if (scaledAmount <= 0n) continue;

      const dedupKey = `${dir.tokenKey}:${scaledAmount.toString()}`;
      if (seenKeys.has(dedupKey)) continue;
      seenKeys.add(dedupKey);

      const effectiveRatioNum = Number((scaledAmount * 10000n) / baseAmount) / 10000;
      const effectiveBps = BigInt(Math.max(1, Math.round(effectiveRatioNum * 10000)));
      const scaledMinProfitRaw = (baseMinProfit * effectiveBps) / 10000n;
      const scaledMinProfit = scaledMinProfitRaw > 1n ? scaledMinProfitRaw : 1n;

      const pctLabel = Math.round(effectiveRatioNum * 100);
      const baseLabel = dir.baseCand.label.replace(/\s*\(\d+%\s*clip\)$/, '');
      const label = pctLabel !== 100 ? `${baseLabel} (${pctLabel}% clip)` : baseLabel;

      out.push({
        ...dir.baseCand,
        label,
        amountUnits: scaledAmount,
        minProfitUnits: scaledMinProfit,
        scaleFactor: effectiveRatioNum,
        calldata: encodeExecuteOptimizedArbitrage({
          tokenIn: dir.baseCand.borrowedToken.addr,
          tokenOut: dir.baseCand.intermediateToken.addr,
          amount: scaledAmount,
          routerA: dir.baseCand.routerA,
          routerB: dir.baseCand.routerB,
          feeA: dir.baseCand.feeA,
          feeB: dir.baseCand.feeB,
          routeType: dir.baseCand.routeType,
          minProfit: scaledMinProfit,
          recipient,
        }),
      });
    }
  }

  return out;
}

export function rebuildCandidateWithMinProfit(
  candidate: EncodedArbitrageCandidate,
  minProfitUnits: bigint
): EncodedArbitrageCandidate {
  const safeMinProfit = minProfitUnits >= 1n ? minProfitUnits : 1n;
  return {
    ...candidate,
    minProfitUnits: safeMinProfit,
    calldata: encodeExecuteOptimizedArbitrage({
      tokenIn: candidate.borrowedToken.addr,
      tokenOut: candidate.intermediateToken.addr,
      amount: candidate.amountUnits,
      routerA: candidate.routerA,
      routerB: candidate.routerB,
      feeA: candidate.feeA,
      feeB: candidate.feeB,
      routeType: candidate.routeType,
      minProfit: safeMinProfit,
      recipient: candidate.recipient,
    }),
  };
}

/**
 * Encodes `executeOptimizedArbitrage` with `minProfit = MaxUint256` for read-only `eth_call` probing:
 * FlashArbOptimized executes the Balancer flash loan + both router swaps and reverts with
 * `InsufficientProfit(actualNetProfitWei, MaxUint256)`, exposing exact on-chain output down to 1 wei.
 */
export function buildMaxProfitProbeCalldata(candidate: EncodedArbitrageCandidate): string {
  return encodeExecuteOptimizedArbitrage({
    tokenIn: candidate.borrowedToken.addr,
    tokenOut: candidate.intermediateToken.addr,
    amount: candidate.amountUnits,
    routerA: candidate.routerA,
    routerB: candidate.routerB,
    feeA: candidate.feeA,
    feeB: candidate.feeB,
    routeType: candidate.routeType,
    minProfit: ethers.MaxUint256,
    recipient: candidate.recipient,
  });
}

export function encodeExecuteOptimizedArbitrage(params: {
  tokenIn: string;
  tokenOut: string;
  amount: bigint;
  routerA: string;
  routerB: string;
  feeA: number;
  feeB: number;
  routeType: 1 | 2 | 3 | 4;
  minProfit: bigint;
  recipient: string;
}): string {
  return flashArbIface.encodeFunctionData('executeOptimizedArbitrage', [
    params.tokenIn,
    params.tokenOut,
    params.amount,
    params.routerA,
    params.routerB,
    params.feeA,
    params.feeB,
    params.routeType,
    params.minProfit,
    params.recipient,
  ]);
}

export function encodeExecuteDirectFlashArb(recipient: string): string {
  return flashArbIface.encodeFunctionData('executeDirectFlashArb', [recipient]);
}

export function encodeRescueTokens(token: string): string {
  return flashArbIface.encodeFunctionData('rescueTokens', [token]);
}

export function encodeRescueTokensTo(token: string, recipient: string): string {
  return flashArbIface.encodeFunctionData('rescueTokensTo', [token, recipient]);
}

export function encodeErc20Transfer(recipient: string, amount: bigint): string {
  return erc20Iface.encodeFunctionData('transfer', [recipient, amount]);
}

export function decodeArbitrageSwapsExecutedLogs(
  logs: Array<{ address?: string; topics: string[]; data: string }>,
  contractAddress: string
): {
  tokenIn: string;
  tokenOut: string;
  amountBorrowed: bigint;
  netProfitSwept: bigint;
  recipient: string;
} | null {
  const targetLower = contractAddress.toLowerCase();
  for (const log of logs || []) {
    if (log.address && log.address.toLowerCase() !== targetLower) continue;
    try {
      const parsed = flashArbIface.parseLog({ topics: log.topics, data: log.data });
      if (parsed && parsed.name === 'ArbitrageSwapsExecuted') {
        return {
          tokenIn: parsed.args.tokenIn,
          tokenOut: parsed.args.tokenOut,
          amountBorrowed: BigInt(parsed.args.amountBorrowed),
          netProfitSwept: BigInt(parsed.args.netProfitSwept),
          recipient: parsed.args.recipient,
        };
      }
    } catch {
      // ignore non-matching logs
    }
  }
  return null;
}

export function parseInsufficientProfitError(errOrHex: any): { actual: bigint; required: bigint } | null {
  const rawData =
    typeof errOrHex === 'string'
      ? errOrHex
      : errOrHex?.data || errOrHex?.error?.data || errOrHex?.info?.error?.data || null;
  if (typeof rawData !== 'string' || !rawData.startsWith('0x') || rawData.length < 10) {
    return null;
  }
  try {
    const parsed = flashArbIface.parseError(rawData);
    if (parsed && parsed.name === 'InsufficientProfit') {
      return {
        actual: BigInt(parsed.args.actual),
        required: BigInt(parsed.args.required),
      };
    }
  } catch {
    // ignore non-matching error data
  }
  return null;
}

export function decodeFlashArbRevertError(err: any): string {
  const rawData =
    err?.data ||
    err?.error?.data ||
    err?.info?.error?.data ||
    null;

  if (typeof rawData === 'string' && rawData.startsWith('0x') && rawData.length >= 10) {
    try {
      const parsed = flashArbIface.parseError(rawData);
      if (parsed) {
        if (parsed.name === 'InsufficientProfit') {
          return `InsufficientProfit(actual=${parsed.args.actual.toString()}, required=${parsed.args.required.toString()})`;
        }
        if (parsed.name === 'SwapExecutionFailed') {
          return `SwapExecutionFailed(${parsed.args.reason})`;
        }
        return `${parsed.name}()`;
      }
    } catch {
      // fallback to Error(string)
    }

    if (rawData.startsWith('0x08c379a0') && rawData.length >= 138) {
      try {
        const [reason] = ethers.AbiCoder.defaultAbiCoder().decode(['string'], `0x${rawData.slice(10)}`);
        if (reason) return String(reason);
      } catch {}
    }
  }

  const msg = String(err?.shortMessage || err?.reason || err?.message || 'Execution reverted');
  return msg;
}

export interface ExtraTokenSpec {
  address: string;
  tokenId?: string;
}

export function parseExtraTokenSpec(raw: unknown): ExtraTokenSpec | null {
  const s = String(raw || '').trim();
  const m = s.match(/^(0x[a-fA-F0-9]{40})(?::(\d+))?$/);
  if (!m) return null;
  return {
    address: ethers.getAddress(m[1]),
    tokenId: m[2],
  };
}

export const ERC165_INTERFACE_IDS = {
  ERC721: '0x80ac58cd',
  ERC1155: '0xd9b67a26',
} as const;

const multiErcTransferIface = new ethers.Interface([
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)',
]);

export function encodeErc721SafeTransferFrom(from: string, to: string, tokenId: string | bigint): string {
  return multiErcTransferIface.encodeFunctionData(
    'safeTransferFrom(address,address,uint256)',
    [ethers.getAddress(from), ethers.getAddress(to), BigInt(tokenId)]
  );
}

export function encodeErc1155SafeTransferFrom(
  from: string,
  to: string,
  tokenId: string | bigint,
  amount: bigint,
  data = '0x'
): string {
  return multiErcTransferIface.encodeFunctionData(
    'safeTransferFrom(address,address,uint256,uint256,bytes)',
    [ethers.getAddress(from), ethers.getAddress(to), BigInt(tokenId), amount, data]
  );
}

export function classifyDetectedErcStandard(flags: {
  isErc1155: boolean;
  isErc721: boolean;
  isErc4626: boolean;
  isErc777: boolean;
  isErc2612: boolean;
  hasErc20TotalSupply: boolean;
}): {
  ercStandard: ErcStandard;
  sweepCompatible: boolean;
  walletSweepCompatible: boolean;
  arbCompatible: boolean;
  compatibilityNote: string;
} {
  if (flags.isErc1155) {
    return {
      ercStandard: 'ERC-1155',
      sweepCompatible: false,
      walletSweepCompatible: true,
      arbCompatible: false,
      compatibilityNote:
        'ERC-1155 Multi-Token · Incompatible with FlashArbOptimized & Balancer/Uniswap swaps; sweepable from Connected Wallet using 0xAddr:tokenId',
    };
  }
  if (flags.isErc721) {
    return {
      ercStandard: 'ERC-721',
      sweepCompatible: false,
      walletSweepCompatible: true,
      arbCompatible: false,
      compatibilityNote:
        'ERC-721 NFT · Incompatible with FlashArbOptimized & DEX swaps; sweepable from Connected Wallet using 0xAddr:tokenId',
    };
  }
  if (flags.isErc4626) {
    return {
      ercStandard: 'ERC-4626',
      sweepCompatible: true,
      walletSweepCompatible: true,
      arbCompatible: false,
      compatibilityNote:
        'ERC-4626 Tokenized Vault (inherits ERC-20) · Contract & Wallet Sweep Compatible (excluded from flash-arb swaps)',
    };
  }
  if (flags.isErc777) {
    return {
      ercStandard: 'ERC-777',
      sweepCompatible: true,
      walletSweepCompatible: true,
      arbCompatible: false,
      compatibilityNote:
        'ERC-777 Hook Token (ERC-20 compatible) · Sweep Compatible (excluded from flash-arb swaps due to send/receive hooks)',
    };
  }
  if (flags.isErc2612) {
    return {
      ercStandard: 'ERC-2612',
      sweepCompatible: true,
      walletSweepCompatible: true,
      arbCompatible: false,
      compatibilityNote: 'ERC-20 + ERC-2612 Permit · Sweep Compatible (pending pre-flight gas check)',
    };
  }
  if (flags.hasErc20TotalSupply) {
    return {
      ercStandard: 'ERC-20',
      sweepCompatible: true,
      walletSweepCompatible: true,
      arbCompatible: false,
      compatibilityNote: 'Custom ERC-20 · Sweep Compatible (pending pre-flight gas check)',
    };
  }
  return {
    ercStandard: 'UNKNOWN',
    sweepCompatible: false,
    walletSweepCompatible: false,
    arbCompatible: false,
    compatibilityNote: 'Incompatible: contract does not expose ERC-20, ERC-4626, ERC-721, or ERC-1155 interfaces',
  };
}

export const DEFAULT_MIN_GAS_RESERVE_WEI = ethers.parseEther('0.002');
export const STANDARD_BASELINE_GAS_UNITS = 350000n;

export interface TradeGasAndFinancingExtra {
  gasSavedWei: bigint;
  gasSavedEth: number;
  gasSavedUsd: number;
  loanFeeSavedUsd: number;
  totalExtraUsd: number;
}

/**
 * Calculates realized gas savings (vs standard 350k unoptimized router+SSTORE execution)
 * and financing savings (0% Balancer V2 vs 5 bps Aave V3) for an executed trade.
 */
export function computeTradeGasAndFinancingExtra(params: {
  gasUsed: bigint;
  effectiveGasPriceWei: bigint | null;
  ethPriceUsd: number;
  loanNotionalUsd: number;
  loanFeePercent?: number;
  baselineGasUnits?: bigint;
}): TradeGasAndFinancingExtra {
  const baseline = params.baselineGasUnits ?? STANDARD_BASELINE_GAS_UNITS;
  const gasSavedWei =
    params.effectiveGasPriceWei !== null &&
    params.effectiveGasPriceWei > 0n &&
    params.gasUsed > 0n &&
    params.gasUsed < baseline
      ? (baseline - params.gasUsed) * params.effectiveGasPriceWei
      : 0n;
  const gasSavedEth = Number(ethers.formatEther(gasSavedWei));
  const ethUsd = Number.isFinite(params.ethPriceUsd) && params.ethPriceUsd > 0 ? params.ethPriceUsd : 0;
  const gasSavedUsd = Number((gasSavedEth * ethUsd).toFixed(4));
  const actualLoanFeePct = params.loanFeePercent ?? 0;
  const standardAaveFeePct = 0.05;
  const notional = Number.isFinite(params.loanNotionalUsd) && params.loanNotionalUsd > 0 ? params.loanNotionalUsd : 0;
  const loanFeeSavedUsd = Number(
    Math.max(0, notional * ((standardAaveFeePct - actualLoanFeePct) / 100)).toFixed(4)
  );
  return {
    gasSavedWei,
    gasSavedEth,
    gasSavedUsd,
    loanFeeSavedUsd,
    totalExtraUsd: Number((gasSavedUsd + loanFeeSavedUsd).toFixed(4)),
  };
}

export interface GasSurplusAllocation {
  sendWei: bigint;
  maxSendableWei: bigint;
  gasLimit: bigint;
  txFeeWei: bigint;
  worthSending: boolean;
  remainingReserveWei: bigint;
}

/**
 * Computes how much native ETH surplus sits above the Gas Wallet's operational reserve
 * (`DEFAULT_MIN_GAS_RESERVE_WEI` = 0.002 ETH) after reserving L2 transfer gas + 20% fee headroom.
 * Never drains below `minReserveWei` and refuses dust transfers where `targetWei <= txFeeWei * 2`.
 */
export function computeGasSurplusAllocation(params: {
  balanceWei: bigint;
  minReserveWei?: bigint;
  transferGasUnits?: bigint;
  gasPriceWei: bigint;
  maxSendWei?: bigint;
}): GasSurplusAllocation {
  const minReserve = params.minReserveWei ?? DEFAULT_MIN_GAS_RESERVE_WEI;
  const baseGas = params.transferGasUnits && params.transferGasUnits >= 21000n ? params.transferGasUnits : 21000n;
  const gasLimit = (baseGas * 125n) / 100n;
  const safeGasPrice = params.gasPriceWei > 0n ? params.gasPriceWei : 0n;
  // Reserve 120% of estimated transfer fee so signer never reverts out-of-gas or underflows reserve
  const txFeeWei = (gasLimit * safeGasPrice * 120n) / 100n;
  const maxSendableWei =
    params.balanceWei > minReserve + txFeeWei ? params.balanceWei - minReserve - txFeeWei : 0n;

  const targetWei =
    params.maxSendWei !== undefined && params.maxSendWei > 0n && params.maxSendWei < maxSendableWei
      ? params.maxSendWei
      : maxSendableWei;

  const worthSending = targetWei > 0n && targetWei > txFeeWei * 2n;
  const sendWei = worthSending ? targetWei : 0n;
  const remainingReserveWei =
    worthSending && params.balanceWei > sendWei + txFeeWei
      ? params.balanceWei - sendWei - txFeeWei
      : params.balanceWei;

  return {
    sendWei,
    maxSendableWei,
    gasLimit,
    txFeeWei,
    worthSending,
    remainingReserveWei,
  };
}

export interface RouteTypeReadinessItem {
  routeType: 1 | 2 | 3 | 4;
  codeName: string;
  description: string;
  available: boolean;
  samplePair: string;
  legADex: string | null;
  legBDex: string | null;
  sampleSelector: string;
  sampleCalldataPrefix: string | null;
}

export interface ChainRouteTypesReadiness {
  chain: SupportedArbChain;
  layer: BlockchainLayer;
  supportedV3Routers: string[];
  supportedV2Routers: string[];
  monitorOnlyRouters: string[];
  functionSelectors: {
    executeOptimizedArbitrage: string;
    executeDirectFlashArb: string;
    rescueTokens: string;
    rescueTokensTo: string;
    routerCapabilities: string;
    owner: string;
  };
  routeTypes: RouteTypeReadinessItem[];
  allFourRouteTypesReady: boolean;
}

/**
 * Verifies which of FlashArbOptimized's 4 atomic routeType execution modes
 * (1=UniV3->V2, 2=V2->UniV3, 3=UniV3->UniV3, 4=V2->V2) have supported on-chain routers
 * on the given blockchain and generates real ABI-encoded calldata previews.
 */
export function verifyChainRouteTypesReadiness(
  chain: SupportedArbChain,
  routerCaps?: RouterCapabilityOptions,
  recipient = '0x000000000000000000000000000000000000dEaD'
): ChainRouteTypesReadiness {
  const meta = CHAIN_LAYER_META[chain];
  const routers = getEffectiveChainDexRouters(chain, routerCaps);
  const v3Entries = Object.entries(routers).filter(([, spec]) => spec.supported && spec.isV3 && spec.router);
  const v2Entries = Object.entries(routers).filter(([, spec]) => spec.supported && !spec.isV3 && spec.router);
  const monitorOnly = Object.entries(routers)
    .filter(([, spec]) => !spec.supported)
    .map(([name]) => name);

  const tokens = getChainTokens(chain);
  const tokA = tokens[0];
  const tokB = tokens.find((t) => t.addr.toLowerCase() !== tokA.addr.toLowerCase() && t.arbCompatible !== false) || tokens[1] || tokA;
  const sampleAmount = toTokenUnits(0.1, tokA.dec);

  const buildItem = (
    routeType: 1 | 2 | 3 | 4,
    codeName: string,
    description: string,
    legA?: [string, DexRouterSpec],
    legB?: [string, DexRouterSpec]
  ): RouteTypeReadinessItem => {
    if (!legA || !legB || !legA[1].router || !legB[1].router) {
      return {
        routeType,
        codeName,
        description,
        available: false,
        samplePair: `${tokA.sym}/${tokB.sym}`,
        legADex: legA?.[0] || null,
        legBDex: legB?.[0] || null,
        sampleSelector: '0x23b3aa6b',
        sampleCalldataPrefix: null,
      };
    }
    const calldata = encodeExecuteOptimizedArbitrage({
      tokenIn: tokA.addr,
      tokenOut: tokB.addr,
      amount: sampleAmount > 0n ? sampleAmount : 1000000n,
      routerA: legA[1].router,
      routerB: legB[1].router,
      feeA: legA[1].isV3 ? 500 : 0,
      feeB: legB[1].isV3 ? 500 : 0,
      routeType,
      minProfit: 1n,
      recipient,
    });
    return {
      routeType,
      codeName,
      description,
      available: true,
      samplePair: `${tokA.sym}/${tokB.sym}`,
      legADex: legA[0],
      legBDex: legB[0],
      sampleSelector: calldata.slice(0, 10),
      sampleCalldataPrefix: calldata.slice(0, 74),
    };
  };

  const firstV3 = v3Entries[0];
  const secondV3 = v3Entries[1] || v3Entries[0];
  const firstV2 = v2Entries[0];
  const secondV2 = v2Entries[1] || v2Entries[0];

  const routeTypes: RouteTypeReadinessItem[] = [
    buildItem(1, 'TYPE_1_V3_TO_V2', 'Leg 1 UniV3 Concentrated -> Leg 2 V2 CPMM', firstV3, firstV2),
    buildItem(2, 'TYPE_2_V2_TO_V3', 'Leg 1 V2 CPMM -> Leg 2 UniV3 Concentrated', firstV2, firstV3),
    buildItem(3, 'TYPE_3_V3_TO_V3', 'Leg 1 UniV3 -> Leg 2 UniV3 (Cross-Tier / Cross-DEX)', firstV3, secondV3),
    buildItem(4, 'TYPE_4_V2_TO_V2', 'Leg 1 V2 CPMM -> Leg 2 V2 CPMM (Zero-Tick Overhead)', firstV2, secondV2),
  ];

  return {
    chain,
    layer: meta.layer,
    supportedV3Routers: v3Entries.map(([name]) => name),
    supportedV2Routers: v2Entries.map(([name]) => name),
    monitorOnlyRouters: monitorOnly,
    functionSelectors: {
      executeOptimizedArbitrage: '0x23b3aa6b',
      executeDirectFlashArb: '0x7804d9ac',
      rescueTokens: '0x00ae3bf8',
      rescueTokensTo: '0xa7070692',
      routerCapabilities: '0x459a01ae',
      owner: '0x8da5cb5b',
    },
    routeTypes,
    allFourRouteTypesReady: routeTypes.every((r) => r.available),
  };
}

export const KNOWN_FLASH_ARB_CONTRACTS: Record<SupportedArbChain, string[]> = {
  ethereum: [],
  polygon: [],
  bsc: [],
  avalanche: [],
  arbitrum: [
    '0xeee31ff9e69904b43c124095b6f33aa61505bcc2',
    '0x19359c6C418669FCfC46196970814353b8766BE0',
  ],
  base: [
    '0x37440674a814f24d9C6ea0990b272215D40c4512',
    '0xBBA273E057cDa31bB359d8AA8749256246B6d0cC',
    '0x29b35c83955146ba8fd754b4b96956d245a5661e',
  ],
  optimism: [
    '0x738C8Eb31316B23d9b8A68B0c2658B456c932598',
  ],
  linea: [],
  scroll: [],
  apechain: [],
};

const ZERO_EVM_ADDRESS = '0x0000000000000000000000000000000000000000';

function isContractPlaceholder(raw: unknown): boolean {
  const s = String(raw ?? '').trim().toLowerCase();
  return (
    !s ||
    s === 'undeployed' ||
    s === 'none' ||
    s === 'null' ||
    s === 'undefined' ||
    s === ZERO_EVM_ADDRESS
  );
}

export function normalizeValidContractAddress(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return null;
  const checksummed = ethers.getAddress(s.toLowerCase());
  if (checksummed === ZERO_EVM_ADDRESS) return null;
  return checksummed;
}

export interface ResolveSweepContractsInput {
  chain: SupportedArbChain;
  requestedContract?: unknown;
  deployedContract?: unknown;
  extraContracts?: unknown[];
  hasWalletSweepTarget?: boolean;
}

export interface ResolveSweepContractsResult {
  ok: boolean;
  contracts: string[];
  primaryContract: string | null;
  invalidExtraContracts: string[];
  usedFallbackKnownContracts: boolean;
  error?: string;
}

export function resolveAndValidateSweepContracts(
  params: ResolveSweepContractsInput
): ResolveSweepContractsResult {
  const rawRequested = String(params.requestedContract ?? '').trim();
  const normalizedRequested = isContractPlaceholder(rawRequested)
    ? null
    : normalizeValidContractAddress(rawRequested);

  if (!isContractPlaceholder(rawRequested) && !normalizedRequested) {
    return {
      ok: false,
      contracts: [],
      primaryContract: null,
      invalidExtraContracts: [],
      usedFallbackKnownContracts: false,
      error: `Invalid contractAddress "${rawRequested}". Provide a valid 42-character 0x EVM address or leave blank to use known ${params.chain} contracts.`,
    };
  }

  const dedup = new Map<string, string>();
  const addCandidate = (addr: unknown) => {
    const valid = normalizeValidContractAddress(addr);
    if (valid && !dedup.has(valid.toLowerCase())) {
      dedup.set(valid.toLowerCase(), valid);
    }
  };

  if (normalizedRequested) {
    dedup.set(normalizedRequested.toLowerCase(), normalizedRequested);
  }
  addCandidate(params.deployedContract);

  const invalidExtraContracts: string[] = [];
  if (Array.isArray(params.extraContracts)) {
    for (const extra of params.extraContracts) {
      if (isContractPlaceholder(extra)) continue;
      const valid = normalizeValidContractAddress(extra);
      if (valid) {
        addCandidate(valid);
      } else {
        invalidExtraContracts.push(String(extra ?? '').trim());
      }
    }
  }

  const knownForChain = KNOWN_FLASH_ARB_CONTRACTS[params.chain] || [];
  const beforeKnownCount = dedup.size;
  for (const known of knownForChain) {
    addCandidate(known);
  }
  const usedFallbackKnownContracts = !normalizedRequested && beforeKnownCount === 0 && dedup.size > 0;

  const contracts = Array.from(dedup.values());
  if (contracts.length === 0 && !params.hasWalletSweepTarget) {
    const chainMeta = CHAIN_LAYER_META[params.chain];
    const chainLabel = chainMeta ? `${params.chain.toUpperCase()} (${chainMeta.layer})` : params.chain;
    return {
      ok: false,
      contracts: [],
      primaryContract: null,
      invalidExtraContracts,
      usedFallbackKnownContracts: false,
      error: `No deployed FlashArb contract registered on ${chainLabel} and no Gas/Connected Wallet sweep option is enabled. Deploy or save a contract address, or enable Gas Wallet sweep.`,
    };
  }

  return {
    ok: true,
    contracts,
    primaryContract: contracts[0] ?? null,
    invalidExtraContracts,
    usedFallbackKnownContracts,
  };
}



