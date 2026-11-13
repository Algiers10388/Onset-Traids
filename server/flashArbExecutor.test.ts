import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  ARBITRUM_TOKENS,
  FLASH_ARB_OPTIMIZED_ABI,
  resolveArbitrageCandidates,
  encodeExecuteDirectFlashArb,
  encodeRescueTokens,
  encodeRescueTokensTo,
  encodeErc20Transfer,
  decodeFlashArbRevertError,
  getContractRouteType,
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
