import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, 'src');
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

const files = ['FlashArbOptimized.sol', 'CamelotV3SwapAdapter.sol'];
const sources = {};
for (const f of files) {
  sources[f] = { content: fs.readFileSync(path.join(srcDir, f), 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    evmVersion: 'cancun',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const fatal = (output.errors || []).filter((e) => e.severity === 'error');
if (fatal.length > 0) {
  for (const err of fatal) console.error(err.formattedMessage || err.message);
  process.exit(1);
}
for (const w of output.errors || []) {
  if (w.severity === 'warning') console.warn(w.formattedMessage || w.message);
}

for (const fileName of files) {
  const contracts = output.contracts[fileName] || {};
  for (const [contractName, artifact] of Object.entries(contracts)) {
    const bytecode = `0x${artifact.evm.bytecode.object}`;
    const deployedBytecode = `0x${artifact.evm.deployedBytecode.object}`;
    if (!bytecode || bytecode === '0x') continue;
    const outPath = path.join(outDir, `${contractName}.json`);
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          contractName,
          abi: artifact.abi,
          bytecode,
          deployedBytecode,
        },
        null,
        2
      )
    );
    console.log(`Compiled ${contractName} -> ${outPath} (init=${bytecode.length / 2 - 1}B, runtime=${deployedBytecode.length / 2 - 1}B)`);
  }
}
