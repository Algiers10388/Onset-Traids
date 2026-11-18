import fs from 'node:fs';
import path from 'node:path';

export type FlashArbContractName = 'FlashArbOptimized' | 'CamelotV3SwapAdapter';

export interface CompiledContractArtifact {
  contractName: string;
  abi: any[];
  bytecode: string;
  deployedBytecode: string;
}

const CONTRACT_FILES: Record<FlashArbContractName, string> = {
  FlashArbOptimized: 'FlashArbOptimized.sol',
  CamelotV3SwapAdapter: 'CamelotV3SwapAdapter.sol',
};

const artifactCache = new Map<string, CompiledContractArtifact>();

function isValidArtifact(data: any): data is CompiledContractArtifact {
  return (
    Boolean(data) &&
    Array.isArray(data.abi) &&
    typeof data.bytecode === 'string' &&
    data.bytecode.startsWith('0x') &&
    data.bytecode.length > 2
  );
}

/**
 * Loads a compiled FlashArb contract artifact from `flash-arb/contracts/out/<Name>.json`,
 * or compiles `flash-arb/contracts/src/<Name>.sol` on-demand via `solc` if the artifact
 * is missing from disk (e.g., fresh container / build without pre-compiled `out/`).
 */
export async function loadOrCompileContractArtifact(
  contractName: FlashArbContractName,
  baseDir: string = process.cwd()
): Promise<CompiledContractArtifact> {
  const outDir = path.join(baseDir, 'flash-arb/contracts/out');
  const artifactPath = path.join(outDir, `${contractName}.json`);
  const cacheKey = artifactPath;

  const cached = artifactCache.get(cacheKey);
  if (cached && isValidArtifact(cached)) {
    return cached;
  }

  if (fs.existsSync(artifactPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      if (isValidArtifact(parsed)) {
        artifactCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch {
      // Corrupt JSON on disk — fall through and recompile
    }
  }

  const srcDir = path.join(baseDir, 'flash-arb/contracts/src');
  const sourceFile = CONTRACT_FILES[contractName];
  const sourcePath = path.join(srcDir, sourceFile);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`${contractName} source file not found at ${sourcePath}`);
  }

  const sources: Record<string, { content: string }> = {};
  for (const fileName of Object.values(CONTRACT_FILES)) {
    const p = path.join(srcDir, fileName);
    if (fs.existsSync(p)) {
      sources[fileName] = { content: fs.readFileSync(p, 'utf8') };
    }
  }

  const solcMod: any = await import('solc');
  const solc = solcMod.default || solcMod;

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
  const fatalErrors = (output.errors || []).filter((e: any) => e.severity === 'error');
  if (fatalErrors.length > 0) {
    const msg = fatalErrors.map((e: any) => e.formattedMessage || e.message).join('\n');
    throw new Error(`Failed to compile ${contractName}: ${msg}`);
  }

  let requestedArtifact: CompiledContractArtifact | null = null;
  for (const [fileName, contracts] of Object.entries<any>(output.contracts || {})) {
    for (const [name, compiled] of Object.entries<any>(contracts || {})) {
      const bytecodeObj = compiled?.evm?.bytecode?.object;
      const deployedObj = compiled?.evm?.deployedBytecode?.object || '';
      if (!bytecodeObj) continue;

      const artifact: CompiledContractArtifact = {
        contractName: name,
        abi: compiled.abi || [],
        bytecode: `0x${bytecodeObj}`,
        deployedBytecode: deployedObj ? `0x${deployedObj}` : '0x',
      };

      const targetPath = path.join(outDir, `${name}.json`);
      artifactCache.set(targetPath, artifact);
      try {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(targetPath, JSON.stringify(artifact, null, 2));
      } catch {
        // Ignore read-only filesystem errors; in-memory artifact still works
      }

      if (name === contractName && fileName === sourceFile) {
        requestedArtifact = artifact;
      }
    }
  }

  if (!requestedArtifact || !isValidArtifact(requestedArtifact)) {
    throw new Error(`${contractName} compilation produced empty bytecode`);
  }

  return requestedArtifact;
}
