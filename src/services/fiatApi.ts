import {
  FiatAccount,
  FiatTransaction,
  LinkedBankAccount,
  LinkedDebitCard,
  ThreeDSChallengeSession,
  ThreeDSVerificationResult,
} from '../types';

export interface CardInput {
  cardNumber: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  cardholderName: string;
  saveCard?: boolean;
}

export interface BankInput {
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'CHECKING' | 'SAVINGS' | 'BUSINESS';
  accountHolderName: string;
  connectedVia?: 'PLAID_OPEN_BANKING' | 'MANUAL_ACH_ROUTING';
}

// Resilient JSON response parser preventing "Unexpected token '<', not valid JSON" errors
async function safeParseJson<T = any>(res: Response, fallbackError = 'Request failed'): Promise<T> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    throw new Error('Network error reading response from banking gateway.');
  }

  let data: any = null;
  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response received (HTML error page, proxy timeout, etc.)
      throw new Error(
        res.status >= 500
          ? 'Banking gateway service is temporarily synchronizing. Please retry in a moment.'
          : `Banking gateway returned an unexpected response (HTTP ${res.status}).`
      );
    }
  }

  if (!res.ok || (data && data.success === false)) {
    const errorMsg = (data && data.error) || (data && data.message) || `${fallbackError} (HTTP ${res.status})`;
    throw new Error(errorMsg);
  }

  return (data || {}) as T;
}

export async function fetchFiatAccount(): Promise<{
  account: FiatAccount;
  security: any;
}> {
  const res = await fetch('/api/fiat/account');
  const data = await safeParseJson(res, 'Failed to retrieve live currency account');
  return { account: data.account, security: data.security };
}

export async function depositViaCard(
  amount: number,
  cardId?: string,
  newCard?: CardInput,
  directToBot: boolean = false
): Promise<{
  account: FiatAccount;
  transaction: FiatTransaction;
  message: string;
  directToBot?: boolean;
  botCreditAmount?: number;
}> {
  const res = await fetch('/api/fiat/deposit/card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, cardId, newCard, directToBot }),
  });
  return safeParseJson(res, 'Debit card load failed');
}

export async function syncBotCapital(
  botCash: number
): Promise<{ success: boolean; allocatedToTrading: number; account: FiatAccount }> {
  try {
    const res = await fetch('/api/fiat/sync-bot-capital', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botCash }),
    });
    return await safeParseJson(res, 'Could not sync bot capital');
  } catch (err: any) {
    console.warn('Could not sync bot capital with treasury:', err);
    return { success: false, allocatedToTrading: botCash, account: {} as any };
  }
}

export async function linkDebitCard(
  cardData: CardInput
): Promise<{ account: FiatAccount; card: LinkedDebitCard; message: string }> {
  const res = await fetch('/api/fiat/link-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cardData),
  });
  return safeParseJson(res, 'Failed to link debit card');
}

export async function removeBankAccount(
  bankId: string
): Promise<{ success: boolean; account: FiatAccount; message: string }> {
  const res = await fetch(`/api/fiat/bank/${bankId}`, {
    method: 'DELETE',
  });
  return safeParseJson(res, 'Failed to remove bank account');
}

export async function removeDebitCard(
  cardId: string
): Promise<{ success: boolean; account: FiatAccount; message: string }> {
  const res = await fetch(`/api/fiat/card/${cardId}`, {
    method: 'DELETE',
  });
  return safeParseJson(res, 'Failed to remove card');
}

export async function transferBetweenFiatAndBot(
  direction: 'TO_BOT' | 'FROM_BOT',
  amount: number
): Promise<{ account: FiatAccount; transaction: FiatTransaction; message: string }> {
  const res = await fetch('/api/fiat/transfer-bot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction, amount }),
  });
  return safeParseJson(res, 'Transfer failed');
}

export interface WithdrawalRequest {
  destinationType: 'BANK' | 'CARD';
  bankId?: string;
  cardId?: string;
  amount: number;
  rail?: 'ACH_TRANSFER' | 'INSTANT_FEDNOW' | 'SAME_DAY_WIRE' | 'VISA_DIRECT_PUSH';
  source?: 'TREASURY' | 'BOT';
  newDestination?: any;
  twoFactorCode?: string;
}

export async function withdrawFunds(
  req: WithdrawalRequest
): Promise<{ account: FiatAccount; transaction: FiatTransaction; message: string; botAmountDeducted?: number }> {
  const res = await fetch('/api/fiat/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return safeParseJson(res, 'Withdrawal processing failed');
}

export async function withdrawToBank(
  bankId: string,
  amount: number
): Promise<{ account: FiatAccount; transaction: FiatTransaction; message: string }> {
  return withdrawFunds({
    destinationType: 'BANK',
    bankId,
    amount,
    rail: 'ACH_TRANSFER',
  });
}

export async function fetchFiatTransactions(): Promise<FiatTransaction[]> {
  const res = await fetch('/api/fiat/transactions');
  if (!res.ok) return [];
  const data = await res.json();
  return data.transactions || [];
}

export interface CheckDepositInput {
  amount: number;
  payerName: string;
  checkNumber: string;
  routingNumber: string;
  accountNumber: string;
  issuingBank?: string;
  settlementSpeed?: 'INSTANT' | 'STANDARD_CLEARING';
  directToBot?: boolean;
  endorsementConfirmed: boolean;
  frontImageUrl?: string;
  backImageUrl?: string;
  memo?: string;
  twoFactorCode?: string;
}

export async function depositPersonalCheck(
  input: CheckDepositInput
): Promise<{
  account: FiatAccount;
  transaction: FiatTransaction;
  check: any;
  message: string;
  directToBot?: boolean;
  botCreditAmount?: number;
}> {
  const res = await fetch('/api/fiat/deposit/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return safeParseJson(res, 'Failed to cash personal check');
}

export async function fetchCheckDeposits(): Promise<any[]> {
  try {
    const res = await fetch('/api/fiat/check-deposits');
    const data = await safeParseJson(res, 'Failed to fetch check deposits');
    return data.checks || [];
  } catch {
    return [];
  }
}

export async function fetchSecurityAudit(): Promise<any | null> {
  try {
    const res = await fetch('/api/fiat/security/audit');
    const data = await safeParseJson(res, 'Failed to fetch security audit');
    return data.report;
  } catch {
    return null;
  }
}

export async function updateBotProtection(
  settings: any
): Promise<{ success: boolean; message: string; botSecurity: any; account: FiatAccount }> {
  const res = await fetch('/api/fiat/security/update-bot-protection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return safeParseJson(res, 'Failed to update bot protection');
}

export async function initiate3DsChallenge(payload: {
  amount: number;
  depositType?: 'CARD' | 'BANK';
  cardId?: string;
  newCard?: CardInput;
  bankId?: string;
  newBank?: any;
  transferSpeed?: string;
  directToBot?: boolean;
}): Promise<{
  success: boolean;
  session: ThreeDSChallengeSession;
  suggestedOtp?: string;
  message: string;
}> {
  const res = await fetch('/api/fiat/3ds/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return safeParseJson(res, 'Failed to initiate 3D Secure challenge');
}

export async function verify3DsChallenge(payload: {
  sessionId: string;
  authCode?: string;
  biometricConfirmed?: boolean;
}): Promise<{
  success: boolean;
  result: ThreeDSVerificationResult;
  transaction: FiatTransaction;
  account: FiatAccount;
  message: string;
}> {
  const res = await fetch('/api/fiat/3ds/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return safeParseJson(res, 'Failed to verify 3D Secure authentication');
}
