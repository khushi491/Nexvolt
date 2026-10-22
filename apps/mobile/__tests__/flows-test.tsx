import { ApiError } from '@nexvolt/api-client';
import type { BookingDto } from '@nexvolt/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockRequestOtp = jest.fn();
const mockSignIn = jest.fn();
const mockStart = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/lib/api', () => ({
  api: { auth: { requestOtp: (...a: unknown[]) => mockRequestOtp(...a) }, sessions: { start: (...a: unknown[]) => mockStart(...a), end: jest.fn() } },
  signIn: (...a: unknown[]) => mockSignIn(...a),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'error'),
}));
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn() } }));

import Login from '@/app/login';
import { SessionPanel } from '@/components/session-panel';
import { reachable } from '@/lib/config';

const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;

describe('Login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects non-Indian numbers without calling the API', async () => {
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '12345');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('Enter a valid 10-digit Indian mobile number')).toBeTruthy();
    expect(mockRequestOtp).not.toHaveBeenCalled();
  });

  it('asks new users for consent on the code step and resubmits the same code', async () => {
    mockRequestOtp.mockResolvedValue({ deliveryChannel: 'emulator', resendAfterSeconds: 30, expiresAt: '' });
    mockSignIn.mockRejectedValueOnce(new ApiError(422, { code: 'CONSENT_REQUIRED', message: 'consent' })).mockResolvedValueOnce({ id: 'u1' });
    await render(<Login />);
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '98765 43210');
    await fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
    expect(mockRequestOtp).toHaveBeenCalledWith('+919876543210');
    expect(screen.getByText(/Local OTP emulator/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('6-digit code'), '123456');
    await fireEvent.press(screen.getByRole('button', { name: 'Verify & continue' }));
    expect(await screen.findByText('Welcome to Nexvolt!')).toBeTruthy();
    const accept = screen.getByRole('button', { name: 'Accept & create account' });
    expect(accept).toBeDisabled();
    await fireEvent(screen.getByLabelText('I agree to the Terms and Privacy Notice'), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Accept & create account' }));
    expect(mockSignIn).toHaveBeenLastCalledWith({ phone: '+919876543210', code: '123456', acceptTerms: true, termsVersion: '2026-10-v1' });
    expect(mockReplace).toHaveBeenCalledWith('/explore');
  });
});

function booking(pricingUnit: 'PER_HOUR' | 'PER_KWH'): BookingDto {
  return {
    id: 'b1', code: 'NV-TEST01', status: 'CHECKED_IN', startAt: '2026-10-24T07:00:00Z', endAt: '2026-10-24T08:00:00Z', holdExpiresAt: null, connectorType: 'TYPE_2',
    approvalMode: 'AUTOMATIC', cancellationPolicy: 'MODERATE', charger: { id: 'c', title: 'T', locality: 'L', city: 'C', approxLocation: { lat: 0, lng: 0 }, photoUrl: null, isSample: false },
    vehicle: { id: 'v', label: 'Nexon' },
    pricing: { pricingUnit, unitPriceMinor: 2000, durationMinutes: 60, estimatedEnergyWh: 6480, chargingFeeMinor: 12960, serviceFeeMinor: 0, serviceFeeTaxMinor: 0, totalMinor: 12960, isEstimate: pricingUnit === 'PER_KWH', lineItems: [], currency: 'INR' },
    payment: null, accessAvailableAt: null, canCancel: false, hasReview: false, hasOpenDispute: false, cancelReason: null, createdAt: '',
    session: { id: 's', bookingId: 'b1', mode: 'MANUAL_METER', status: 'NOT_STARTED', startedAt: null, endedAt: null, durationMinutes: null, estimatedEnergyWh: 6480, meteredEnergyWh: null, readings: [], assessment: null, driverStartConfirmedAt: null, hostStartConfirmedAt: null, driverEndConfirmedAt: null, hostEndConfirmedAt: null, liveTelemetryAvailable: false },
  };
}

describe('SessionPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('labels energy honestly: estimate vs verified, and states there is no remote control', async () => {
    await render(wrap(<SessionPanel b={booking('PER_HOUR')} />));
    expect(screen.getByText('~6.5 kWh (estimate)')).toBeTruthy();
    expect(screen.getByText('After both readings agree')).toBeTruthy();
    expect(screen.getByText(/can’t control or monitor it remotely/)).toBeTruthy();
  });

  it('requires a valid reading for per-kWh bookings', async () => {
    mockStart.mockResolvedValue({});
    await render(wrap(<SessionPanel b={booking('PER_KWH')} />));
    const confirm = screen.getByRole('button', { name: 'Confirm charging started' });
    expect(confirm).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText(/Meter reading at start/), '12.3456');
    expect(screen.getByText('Use a number with up to 3 decimals')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(/Meter reading at start/), '1234.567');
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm charging started' }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith('b1', { readingKwh: '1234.567' }));
  });

  it('allows hourly sessions without a reading', async () => {
    mockStart.mockResolvedValue({});
    await render(wrap(<SessionPanel b={booking('PER_HOUR')} />));
    await fireEvent.press(screen.getByRole('button', { name: 'Confirm charging started' }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledWith('b1', {}));
  });
});

describe('reachable()', () => {
  it('rewrites the API origin so phones can open hosted checkout links', () => {
    expect(reachable('http://localhost:4000/api/v1/payments/checkout/abc?t=x')).toMatch(/^http:\/\/[^/]+\/api\/v1\/payments\/checkout\/abc\?t=x$/);
  });
});
