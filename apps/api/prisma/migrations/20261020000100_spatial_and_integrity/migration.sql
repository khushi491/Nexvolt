-- Constraints and indexes Prisma cannot express. Hand-written; keep in sync with docs/DATABASE.md.

-- ── Spatial indexes (KNN + radius search on the PUBLIC point; exact point indexed for ops tooling) ──
CREATE INDEX IF NOT EXISTS chargers_public_location_gix ON chargers USING GIST ("publicLocation");
CREATE INDEX IF NOT EXISTS chargers_location_gix ON chargers USING GIST ("location");

-- ── Double-booking prevention ──
-- No two capacity-holding bookings on the same charger may overlap, including the host buffer.
-- Holds (HELD / PENDING_PAYMENT / AWAITING_HOST_APPROVAL) block capacity exactly like confirmed bookings,
-- so concurrent checkouts race at the database, not in application code.
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    "chargerId" WITH =,
    tstzrange("startAt", "blockedUntil", '[)') WITH &&
  )
  WHERE (status IN ('AWAITING_HOST_APPROVAL', 'HELD', 'PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'CHARGING'));

ALTER TABLE bookings ADD CONSTRAINT bookings_time_order CHECK ("endAt" > "startAt" AND "blockedUntil" >= "endAt");
ALTER TABLE bookings ADD CONSTRAINT bookings_money_nonneg CHECK (
  "unitPriceMinor" >= 0 AND "chargingFeeMinor" >= 0 AND "serviceFeeMinor" >= 0 AND "serviceFeeTaxMinor" >= 0
  AND "totalMinor" = "chargingFeeMinor" + "serviceFeeMinor" + "serviceFeeTaxMinor"
  AND "commissionBps" BETWEEN 0 AND 10000 AND "estimatedEnergyWh" >= 0
);

-- ── Payments: at most one live (authorised/captured) payment per booking → no double charge ──
CREATE UNIQUE INDEX IF NOT EXISTS payments_one_live_per_booking
  ON payments ("bookingId") WHERE status IN ('AUTHORIZED', 'CAPTURED', 'PARTIALLY_REFUNDED');
ALTER TABLE payments ADD CONSTRAINT payments_amounts CHECK (
  "amountMinor" > 0 AND "amountRefundedMinor" >= 0 AND "amountRefundedMinor" <= "amountMinor"
);
ALTER TABLE refunds ADD CONSTRAINT refunds_amount_positive CHECK ("amountMinor" > 0 AND "chargingFeePortionMinor" >= 0);

-- ── Ledger / payouts ──
ALTER TABLE host_ledger_entries ADD CONSTRAINT ledger_amount_nonzero CHECK ("amountMinor" <> 0);
ALTER TABLE payouts ADD CONSTRAINT payouts_amount_positive CHECK ("amountMinor" > 0);
ALTER TABLE payouts ADD CONSTRAINT payouts_paid_requires_reference CHECK (status <> 'PAID' OR "externalReference" IS NOT NULL);

-- ── Chargers ──
ALTER TABLE chargers ADD CONSTRAINT chargers_price_positive CHECK ("unitPriceMinor" > 0);
ALTER TABLE chargers ADD CONSTRAINT chargers_durations CHECK (
  "minDurationMinutes" > 0 AND "maxDurationMinutes" >= "minDurationMinutes" AND "bufferMinutes" >= 0
);
ALTER TABLE chargers ADD CONSTRAINT chargers_verified_has_approval CHECK (status <> 'VERIFIED' OR "verifiedAt" IS NOT NULL);
ALTER TABLE chargers ADD CONSTRAINT chargers_published_requires_verified CHECK (NOT "isPublished" OR status = 'VERIFIED');
ALTER TABLE charger_connectors ADD CONSTRAINT charger_connectors_power CHECK ("powerKw" > 0);
ALTER TABLE charger_availability_rules ADD CONSTRAINT availability_rule_bounds CHECK (
  "dayOfWeek" BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute"
);
ALTER TABLE availability_exceptions ADD CONSTRAINT availability_exception_bounds CHECK (
  type = 'BLACKOUT' OR ("startMinute" IS NOT NULL AND "endMinute" IS NOT NULL AND "endMinute" > "startMinute")
);

-- ── Host verification can only be granted with an approval timestamp ──
ALTER TABLE host_profiles ADD CONSTRAINT host_verified_has_timestamp CHECK ("kycStatus" <> 'VERIFIED' OR "verifiedAt" IS NOT NULL);

-- ── Reviews / disputes ──
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5);
CREATE UNIQUE INDEX IF NOT EXISTS disputes_one_open_per_booking
  ON disputes ("bookingId") WHERE status IN ('OPEN', 'UNDER_REVIEW');

-- ── Meter readings ──
ALTER TABLE meter_readings ADD CONSTRAINT meter_reading_nonneg CHECK ("readingKwh" >= 0);
ALTER TABLE charging_sessions ADD CONSTRAINT session_measurements_nonneg CHECK (
  ("meteredEnergyWh" IS NULL OR "meteredEnergyWh" >= 0) AND ("durationMinutes" IS NULL OR "durationMinutes" >= 0)
);

-- ── Append-only audit log and payment events ──
CREATE OR REPLACE FUNCTION nexvolt_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION nexvolt_forbid_mutation();
