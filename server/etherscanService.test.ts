// Run: node --test --import tsx server/etherscanService.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { etherscanApi, etherscanService, isTransientEtherscanError } = await import('./etherscanService.ts');

test('isTransientEtherscanError recognizes AbortError, timeout, network resets, and HTTP 5xx/429', () => {
  const abortErr = new DOMException('This operation was aborted', 'AbortError');
  assert.equal(isTransientEtherscanError(abortErr), true);
  assert.equal(isTransientEtherscanError(new Error('Etherscan request timed out after 20000ms')), true);
  assert.equal(isTransientEtherscanError(new Error('Etherscan HTTP 503')), true);
  assert.equal(isTransientEtherscanError(new Error('Max calls per sec rate limit reached')), true);
  assert.equal(isTransientEtherscanError(new Error('Invalid API Key')), false);
});

test('etherscanApi retries transient AbortError and succeeds on recovery', async () => {
  const prevKey = process.env.ETHERSCAN_API_KEY;
  const realFetch = globalThis.fetch;
  process.env.ETHERSCAN_API_KEY = 'test-key';
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      throw new DOMException('This operation was aborted', 'AbortError');
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: '1', result: { ethusd: '3200.50' } }),
    } as any;
  }) as any;

  try {
    const res = await etherscanApi(
      { module: 'stats', action: 'ethprice' },
      1,
      { timeoutMs: 250, retryDelaysMs: [10, 10] }
    );
    assert.equal(calls, 2);
    assert.equal(res.ethusd, '3200.50');
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.ETHERSCAN_API_KEY;
    else process.env.ETHERSCAN_API_KEY = prevKey;
  }
});

test('etherscanApi normalizes persistent AbortError into timeout message', async () => {
  const prevKey = process.env.ETHERSCAN_API_KEY;
  const realFetch = globalThis.fetch;
  process.env.ETHERSCAN_API_KEY = 'test-key';

  globalThis.fetch = (async () => {
    throw new DOMException('This operation was aborted', 'AbortError');
  }) as any;

  try {
    await assert.rejects(
      () => etherscanApi({ module: 'stats', action: 'ethprice' }, 1, { timeoutMs: 321, retryDelaysMs: [5] }),
      (err: any) => /timed out after 321ms/i.test(err?.message || '') && !/This operation was aborted/i.test(err?.message || '')
    );
  } finally {
    globalThis.fetch = realFetch;
    if (prevKey === undefined) delete process.env.ETHERSCAN_API_KEY;
    else process.env.ETHERSCAN_API_KEY = prevKey;
  }
});

test('etherscanService syncs block cleanly, matches lowercase builder/notable wallets, and avoids console.error on transient abort', async () => {
  const prevKey = process.env.ETHERSCAN_API_KEY;
  const realFetch = globalThis.fetch;
  const realConsoleError = console.error;
  process.env.ETHERSCAN_API_KEY = 'test-key';

  const errorLogs: string[] = [];
  console.error = (...args: any[]) => {
    errorLogs.push(args.map(String).join(' '));
  };

  let failBlockOnce = true;
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.includes('action=eth_getBlockByNumber')) {
      if (failBlockOnce) {
        failBlockOnce = false;
        throw new DOMException('This operation was aborted', 'AbortError');
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: '2.0',
          result: {
            number: '0x14d8000',
            baseFeePerGas: '0x3b9aca00', // 1 Gwei
            miner: '0x396343362be2a4da1ce0c1c210945346fb82aa49', // BeaverBuild (MEV) lowercased
            timestamp: '0x67000000',
            transactions: [
              {
                hash: '0xabc123',
                from: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045', // Vitalik lowercased
                to: '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 Router lowercased
                value: '0xde0b6b3a7640000', // 1 ETH
                gasPrice: '0x77359400', // 2 Gwei
              },
            ],
          },
        }),
      } as any;
    }
    if (u.includes('action=ethprice')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: '1', result: { ethusd: '3100.00' } }),
      } as any;
    }
    if (u.includes('action=gasoracle')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: '1', result: { SafeGasPrice: '1', ProposeGasPrice: '2', FastGasPrice: '3' } }),
      } as any;
    }
    throw new Error(`Unexpected URL in test: ${u}`);
  }) as any;

  try {
    await etherscanService.syncLiveBlockAndTxs();
    assert.equal(errorLogs.length, 0);
    const state = etherscanService.getState();
    assert.equal(state.error, null);
    assert.ok(state.blockSnapshot);
    assert.equal(state.blockSnapshot!.builderName, 'BeaverBuild (MEV)');
    assert.equal(state.liveTransactions.length, 1);
    assert.equal(state.liveTransactions[0].fromLabel, 'Vitalik Buterin (vitalik.eth)');
    assert.equal(state.liveTransactions[0].toLabel, 'Uniswap V3: SwapRouter');
  } finally {
    globalThis.fetch = realFetch;
    console.error = realConsoleError;
    if (prevKey === undefined) delete process.env.ETHERSCAN_API_KEY;
    else process.env.ETHERSCAN_API_KEY = prevKey;
  }
});
