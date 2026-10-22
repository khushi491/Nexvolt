import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import type { ChargerSearchResultDto } from '@nexvolt/shared';
import { ChargerCard } from '@/components/charger-card';
import { BookingStatusBadge, Button, PriceBreakdown } from '@/components/ui';

describe('Button', () => {
  it('calls onPress and exposes button role', async () => {
    const onPress = jest.fn();
    await render(<Button title="Book now" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Book now' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while disabled or loading, and reports state to assistive tech', async () => {
    const onPress = jest.fn();
    await render(
      <>
        <Button title="Disabled" onPress={onPress} disabled />
        <Button title="Busy" onPress={onPress} loading />
      </>,
    );
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Disabled' }));
    await user.press(screen.getByRole('button', { name: 'Busy' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Busy' }).props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});

describe('PriceBreakdown', () => {
  it('itemises in INR and labels per-kWh totals as estimates', async () => {
    await render(<PriceBreakdown items={[{ code: 'CHARGING_FEE', label: 'Charging energy (estimate)', amountMinor: 11664 }]} total={11664} isEstimate />);
    expect(screen.getAllByText('₹116.64')).toHaveLength(2);
    expect(screen.getByText('Total (prepaid estimate)')).toBeTruthy();
    expect(screen.getByText(/Unused prepayment is refunded/)).toBeTruthy();
  });

  it('does not show estimate wording for hourly totals', async () => {
    await render(<PriceBreakdown items={[{ code: 'CHARGING_FEE', label: 'Charging slot fee', amountMinor: 12000 }]} total={12000} />);
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.queryByText(/estimate/i)).toBeNull();
  });
});

describe('BookingStatusBadge', () => {
  it('uses human labels', async () => {
    await render(<BookingStatusBadge status="AWAITING_HOST_APPROVAL" />);
    expect(screen.getByText('Awaiting host')).toBeTruthy();
  });
});

describe('ChargerCard', () => {
  const base: ChargerSearchResultDto = {
    id: 'c1', title: 'Covered 7 kW charger', currentType: 'AC', maxPowerKw: 7.2, connectors: [{ connectorType: 'TYPE_2', powerKw: 7.2 }],
    pricingUnit: 'PER_HOUR', unitPriceMinor: 12000, approxLocation: { lat: 12.97, lng: 77.64 }, approxDistanceKm: 1.4, locality: 'Indiranagar', city: 'Bengaluru',
    parkingType: 'PRIVATE_DRIVEWAY', wheelchairAccessible: false, verifiedMeter: false, approvalMode: 'MANUAL', ratingAvg: 4.5, ratingCount: 2, photoUrl: null,
    hostIdentityVerified: true, isSample: true, availableForRequestedSlot: null, compatibility: { vehicleId: 'v', compatible: true, effectiveKw: 7.2, bestConnector: 'TYPE_2' },
  };

  it('summarises the listing accessibly with approximate distance and price', async () => {
    const onPress = jest.fn();
    await render(<ChargerCard c={base} onPress={onPress} />);
    const card = screen.getByRole('button', { name: /Covered 7 kW charger, 1.4 kilometres away, ₹120/ });
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByText('~1.4 km · Indiranagar, Bengaluru')).toBeTruthy();
  });

  it('flags sample listings, compatibility and manual approval', async () => {
    await render(<ChargerCard c={base} onPress={() => undefined} />);
    expect(screen.getByText('SAMPLE')).toBeTruthy();
    expect(screen.getByText('Fits your EV · 7.2 kW')).toBeTruthy();
    expect(screen.getByText('Host approves')).toBeTruthy();
  });

  it('omits the sample badge for real listings', async () => {
    await render(<ChargerCard c={{ ...base, isSample: false, compatibility: undefined }} onPress={() => undefined} />);
    expect(screen.queryByText('SAMPLE')).toBeNull();
    expect(screen.queryByText(/Fits your EV/)).toBeNull();
  });
});
