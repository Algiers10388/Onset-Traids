const fs = require('fs');
const path = require('path');
const solc = require('solc');

const contractPath = path.join(__dirname, '../flash-arb/contracts/src/FlashArbOptimized.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'FlashArbOptimized.sol': {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    viaIR: true,
    evmVersion: 'cancun',
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let hasError = false;
  for (const err of output.errors) {
    console.log(err.formattedMessage);
    if (err.severity === 'error') {
      hasError = true;
    }
  }
  if (hasError) {
    process.exit(1);
  }
}

const contract = output.contracts['FlashArbOptimized.sol']['FlashArbOptimized'];
const bytecode = '0x' + contract.evm.bytecode.object;
const abi = contract.abi;

const outDir = path.join(__dirname, '../flash-arb/contracts/out');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const artifact = {
  contractName: 'FlashArbOptimized',
  abi,
  bytecode,
};

fs.writeFileSync(path.join(outDir, 'FlashArbOptimized.json'), JSON.stringify(artifact, null, 2));
console.log('Successfully compiled FlashArbOptimized.sol to flash-arb/contracts/out/FlashArbOptimized.json');
console.log('Bytecode characters:', bytecode.length);
console.log('ABI methods:', abi.length);
