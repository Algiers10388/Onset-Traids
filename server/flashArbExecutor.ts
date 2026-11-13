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

export type SupportedArbChain = 'arbitrum' | 'base' | 'optimism';

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
  arbitrum: ARBITRUM_TOKENS,
  base: {
    WETH: { sym: 'WETH', addr: '0x4200000000000000000000000000000000000006', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 (WETH9) · FlashArb & Sweep Compatible' },
    USDC: { sym: 'USDC', addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    USDbC: { sym: 'USDbC', addr: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', dec: 6, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    cbETH: { sym: 'cbETH', addr: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 LST · FlashArb & Sweep Compatible' },
    AERO: { sym: 'AERO', addr: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', dec: 18, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
    DAI: { sym: 'DAI', addr: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', dec: 18, ercStandard: 'ERC-2612', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 + ERC-2612 Permit · FlashArb & Sweep Compatible' },
    cbBTC: { sym: 'cbBTC', addr: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', dec: 8, ercStandard: 'ERC-20', arbCompatible: true, sweepCompatible: true, walletSweepCompatible: true, compatibilityNote: 'ERC-20 · FlashArb & Sweep Compatible' },
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
};

export function getChainTokens(chain: string): ArbitrumTokenInfo[] {
  const key = (chain || 'arbitrum').toLowerCase() as SupportedArbChain;
  return Object.values(CHAIN_TOKENS[key] || CHAIN_TOKENS.arbitrum);
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
      router: '0xFB7eF66a7e61224DD6FcD0D7d9C3be5C8B049b9f',
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
};

export function getChainDexRouters(chain?: string): Record<string, DexRouterSpec> {
  const key = (chain || 'arbitrum').toLowerCase() as SupportedArbChain;
  return CHAIN_DEX_ROUTERS[key] || ARBITRUM_DEX_ROUTERS;
}

export const FLASH_ARB_OPTIMIZED_ABI = [
  'function owner() view returns (address)',
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
}

export function resolveArbitrageCandidates(
  input: RouteExecutionInput,
  recipient: string
): EncodedArbitrageCandidate[] {
  const routers = getChainDexRouters(input.chain);
  const buySpec = routers[input.buyDex];
  const sellSpec = routers[input.sellDex];
  if (!buySpec?.supported || !buySpec.router || !sellSpec?.supported || !sellSpec.router) {
    return [];
  }

  const buyFeePpm = Math.round(input.buyFeePercent * 10000);
  const sellFeePpm = Math.round(input.sellFeePercent * 10000);

  const candidates: EncodedArbitrageCandidate[] = [];

  // Candidate 1: Borrow BASE token
  // Because `sell` pool prices BASE higher in QUOTE than `buy` pool,
  // Leg 1 swaps BASE -> QUOTE on `sell` pool; Leg 2 swaps QUOTE -> BASE on `buy` pool.
  const baseLoanUnits = toTokenUnits(input.optimalLoanBaseUnits, input.baseToken.dec);
  if (baseLoanUnits > 0n) {
    const estProfitUsdPositive = Math.max(0.01, input.estNetProfitUsd);
    const estProfitBaseHuman = input.buyPriceUsd > 0 ? estProfitUsdPositive / input.buyPriceUsd : 0;
    const halfProfitBase = toTokenUnits(estProfitBaseHuman / 2, input.baseToken.dec);
    const minProfitBase = halfProfitBase > 1n ? halfProfitBase : 1n;
    const feeA = sellSpec.isV3 ? sellFeePpm : 0;
    const feeB = buySpec.isV3 ? buyFeePpm : 0;
    const routeType = getContractRouteType(sellSpec.isV3, buySpec.isV3);

    candidates.push({
      label: `Borrow ${input.baseToken.sym}: ${input.sellDex} -> ${input.buyDex}`,
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
  const quoteLoanHuman = input.optimalLoanBaseUnits * input.buyPriceQuotePerBase;
  const quoteLoanUnits = toTokenUnits(quoteLoanHuman, input.quoteToken.dec);
  if (quoteLoanUnits > 0n) {
    const quoteUsdPrice =
      input.buyPriceQuotePerBase > 0 && input.buyPriceUsd > 0
        ? input.buyPriceUsd / input.buyPriceQuotePerBase
        : 1;
    const estProfitUsdPositive = Math.max(0.01, input.estNetProfitUsd);
    const estProfitQuoteHuman = quoteUsdPrice > 0 ? estProfitUsdPositive / quoteUsdPrice : 0;
    const halfProfitQuote = toTokenUnits(estProfitQuoteHuman / 2, input.quoteToken.dec);
    const minProfitQuote = halfProfitQuote > 1n ? halfProfitQuote : 1n;
    const feeA = buySpec.isV3 ? buyFeePpm : 0;
    const feeB = sellSpec.isV3 ? sellFeePpm : 0;
    const routeType = getContractRouteType(buySpec.isV3, sellSpec.isV3);

    candidates.push({
      label: `Borrow ${input.quoteToken.sym}: ${input.buyDex} -> ${input.sellDex}`,
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
