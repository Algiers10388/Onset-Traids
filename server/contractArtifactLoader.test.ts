import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadOrCompileContractArtifact } from './contractArtifactLoader.ts';

test('loadOrCompileContractArtifact compiles FlashArbOptimized and CamelotV3SwapAdapter on demand when out/ is missing', async () => {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'flasharb-art-'));
  try {
    const tmpSrc = path.join(tmpBase, 'flash-arb/contracts/src');
    fs.mkdirSync(tmpSrc, { recursive: true });
    const repoSrc = path.join(process.cwd(), 'flash-arb/contracts/src');
    for (const f of ['FlashArbOptimized.sol', 'CamelotV3SwapAdapter.sol']) {
      fs.copyFileSync(path.join(repoSrc, f), path.join(tmpSrc, f));
    }

    const outDir = path.join(tmpBase, 'flash-arb/contracts/out');
    assert.equal(fs.existsSync(outDir), false);

    const mainArt = await loadOrCompileContractArtifact('FlashArbOptimized', tmpBase);
    assert.equal(mainArt.contractName, 'FlashArbOptimized');
    assert.ok(mainArt.bytecode.startsWith('0x') && mainArt.bytecode.length > 100);
    assert.ok(mainArt.abi.some((e: any) => e.name === 'executeOptimizedArbitrage'));
    assert.ok(fs.existsSync(path.join(outDir, 'FlashArbOptimized.json')));

    const adapterArt = await loadOrCompileContractArtifact('CamelotV3SwapAdapter', tmpBase);
    assert.equal(adapterArt.contractName, 'CamelotV3SwapAdapter');
    assert.ok(adapterArt.bytecode.startsWith('0x') && adapterArt.bytecode.length > 100);
    assert.ok(adapterArt.abi.some((e: any) => e.name === 'exactInputSingle'));
    assert.ok(fs.existsSync(path.join(outDir, 'CamelotV3SwapAdapter.json')));
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
});
