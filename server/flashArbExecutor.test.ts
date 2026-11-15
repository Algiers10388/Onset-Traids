import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ethers } from 'ethers';
import {
  ARBITRUM_TOKENS,
  CHAIN_TOKENS,
  CHAIN_DEX_ROUTERS,
  V3_QUOTER_V2_ADDRESSES,
  CAMELOT_V3_ROUTER_ADDRESS,
  CAMELOT_V2_ROUTER_ADDRESS,
  getChainTokens,
  getChainDexRouters,
  getEffectiveChainDexRouters,
  FLASH_ARB_OPTIMIZED_ABI,
  resolveArbitrageCandidates,
  buildScaledArbitrageCandidates,
  buildMaxProfitProbeCalldata,
  rebuildCandidateWithMinProfit,
  parseInsufficientProfitError,
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
  DEFAULT_MIN_GAS_RESERVE_WEI,
  computeTradeGasAndFinancingExtra,
  computeGasSurplusAllocation,
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
  assert.equal(baseTokens.length, 13);
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

  // Core & expanded Base tokens support both arbitrage & sweep
  assert.equal(ARBITRUM_TOKENS.WETH.arbCompatible, true);
  assert.equal(ARBITRUM_TOKENS.WETH.sweepCompatible, true);
  assert.equal(CHAIN_TOKENS.base.USDC.arbCompatible, true);
  assert.equal(CHAIN_TOKENS.base.USDC.sweepCompatible, true);
  assert.equal(CHAIN_TOKENS.base.VIRTUAL.arbCompatible, true);
  assert.equal(CHAIN_TOKENS.base.DEGEN.arbCompatible, true);
  assert.equal(CHAIN_TOKENS.base.MORPHO.arbCompatible, true);

  const virtualCandidates = resolveArbitrageCandidates(
    {
      chain: 'base',
      baseToken: CHAIN_TOKENS.base.VIRTUAL,
      quoteToken: CHAIN_TOKENS.base.WETH,
      buyDex: 'Uniswap V3',
      buyFeePercent: 0.3,
      sellDex: 'Uniswap V2',
      sellFeePercent: 0.3,
      optimalLoanBaseUnits: 500,
      buyPriceQuotePerBase: 0.0005,
      buyPriceUsd: 1.5,
      estNetProfitUsd: 12,
    },
    RECIPIENT
  );
  assert.equal(virtualCandidates.length, 2);
  assert.ok(virtualCandidates[0].calldata.startsWith('0x23b3aa6b'));
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
  assert.equal(opRouters['SushiSwap V3'].router?.toLowerCase(), '0x8c32fd078b89eccb06b40289a539d84a4aa9fda6');
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
  assert.equal(decodedOpQuote.routerB.toLowerCase(), '0x8c32fd078b89eccb06b40289a539d84a4aa9fda6');
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

test('computeTradeGasAndFinancingExtra computes Cancun gas savings and 0% Balancer fee savings', () => {
  const extra = computeTradeGasAndFinancingExtra({
    gasUsed: 148000n,
    effectiveGasPriceWei: 100000000n, // 0.1 gwei
    ethPriceUsd: 3000,
    loanNotionalUsd: 25000,
    loanFeePercent: 0,
  });

  // (350,000 - 148,000) * 0.1 gwei = 202,000 * 1e8 wei = 0.0000202 ETH
  assert.equal(extra.gasSavedWei, 202000n * 100000000n);
  assert.ok(Math.abs(extra.gasSavedEth - 0.0000202) < 1e-10);
  assert.ok(Math.abs(extra.gasSavedUsd - 0.0606) < 1e-6);
  // 0.05% of $25,000 = $12.50
  assert.equal(extra.loanFeeSavedUsd, 12.5);
  assert.equal(extra.totalExtraUsd, Number((extra.gasSavedUsd + 12.5).toFixed(4)));

  // Edge case: missing gas price or gasUsed >= baseline returns 0 gas savings
  const zeroGas = computeTradeGasAndFinancingExtra({
    gasUsed: 400000n,
    effectiveGasPriceWei: null,
    ethPriceUsd: 3000,
    loanNotionalUsd: 10000,
  });
  assert.equal(zeroGas.gasSavedWei, 0n);
  assert.equal(zeroGas.gasSavedUsd, 0);
  assert.equal(zeroGas.loanFeeSavedUsd, 5);
});

test('computeGasSurplusAllocation protects 0.002 ETH reserve, caps by maxSendWei, and skips dust', () => {
  const gasPriceWei = 100000000n; // 0.1 gwei

  // Sufficient balance above 0.002 ETH reserve (0.01 ETH total)
  const fullSurplus = computeGasSurplusAllocation({
    balanceWei: ethers.parseEther('0.01'),
    transferGasUnits: 21000n,
    gasPriceWei,
  });
  assert.equal(fullSurplus.worthSending, true);
  assert.equal(fullSurplus.gasLimit, (21000n * 125n) / 100n); // 26250n
  assert.equal(fullSurplus.txFeeWei, (26250n * gasPriceWei * 120n) / 100n);
  assert.equal(
    fullSurplus.maxSendableWei,
    ethers.parseEther('0.01') - DEFAULT_MIN_GAS_RESERVE_WEI - fullSurplus.txFeeWei
  );
  assert.equal(fullSurplus.sendWei, fullSurplus.maxSendableWei);
  assert.equal(fullSurplus.remainingReserveWei, DEFAULT_MIN_GAS_RESERVE_WEI);

  // Respects maxSendWei cap when surplus is larger than single-trade gas savings
  const capped = computeGasSurplusAllocation({
    balanceWei: ethers.parseEther('0.01'),
    transferGasUnits: 21000n,
    gasPriceWei,
    maxSendWei: ethers.parseEther('0.001'),
  });
  assert.equal(capped.worthSending, true);
  assert.equal(capped.sendWei, ethers.parseEther('0.001'));
  assert.ok(capped.remainingReserveWei > DEFAULT_MIN_GAS_RESERVE_WEI);

  // Rejects sub-2x-fee dust above reserve
  const dust = computeGasSurplusAllocation({
    balanceWei: DEFAULT_MIN_GAS_RESERVE_WEI + fullSurplus.txFeeWei * 2n,
    transferGasUnits: 21000n,
    gasPriceWei,
  });
  assert.equal(dust.worthSending, false);
  assert.equal(dust.sendWei, 0n);

  // Rejects balances at or below reserve
  const belowReserve = computeGasSurplusAllocation({
    balanceWei: ethers.parseEther('0.0015'),
    transferGasUnits: 21000n,
    gasPriceWei,
  });
  assert.equal(belowReserve.worthSending, false);
  assert.equal(belowReserve.maxSendableWei, 0n);
  assert.equal(belowReserve.sendWei, 0n);
});

test('buildScaledArbitrageCandidates caps by Balancer Vault liquidity and generates V3 progressive clips', () => {
  const input = {
    chain: 'base' as const,
    baseToken: CHAIN_TOKENS.base.cbETH,
    quoteToken: CHAIN_TOKENS.base.WETH,
    buyDex: 'Uniswap V3',
    buyFeePercent: 0.05,
    sellDex: 'PancakeSwap V3',
    sellFeePercent: 0.01,
    optimalLoanBaseUnits: 10,
    buyPriceQuotePerBase: 1.1,
    buyPriceUsd: 2400,
    estNetProfitUsd: 16,
  };

  // Vault has 0 cbETH and 20 WETH -> should skip cbETH entirely and prioritize WETH clips [100%, 50%, 25%, 10%]
  const cands = buildScaledArbitrageCandidates(
    input,
    RECIPIENT,
    {
      [CHAIN_TOKENS.base.cbETH.addr.toLowerCase()]: 0n,
      [CHAIN_TOKENS.base.WETH.addr.toLowerCase()]: ethers.parseEther('20'),
    },
    [1, 0.5, 0.25, 0.1]
  );

  assert.equal(cands.length, 4);
  assert.ok(cands.every((c) => c.borrowedToken.sym === 'WETH'));
  assert.equal(cands[0].amountUnits, ethers.parseEther('11'));
  assert.equal(cands[1].amountUnits, ethers.parseEther('5.5'));
  assert.equal(cands[2].amountUnits, ethers.parseEther('2.75'));
  assert.equal(cands[3].amountUnits, ethers.parseEther('1.1'));
  assert.ok(cands.every((c) => c.minProfitUnits >= 1n));

  // If WETH vault holds only 4 WETH (85% safe cap = 3.4 WETH), 100% and 50% clips cap cleanly at 3.4 WETH deduplicated
  const capped = buildScaledArbitrageCandidates(
    input,
    RECIPIENT,
    {
      [CHAIN_TOKENS.base.cbETH.addr.toLowerCase()]: 0n,
      [CHAIN_TOKENS.base.WETH.addr.toLowerCase()]: ethers.parseEther('4'),
    },
    [1, 0.5, 0.25, 0.1]
  );
  assert.equal(capped.length, 3);
  assert.equal(capped[0].amountUnits, ethers.parseEther('3.4'));
  assert.equal(capped[1].amountUnits, ethers.parseEther('2.75'));
  assert.equal(capped[2].amountUnits, ethers.parseEther('1.1'));
});

test('resolveArbitrageCandidates scales minProfitUnits proportionally for tight L2 spreads without inflated revert floors', () => {
  const cands = resolveArbitrageCandidates(
    {
      chain: 'arbitrum',
      baseToken: ARBITRUM_TOKENS.WETH,
      quoteToken: ARBITRUM_TOKENS.USDC,
      buyDex: 'PancakeSwap V3',
      buyFeePercent: 0.01,
      sellDex: 'Uniswap V3',
      sellFeePercent: 0.01,
      optimalLoanBaseUnits: 0.1, // $180 trade
      buyPriceQuotePerBase: 1800,
      buyPriceUsd: 1800,
      estNetProfitUsd: 0.02, // $0.02 expected profit
    },
    RECIPIENT,
    0.1 // 10% fallback clip -> $0.002 expected profit
  );
  assert.equal(cands.length, 2);
  // Quote USDC minProfit should be ~25% of $0.002 = $0.0005 = 500 units (not $0.005 = 5000 units which would revert!)
  const usdcCand = cands.find((c) => c.borrowedToken.sym === 'USDC')!;
  assert.ok(usdcCand.minProfitUnits >= 1n && usdcCand.minProfitUnits <= 1000n);
});

test('V3 profit probe calldata, InsufficientProfit parser, minProfit tightening, and upscale clips work cleanly', () => {
  const iface = new ethers.Interface(FLASH_ARB_OPTIMIZED_ABI);
  const input = {
    chain: 'arbitrum' as const,
    baseToken: ARBITRUM_TOKENS.WBTC,
    quoteToken: ARBITRUM_TOKENS.USDT,
    buyDex: 'Uniswap V3',
    buyFeePercent: 0.05,
    sellDex: 'PancakeSwap V3',
    sellFeePercent: 0.05,
    optimalLoanBaseUnits: 0.1,
    buyPriceQuotePerBase: 65000,
    buyPriceUsd: 65000,
    estNetProfitUsd: 12,
  };
  const cands = buildScaledArbitrageCandidates(
    input,
    RECIPIENT,
    {
      [ARBITRUM_TOKENS.WBTC.addr.toLowerCase()]: ethers.parseUnits('2', 8),
      [ARBITRUM_TOKENS.USDT.addr.toLowerCase()]: ethers.parseUnits('50000', 6),
    },
    [1.5, 1, 0.5]
  );
  assert.ok(cands.some((c) => c.label.includes('150% clip')));
  const first = cands[0];
  assert.equal(first.routeType, 3); // V3 -> V3

  const probeData = buildMaxProfitProbeCalldata(first);
  const decodedProbe = iface.decodeFunctionData('executeOptimizedArbitrage', probeData);
  assert.equal(decodedProbe.minProfit, ethers.MaxUint256);

  const errHex = iface.encodeErrorResult('InsufficientProfit', [2500000n, ethers.MaxUint256]);
  const parsed = parseInsufficientProfitError({ error: { data: errHex } });
  assert.deepEqual(parsed, { actual: 2500000n, required: ethers.MaxUint256 });

  const tightened = rebuildCandidateWithMinProfit(first, (parsed!.actual * 75n) / 100n);
  assert.equal(tightened.minProfitUnits, 1875000n);
  const decodedTight = iface.decodeFunctionData('executeOptimizedArbitrage', tightened.calldata);
  assert.equal(decodedTight.minProfit, 1875000n);

  assert.ok(V3_QUOTER_V2_ADDRESSES.arbitrum['Uniswap V3']);
  assert.ok(V3_QUOTER_V2_ADDRESSES.arbitrum['PancakeSwap V3']);
  assert.ok(V3_QUOTER_V2_ADDRESSES.arbitrum['SushiSwap V3']);
  assert.ok(V3_QUOTER_V2_ADDRESSES.base['Uniswap V3']);
  assert.ok(V3_QUOTER_V2_ADDRESSES.base['PancakeSwap V3']);
  assert.ok(V3_QUOTER_V2_ADDRESSES.base['SushiSwap V3']);
});

test('getEffectiveChainDexRouters enables Camelot V3/V2 for Option 1 (native) and Option 2 (adapter)', () => {
  const defaultRouters = getEffectiveChainDexRouters('arbitrum');
  assert.equal(defaultRouters['Camelot V3'].supported, false);
  assert.equal(defaultRouters['Camelot V2'].supported, false);

  const option1Routers = getEffectiveChainDexRouters('arbitrum', {
    supportsAlgebra: true,
    supportsCamelotV2: true,
  });
  assert.equal(option1Routers['Camelot V3'].supported, true);
  assert.equal(option1Routers['Camelot V3'].router, CAMELOT_V3_ROUTER_ADDRESS);
  assert.equal(option1Routers['Camelot V3'].isV3, true);
  assert.equal(option1Routers['Camelot V2'].supported, true);
  assert.equal(option1Routers['Camelot V2'].router, CAMELOT_V2_ROUTER_ADDRESS);
  assert.equal(option1Routers['Camelot V2'].isV3, false);

  const adapterAddr = '0x1234567890AbcdEF1234567890aBcdef12345678';
  const option2Routers = getEffectiveChainDexRouters('arbitrum', {
    camelotV3Adapter: adapterAddr,
  });
  assert.equal(option2Routers['Camelot V3'].supported, true);
  assert.equal(option2Routers['Camelot V3'].router, adapterAddr);
  assert.equal(option2Routers['Camelot V2'].supported, false);

  // Base remains unaffected by Arbitrum capability flags
  const baseWithArbCaps = getEffectiveChainDexRouters('base', {
    supportsAlgebra: true,
    camelotV3Adapter: adapterAddr,
  });
  assert.equal(baseWithArbCaps['Aerodrome Slipstream'].supported, false);
});

test('resolveArbitrageCandidates & buildScaledArbitrageCandidates encode Camelot V3 <-> PancakeSwap V3 and Camelot V2 under Option 1 & Option 2', () => {
  const iface = new ethers.Interface(FLASH_ARB_OPTIMIZED_ABI);
  const camelotToPancakeInput = {
    chain: 'arbitrum' as const,
    baseToken: ARBITRUM_TOKENS.WETH,
    quoteToken: ARBITRUM_TOKENS.USDC,
    buyDex: 'Camelot V3',
    buyFeePercent: 0.05,
    sellDex: 'PancakeSwap V3',
    sellFeePercent: 0.05,
    optimalLoanBaseUnits: 1,
    buyPriceQuotePerBase: 2500,
    buyPriceUsd: 2500,
    estNetProfitUsd: 15,
  };

  // Option 1: Native upgraded FlashArbOptimized with supportsAlgebra
  const nativeCands = resolveArbitrageCandidates(
    camelotToPancakeInput,
    RECIPIENT,
    1,
    { supportsAlgebra: true, supportsCamelotV2: true }
  );
  assert.equal(nativeCands.length, 2);
  assert.equal(nativeCands[0].routeType, 3); // V3 -> V3
  const decodedNativeQuote = iface.decodeFunctionData('executeOptimizedArbitrage', nativeCands[1].calldata);
  assert.equal(decodedNativeQuote.routerA.toLowerCase(), CAMELOT_V3_ROUTER_ADDRESS.toLowerCase());
  assert.equal(decodedNativeQuote.routerB.toLowerCase(), '0x1b81d678ffb9c0263b24a97847620c99d213eb14');

  // Option 1: Camelot V2 -> Uniswap V3
  const camelotV2Cands = resolveArbitrageCandidates(
    {
      ...camelotToPancakeInput,
      buyDex: 'Camelot V2',
      buyFeePercent: 0.3,
      sellDex: 'Uniswap V3',
    },
    RECIPIENT,
    1,
    { supportsAlgebra: true, supportsCamelotV2: true }
  );
  assert.equal(camelotV2Cands.length, 2);
  const decodedV2Base = iface.decodeFunctionData('executeOptimizedArbitrage', camelotV2Cands[0].calldata);
  assert.equal(Number(decodedV2Base.routeType), 1); // V3 -> V2 (sell on Uniswap V3, buy on Camelot V2)
  assert.equal(decodedV2Base.routerA.toLowerCase(), '0xe592427a0aece92de3edee1f18e0157c05861564');
  assert.equal(decodedV2Base.routerB.toLowerCase(), CAMELOT_V2_ROUTER_ADDRESS.toLowerCase());

  const decodedV2Quote = iface.decodeFunctionData('executeOptimizedArbitrage', camelotV2Cands[1].calldata);
  assert.equal(Number(decodedV2Quote.routeType), 2); // V2 -> V3 (buy on Camelot V2, sell on Uniswap V3)
  assert.equal(decodedV2Quote.routerA.toLowerCase(), CAMELOT_V2_ROUTER_ADDRESS.toLowerCase());
  assert.equal(decodedV2Quote.routerB.toLowerCase(), '0xe592427a0aece92de3edee1f18e0157c05861564');

  // Option 2: Existing FlashArbOptimized + CamelotV3SwapAdapter
  const adapterAddr = '0x1234567890AbcdEF1234567890aBcdef12345678';
  const scaledAdapterCands = buildScaledArbitrageCandidates(
    camelotToPancakeInput,
    RECIPIENT,
    {
      [ARBITRUM_TOKENS.WETH.addr.toLowerCase()]: ethers.parseEther('10'),
      [ARBITRUM_TOKENS.USDC.addr.toLowerCase()]: ethers.parseUnits('25000', 6),
    },
    [1, 0.5],
    { camelotV3Adapter: adapterAddr }
  );
  assert.equal(scaledAdapterCands.length, 4);
  const decodedAdapterQuote = iface.decodeFunctionData(
    'executeOptimizedArbitrage',
    scaledAdapterCands.find((c) => c.borrowedToken.sym === 'USDC')!.calldata
  );
  assert.equal(decodedAdapterQuote.routerA.toLowerCase(), adapterAddr.toLowerCase());

  // Without native support, Camelot V2 stays excluded even if CamelotV3SwapAdapter is configured
  const v2ExcludedWithAdapterOnly = resolveArbitrageCandidates(
    {
      ...camelotToPancakeInput,
      buyDex: 'Camelot V2',
      sellDex: 'Uniswap V3',
    },
    RECIPIENT,
    1,
    { camelotV3Adapter: adapterAddr }
  );
  assert.equal(v2ExcludedWithAdapterOnly.length, 0);
});

test('compiled FlashArbOptimized and CamelotV3SwapAdapter artifacts exist with expected selectors', () => {
  const outDir = path.resolve(process.cwd(), 'flash-arb/contracts/out');
  const mainArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'FlashArbOptimized.json'), 'utf8'));
  const adapterArtifact = JSON.parse(fs.readFileSync(path.join(outDir, 'CamelotV3SwapAdapter.json'), 'utf8'));

  assert.ok(typeof mainArtifact.bytecode === 'string' && mainArtifact.bytecode.startsWith('0x'));
  assert.ok(typeof mainArtifact.deployedBytecode === 'string' && mainArtifact.deployedBytecode.startsWith('0x'));
  assert.ok(Array.isArray(mainArtifact.abi));
  assert.ok(mainArtifact.abi.some((entry: { name?: string }) => entry.name === 'routerCapabilities'));
  assert.ok(mainArtifact.abi.some((entry: { name?: string }) => entry.name === 'executeOptimizedArbitrage'));

  assert.ok(typeof adapterArtifact.bytecode === 'string' && adapterArtifact.bytecode.startsWith('0x'));
  assert.ok(typeof adapterArtifact.deployedBytecode === 'string' && adapterArtifact.deployedBytecode.startsWith('0x'));
  assert.ok(Array.isArray(adapterArtifact.abi));
  assert.ok(adapterArtifact.abi.some((entry: { name?: string }) => entry.name === 'exactInputSingle'));
  assert.ok(adapterArtifact.abi.some((entry: { name?: string }) => entry.name === 'camelotRouter'));
});




