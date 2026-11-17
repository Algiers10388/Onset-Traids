export interface UsdtContractTokenHolding {
  symbol: string;
  address?: string;
  balance: string;
  sweepCompatible?: boolean;
}

export interface UsdtContractInspection {
  address: string;
  isDeployed?: boolean;
  ownerMatchesSigner?: boolean;
  accessibleForSweep?: boolean;
  supportsRescueTokensTo?: boolean;
  supportsRescueTokens?: boolean;
  nonZeroTokens: UsdtContractTokenHolding[];
}

export interface UsdtAutoSweepEvaluation {
  shouldTrigger: boolean;
  exceedsThreshold: boolean;
  reason:
    | 'READY'
    | 'DISABLED'
    | 'INVALID_PROFIT_WALLET'
    | 'SIGNER_NOT_CONFIGURED'
    | 'SWEEP_IN_FLIGHT'
    | 'COOLDOWN_ACTIVE'
    | 'BELOW_THRESHOLD'
    | 'NO_ACCESSIBLE_CONTRACT';
  thresholdUsdt: number;
  totalContractUsdt: number;
  sweepableContractUsdt: number;
  triggerContracts: string[];
  blockedContracts: string[];
}

export const DEFAULT_USDT_SWEEP_THRESHOLD = 5;
export const DEFAULT_USDT_AUTO_SWEEP_COOLDOWN_MS = 30_000;

export function parseUsdtSweepThreshold(
  raw: string | number | null | undefined,
  fallback: number = DEFAULT_USDT_SWEEP_THRESHOLD
): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(6));
}

export function normalizeTokenSymbolFilter(tokenSymbols?: unknown): Set<string> | null {
  if (!Array.isArray(tokenSymbols) || tokenSymbols.length === 0) return null;
  const normalized = tokenSymbols
    .map((s) => String(s || '').trim().toUpperCase())
    .filter((s) => s.length > 0);
  return normalized.length > 0 ? new Set(normalized) : null;
}

export function filterSweepTokensBySymbols<T extends { symbol: string }>(
  tokens: T[],
  symbolFilter: Set<string> | null
): T[] {
  if (!symbolFilter || symbolFilter.size === 0) return tokens;
  return tokens.filter((t) => symbolFilter.has(String(t.symbol || '').trim().toUpperCase()));
}

export function isValidNonZeroEvmAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  return (
    /^0x[a-fA-F0-9]{40}$/.test(trimmed) &&
    trimmed.toLowerCase() !== '0x0000000000000000000000000000000000000000'
  );
}

export function evaluateContractUsdtSweep(params: {
  contracts: UsdtContractInspection[];
  thresholdUsdt: number;
  enabled: boolean;
  isSignerKeyConfigured: boolean;
  profitWalletAddress: string;
  isBusy: boolean;
  lastAttemptAtMs?: number;
  nowMs?: number;
  cooldownMs?: number;
}): UsdtAutoSweepEvaluation {
  const safeThreshold = parseUsdtSweepThreshold(params.thresholdUsdt, DEFAULT_USDT_SWEEP_THRESHOLD);
  const cooldownMs = params.cooldownMs ?? DEFAULT_USDT_AUTO_SWEEP_COOLDOWN_MS;
  const lastAttemptAtMs = params.lastAttemptAtMs ?? 0;
  const nowMs = params.nowMs ?? Date.now();

  let totalContractUsdt = 0;
  let sweepableContractUsdt = 0;
  const triggerContracts: string[] = [];
  const blockedContracts: string[] = [];

  for (const contract of params.contracts || []) {
    if (contract.isDeployed === false) continue;

    const usdtHoldings = (contract.nonZeroTokens || []).filter(
      (tok) => String(tok.symbol || '').trim().toUpperCase() === 'USDT'
    );
    if (usdtHoldings.length === 0) continue;

    let contractUsdt = 0;
    let contractCompatibleUsdt = 0;
    for (const tok of usdtHoldings) {
      const amount = Number(tok.balance);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      contractUsdt += amount;
      if (tok.sweepCompatible !== false) {
        contractCompatibleUsdt += amount;
      }
    }

    if (contractUsdt <= 0) continue;
    totalContractUsdt += contractUsdt;

    const hasRescueFn =
      contract.supportsRescueTokensTo === true ||
      contract.supportsRescueTokens === true ||
      (contract.supportsRescueTokensTo === undefined && contract.supportsRescueTokens === undefined);
    const signerCanSweep =
      contract.ownerMatchesSigner === true ||
      (contract.ownerMatchesSigner === undefined && contract.accessibleForSweep === true);

    if (signerCanSweep && hasRescueFn && contractCompatibleUsdt > 0) {
      sweepableContractUsdt += contractCompatibleUsdt;
      triggerContracts.push(contract.address);
    } else {
      blockedContracts.push(contract.address);
    }
  }

  totalContractUsdt = Number(totalContractUsdt.toFixed(6));
  sweepableContractUsdt = Number(sweepableContractUsdt.toFixed(6));

  const exceedsThreshold =
    totalContractUsdt > 0 && totalContractUsdt > safeThreshold;

  if (!params.enabled) {
    return {
      shouldTrigger: false,
      exceedsThreshold,
      reason: 'DISABLED',
      thresholdUsdt: safeThreshold,
      totalContractUsdt,
      sweepableContractUsdt,
      triggerContracts,
      blockedContracts,
    };
  }

  if (!isValidNonZeroEvmAddress(params.profitWalletAddress)) {
    return {
      shouldTrigger: false,
      exceedsThreshold,
      reason: 'INVALID_PROFIT_WALLET',
      thresholdUsdt: safeThreshold,
      totalContractUsdt,
      sweepableContractUsdt,
      triggerContracts,
      blockedContracts,
    };
  }

  if (!params.isSignerKeyConfigured) {
    return {
      shouldTrigger: false,
      exceedsThreshold,
      reason: 'SIGNER_NOT_CONFIGURED',
      thresholdUsdt: safeThreshold,
      totalContractUsdt,
      sweepableContractUsdt,
      triggerContracts,
      blockedContracts,
    };
  }

  if (totalContractUsdt <= 0 || totalContractUsdt <= safeThreshold) {
    return {
      shouldTrigger: false,
      exceedsThreshold: false,
      reason: 'BELOW_THRESHOLD',
      thresholdUsdt: safeThreshold,
      totalContractUsdt,
      sweepableContractUsdt,
      triggerContracts,
      blockedContracts,
    };
  }

  if (sweepableContractUsdt <= 0 || triggerContracts.length === 0) {
    return {
      shouldTrigger: false,
      exceedsThreshold,
      reason: 'NO_ACCESSIBLE_CONTRACT',
      thresholdUsdt: safeThreshold,
      totalContractUsdt,
      sweepableContractUsdt,
      triggerContracts,
      blockedContracts,
    };
  }

  if (sweepableContractUsdt <= safeThreshold) {
    return {
      shouldTrigger: false,
      exceedsThreshold,
      reason: 'BELOW_THRESHOLD',
      thresholdUsdt: safeThreshold,
      totalContractUsdt,
      sweepableContractUsdt,
      triggerContracts,
      blockedContracts,
    };
  }

  if (params.isBusy) {
    return {
      shouldTrigger: false,
      exceedsThreshold,
      reason: 'SWEEP_IN_FLIGHT',
      thresholdUsdt: safeThreshold,
      totalContractUsdt,
      sweepableContractUsdt,
      triggerContracts,
      blockedContracts,
    };
  }

  if (lastAttemptAtMs > 0 && nowMs - lastAttemptAtMs < cooldownMs) {
    return {
      shouldTrigger: false,
      exceedsThreshold,
      reason: 'COOLDOWN_ACTIVE',
      thresholdUsdt: safeThreshold,
      totalContractUsdt,
      sweepableContractUsdt,
      triggerContracts,
      blockedContracts,
    };
  }

  return {
    shouldTrigger: true,
    exceedsThreshold: true,
    reason: 'READY',
    thresholdUsdt: safeThreshold,
    totalContractUsdt,
    sweepableContractUsdt,
    triggerContracts,
    blockedContracts,
  };
}
