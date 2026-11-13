import { ethers } from 'ethers';

export interface ArbitrumTokenInfo {
  sym: string;
  addr: string;
  dec: number;
}

export const ARBITRUM_TOKENS: Record<string, ArbitrumTokenInfo> = {
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
};

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
  const buySpec = ARBITRUM_DEX_ROUTERS[input.buyDex];
  const sellSpec = ARBITRUM_DEX_ROUTERS[input.sellDex];
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
