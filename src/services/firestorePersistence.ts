import {
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseConfig';
import { PortfolioState, Position, Order, StrategyParameters } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Persist live trading portfolio state directly into Firestore
 */
export async function persistPortfolioToFirestore(
  userId: string,
  portfolio: PortfolioState,
  positions: Position[],
  orders: Order[]
): Promise<void> {
  if (!userId) return;
  const path = `users/${userId}/portfolio/latest`;
  try {
    const portfolioRef = doc(db, 'users', userId, 'portfolio', 'latest');
    const totalPosValue = positions.reduce((acc, p) => acc + p.notional, 0);
    const totalVal = portfolio.cash + totalPosValue;

    await setDoc(
      portfolioRef,
      {
        cash: portfolio.cash,
        totalValue: totalVal,
        mode: 'LIVE_REAL_TRADING',
        startingBalance: portfolio.startingBalance,
        realizedPnl: portfolio.realizedPnl,
        totalTrades: portfolio.totalTrades,
        winningTrades: portfolio.winningTrades,
        losingTrades: portfolio.losingTrades,
        maxDrawdownPercent: portfolio.maxDrawdownPercent,
        peakEquity: portfolio.peakEquity,
        positionsCount: positions.length,
        activeOrdersCount: orders.length,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Load persisted live portfolio from Firestore
 */
export async function loadPortfolioFromFirestore(
  userId: string
): Promise<Partial<PortfolioState> | null> {
  if (!userId) return null;
  const path = `users/${userId}/portfolio/latest`;
  try {
    const portfolioRef = doc(db, 'users', userId, 'portfolio', 'latest');
    const snap = await getDoc(portfolioRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      cash: typeof data.cash === 'number' ? data.cash : 0,
      startingBalance: typeof data.startingBalance === 'number' ? data.startingBalance : 0,
      realizedPnl: typeof data.realizedPnl === 'number' ? data.realizedPnl : 0,
      totalTrades: typeof data.totalTrades === 'number' ? data.totalTrades : 0,
      winningTrades: typeof data.winningTrades === 'number' ? data.winningTrades : 0,
      losingTrades: typeof data.losingTrades === 'number' ? data.losingTrades : 0,
      maxDrawdownPercent: typeof data.maxDrawdownPercent === 'number' ? data.maxDrawdownPercent : 0,
      peakEquity: typeof data.peakEquity === 'number' ? data.peakEquity : 0,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Record real trade execution log into Firestore
 */
export async function persistExecutionLog(
  userId: string,
  log: {
    id: string;
    timestamp: number;
    symbol: string;
    type: string;
    netProfitUsd: number;
    status: string;
    route: string;
  }
): Promise<void> {
  if (!userId) return;
  const path = `users/${userId}/executions/${log.id}`;
  try {
    const execRef = doc(db, 'users', userId, 'executions', log.id);
    await setDoc(execRef, {
      ...log,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Persist active strategy configuration to Firestore
 */
export async function persistStrategyToFirestore(
  userId: string,
  strategy: StrategyParameters
): Promise<void> {
  if (!userId) return;
  const stratId = strategy.id || 'default_strategy';
  const path = `users/${userId}/strategies/${stratId}`;
  try {
    const stratRef = doc(db, 'users', userId, 'strategies', stratId);
    await setDoc(stratRef, {
      id: stratId,
      name: strategy.name,
      type: strategy.triggerType || 'QUANTITATIVE_MOMENTUM',
      minSpreadPercent: strategy.minArbitrageProfitPercent || 0.15,
      maxPositionUsd: strategy.maxPositions || 5,
      stopLossPercent: strategy.stopLossPercent,
      takeProfitPercent: strategy.takeProfitPercent,
      routingMode: strategy.routingMode || 'SMART_ORDER_ROUTER',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Persist Flash Arb configuration (including Profit Recipient Wallet and Deployed Contracts) to Firestore
 */
export async function persistFlashArbSettings(
  userId: string,
  settings: {
    profitRecipientAddress?: string;
    label?: string;
    gasWalletAddress?: string;
    gasWalletLabel?: string;
    autoExecute?: boolean;
    defaultToken?: string;
    arbitrumContract?: string;
    baseContract?: string;
    optimismContract?: string;
  }
): Promise<void> {
  if (!userId) return;
  const path = `users/${userId}/bot_security_settings/flash_arb`;
  try {
    const ref = doc(db, 'users', userId, 'bot_security_settings', 'flash_arb');
    await setDoc(
      ref,
      {
        ...settings,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Load Flash Arb configuration (including Profit Recipient, Gas Funder, and Deployed Contracts) from Firestore
 */
export async function loadFlashArbSettings(
  userId: string
): Promise<{
  profitRecipientAddress?: string;
  label?: string;
  gasWalletAddress?: string;
  gasWalletLabel?: string;
  autoExecute?: boolean;
  defaultToken?: string;
  arbitrumContract?: string;
  baseContract?: string;
  optimismContract?: string;
} | null> {
  if (!userId) return null;
  const path = `users/${userId}/bot_security_settings/flash_arb`;
  try {
    const ref = doc(db, 'users', userId, 'bot_security_settings', 'flash_arb');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as any;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

