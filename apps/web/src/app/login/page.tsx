'use client';
import { ApiError } from '@nexvolt/api-client';
import { normalizeIndianPhone } from '@nexvolt/shared';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand';
import { DemoBanner } from '@/components/demo-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { api, errorMessage, login } from '@/lib/api';
import { useSession } from '@/lib/session';

const TERMS_VERSION = '2026-10-v1';

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [needsConsent, setNeedsConsent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [emulator, setEmulator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/');
  }, [status, router]);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = normalizeIndianPhone(phone);
    if (!normalized) return setError('Enter a valid 10-digit Indian mobile number');
    setBusy(true);
    try {
      const r = await api.auth.requestOtp(normalized);
      setEmulator(r.deliveryChannel === 'emulator');
      setStep('code');
    } catch (x) {
      setError(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ phone: normalizeIndianPhone(phone)!, code, ...(needsConsent ? { acceptTerms: consent, termsVersion: TERMS_VERSION } : {}) });
      router.replace('/');
    } catch (x) {
      if (x instanceof ApiError && x.code === 'CONSENT_REQUIRED') {
        setNeedsConsent(true);
        setError('New here? Please accept the Terms and Privacy Notice, then request a new code.');
        setStep('phone');
        setCode('');
      } else setError(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <div className="grid flex-1 lg:grid-cols-2">
        <div className="hidden flex-col justify-between bg-navy p-12 text-white lg:flex">
          <Logo inverse />
          <div>
            <p className="text-4xl font-bold leading-tight">The Next Way to Charge.</p>
            <p className="mt-4 max-w-md text-white/75">Share your charger with verified drivers, manage availability and track earnings — or run Nexvolt operations.</p>
          </div>
          <p className="text-xs text-white/50">Working brand for an MVP. Not production-ready.</p>
        </div>
        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardContent className="p-8">
              <div className="mb-6 lg:hidden"><Logo /></div>
              <h1 className="text-2xl font-bold text-navy">Sign in</h1>
              <p className="mt-1 text-sm text-slate-strong">We’ll send a one-time code to your mobile number.</p>
              {step === 'phone' ? (
                <form onSubmit={requestCode} className="mt-6 space-y-4" noValidate>
                  <Field label="Mobile number" htmlFor="phone" error={error ?? undefined} hint="Indian mobile numbers only (+91)">
                    <div className="flex">
                      <span className="inline-flex items-center rounded-l-md border border-r-0 border-line-strong bg-background px-3 text-sm text-slate-strong">+91</span>
                      <Input id="phone" inputMode="numeric" autoComplete="tel-national" className="rounded-l-none" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" aria-invalid={!!error} />
                    </div>
                  </Field>
                  {needsConsent && (
                    <label className="flex items-start gap-3 rounded-md border border-line p-3 text-sm">
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0B7A6E]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                      <span>I agree to the Nexvolt Terms of Service and Privacy Notice (draft v{TERMS_VERSION}) and consent to processing of my data to provide the service.</span>
                    </label>
                  )}
                  <Button type="submit" className="w-full" loading={busy} disabled={needsConsent && !consent}>Send code</Button>
                </form>
              ) : (
                <form onSubmit={verify} className="mt-6 space-y-4">
                  {emulator && (
                    <p className="rounded-md bg-demo-soft p-3 text-xs font-medium text-demo">Local OTP emulator: no SMS was sent. Use the code from the API log (or the configured demo code).</p>
                  )}
                  <Field label={`Code sent to +91 ${phone}`} htmlFor="code" error={error ?? undefined}>
                    <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus aria-invalid={!!error} />
                  </Field>
                  <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>Verify & continue</Button>
                  <Button type="button" variant="link" onClick={() => { setStep('phone'); setError(null); }}>Use a different number</Button>
                </form>
              )}
              <p className="mt-6 flex items-center gap-2 text-xs text-slate-strong"><ShieldCheck className="h-4 w-4 text-teal-strong" /> Codes expire in 5 minutes. Never share them with anyone.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
