import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
  Smartphone,
  Fingerprint,
  Clock,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  KeyRound,
  ExternalLink,
  Shield,
  Building2,
} from 'lucide-react';
import { ThreeDSChallengeSession, ThreeDSVerificationResult } from '../types';
import { verify3DsChallenge } from '../services/fiatApi';

interface ThreeDSecureModalProps {
  isOpen: boolean;
  session: ThreeDSChallengeSession | null;
  suggestedOtp?: string;
  onSuccess: (result: ThreeDSVerificationResult) => void;
  onCancel: () => void;
}

export const ThreeDSecureModal: React.FC<ThreeDSecureModalProps> = ({
  isOpen,
  session,
  suggestedOtp,
  onSuccess,
  onCancel,
}) => {
  const [authMethod, setAuthMethod] = useState<'SMS_OTP' | 'BIOMETRIC_PASSKEY'>('SMS_OTP');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(30);
  const [canResend, setCanResend] = useState<boolean>(false);
  const [biometricScanning, setBiometricScanning] = useState<boolean>(false);
  const [biometricDone, setBiometricDone] = useState<boolean>(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset and populate test hint when session changes
  useEffect(() => {
    if (isOpen && session) {
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMsg(null);
      setBiometricDone(false);
      setBiometricScanning(false);
      setResendCooldown(30);
      setCanResend(false);

      // Focus first input box
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    }
  }, [isOpen, session]);

  // Countdown timer for resend
  useEffect(() => {
    if (!isOpen || resendCooldown <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, resendCooldown]);

  if (!isOpen || !session) return null;

  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }

    // If pasted multiple digits
    if (clean.length > 1) {
      const next = [...otpDigits];
      const chars = clean.slice(0, 6).split('');
      chars.forEach((c, i) => {
        if (index + i < 6) next[index + i] = c;
      });
      setOtpDigits(next);
      const focusTarget = Math.min(index + chars.length, 5);
      inputRefs.current[focusTarget]?.focus();
      return;
    }

    const next = [...otpDigits];
    next[index] = clean.slice(-1);
    setOtpDigits(next);

    // Auto-advance
    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const fillSuggestedCode = () => {
    const code = suggestedOtp || '849201';
    const digits = code.slice(0, 6).split('');
    setOtpDigits(digits);
    inputRefs.current[5]?.focus();
  };

  const handleResend = () => {
    setResendCooldown(30);
    setCanResend(false);
    setErrorMsg(null);
  };

  const handleVerifyOtp = async () => {
    const enteredCode = otpDigits.join('');
    if (enteredCode.length !== 6) {
      setErrorMsg('Please enter all 6 digits of the verification code.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await verify3DsChallenge({
        sessionId: session.sessionId,
        authCode: enteredCode,
      });

      if (res.success && res.result.verified) {
        onSuccess(res.result);
      } else {
        setErrorMsg(res.message || 'Verification failed. Please check the code.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '3D Secure authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    setBiometricScanning(true);
    setErrorMsg(null);

    // Simulate authentic biometric sensor challenge
    setTimeout(async () => {
      setBiometricScanning(false);
      setBiometricDone(true);
      setIsLoading(true);

      try {
        const res = await verify3DsChallenge({
          sessionId: session.sessionId,
          biometricConfirmed: true,
        });

        if (res.success && res.result.verified) {
          onSuccess(res.result);
        } else {
          setErrorMsg(res.message || 'Biometric authorization was rejected by issuing bank.');
          setBiometricDone(false);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Biometric verification communication failed.');
        setBiometricDone(false);
      } finally {
        setIsLoading(false);
      }
    }, 1200);
  };

  // Card brand styling
  const getBrandBadge = () => {
    if (session.depositType === 'BANK') {
      return (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
          <Building2 className="h-3.5 w-3.5" />
          <span>FEDNOW / NACHA STRONG AUTH</span>
        </div>
      );
    }

    switch (session.cardBrand) {
      case 'VISA':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-300 font-bold text-xs tracking-wider">
            <span className="font-serif italic font-extrabold text-white text-sm">VISA</span>
            <span className="text-[11px] font-mono uppercase bg-blue-500 text-white px-1.5 py-0.2 rounded font-semibold">
              Secure
            </span>
          </div>
        );
      case 'MASTERCARD':
        return (
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-xs tracking-wider">
            <div className="flex -space-x-1">
              <div className="w-3.5 h-3.5 rounded-full bg-red-500 opacity-90"></div>
              <div className="w-3.5 h-3.5 rounded-full bg-amber-400 opacity-90"></div>
            </div>
            <span className="text-[11px] font-sans font-semibold">Identity Check</span>
          </div>
        );
      case 'AMEX':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 font-bold text-xs font-mono">
            <span>AMEX</span>
            <span className="text-[10px] bg-cyan-500 text-black px-1 rounded font-bold">SafeKey</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-600/20 border border-orange-500/40 text-orange-300 font-bold text-xs font-mono">
            <span>DISCOVER</span>
            <span className="text-[10px]">ProtectBuy</span>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-200">
        {/* Top EMVCo 3DS 2.2 Standard Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/80 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getBrandBadge()}
            <div className="border-l border-slate-700 pl-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                ACS Protocol {session.protocolVersion}
              </div>
              <div className="text-xs font-semibold text-white flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
                <span>Strong Customer Authentication (SCA)</span>
              </div>
            </div>
          </div>

          <button
            onClick={onCancel}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            title="Cancel 3DS challenge"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Transaction Summary Card */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Merchant</span>
              <span className="font-semibold text-white font-mono">{session.merchantName}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Transaction Amount</span>
              <span className="font-bold text-base text-emerald-400 font-mono">
                ${session.amount.toFixed(2)} {session.currency}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Payment Instrument</span>
              <span className="font-mono text-slate-300 flex items-center gap-1.5">
                {session.depositType === 'BANK' ? (
                  <>
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    <span>Bank Routing •••• {session.cardLast4}</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="h-3.5 w-3.5 text-slate-400" />
                    <span>{session.cardBrand} •••• {session.cardLast4}</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60 font-mono text-[11px] text-slate-400">
              <span>Directory Server TxID:</span>
              <span className="text-slate-500 truncate max-w-[200px]">{session.dsTransId}</span>
            </div>
          </div>

          {/* Mode Tabs: SMS OTP vs Biometric */}
          <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('SMS_OTP');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                authMethod === 'SMS_OTP'
                  ? 'bg-cyan-500 text-black shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span>SMS One-Time Code</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod('BIOMETRIC_PASSKEY');
                setErrorMsg(null);
              }}
              className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                authMethod === 'BIOMETRIC_PASSKEY'
                  ? 'bg-cyan-500 text-black shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Fingerprint className="h-4 w-4" />
              <span>Biometric / Banking App</span>
            </button>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Method 1: SMS OTP */}
          {authMethod === 'SMS_OTP' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-xs text-slate-300">
                  Your bank sent a 6-digit confirmation code to mobile number ending in{' '}
                  <strong className="text-white font-mono">{session.maskedPhoneNumber}</strong>.
                </p>
                <p className="text-[11px] text-slate-500">
                  Code expires in 10 minutes. Do not share this code with anyone.
                </p>
              </div>

              {/* 6 Digit Input Boxes */}
              <div className="flex justify-center gap-2 sm:gap-3 py-1">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    disabled={isLoading}
                    className="w-11 h-13 text-center text-xl font-mono font-bold rounded-xl bg-slate-900 border border-slate-700 text-white focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none transition-all disabled:opacity-50"
                  />
                ))}
              </div>

              {/* Simulation Quick-Fill Banner */}
              {suggestedOtp && (
                <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-300">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-cyan-400 shrink-0" />
                    <span>
                      Demo SMS Code: <strong className="font-mono text-white text-sm">{suggestedOtp}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={fillSuggestedCode}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 text-[11px] font-semibold transition-colors"
                  >
                    Auto-Fill
                  </button>
                </div>
              )}

              {/* Resend & Cooldown */}
              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!canResend || isLoading}
                  className="text-slate-400 hover:text-cyan-300 disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Resend Code</span>
                </button>
                <div className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{canResend ? 'Ready to resend' : `Resend in ${resendCooldown}s`}</span>
                </div>
              </div>

              {/* Verify OTP Button */}
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={isLoading || otpDigits.join('').length !== 6}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-bold text-sm shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Validating with Issuing ACS...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Authorize & Settle Deposit</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Method 2: Biometric / Banking App */}
          {authMethod === 'BIOMETRIC_PASSKEY' && (
            <div className="space-y-5 text-center py-2">
              <div className="relative mx-auto w-24 h-24 rounded-full flex items-center justify-center bg-slate-900 border border-cyan-500/30">
                {biometricScanning ? (
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin"></div>
                ) : null}

                {biometricDone ? (
                  <CheckCircle2 className="h-12 w-12 text-emerald-400 animate-in zoom-in-75 duration-200" />
                ) : (
                  <Fingerprint className={`h-12 w-12 text-cyan-400 ${biometricScanning ? 'scale-110' : ''} transition-all duration-300`} />
                )}
              </div>

              <div className="space-y-1">
                <h5 className="text-sm font-bold text-white">
                  {biometricDone
                    ? 'Biometrics Verified Successfully'
                    : biometricScanning
                    ? 'Scanning Biometric Sensor / Device Credential...'
                    : 'Authorize with Device Passkey'}
                </h5>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {biometricScanning
                    ? 'Secure Enclave communicating with Issuing Bank Access Control Server.'
                    : 'Use Touch ID, Face ID, or your registered mobile banking passkey to approve this transfer immediately.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleBiometricAuth}
                disabled={isLoading || biometricScanning}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-bold text-sm shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {biometricScanning || isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Verifying Cryptographic Passkey...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4" />
                    <span>Tap to Authorize with Passkey</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Security & Liability Shift Guarantee Footer */}
          <div className="pt-3 border-t border-slate-800/80 flex items-start gap-2.5 text-[11px] text-slate-400">
            <Lock className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-slate-300">Liability Shift Guaranteed: </span>
              Under EMV 3DS 2.2 specifications, cryptographic authentication shifts chargeback and fraud liability directly to the issuing bank (ECI 05 / 02). Zero plaintext card storage.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
