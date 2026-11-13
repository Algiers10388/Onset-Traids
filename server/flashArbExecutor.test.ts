import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  ARBITRUM_TOKENS,
  CHAIN_TOKENS,
  CHAIN_DEX_ROUTERS,
  getChainTokens,
  getChainDexRouters,
  FLASH_ARB_OPTIMIZED_ABI,
  resolveArbitrageCandidates,
  encodeExecuteDirectFlashArb,
  encodeRescueTokens,
  encodeRescueTokensTo,
  encodeErc20Transfer,
  decodeFlashArbRevertError,
  getContractRouteType,
  parseExtraTokenSpec,
  encodeErc721SafeTransferFrom,
  encodeErc1155SafeTransferFrom,
  classifyDetectedErcStandard,
} from './flashArbExecutor.ts';

const RECIPIENT = '0x65602EB9e09B07002872E074004400d37e27CCB9';

test('getContractRouteType matches FlashArbOptimized.sol constants', () => {
  assert.equal(getContractRouteType(true, false), 1);  // V3 -> V2
  assert.equal(getContractRouteType(false, true), 2);  // V2 -> V3
  assert.equal(getContractRouteType(true, true), 3);   // V3 -> V3
  assert.equal(getContractRouteType(false, false), 4); // V2 -> V2
});

test('resolveArbitrageCandidates encodes base & quote executeOptimizedArbitrage calldata', () => {
  const candidates = resolveArbitrageCandidates(
    {
      baseToken: ARBITRUM_TOKENS.WETH,
      quoteToken: ARBITRUM_TOKENS.USDC,
      buyDex: 'Uniswap V3',
      buyFeePercent: 0.05,
      sellDex: 'Sushiswap V2',
      sellFeePercent: 0.30,
      optimalLoanBaseUnits: 5,
      buyPriceQuotePerBase: 2400,
      buyPriceUsd: 2400,
      estNetProfitUsd: 12,
    },
    RECIPIENT
  );

  assert.equal(candidates.length, 2);

  // Candidate 0 borrows WETH: sells WETH->USDC on Sushiswap V2 (leg A), buys USDC->WETH on Uniswap V3 (leg B)
  const baseCand = candidates[0];
  assert.equal(baseCand.borrowedToken.sym, 'WETH');
  assert.equal(baseCand.routeType, 2); // V2 -> V3
  assert.equal(baseCand.feeA, 0);
  assert.equal(baseCand.feeB, 500);
  assert.ok(baseCand.minProfitUnits > 0n);
  assert.ok(baseCand.calldata.startsWith('0x23b3aa6b'));

  // Candidate 1 borrows USDC: buys USDC->WETH on Uniswap V3 (leg A), sells WETH->USDC on Sushiswap V2 (leg B)
  const quoteCand = candidates[1];
  assert.equal(quoteCand.borrowedToken.sym, 'USDC');
  assert.equal(quoteCand.routeType, 1); // V3 -> V2
  assert.equal(quoteCand.feeA, 500);
  assert.equal(quoteCand.feeB, 0);
  assert.ok(quoteCand.minProfitUnits > 0n);
  assert.ok(quoteCand.calldata.startsWith('0x23b3aa6b'));
});

test('resolveArbitrageCandidates excludes Algebra (Camelot V3) and Camelot V2 unsupported routers', () => {
  for (const unsupportedDex of ['Camelot V3', 'Camelot V2']) {
    const candidates = resolveArbitrageCandidates(
      {
        baseToken: ARBITRUM_TOKENS.WETH,
        quoteToken: ARBITRUM_TOKENS.USDC,
        buyDex: unsupportedDex,
        buyFeePercent: 0.08,
        sellDex: 'Uniswap V3',
        sellFeePercent: 0.05,
        optimalLoanBaseUnits: 2,
        buyPriceQuotePerBase: 2400,
        buyPriceUsd: 2400,
        estNetProfitUsd: 10,
      },
      RECIPIENT
    );
    assert.equal(candidates.length, 0);
  }
});

test('resolveArbitrageCandidates encodes SushiSwap V3 <-> Uniswap V3 and newly added tokens', () => {
  const candidates = resolveArbitrageCandidates(
    {
      baseToken: ARBITRUM_TOKENS.PENDLE,
      quoteToken: ARBITRUM_TOKENS.WETH,
      buyDex: 'SushiSwap V3',
      buyFeePercent: 0.30,
      sellDex: 'Uniswap V3',
      sellFeePercent: 0.05,
      optimalLoanBaseUnits: 500,
      buyPriceQuotePerBase: 0.00075,
      buyPriceUsd: 1.50,
      estNetProfitUsd: 15,
    },
    RECIPIENT
  );
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].routeType, 3); // V3 -> V3
  assert.equal(candidates[0].feeA, 500);
  assert.equal(candidates[0].feeB, 3000);
  assert.ok(candidates[0].calldata.startsWith('0x23b3aa6b'));
});

test('sweep calldata selectors match FlashArbOptimized & ERC20', () => {
  assert.ok(encodeExecuteDirectFlashArb(RECIPIENT).startsWith('0x7804d9ac'));
  assert.ok(encodeRescueTokens(ARBITRUM_TOKENS.USDC.addr).startsWith('0x00ae3bf8'));
  assert.ok(encodeRescueTokensTo(ARBITRUM_TOKENS.USDC.addr, RECIPIENT).startsWith('0xa7070692'));
  assert.ok(encodeErc20Transfer(RECIPIENT, 1000000n).startsWith('0xa9059cbb'));
});

test('decodeFlashArbRevertError decodes custom InsufficientProfit & MinProfitRequired errors', () => {
  const iface = new ethers.Interface(FLASH_ARB_OPTIMIZED_ABI);
  const insufficientData = iface.encodeErrorResult('InsufficientProfit', [50n, 100n]);
  assert.equal(
    decodeFlashArbRevertError({ data: insufficientData }),
    'InsufficientProfit(actual=50, required=100)'
  );
  const minProfitData = iface.encodeErrorResult('MinProfitRequired', []);
  assert.equal(decodeFlashArbRevertError({ data: minProfitData }), 'MinProfitRequired()');
});

test('CHAIN_TOKENS & getChainTokens expose verified multi-chain tokens with compatibility flags', () => {
  const arbTokens = getChainTokens('arbitrum');
  const baseTokens = getChainTokens('base');
  const opTokens = getChainTokens('optimism');

  assert.equal(arbTokens.length, 20);
  assert.equal(baseTokens.length, 7);
  assert.equal(opTokens.length, 8);

  // Canonical Arbitrum addresses for PENDLE and UNI
  assert.equal(ARBITRUM_TOKENS.PENDLE.addr.toLowerCase(), '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8');
  assert.equal(ARBITRUM_TOKENS.UNI.addr.toLowerCase(), '0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0');

  // Every token must have a valid checksummed EVM address and sweepCompatible defined
  for (const chain of ['arbitrum', 'base', 'optimism'] as const) {
    for (const tok of Object.values(CHAIN_TOKENS[chain])) {
      assert.equal(ethers.isAddress(tok.addr), true);
      assert.equal(typeof tok.sweepCompatible, 'boolean');
    }
  }

  // Yield/LST tokens excluded from arb swaps must still be sweep-compatible
  assert.equal(ARBITRUM_TOKENS.wstETH.arbCompatible, false);
  assert.equal(ARBITRUM_TOKENS.wstETH.sweepCompatible, true);
  assert.equal(ARBITRUM_TOKENS.sUSDe.arbCompatible, false);
  assert.equal(ARBITRUM_TOKENS.sUSDe.sweepCompatible, true);
  assert.equal(CHAIN_TOKENS.optimism.wstETH.arbCompatible, false);
  assert.equal(CHAIN_TOKENS.optimism.wstETH.sweepCompatible, true);

  // Core tokens support both arbitrage & sweep
  assert.equal(ARBITRUM_TOKENS.WETH.arbCompatible, true);
  assert.equal(ARBITRUM_TOKENS.WETH.sweepCompatible, true);
  assert.equal(CHAIN_TOKENS.base.USDC.arbCompatible, true);
  assert.equal(CHAIN_TOKENS.base.USDC.sweepCompatible, true);
});

test('parseExtraTokenSpec parses ERC-20 addresses and ERC-721/1155 address:tokenId specs', () => {
  const erc20 = parseExtraTokenSpec('0xaf88d065e77c8cc2239327c5edb3a432268e5831');
  assert.deepEqual(erc20, {
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    tokenId: undefined,
  });

  const erc1155 = parseExtraTokenSpec(' 0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2:42 ');
  assert.deepEqual(erc1155, {
    address: '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2',
    tokenId: '42',
  });

  assert.equal(parseExtraTokenSpec('not-an-address'), null);
  assert.equal(parseExtraTokenSpec('0x1234:5'), null);
  assert.equal(parseExtraTokenSpec('0xaf88d065e77c8cc2239327c5edb3a432268e5831:abc'), null);
});

test('ERC-721 and ERC-1155 safeTransferFrom calldata encoders match canonical selectors', () => {
  const from = '0xF1d765d693f9e6fAb0c4a2FCa942d9D54233C966';
  const erc721Data = encodeErc721SafeTransferFrom(from, RECIPIENT, '7');
  assert.ok(erc721Data.startsWith('0x42842e0e'));

  const erc1155Data = encodeErc1155SafeTransferFrom(from, RECIPIENT, '99', 3n);
  assert.ok(erc1155Data.startsWith('0xf242432a'));
});

test('classifyDetectedErcStandard distinguishes ERC-1155, ERC-721, ERC-4626, ERC-777, ERC-2612, ERC-20, and UNKNOWN', () => {
  const baseFlags = {
    isErc1155: false,
    isErc721: false,
    isErc4626: false,
    isErc777: false,
    isErc2612: false,
    hasErc20TotalSupply: false,
  };

  const c1155 = classifyDetectedErcStandard({ ...baseFlags, isErc1155: true });
  assert.equal(c1155.ercStandard, 'ERC-1155');
  assert.equal(c1155.sweepCompatible, false);
  assert.equal(c1155.walletSweepCompatible, true);
  assert.equal(c1155.arbCompatible, false);

  const c721 = classifyDetectedErcStandard({ ...baseFlags, isErc721: true });
  assert.equal(c721.ercStandard, 'ERC-721');
  assert.equal(c721.sweepCompatible, false);
  assert.equal(c721.walletSweepCompatible, true);
  assert.equal(c721.arbCompatible, false);

  const c4626 = classifyDetectedErcStandard({ ...baseFlags, isErc4626: true, hasErc20TotalSupply: true });
  assert.equal(c4626.ercStandard, 'ERC-4626');
  assert.equal(c4626.sweepCompatible, true);
  assert.equal(c4626.walletSweepCompatible, true);
  assert.equal(c4626.arbCompatible, false);

  const c777 = classifyDetectedErcStandard({ ...baseFlags, isErc777: true, hasErc20TotalSupply: true });
  assert.equal(c777.ercStandard, 'ERC-777');
  assert.equal(c777.sweepCompatible, true);
  assert.equal(c777.arbCompatible, false);

  const c2612 = classifyDetectedErcStandard({ ...baseFlags, isErc2612: true, hasErc20TotalSupply: true });
  assert.equal(c2612.ercStandard, 'ERC-2612');
  assert.equal(c2612.sweepCompatible, true);
  assert.equal(c2612.walletSweepCompatible, true);

  const c20 = classifyDetectedErcStandard({ ...baseFlags, hasErc20TotalSupply: true });
  assert.equal(c20.ercStandard, 'ERC-20');
  assert.equal(c20.sweepCompatible, true);

  const cUnknown = classifyDetectedErcStandard(baseFlags);
  assert.equal(cUnknown.ercStandard, 'UNKNOWN');
  assert.equal(cUnknown.sweepCompatible, false);
  assert.equal(cUnknown.walletSweepCompatible, false);
});

test('CHAIN_DEX_ROUTERS and getChainDexRouters expose verified routers on Arbitrum, Base, and Optimism', () => {
  assert.equal(Object.keys(CHAIN_DEX_ROUTERS).length, 3);

  const baseRouters = getChainDexRouters('base');
  assert.equal(baseRouters['Uniswap V3'].router?.toLowerCase(), '0x2626664c2603336e57b271c5c0b26f421741e481');
  assert.equal(baseRouters['PancakeSwap V3'].router?.toLowerCase(), '0x1b81d678ffb9c0263b24a97847620c99d213eb14');
  assert.equal(baseRouters['BaseSwap V2'].router?.toLowerCase(), '0x327df1e6de05895d2ab08513aadd9313fe505d86');
  assert.equal(baseRouters['Aerodrome Slipstream'].supported, false);

  const opRouters = getChainDexRouters('optimism');
  assert.equal(opRouters['Uniswap V3'].router?.toLowerCase(), '0xe592427a0aece92de3edee1f18e0157c05861564');
  assert.equal(opRouters['SushiSwap V3'].router?.toLowerCase(), '0xfb7ef66a7e61224dd6fcd0d7d9c3be5c8b049b9f');
  assert.equal(opRouters['Uniswap V2'].router?.toLowerCase(), '0x4a7b5da61326a6379179b40d00f57e5bbdc962c2');
  assert.equal(opRouters['Velodrome Slipstream'].supported, false);
});

test('resolveArbitrageCandidates encodes Base & Optimism routes and excludes Slipstream monitor-only pools', () => {
  const iface = new ethers.Interface(FLASH_ARB_OPTIMIZED_ABI);

  // Base: Uniswap V3 (SwapRouter02) <-> BaseSwap V2
  const baseCandidates = resolveArbitrageCandidates(
    {
      chain: 'base',
      baseToken: CHAIN_TOKENS.base.WETH,
      quoteToken: CHAIN_TOKENS.base.USDC,
      buyDex: 'Uniswap V3',
      buyFeePercent: 0.05,
      sellDex: 'BaseSwap V2',
      sellFeePercent: 0.25,
      optimalLoanBaseUnits: 3,
      buyPriceQuotePerBase: 2500,
      buyPriceUsd: 2500,
      estNetProfitUsd: 10,
    },
    RECIPIENT
  );
  assert.equal(baseCandidates.length, 2);
  const decodedBaseQuote = iface.decodeFunctionData('executeOptimizedArbitrage', baseCandidates[1].calldata);
  assert.equal(decodedBaseQuote.routerA.toLowerCase(), '0x2626664c2603336e57b271c5c0b26f421741e481');
  assert.equal(decodedBaseQuote.routerB.toLowerCase(), '0x327df1e6de05895d2ab08513aadd9313fe505d86');
  assert.equal(Number(decodedBaseQuote.routeType), 1); // V3 -> V2

  // Optimism: Uniswap V3 <-> SushiSwap V3
  const opCandidates = resolveArbitrageCandidates(
    {
      chain: 'optimism',
      baseToken: CHAIN_TOKENS.optimism.OP,
      quoteToken: CHAIN_TOKENS.optimism.USDC,
      buyDex: 'Uniswap V3',
      buyFeePercent: 0.30,
      sellDex: 'SushiSwap V3',
      sellFeePercent: 0.05,
      optimalLoanBaseUnits: 1000,
      buyPriceQuotePerBase: 1.5,
      buyPriceUsd: 1.5,
      estNetProfitUsd: 8,
    },
    RECIPIENT
  );
  assert.equal(opCandidates.length, 2);
  const decodedOpQuote = iface.decodeFunctionData('executeOptimizedArbitrage', opCandidates[1].calldata);
  assert.equal(decodedOpQuote.routerA.toLowerCase(), '0xe592427a0aece92de3edee1f18e0157c05861564');
  assert.equal(decodedOpQuote.routerB.toLowerCase(), '0xfb7ef66a7e61224dd6fcd0d7d9c3be5c8b049b9f');
  assert.equal(Number(decodedOpQuote.routeType), 3); // V3 -> V3

  // Monitor-only Slipstream DEXes must be excluded from automated execution
  const aeroExcluded = resolveArbitrageCandidates(
    {
      chain: 'base',
      baseToken: CHAIN_TOKENS.base.WETH,
      quoteToken: CHAIN_TOKENS.base.USDC,
      buyDex: 'Aerodrome Slipstream',
      buyFeePercent: 0.05,
      sellDex: 'Uniswap V3',
      sellFeePercent: 0.05,
      optimalLoanBaseUnits: 2,
      buyPriceQuotePerBase: 2500,
      buyPriceUsd: 2500,
      estNetProfitUsd: 10,
    },
    RECIPIENT
  );
  assert.equal(aeroExcluded.length, 0);

  const veloExcluded = resolveArbitrageCandidates(
    {
      chain: 'optimism',
      baseToken: CHAIN_TOKENS.optimism.WETH,
      quoteToken: CHAIN_TOKENS.optimism.USDC,
      buyDex: 'Velodrome Slipstream',
      buyFeePercent: 0.05,
      sellDex: 'Uniswap V3',
      sellFeePercent: 0.05,
      optimalLoanBaseUnits: 2,
      buyPriceQuotePerBase: 2500,
      buyPriceUsd: 2500,
      estNetProfitUsd: 10,
    },
    RECIPIENT
  );
  assert.equal(veloExcluded.length, 0);
});


