import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Landmark,
  ShieldCheck,
  Lock,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
  Plus,
  Zap,
  Building2,
  ExternalLink,
  Receipt,
  Sparkles,
  RefreshCw,
  Download,
  SlidersHorizontal,
  Filter,
  Search,
  ArrowUpDown,
  RotateCw,
  Trash2,
} from 'lucide-react';
import {
  FiatAccount,
  FiatTransaction,
  LinkedBankAccount,
  LinkedDebitCard,
  ThreeDSChallengeSession,
  ThreeDSVerificationResult,
} from '../types';
import {
  depositViaCard,
  linkDebitCard,
  removeBankAccount,
  removeDebitCard,
  transferBetweenFiatAndBot,
  withdrawToBank,
  withdrawFunds,
  initiate3DsChallenge,
} from '../services/fiatApi';
import { formatCurrency } from '../utils/cryptoMath';
import { CashCheckModalTab } from './CashCheckModalTab';
import { BankBotSecurityTab } from './BankBotSecurityTab';
import { ThreeDSecureModal } from './ThreeDSecureModal';
import { StripeCardDeposit, type StripeDepositResult } from './StripeCardDeposit';
import { PlaidBankDeposit } from './PlaidBankDeposit';
import { PayPalWithdraw } from './PayPalWithdraw';

export type TabType =
  | 'FUND_BOT'
  | 'CASH_CHECK'
  | 'SECURITY'
  | 'WITHDRAW'
  | 'ADD_BANK'
  | 'ADD_CARD'
  | 'DEPOSIT'
  | 'DEBIT_CARD'
  | 'BANK_TRANSFER'
  | 'TRANSFER_BOT'
  | 'LEDGER';

interface LiveCurrencyAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  fiatAccount: FiatAccount;
  transactions: FiatTransaction[];
  onAccountUpdated: (newAccount: FiatAccount, notificationMsg?: string) => void;
  onBotCashAdjusted?: (amountDelta: number) => void;
  botCash: number;
  initialTab?: TabType;
}

const POPULAR_BANKS = [
  { name: 'Bank of America', routing: '121000358' },
  { name: 'Wells Fargo', routing: '121000248' },
  { name: 'Citibank', routing: '021000089' },
  { name: 'Capital One', routing: '051405515' },
  { name: 'Charles Schwab Bank', routing: '121143720' },
  { name: 'Fidelity Cash Mgmt', routing: '101205681' },
  { name: 'Navy Federal CU', routing: '256074974' },
  { name: 'US Bank', routing: '091000022' },
  { name: 'PNC Bank', routing: '043000096' },
  { name: 'TD Bank', routing: '031201360' },
  { name: 'Ally Bank', routing: '124085066' },
  { name: 'Discover Bank', routing: '031100649' },
  { name: 'Truist Bank', routing: '061000104' },
  { name: 'Huntington Bank', routing: '044000024' },
  { name: 'JPMorgan Chase', routing: '021000021' },
  { name: 'Goldman Sachs Marcus', routing: '021000089' },
];

export const LiveCurrencyAccountModal: React.FC<LiveCurrencyAccountModalProps> = ({
  isOpen,
  onClose,
  fiatAccount,
  transactions,
  onAccountUpdated,
  onBotCashAdjusted,
  botCash,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'FUND_BOT');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Dedicated Tab: Fund Trading Bot State
  const [fundBotSourceType, setFundBotSourceType] = useState<'BANK' | 'CARD' | 'VAULT'>('BANK');
  const [fundBotAmount, setFundBotAmount] = useState<string>('500');
  const [fundSuccessReceipt, setFundSuccessReceipt] = useState<FiatTransaction | null>(null);
  const [showNewBankInFund, setShowNewBankInFund] = useState<boolean>(false);
  const [showNewCardInFund, setShowNewCardInFund] = useState<boolean>(false);

  // Sub-toggle for deposit method: defaults to BANK
  const [depositMethod, setDepositMethod] = useState<'CARD' | 'BANK'>('BANK');
  // Target destination for deposits: directly fund bot cash or store in live vault
  const [depositTarget, setDepositTarget] = useState<'BOT' | 'VAULT'>('BOT');

  // Interactive UI State enhancements
  const [isCardFlipped, setIsCardFlipped] = useState<boolean>(false);
  const [bankSearchQuery, setBankSearchQuery] = useState<string>('');
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'WITHDRAW' | 'DEPOSIT' | 'BOT_TRANSFER'>('ALL');
  const [ledgerSearch, setLedgerSearch] = useState<string>('');

  // 3D Secure 2.2 Strong Customer Authentication State
  const [active3DsSession, setActive3DsSession] = useState<ThreeDSChallengeSession | null>(null);
  const [suggested3DsOtp, setSuggested3DsOtp] = useState<string | undefined>(undefined);
  const [is3DsModalOpen, setIs3DsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (initialTab && isOpen) {
      if (initialTab === 'FUND_BOT') {
        setActiveTab('FUND_BOT');
        setDepositTarget('BOT');
      } else if (initialTab === 'DEBIT_CARD') {
        setActiveTab('FUND_BOT');
        setFundBotSourceType('CARD');
        setDepositTarget('BOT');
      } else if (initialTab === 'BANK_TRANSFER') {
        setActiveTab('FUND_BOT');
        setFundBotSourceType('BANK');
        setDepositTarget('BOT');
      } else {
        setActiveTab(initialTab);
      }
    } else if (isOpen && !initialTab) {
      setActiveTab('FUND_BOT');
      setDepositTarget('BOT');
    }
  }, [initialTab, isOpen]);

  // Tab: Debit Card State
  const [selectedCardId, setSelectedCardId] = useState<string>(fiatAccount.linkedCards[0]?.id || 'NEW');
  const [cardDepositAmount, setCardDepositAmount] = useState<string>('');
  const [newCardNumber, setNewCardNumber] = useState<string>('');
  const [newCardExpMonth, setNewCardExpMonth] = useState<string>('12');
  const [newCardExpYear, setNewCardExpYear] = useState<string>('2029');
  const [newCardCvc, setNewCardCvc] = useState<string>('');
  const [newCardHolder, setNewCardHolder] = useState<string>(fiatAccount.accountHolder || 'Authorized Trader');
  const [saveNewCard, setSaveNewCard] = useState<boolean>(true);

  // Tab: Bank Transfer State
  const [selectedBankId, setSelectedBankId] = useState<string>(fiatAccount.linkedBanks[0]?.id || '');
  const [bankDepositAmount, setBankDepositAmount] = useState<string>('');
  const [transferSpeed, setTransferSpeed] = useState<'INSTANT_FEDNOW' | 'STANDARD_ACH'>('INSTANT_FEDNOW');
  const [showConnectBankForm, setShowConnectBankForm] = useState<boolean>(false);
  const [newBankName, setNewBankName] = useState<string>('');
  const [newRoutingNumber, setNewRoutingNumber] = useState<string>('');
  const [newAccountNumber, setNewAccountNumber] = useState<string>('');
  const [newAccountType, setNewAccountType] = useState<'CHECKING' | 'SAVINGS'>('CHECKING');
  const [newAccountHolder, setNewAccountHolder] = useState<string>(fiatAccount.accountHolder || 'Authorized Trader');

  // Tab: Comprehensive Withdraw State
  const [withdrawSource, setWithdrawSource] = useState<'TREASURY' | 'BOT'>('TREASURY');
  const [withdrawDestinationType, setWithdrawDestinationType] = useState<'BANK' | 'CARD'>('BANK');
  const [withdrawBankId, setWithdrawBankId] = useState<string>(fiatAccount.linkedBanks[0]?.id || '');
  const [withdrawCardId, setWithdrawCardId] = useState<string>(fiatAccount.linkedCards[0]?.id || '');
  const [withdrawRail, setWithdrawRail] = useState<'INSTANT_FEDNOW' | 'ACH_TRANSFER' | 'SAME_DAY_WIRE'>('INSTANT_FEDNOW');
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [showInlineNewBank, setShowInlineNewBank] = useState<boolean>(false);
  const [showInlineNewCard, setShowInlineNewCard] = useState<boolean>(false);
  const [inlineBankName, setInlineBankName] = useState<string>('');
  const [inlineRouting, setInlineRouting] = useState<string>('');
  const [inlineAccountNum, setInlineAccountNum] = useState<string>('');
  const [inlineAccountType, setInlineAccountType] = useState<'CHECKING' | 'SAVINGS'>('CHECKING');
  const [inlineCardNum, setInlineCardNum] = useState<string>('');
  const [inlineCardExpMonth, setInlineCardExpMonth] = useState<string>('');
  const [inlineCardExpYear, setInlineCardExpYear] = useState<string>('');
  const [inlineCardCvc, setInlineCardCvc] = useState<string>('');
  const [inlineCardHolder, setInlineCardHolder] = useState<string>(fiatAccount.accountHolder);
  const [withdraw2FaCode, setWithdraw2FaCode] = useState<string>('');
  const [withdrawSuccessReceipt, setWithdrawSuccessReceipt] = useState<FiatTransaction | null>(null);

  // Tab: Bot Transfer State
  const [botTransferDirection, setBotTransferDirection] = useState<'TO_BOT' | 'FROM_BOT'>('TO_BOT');
  const [botTransferAmount, setBotTransferAmount] = useState<string>('1000');

  useEffect(() => {
    if (!selectedBankId && fiatAccount.linkedBanks.length > 0) {
      setSelectedBankId(fiatAccount.linkedBanks[0].id);
    }
    if ((!selectedCardId || selectedCardId === 'NEW') && fiatAccount.linkedCards.length > 0) {
      setSelectedCardId(fiatAccount.linkedCards[0].id);
    }
    if ((!withdrawBankId || !fiatAccount.linkedBanks.some((b) => b.id === withdrawBankId)) && fiatAccount.linkedBanks.length > 0) {
      setWithdrawBankId(fiatAccount.linkedBanks[0].id);
    }
    if ((!withdrawCardId || !fiatAccount.linkedCards.some((c) => c.id === withdrawCardId)) && fiatAccount.linkedCards.length > 0) {
      setWithdrawCardId(fiatAccount.linkedCards[0].id);
    }
  }, [fiatAccount.linkedBanks, fiatAccount.linkedCards, selectedBankId, selectedCardId, withdrawBankId, withdrawCardId]);

  const downloadReceiptText = (tx: FiatTransaction) => {
    const receiptContent = `========================================================
APEX QUANT FINANCIAL RAIL - PROOF OF SETTLEMENT
========================================================
Settlement ID:      ${tx.id}
Cryptographic Hash: ${tx.referenceHash}
Timestamp:          ${new Date(tx.timestamp).toISOString()} (${new Date(tx.timestamp).toLocaleString()})
Transaction Type:   ${tx.type}
Rail:               ${tx.rail}
Source:             ${tx.sourceName}
Destination:        ${tx.destinationName || 'Linked Custodial Account'}
Gross Amount:       $${tx.amount.toFixed(2)} USD
Network Fee:        $${(tx.fee || 0).toFixed(2)} USD (Zero Payout Fee)
Net Settled:        $${(tx.netAmount || tx.amount).toFixed(2)} USD
Settlement Status:  COMPLETED / VERIFIED (FDIC Rail)
Custodial Trust:    Evolve Bank & Trust / Cross River Bank
Encryption:         AES-256-GCM Hardware Security Module
========================================================
Federal Reserve FedNow / Visa Direct Gateway Acknowledged.
This document certifies real-time clearing across banking rails.
========================================================`;
    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Settlement-Receipt-${tx.referenceHash.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMessage({ type, text });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 6000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handle3DsSuccess = (result: ThreeDSVerificationResult) => {
    setIs3DsModalOpen(false);
    setActive3DsSession(null);
    if (result.account) {
      onAccountUpdated(result.account, result.message);
    }
    if (result.transaction) {
      setFundSuccessReceipt(result.transaction);
      if (
        onBotCashAdjusted &&
        (result.transaction.destinationName?.toLowerCase().includes('bot') ||
          result.transaction.type === 'TRANSFER_TO_BOT_CAPITAL')
      ) {
        onBotCashAdjusted(result.transaction.amount);
      }
    }
    showFeedback(
      'success',
      `3D Secure 2.2 Verified! Cryptogram: ${result.cavv.slice(0, 10)}... Issuer liability shift applied.`
    );
  };

  // Real card deposit finished (Stripe confirmed it and the server credited the ledger)
  const handleStripeDeposited = (result: StripeDepositResult, fallbackAmount: number) => {
    onAccountUpdated(result.account, result.message);
    if (result.directToBot && onBotCashAdjusted) {
      onBotCashAdjusted(result.botCreditAmount ?? result.transaction?.netAmount ?? fallbackAmount);
    }
    if (result.transaction) setFundSuccessReceipt(result.transaction);
    showFeedback('success', result.message);
  };

  // Primary: Handle Direct Transfer to Fund Trading Bot
  const handleFundBotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(fundBotAmount);
    if (isNaN(amt) || amt < 0.01) {
      showFeedback('error', 'Minimum funding amount is $0.01 USD.');
      return;
    }

    setIsLoading(true);
    try {
      if (fundBotSourceType === 'BANK') {
        throw new Error('Bank (ACH) deposits go to the USD ledger first. Use the Bank tab, then Transfer to Bot after the funds settle.');
      } else if (fundBotSourceType === 'CARD') {
        throw new Error('Use the "Charge card" button inside the card form to pay with Stripe.');
      } else if (fundBotSourceType === 'VAULT') {
        if (amt > fiatAccount.availableBalance) {
          throw new Error(`Insufficient funds in Live Vault ($${fiatAccount.availableBalance.toFixed(2)} available).`);
        }
        const res = await transferBetweenFiatAndBot('TO_BOT', amt);
        onAccountUpdated(res.account, res.message);
        if (onBotCashAdjusted) {
          onBotCashAdjusted(amt);
        }
        setFundSuccessReceipt(res.transaction);
        showFeedback('success', res.message);
      }
    } catch (err: any) {
      showFeedback('error', err.message || 'Bot funding transfer failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3e. Remove a Linked Bank Account
  const handleRemoveBank = async (bankId: string, bankName: string) => {
    setIsLoading(true);
    try {
      const res = await removeBankAccount(bankId);
      onAccountUpdated(res.account, res.message);
      if (selectedBankId === bankId) {
        setSelectedBankId(res.account.linkedBanks[0]?.id || '');
      }
      if (withdrawBankId === bankId) {
        setWithdrawBankId(res.account.linkedBanks[0]?.id || '');
      }
      showFeedback('success', res.message || `Disconnected ${bankName}.`);
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to remove bank account.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3f. Remove a Linked Debit Card
  const handleRemoveCard = async (cardId: string, brand: string, last4: string) => {
    setIsLoading(true);
    try {
      const res = await removeDebitCard(cardId);
      onAccountUpdated(res.account, res.message);
      if (selectedCardId === cardId) {
        setSelectedCardId(res.account.linkedCards[0]?.id || 'NEW');
      }
      if (withdrawCardId === cardId) {
        setWithdrawCardId(res.account.linkedCards[0]?.id || '');
      }
      showFeedback('success', res.message || `Disconnected ${brand} •••• ${last4}.`);
    } catch (err: any) {
      showFeedback('error', err.message || 'Failed to remove debit card.');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Handle Withdrawal
  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt < 0.01) {
      showFeedback('error', 'Minimum withdrawal amount is $0.01 USD.');
      return;
    }

    const availableLimit = withdrawSource === 'TREASURY' ? fiatAccount.availableBalance : botCash;
    if (amt > availableLimit) {
      showFeedback(
        'error',
        `Insufficient funds in ${withdrawSource === 'TREASURY' ? 'Live Vault Cash' : 'Trading Bot Cash'}. Available: $${availableLimit.toFixed(2)}`
      );
      return;
    }

    let newDest: any = undefined;

    if (withdrawDestinationType === 'CARD' && !showInlineNewCard && !withdrawCardId && fiatAccount.linkedCards.length === 0) {
      setShowInlineNewCard(true);
      showFeedback('error', 'Please enter your check/debit card details to complete the payout.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await withdrawFunds({
        destinationType: withdrawDestinationType,
        bankId: withdrawDestinationType === 'BANK' ? withdrawBankId : undefined,
        cardId: withdrawDestinationType === 'CARD' ? withdrawCardId : undefined,
        amount: amt,
        rail: withdrawDestinationType === 'CARD' ? 'VISA_DIRECT_PUSH' : withdrawRail,
        source: withdrawSource,
        newDestination: newDest,
        twoFactorCode: withdraw2FaCode.trim() || undefined,
      });

      onAccountUpdated(res.account, res.message);
      if (withdrawSource === 'BOT' && onBotCashAdjusted) {
        onBotCashAdjusted(-amt);
      }
      setWithdrawSuccessReceipt(res.transaction);
      showFeedback('success', res.message);
    } catch (err: any) {
      showFeedback('error', err.message || 'Withdrawal processing failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Handle Transfer Between Live Fiat and Bot Capital
  const handleBotTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(botTransferAmount);
    if (isNaN(amt) || amt < 0.01) {
      showFeedback('error', 'Minimum transfer amount is $0.01 USD.');
      return;
    }

    if (botTransferDirection === 'FROM_BOT' && amt > botCash) {
      showFeedback('error', `Cannot withdraw more than current bot margin cash balance ($${botCash.toFixed(2)}).`);
      return;
    }

    setIsLoading(true);
    try {
      const res = await transferBetweenFiatAndBot(botTransferDirection, amt);
      onAccountUpdated(res.account, res.message);
      if (onBotCashAdjusted) {
        onBotCashAdjusted(botTransferDirection === 'TO_BOT' ? amt : -amt);
      }
      showFeedback('success', res.message);
    } catch (err: any) {
      showFeedback('error', err.message || 'Capital transfer failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper for card preview
  const activeCard = fiatAccount.linkedCards.find((c) => c.id === selectedCardId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 w-full max-w-6xl xl:max-w-7xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[94vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 border border-emerald-500/30 text-emerald-400">
              <Landmark className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">Live Currency Account & Banking Rail</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  AES-256 GCM Vault
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30">
                  FDIC Custody
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-currency fiat treasury with instant debit card loading, multi-rail withdrawals, and direct connectivity to any US bank.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Balance Overview Banner */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Available Fiat Cash</div>
            <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
              {formatCurrency(fiatAccount.availableBalance)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Instant Clearing (USD)</div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Allocated to Bot</div>
            <div className="text-xl font-black text-cyan-400 font-mono mt-0.5">
              {formatCurrency(fiatAccount.allocatedToTrading)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Active Trading Margin</div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Connected Banks</div>
            <div className="text-xl font-black text-white font-mono mt-0.5">
              {fiatAccount.linkedBanks.length} <span className="text-xs font-normal text-slate-400">Institutions</span>
            </div>
            <div className="text-[10px] text-emerald-400/80 mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-2.5 w-2.5" /> ACH & FedNow Verified
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Daily Limit Remaining</div>
            <div className="text-xl font-black text-slate-200 font-mono mt-0.5">
              ${(fiatAccount.dailyDepositLimit - fiatAccount.dailyDepositUsed).toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Limit: ${fiatAccount.dailyDepositLimit.toLocaleString()}/day</div>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMessage && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl text-xs flex items-center gap-2.5 border ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            )}
            <div className="flex-1">{feedbackMessage.text}</div>
          </div>
        )}

        {/* Navigation Tabs - Primary Fund Trading Bot along with banking operations */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/70 overflow-x-auto text-xs font-semibold gap-2 py-3 scrollbar-thin">
          <button
            type="button"
            onClick={() => setActiveTab('FUND_BOT')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'FUND_BOT'
                ? 'bg-amber-500/25 text-amber-200 border border-amber-500/60 shadow-md font-bold ring-1 ring-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-xs">⚡ Fund Trading Bot</span>
            <span className="text-[9px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full font-mono font-bold">
              Bank & Card
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CASH_CHECK')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'CASH_CHECK'
                ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/60 shadow-md font-bold ring-1 ring-emerald-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <span className="text-sm">💵</span>
            <span className="text-xs">Cash a Check</span>
            <span className="text-[9px] bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold">
              Mobile RDC
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SECURITY')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'SECURITY'
                ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/60 shadow-md font-bold ring-1 ring-cyan-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <span className="text-xs">Bank & Bot Security</span>
            <span className="text-[9px] bg-cyan-500/30 text-cyan-200 px-2 py-0.5 rounded-full font-mono font-bold">
              Fortress A+
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('WITHDRAW')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'WITHDRAW'
                ? 'bg-rose-500/25 text-rose-200 border border-rose-500/60 shadow-md font-bold ring-1 ring-rose-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <ArrowUpFromLine className="h-4 w-4 text-rose-400" />
            <span className="text-xs">Withdraw Funds</span>
            <span className="text-[9px] bg-rose-500/30 text-rose-200 px-2 py-0.5 rounded-full font-mono font-bold">
              Payouts
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ADD_BANK')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ADD_BANK'
                ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/60 shadow-md font-bold ring-1 ring-emerald-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <Landmark className="h-4 w-4 text-emerald-400" />
            <span className="text-xs">+ Add Bank Account</span>
            <span className="text-[9px] bg-emerald-500/30 text-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold">
              + Link Bank
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ADD_CARD')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ADD_CARD'
                ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/60 shadow-md font-bold ring-1 ring-cyan-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <CreditCard className="h-4 w-4 text-cyan-400" />
            <span className="text-xs">+ Add Check Card</span>
            <span className="text-[9px] bg-cyan-500/30 text-cyan-200 px-2 py-0.5 rounded-full font-mono font-bold">
              + Link Card
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DEPOSIT')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'DEPOSIT' || activeTab === 'DEBIT_CARD' || activeTab === 'BANK_TRANSFER'
                ? 'bg-amber-500/25 text-amber-200 border border-amber-500/60 shadow-md font-bold ring-1 ring-amber-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <ArrowDownToLine className="h-4 w-4 text-amber-400" />
            <span className="text-xs">Deposit to Vault</span>
            <span className="text-[9px] bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full font-mono font-bold">
              Load Vault
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('TRANSFER_BOT')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'TRANSFER_BOT'
                ? 'bg-purple-500/25 text-purple-200 border border-purple-500/60 shadow-md font-bold ring-1 ring-purple-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <ArrowLeftRight className="h-4 w-4 text-purple-400" />
            <span className="text-xs">Vault ⇄ Bot Bridge</span>
            <span className="text-[9px] bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full font-mono font-bold">
              Margin Move
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('LEDGER')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'LEDGER'
                ? 'bg-blue-500/25 text-blue-200 border border-blue-500/60 shadow-md font-bold ring-1 ring-blue-500/40'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border border-transparent'
            }`}
          >
            <Clock className="h-4 w-4 text-blue-400" />
            <span className="text-xs">Audit Ledger</span>
            <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-mono">
              {transactions.length}
            </span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB: CASH A PERSONAL CHECK (MOBILE RDC) */}
          {activeTab === 'CASH_CHECK' && (
            <CashCheckModalTab
              fiatAccount={fiatAccount}
              onAccountUpdated={onAccountUpdated}
              onBotCashAdjusted={onBotCashAdjusted}
              botCash={botCash}
            />
          )}

          {/* TAB: BANK & BOT SECURITY ENGINE */}
          {activeTab === 'SECURITY' && (
            <BankBotSecurityTab
              fiatAccount={fiatAccount}
              onAccountUpdated={onAccountUpdated}
            />
          )}

          {/* TAB: FUND TRADING BOT DIRECTLY FROM BANK OR CHECK CARD */}
          {activeTab === 'FUND_BOT' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
              {/* Receipt Banner if just completed */}
              {fundSuccessReceipt && (
                <div className="p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/60 shadow-2xl space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        <CheckCircle2 className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <span>Trading Bot Successfully Funded</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            SETTLED & ACTIVE
                          </span>
                        </h4>
                        <p className="text-xs text-slate-300 mt-0.5">
                          ${fundSuccessReceipt.amount.toFixed(2)} USD deposited into Bot Active Margin. The trading bot can now execute orders with these funds.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setFundSuccessReceipt(null)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg text-xs"
                      title="Dismiss receipt"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-mono uppercase">Amount Funded</div>
                      <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                        +{formatCurrency(fundSuccessReceipt.amount)}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-mono uppercase">Source</div>
                      <div className="text-xs font-bold text-white truncate mt-0.5">
                        {fundSuccessReceipt.sourceName}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">Verified Rail</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-mono uppercase">Clearing Rail</div>
                      <div className="text-xs font-bold text-cyan-300 mt-0.5">
                        {fundSuccessReceipt.rail === 'FEDNOW_INSTANT'
                          ? 'FedNow Instant (0s)'
                          : fundSuccessReceipt.rail === 'DEBIT_PULL'
                          ? 'Visa Direct / MC Pull'
                          : 'Direct ACH'}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-mono">$0.00 Fee Guaranteed</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400 font-mono uppercase">Current Bot Margin</div>
                      <div className="text-base font-black text-cyan-400 font-mono mt-0.5">
                        {formatCurrency(botCash)}
                      </div>
                      <div className="text-[10px] text-slate-500">Ready to trade</div>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Audit Hash:</span>
                      <span className="text-cyan-400 truncate text-[11px] select-all">
                        {fundSuccessReceipt.referenceHash}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(fundSuccessReceipt.referenceHash)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] shrink-0 ml-2 transition-all cursor-pointer"
                    >
                      {copiedHash === fundSuccessReceipt.referenceHash ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 text-slate-400" />
                          <span>Copy Hash</span>
                        </>
                      )}
                    </button>
                  </div>

                  {fundSuccessReceipt.id.includes('3ds') && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-[11px] text-emerald-300 font-mono">
                      <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>3D Secure 2.2 SCA Verified • EMVCo Cryptogram Authorized • Issuer Liability Shift Active</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => downloadReceiptText(fundSuccessReceipt)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border border-emerald-500/30"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download Receipt (.txt)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFundSuccessReceipt(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer"
                    >
                      Fund More Capital
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>Start Bot with New Margin</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Main Fund Bot Configuration Card */}
              <div className="p-6 bg-slate-900/90 border border-amber-500/30 rounded-2xl shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-yellow-500/20 border border-amber-500/40 text-amber-400">
                      <Zap className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                        <span>Fund Trading Bot from Bank or Check Card</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Direct to Margin
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Transfers credit immediately to Bot Active Margin so automated strategies can execute live and simulated orders.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-start sm:self-auto font-mono">
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Current Bot Margin</div>
                      <div className="text-base sm:text-lg font-black text-emerald-400">
                        {formatCurrency(botCash)}
                      </div>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleFundBotSubmit} className="space-y-6">
                  {/* STEP 1: SELECT TRANSFER SOURCE */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                      1. Select Funding Source
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Option A: Bank Account */}
                      <div
                        onClick={() => setFundBotSourceType('BANK')}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          fundBotSourceType === 'BANK'
                            ? 'bg-amber-950/30 border-amber-500/80 ring-2 ring-amber-500/40 shadow-lg shadow-amber-500/10'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-bold text-white">Bank Account</span>
                          </div>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                            FedNow 0s
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-2">
                          US checking or savings account. Real-time FedNow instant settlement or ACH.
                        </div>
                        {fiatAccount.linkedBanks.length > 0 && (
                          <div className="text-[10px] text-cyan-300 font-mono mt-2">
                            {fiatAccount.linkedBanks.length} connected bank{fiatAccount.linkedBanks.length > 1 ? 's' : ''} available
                          </div>
                        )}
                      </div>

                      {/* Option B: Check Card / Debit Card */}
                      <div
                        onClick={() => setFundBotSourceType('CARD')}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          fundBotSourceType === 'CARD'
                            ? 'bg-cyan-950/30 border-cyan-500/80 ring-2 ring-cyan-500/40 shadow-lg shadow-cyan-500/10'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300">
                              <CreditCard className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-bold text-white">Check / Debit Card</span>
                          </div>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                            Instant Pull
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-2">
                          Instant card pull via Visa Direct or Mastercard. Funds clear in 0 seconds.
                        </div>
                        {fiatAccount.linkedCards.length > 0 && (
                          <div className="text-[10px] text-cyan-300 font-mono mt-2">
                            {fiatAccount.linkedCards.length} saved check card{fiatAccount.linkedCards.length > 1 ? 's' : ''} ready
                          </div>
                        )}
                      </div>

                      {/* Option C: Live Treasury Vault */}
                      <div
                        onClick={() => setFundBotSourceType('VAULT')}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          fundBotSourceType === 'VAULT'
                            ? 'bg-purple-950/30 border-purple-500/80 ring-2 ring-purple-500/40 shadow-lg shadow-purple-500/10'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-300">
                              <Landmark className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-bold text-white">Treasury Vault</span>
                          </div>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                            Internal
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-2">
                          Move existing funds from Live USD Treasury Vault into Bot Trading Margin.
                        </div>
                        <div className="text-[10px] text-emerald-400 font-mono mt-2">
                          {formatCurrency(fiatAccount.availableBalance)} available
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* STEP 2: SOURCE CONFIGURATION */}
                  {/* WHEN SOURCE IS BANK ACCOUNT: ACH goes to the ledger first */}
                  {fundBotSourceType === 'BANK' && (
                    <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3 text-xs text-slate-300">
                      <div className="font-bold text-white">Bank (ACH) deposits go to your USD ledger first</div>
                      <p>
                        ACH takes about 4 business days and can be returned by the bank after it clears, so it cannot fund the bot directly. Deposit from your bank
                        on the Bank tab, then use Transfer to Bot once the funds settle. For instant funding use the Card source.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setDepositMethod('BANK');
                          setActiveTab('DEPOSIT');
                        }}
                        className="px-3 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold cursor-pointer"
                      >
                        Go to bank deposit
                      </button>
                    </div>
                  )}

                  {/* WHEN SOURCE IS CARD: real Stripe Elements form */}
                  {fundBotSourceType === 'CARD' && (
                    <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                      <StripeCardDeposit
                        amount={parseFloat(fundBotAmount) || 0}
                        directToBot
                        buttonLabel="Charge card and fund bot"
                        onDeposited={(r) => handleStripeDeposited(r, parseFloat(fundBotAmount) || 0)}
                        onError={(m) => showFeedback('error', m)}
                      />
                    </div>
                  )}

                  {/* WHEN SOURCE IS TREASURY VAULT */}
                  {fundBotSourceType === 'VAULT' && (
                    <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-bold">Live Vault Balance Available:</span>
                        <span className="font-mono text-base font-black text-emerald-400">
                          {formatCurrency(fiatAccount.availableBalance)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Transfer settled USD from your custodial vault directly into active bot margin. Instant clearing, zero fee.
                      </p>
                      <div className="flex gap-2 pt-1">
                        {[0.25, 0.5, 0.75, 1].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => setFundBotAmount(String(Math.floor(fiatAccount.availableBalance * pct)))}
                            className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-purple-500/40 text-slate-300 font-mono text-xs font-bold cursor-pointer transition-all"
                          >
                            {pct === 1 ? 'MAX (100%)' : `${pct * 100}%`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* STEP 3: FUNDING AMOUNT */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        2. Transfer Amount to Bot (USD)
                      </label>
                      <span className="text-xs text-slate-400 font-mono">
                        Min: $0.01 • Zero Fee
                      </span>
                    </div>

                    {/* Quick Amount Chips */}
                    <div className="flex flex-wrap gap-2 mb-2.5">
                      {[100, 250, 500, 1000, 2500, 5000, 10000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setFundBotAmount(String(preset))}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all ${
                            fundBotAmount === String(preset)
                              ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                          }`}
                        >
                          +${preset.toLocaleString()}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <span className="absolute left-4 top-2.5 text-slate-400 font-mono text-xl font-bold">$</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={fundBotAmount}
                        onChange={(e) => setFundBotAmount(e.target.value)}
                        placeholder="500.00"
                        className="w-full bg-slate-950 border border-slate-700 text-white pl-9 pr-4 py-2.5 rounded-xl font-mono text-2xl font-black focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>
                  </div>

                  {/* STEP 4: REAL-TIME TRANSFER SUMMARY */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Funding Source:</span>
                      <span className="font-semibold text-slate-200">
                        {fundBotSourceType === 'BANK'
                          ? `${newBankName || 'Connected Bank'} (FedNow Instant)`
                          : fundBotSourceType === 'CARD'
                          ? 'Card (charged through Stripe)'
                          : 'Live USD Treasury Vault'}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>Destination Target:</span>
                      <span className="font-semibold text-amber-300">
                        Bot Active Margin (Trading Cash)
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>Transfer Rail & Settlement:</span>
                      <span className="text-cyan-300 font-semibold font-mono">
                        {fundBotSourceType === 'BANK'
                          ? transferSpeed === 'INSTANT_FEDNOW' ? 'FedNow 0s Instant Settlement' : 'Direct ACH (Same-Day)'
                          : fundBotSourceType === 'CARD'
                          ? 'Stripe card payment (3-D Secure when your bank requires it)'
                          : 'Internal Ledger Bridge'}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-400">
                      <span>Network Transfer Fee:</span>
                      <span className="text-emerald-400 font-mono font-bold">
                        {fundBotSourceType === 'CARD' ? 'Stripe fee is deducted from the credited amount' : '$0.00'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
                      <div>
                        <div className="text-slate-400 text-[11px]">Updated Bot Trading Margin:</div>
                        <div className="text-slate-500 text-[10px]">
                          ${botCash.toFixed(2)} + ${parseFloat(fundBotAmount || '0').toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black font-mono text-emerald-400">
                          {formatCurrency(botCash + (parseFloat(fundBotAmount || '0') || 0))} USD
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* STEP 5: SUBMIT BUTTON (card payments use the Stripe form's own button) */}
                  {fundBotSourceType !== 'CARD' && fundBotSourceType !== 'BANK' && (
                  <button
                    type="submit"
                    disabled={isLoading || parseFloat(fundBotAmount || '0') <= 0}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-xl shadow-amber-500/20 transition-all disabled:opacity-50 active:scale-[0.99]"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Clearing Transfer via Financial Rails...</span>
                      </div>
                    ) : (
                      <>
                        <Zap className="h-5 w-5" />
                        <span>
                          {`Complete Transfer & Fund Bot: $${parseFloat(fundBotAmount || '0').toFixed(2)} USD`}
                        </span>
                      </>
                    )}
                  </button>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* TAB: LINK A BANK ACCOUNT (Plaid Link) */}
          {activeTab === 'ADD_BANK' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
              <div className="p-6 bg-slate-900/90 border border-cyan-500/30 rounded-2xl shadow-xl space-y-5">
                <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    <Landmark className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-wide">Link a bank account</h3>
                    <p className="text-xs text-slate-400">Verified through Plaid and used for ACH deposits through Stripe. Withdrawals to a bank are not available here.</p>
                  </div>
                </div>
                <PlaidBankDeposit
                  linkedBanks={fiatAccount.linkedBanks}
                  onAccountUpdated={(account, message) => {
                    onAccountUpdated(account, message);
                    showFeedback('success', message);
                  }}
                  onError={(m) => showFeedback('error', m)}
                />
              </div>
            </div>
          )}

          {/* TAB: ADD NEW DEBIT CARD (DEDICATED FULL-SPACE VIEW) */}
          {activeTab === 'ADD_CARD' && (
            <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
              <div className="p-6 bg-slate-900/90 border border-cyan-500/30 rounded-2xl shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-wide">
                        Link Debit Card for Instant Push Withdrawals
                      </h3>
                      <p className="text-xs text-slate-400">
                        Powered by Visa Direct & Mastercard Send. Funds reflect in your bank account in under 30 minutes.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                      <Zap className="h-3.5 w-3.5" />
                      Instant 30-Min Push
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Visual Card Preview with Interactive Flip */}
                  <div className="md:col-span-5 flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-400">Interactive Card Preview</span>
                      <button
                        type="button"
                        onClick={() => setIsCardFlipped(!isCardFlipped)}
                        className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
                      >
                        <RotateCw className="h-3 w-3" />
                        <span>Flip {isCardFlipped ? 'to Front' : 'to Back (CVV)'}</span>
                      </button>
                    </div>

                    {!isCardFlipped ? (
                      /* Card Front */
                      <div
                        onClick={() => setIsCardFlipped(true)}
                        className="relative h-52 w-full rounded-2xl p-5 bg-gradient-to-tr from-slate-900 via-slate-800 to-cyan-950 border border-cyan-500/40 shadow-2xl flex flex-col justify-between overflow-hidden cursor-pointer transition-transform hover:scale-[1.01]"
                        title="Click to flip card to back"
                      >
                        <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-10 bg-amber-400/20 border border-amber-400/40 rounded flex items-center justify-center">
                              <div className="w-5 h-4 border border-amber-400/60 rounded-sm" />
                            </div>
                            <span className="text-[10px] font-mono text-cyan-300 font-semibold tracking-wider">
                              DEBIT RAIL
                            </span>
                          </div>
                          <span className="text-sm font-bold font-mono tracking-widest text-white">
                            {newCardNumber.startsWith('4') ? 'VISA' : newCardNumber.startsWith('5') ? 'MASTERCARD' : 'VISA / MC'}
                          </span>
                        </div>

                        <div className="my-auto">
                          <div className="font-mono text-lg tracking-[0.2em] text-white font-bold drop-shadow">
                            {newCardNumber ? newCardNumber.padEnd(19, '•') : '•••• •••• •••• ••••'}
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-mono">
                          <div>
                            <div className="text-[8px] uppercase tracking-wider text-slate-400">Cardholder</div>
                            <div className="text-slate-200 font-semibold truncate max-w-[150px]">
                              {newCardHolder || 'PRIMARY TRADER'}
                            </div>
                          </div>
                          <div>
                            <div className="text-[8px] uppercase tracking-wider text-slate-400">Expires</div>
                            <div className="text-slate-200 font-semibold">
                              {newCardExpMonth}/{newCardExpYear.slice(-2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Card Back */
                      <div
                        onClick={() => setIsCardFlipped(false)}
                        className="relative h-52 w-full rounded-2xl bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 border border-cyan-500/40 shadow-2xl flex flex-col justify-between overflow-hidden cursor-pointer transition-transform hover:scale-[1.01]"
                        title="Click to flip card to front"
                      >
                        <div className="h-10 w-full bg-slate-950 mt-4 border-y border-slate-800" />
                        <div className="px-5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] uppercase font-mono text-slate-400">Authorized Signature</span>
                            <span className="text-[8px] uppercase font-mono text-slate-400">CVV/CVC</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-8 bg-slate-100/90 rounded px-3 flex items-center font-serif italic text-slate-800 text-xs select-none">
                              {newCardHolder || 'Authorized Trader'}
                            </div>
                            <div className="h-8 w-14 bg-slate-900 border border-slate-700 rounded flex items-center justify-center font-mono font-bold text-amber-300 text-sm">
                              {newCardCvc || '•••'}
                            </div>
                          </div>
                        </div>
                        <div className="px-5 pb-4 flex items-center justify-between text-[8px] font-mono text-slate-500">
                          <span>Custodial Card Services • 1-800-APEX-USD</span>
                          <span className="text-cyan-400 font-bold">PCI-DSS TIER 1</span>
                        </div>
                      </div>
                    )}

                    <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 text-xs space-y-2 text-slate-400">
                      <div className="flex items-center gap-2 text-slate-300 font-semibold">
                        <Lock className="h-3.5 w-3.5 text-cyan-400" />
                        <span>PCI-DSS Tier 1 Encrypted Vault</span>
                      </div>
                      <p>
                        Cards are tokenized and stored securely. You can withdraw directly to this card anytime with instant confirmation.
                      </p>
                    </div>
                  </div>

                  {/* Card Entry Form */}
                  <div className="md:col-span-7">
                    <div className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-4 text-xs text-amber-100 space-y-1.5">
  <div className="font-bold">Card payouts are not available</div>
  <p>
    This app has no payout provider, so it cannot send money to a card, and it no longer collects card numbers for that purpose.
    Withdraw from your exchange or payment processor dashboard. Card <em>deposits</em> use Stripe on the Deposit tab.
  </p>
</div>
                  </div>
                </div>
              </div>

              {/* List of currently linked debit cards */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Currently Linked Debit Cards ({fiatAccount.linkedCards.length})
                </h4>
                {fiatAccount.linkedCards.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center">
                    <CreditCard className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                    <div className="text-sm font-medium text-slate-300">No Debit Cards Linked</div>
                    <div className="text-xs text-slate-500 mt-1">Use the card entry form above to link a card for instant deposits and payouts.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {fiatAccount.linkedCards.map((card) => (
                      <div
                        key={card.id}
                        className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                            <CreditCard className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white flex items-center gap-2">
                              <span>{card.brand} •••• {card.last4}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                Instant Push
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              {card.cardholderName} | Exp: {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setWithdrawCardId(card.id);
                              setWithdrawDestinationType('CARD');
                              setActiveTab('WITHDRAW');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-cyan-300 border border-slate-700 cursor-pointer transition-all"
                          >
                            Withdraw
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCard(card.id, card.brand, card.last4)}
                            className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/60 cursor-pointer transition-all"
                            title="Disconnect and remove debit card"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* UNIFIED DEPOSIT HEADER & RAIL SELECTOR */}
          {(activeTab === 'DEPOSIT' || activeTab === 'DEBIT_CARD' || activeTab === 'BANK_TRANSFER') && (
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-4 mb-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ArrowDownToLine className="h-4 w-4 text-emerald-400" />
                    <span>Deposit Funds to Trading Account</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Transfer USD from connected banks via FedNow instant (0s), standard ACH, or instant debit card pull.
                  </p>
                </div>

                {/* Rail Selector */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('DEPOSIT');
                      setDepositMethod('BANK');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      depositMethod === 'BANK'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Connected Bank (FedNow / ACH)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('DEPOSIT');
                      setDepositMethod('CARD');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      depositMethod === 'CARD'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Debit Card (Instant)</span>
                  </button>
                </div>
              </div>

              {/* Destination Target: Direct to Bot vs Live Vault */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
                <div>
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    <span>Deposit Destination Target:</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {depositTarget === 'BOT'
                      ? '⚡ Funds directly increase Bot Active Margin (Portfolio Cash) so the bot trades immediately.'
                      : '🏛 Funds are safely stored in your Live USD Treasury Vault. Transfer to bot anytime in Bot Margin Transfer.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositTarget('BOT')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                      depositTarget === 'BOT'
                        ? 'bg-emerald-500 text-slate-950 shadow-md ring-2 ring-emerald-400/40 font-extrabold'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    <span>Direct to Bot Trading Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositTarget('VAULT')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                      depositTarget === 'VAULT'
                        ? 'bg-cyan-500 text-slate-950 shadow-md ring-2 ring-cyan-400/40 font-extrabold'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Landmark className="h-3.5 w-3.5" />
                    <span>Live Vault Treasury</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: DEBIT CARD LOADING */}
          {((activeTab === 'DEPOSIT' && depositMethod === 'CARD') || activeTab === 'DEBIT_CARD') && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: Visual Debit Card */}
              <div className="md:col-span-5 flex flex-col justify-between space-y-4">
                <div className="relative h-48 w-full rounded-2xl p-5 bg-gradient-to-tr from-slate-900 via-slate-800 to-cyan-950 border border-cyan-500/30 shadow-xl flex flex-col justify-between overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-10 bg-amber-400/20 border border-amber-400/40 rounded flex items-center justify-center">
                        <div className="w-5 h-4 border border-amber-400/60 rounded-sm" />
                      </div>
                      <span className="text-[10px] font-mono text-cyan-300 font-semibold tracking-wider">DEBIT RAIL</span>
                    </div>
                    <span className="text-sm font-bold font-mono tracking-widest text-white">
                      {selectedCardId === 'NEW' ? 'VISA / MC' : activeCard?.brand || 'VISA'}
                    </span>
                  </div>

                  <div className="my-auto">
                    <div className="font-mono text-base tracking-[0.2em] text-white font-bold">
                      {selectedCardId === 'NEW'
                        ? newCardNumber
                          ? newCardNumber.padEnd(19, '•')
                          : '•••• •••• •••• ••••'
                        : `•••• •••• •••• ${activeCard?.last4 || '4242'}`}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <div>
                      <div className="text-[8px] uppercase tracking-wider text-slate-400">Cardholder</div>
                      <div className="text-slate-200 font-semibold truncate max-w-[140px]">
                        {selectedCardId === 'NEW' ? newCardHolder || 'CARDHOLDER' : activeCard?.cardholderName}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] uppercase tracking-wider text-slate-400">Expires</div>
                      <div className="text-slate-200 font-semibold">
                        {selectedCardId === 'NEW'
                          ? `${newCardExpMonth}/${newCardExpYear.slice(-2)}`
                          : `${String(activeCard?.expMonth || 12).padStart(2, '0')}/${String(
                              activeCard?.expYear || 2029
                            ).slice(-2)}`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] space-y-2 text-slate-400">
                  <div className="flex items-center gap-2 text-slate-300 font-semibold">
                    <Lock className="h-3.5 w-3.5 text-cyan-400" />
                    <span>PCI-DSS Tier 1 Encrypted Tokenization</span>
                  </div>
                  <p>
                    Card details are entered in Stripe's secure fields and never touch this app or its server. Stripe's processing fee is deducted from the amount credited, and your bank may ask for 3-D Secure.
                  </p>
                </div>
              </div>

              {/* Right Column: Loading Controls */}
              <div className="md:col-span-7">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Deposit amount (USD)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-sm">$</span>
                      <input
                        type="number"
                        min="0.5"
                        step="0.01"
                        value={cardDepositAmount}
                        onChange={(e) => setCardDepositAmount(e.target.value)}
                        placeholder="0.50"
                        className="w-full bg-slate-900 border border-slate-700 text-white pl-8 pr-4 py-2.5 rounded-xl font-mono text-base font-bold focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Minimum $0.50 (Stripe). Credits to {depositTarget === 'BOT' ? 'the trading bot cash balance' : 'your USD ledger'}.</p>
                  </div>

                  <StripeCardDeposit
                    amount={parseFloat(cardDepositAmount) || 0}
                    directToBot={depositTarget === 'BOT'}
                    onDeposited={(r) => handleStripeDeposited(r, parseFloat(cardDepositAmount) || 0)}
                    onError={(m) => showFeedback('error', m)}
                  />
                </div>
                </div>
              </div>
          )}

          {/* TAB 2: BANK DEPOSIT (Plaid Link + Stripe ACH) */}
          {((activeTab === 'DEPOSIT' && depositMethod === 'BANK') || activeTab === 'BANK_TRANSFER') && (
            <div className="space-y-6">
              <PlaidBankDeposit
                linkedBanks={fiatAccount.linkedBanks}
                onAccountUpdated={(account, message) => {
                  onAccountUpdated(account, message);
                  showFeedback('success', message);
                }}
                onError={(m) => showFeedback('error', m)}
              />
            </div>
          )}

          {/* TAB 3: WITHDRAW TO PAYPAL (PayPal Payouts) */}
          {activeTab === 'WITHDRAW' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <PayPalWithdraw
                availableBalance={fiatAccount.availableBalance}
                onAccountUpdated={(account, message) => {
                  onAccountUpdated(account, message);
                  showFeedback('success', message);
                }}
                onError={(m) => showFeedback('error', m)}
              />
            </div>
          )}

          {/* TAB 4: BOT CAPITAL TRANSFER */}
          {activeTab === 'TRANSFER_BOT' && (
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-xs font-bold text-white">Bridge Live Treasury & Algorithmic Trading Bot</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Move funds instantly between your secure live currency account and the active crypto trading margin.
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="text-slate-400 text-[10px]">Bot Trading Cash</div>
                  <div className="text-cyan-400 font-bold">{formatCurrency(botCash)}</div>
                </div>
              </div>

              <form onSubmit={handleBotTransfer} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBotTransferDirection('TO_BOT')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      botTransferDirection === 'TO_BOT'
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5 text-emerald-400">
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      <span>Deposit to Trading Bot</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Live Fiat Vault ➔ Bot Trading Cash</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBotTransferDirection('FROM_BOT')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      botTransferDirection === 'FROM_BOT'
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center gap-1.5 text-cyan-400">
                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                      <span>Secure Bot Profits to Vault</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Bot Trading Cash ➔ Live Fiat Vault</div>
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-slate-400">Transfer Amount (USD)</label>
                    <span className="text-[10px] font-mono text-slate-400">
                      Available to Move:{' '}
                      <strong className="text-white">
                        {formatCurrency(botTransferDirection === 'TO_BOT' ? fiatAccount.availableBalance : botCash)}
                      </strong>
                    </span>
                  </div>

                  {/* Percentage Presets */}
                  <div className="flex gap-2 mb-2">
                    {[0.25, 0.5, 0.75, 1].map((pct) => {
                      const pool = botTransferDirection === 'TO_BOT' ? fiatAccount.availableBalance : botCash;
                      const val = Math.floor(pool * pct);
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setBotTransferAmount(String(val))}
                          className="flex-1 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 font-mono text-xs font-bold cursor-pointer transition-all hover:text-white"
                        >
                          {pct === 1 ? 'MAX (100%)' : `${pct * 100}%`}
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-sm">$</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.01"
                      value={botTransferAmount}
                      onChange={(e) => setBotTransferAmount(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 text-white pl-8 pr-4 py-2.5 rounded-xl font-mono text-base font-bold focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span>
                    Execute Internal Transfer (${parseFloat(botTransferAmount || '0').toFixed(2)})
                  </span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 5: AUDIT LEDGER */}
          {activeTab === 'LEDGER' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Receipt className="h-4 w-4 text-cyan-400" />
                    Immutable Proof-of-Reserves Activity Log
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Cryptographically hashed records across FedNow, Visa Direct, and ACH banking rails.
                  </p>
                </div>
                <span className="font-mono text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full self-start sm:self-auto">
                  {transactions.length} Verified Entries
                </span>
              </div>

              {/* Interactive Search & Filter Controls */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <div className="relative w-full sm:flex-1">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search by bank, card, rail, or hash..."
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-white pl-8 pr-3 py-1.5 rounded-xl focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  {ledgerSearch && (
                    <button
                      type="button"
                      onClick={() => setLedgerSearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold cursor-pointer transition-all ${
                      ledgerFilter === 'ALL'
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    All ({transactions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('WITHDRAW')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold cursor-pointer transition-all ${
                      ledgerFilter === 'WITHDRAW'
                        ? 'bg-rose-500 text-white font-bold'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-300'
                    }`}
                  >
                    Withdrawals ({transactions.filter((t) => t.type.includes('WITHDRAW')).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('DEPOSIT')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold cursor-pointer transition-all ${
                      ledgerFilter === 'DEPOSIT'
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-emerald-300'
                    }`}
                  >
                    Deposits ({transactions.filter((t) => t.type.includes('DEPOSIT') || t.type.includes('LOAD')).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerFilter('BOT_TRANSFER')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold cursor-pointer transition-all ${
                      ledgerFilter === 'BOT_TRANSFER'
                        ? 'bg-blue-500 text-white font-bold'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-300'
                    }`}
                  >
                    Bot Bridge ({transactions.filter((t) => t.type.includes('BOT')).length})
                  </button>
                </div>
              </div>

              {/* Transactions List */}
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {(() => {
                  const filtered = transactions.filter((tx) => {
                    if (ledgerFilter === 'WITHDRAW' && !tx.type.includes('WITHDRAW')) return false;
                    if (ledgerFilter === 'DEPOSIT' && !(tx.type.includes('DEPOSIT') || tx.type.includes('LOAD'))) return false;
                    if (ledgerFilter === 'BOT_TRANSFER' && !tx.type.includes('BOT')) return false;
                    if (ledgerSearch.trim()) {
                      const q = ledgerSearch.toLowerCase();
                      const matchSource = tx.sourceName?.toLowerCase().includes(q);
                      const matchDest = tx.destinationName?.toLowerCase().includes(q);
                      const matchHash = tx.referenceHash?.toLowerCase().includes(q);
                      const matchRail = tx.rail?.toLowerCase().includes(q);
                      if (!matchSource && !matchDest && !matchHash && !matchRail) return false;
                    }
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="p-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
                        No transactions found matching the current filter or search criteria.
                      </div>
                    );
                  }

                  return filtered.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-all text-xs group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400">
                          {tx.type.includes('DEPOSIT') || tx.type.includes('LOAD') ? (
                            <ArrowDownToLine className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <ArrowUpFromLine className="h-4 w-4 text-cyan-400" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{tx.sourceName}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                              {tx.rail}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                            <span>{new Date(tx.timestamp).toLocaleString()}</span>
                            <span>•</span>
                            <span className="font-mono text-slate-500">Hash: {tx.referenceHash}</span>
                            <button
                              onClick={() => copyToClipboard(tx.referenceHash)}
                              className="text-slate-400 hover:text-cyan-300"
                              title="Copy transaction hash"
                            >
                              {copiedHash === tx.referenceHash ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              onClick={() => downloadReceiptText(tx)}
                              className="text-slate-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer"
                              title="Download Proof of Settlement (.txt)"
                            >
                              <Download className="h-3 w-3" />
                              <span>Receipt</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="text-right font-mono">
                        <div
                          className={`font-bold ${
                            tx.type.includes('WITHDRAW') ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {tx.type.includes('WITHDRAW') ? '-' : '+'}
                          {formatCurrency(tx.amount)}
                        </div>
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Footer Security Badge */}
        <div className="px-6 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Custodial Trust Partner: Cross River / Evolve Bank & Trust (Member FDIC)</span>
            </span>
          </div>
          <div className="font-mono text-[10px] text-slate-500">
            Account: {fiatAccount.accountNumberMasked}
          </div>
        </div>
      </div>

      {/* 3D Secure 2.2 Strong Customer Authentication Modal */}
      <ThreeDSecureModal
        isOpen={is3DsModalOpen}
        session={active3DsSession}
        suggestedOtp={suggested3DsOtp}
        onSuccess={handle3DsSuccess}
        onCancel={() => {
          setIs3DsModalOpen(false);
          setActive3DsSession(null);
          showFeedback('error', '3D Secure transfer approval was cancelled.');
        }}
      />
    </div>
  );
};
