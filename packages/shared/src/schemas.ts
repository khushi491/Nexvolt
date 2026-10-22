/**
 * Request schemas (zod) shared by API validation and client forms.
 * The API turns these into DTOs with nestjs-zod so OpenAPI stays in sync.
 */
import { z } from 'zod';
import { INDIAN_STATES, isValidPincode } from './location';
import { normalizeIndianPhone } from './phone';

import {
  ApprovalMode,
  CancellationPolicy,
  ConnectorType,
  CurrentType,
  DisputeReason,
  DocumentType,
  ExceptionType,
  HostType,
  IncidentType,
  MeterPhase,
  MeterType,
  ParkingType,
  PricingUnit,
  Priority,
  TicketCategory,
  TicketStatus,
  IncidentStatus,
} from './enums';

const enumOf = <T extends Record<string, string>>(o: T) =>
  z.enum(Object.values(o) as [T[keyof T], ...T[keyof T][]]);


export const zConnectorType = enumOf(ConnectorType);
export const zCurrentType = enumOf(CurrentType);

export const zPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeIndianPhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid Indian mobile number' });
      return z.NEVER;
    }
    return n;
  });

const zUuid = z.string().uuid();
const zIsoDateTime = z.string().datetime({ offset: true });
const zLocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const zKwhReading = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Enter the meter reading in kWh, up to 3 decimals');
const zMinute = z.number().int().min(0).max(1440);
const zKw = z.number().positive().max(400);

// ---------- Auth ----------
export const RequestOtpSchema = z.object({ phone: zPhone });
export type RequestOtpInput = z.input<typeof RequestOtpSchema>;

export const VerifyOtpSchema = z.object({
  phone: zPhone,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  /** Explicit consent to Terms & Privacy Notice (DPDP). Required on first login. */
  acceptTerms: z.boolean().optional(),
  termsVersion: z.string().max(20).optional(),
});
export type VerifyOtpInput = z.input<typeof VerifyOtpSchema>;

export const RefreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

// ---------- Users ----------
export const NotificationPrefsSchema = z.object({
  push: z.boolean(),
  sms: z.boolean(),
  email: z.boolean(),
  bookings: z.boolean(),
  payments: z.boolean(),
  reminders: z.boolean(),
  marketing: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push: true,
  sms: false,
  email: false,
  bookings: true,
  payments: true,
  reminders: true,
  marketing: false,
};

export const UpdateMeSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(120).optional().nullable(),
  emergencyContactName: z.string().trim().max(80).optional().nullable(),
  emergencyContactPhone: zPhone.optional().nullable(),
  notificationPrefs: NotificationPrefsSchema.partial().optional(),
});

export const RegisterDeviceSchema = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(['ios', 'android', 'web']),
});

// ---------- Vehicles ----------
export const CreateVehicleSchema = z
  .object({
    catalogModelId: zUuid.optional(),
    manufacturer: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(60),
    nickname: z.string().trim().max(40).optional(),
    connectors: z.array(zConnectorType).min(1).max(4),
    maxAcKw: zKw,
    maxDcKw: zKw.optional().nullable(),
    isDefault: z.boolean().optional(),
  })
  .refine((v) => new Set(v.connectors).size === v.connectors.length, 'Duplicate connectors');
export const UpdateVehicleSchema = z.object({
  nickname: z.string().trim().max(40).optional(),
  connectors: z.array(zConnectorType).min(1).max(4).optional(),
  maxAcKw: zKw.optional(),
  maxDcKw: zKw.optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const VehicleCatalogSchema = z.object({
  manufacturer: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  variant: z.string().trim().max(60).optional().nullable(),
  connectors: z.array(zConnectorType).min(1),
  maxAcKw: zKw,
  maxDcKw: zKw.optional().nullable(),
  batteryKwh: z.number().positive().max(300).optional().nullable(),
  isActive: z.boolean().default(true),
});

// ---------- Host ----------
export const HOST_ATTESTATION_VERSION = '2026-10-v1';
export const HostOnboardSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  hostType: enumOf(HostType),
  /** Host attests they have authority to offer charging and parking at the premises. */
  attestAuthority: z.literal(true),
  /** Host attests installation was done by a qualified electrician and is maintained safely. */
  attestElectricalSafety: z.literal(true),
  attestationVersion: z.literal(HOST_ATTESTATION_VERSION),
});
export const UpdateHostSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  hostType: enumOf(HostType).optional(),
  bio: z.string().trim().max(500).optional().nullable(),
});

// ---------- Documents / uploads ----------
export const ALLOWED_DOCUMENT_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export const CreateDocumentUploadSchema = z.object({
  docType: enumOf(DocumentType),
  chargerId: zUuid.optional(),
  fileName: z.string().trim().min(1).max(120),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
});
export const CreatePhotoUploadSchema = z.object({
  mimeType: z.enum(ALLOWED_PHOTO_MIME),
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
});
export const CreateEvidenceUploadSchema = z.object({
  mimeType: z.enum(ALLOWED_PHOTO_MIME),
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
});

// ---------- Chargers ----------
const AddressSchema = z.object({
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional().nullable(),
  locality: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.enum(INDIAN_STATES),
  pincode: z.string().refine(isValidPincode, 'Enter a valid 6-digit PIN code'),
});

export const ChargerConnectorInputSchema = z.object({
  connectorType: zConnectorType,
  powerKw: zKw,
});

const chargerBase = {
  title: z.string().trim().min(4).max(80),
  description: z.string().trim().max(1000).optional().nullable(),
  currentType: zCurrentType,
  maxPowerKw: zKw,
  connectors: z.array(ChargerConnectorInputSchema).min(1).max(4),
  chargerMake: z.string().trim().max(60).optional().nullable(),
  chargerModel: z.string().trim().max(60).optional().nullable(),
  serialNumber: z.string().trim().max(80).optional().nullable(),
  meterType: enumOf(MeterType),
  smartCapable: z.boolean().default(false),
  integrationProvider: z.string().trim().max(60).optional().nullable(),
  parkingType: enumOf(ParkingType),
  /** Shown publicly: e.g. "Covered basement, height limit 2.1m". */
  parkingNotes: z.string().trim().max(500).optional().nullable(),
  wheelchairAccessible: z.boolean().default(false),
  /** Private: revealed only for confirmed bookings near the start time. */
  accessInstructions: z.string().trim().max(1000).optional().nullable(),
  safetyNotes: z.string().trim().max(1000).optional().nullable(),
  pricingUnit: enumOf(PricingUnit),
  unitPriceMinor: z.number().int().positive().max(10_000_000),
  cancellationPolicy: enumOf(CancellationPolicy),
  address: AddressSchema,
  lat: z.number().min(6).max(37.5),
  lng: z.number().min(68).max(97.5),
};

export const CreateChargerSchema = z
  .object(chargerBase)
  .refine((c) => c.connectors.every((k) => k.powerKw <= c.maxPowerKw), {
    message: 'Connector power cannot exceed the charger’s maximum safe power',
    path: ['connectors'],
  })
  .refine((c) => new Set(c.connectors.map((k) => k.connectorType)).size === c.connectors.length, {
    message: 'Duplicate connector types',
    path: ['connectors'],
  });
export type CreateChargerInput = z.input<typeof CreateChargerSchema>;

export const UpdateChargerSchema = z.object(chargerBase).partial();

export const AvailabilitySchema = z
  .object({
    rules: z
      .array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startMinute: zMinute, endMinute: zMinute }))
      .max(50),
    bufferMinutes: z.number().int().min(0).max(120),
    minDurationMinutes: z.number().int().min(15).max(720),
    maxDurationMinutes: z.number().int().min(15).max(1440),
    approvalMode: enumOf(ApprovalMode),
  })
  .refine((v) => v.rules.every((r) => r.endMinute > r.startMinute), {
    message: 'Each window must end after it starts',
    path: ['rules'],
  })
  .refine((v) => v.maxDurationMinutes >= v.minDurationMinutes, {
    message: 'Maximum duration must be at least the minimum',
    path: ['maxDurationMinutes'],
  })
  .refine((v) => v.rules.every((r) => r.startMinute % 15 === 0 && r.endMinute % 15 === 0), {
    message: 'Windows must align to 15 minutes',
    path: ['rules'],
  });
export type AvailabilityInput = z.input<typeof AvailabilitySchema>;

export const CreateExceptionSchema = z
  .object({
    date: zLocalDate,
    type: enumOf(ExceptionType),
    startMinute: zMinute.optional().nullable(),
    endMinute: zMinute.optional().nullable(),
    reason: z.string().trim().max(200).optional().nullable(),
  })
  .refine(
    (v) => v.type === 'BLACKOUT' || (v.startMinute != null && v.endMinute != null && v.endMinute > v.startMinute),
    { message: 'Custom hours need a start and end', path: ['endMinute'] },
  );

// ---------- Search ----------
const boolQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const SearchChargersSchema = z.object({
  lat: z.coerce.number().min(6).max(37.5),
  lng: z.coerce.number().min(68).max(97.5),
  radiusKm: z.coerce.number().min(0.5).max(50).default(10),
  connector: zConnectorType.optional(),
  currentType: zCurrentType.optional(),
  minPowerKw: z.coerce.number().min(0).max(400).optional(),
  maxPriceMinor: z.coerce.number().int().positive().optional(),
  pricingUnit: enumOf(PricingUnit).optional(),
  vehicleId: zUuid.optional(),
  startAt: zIsoDateTime.optional(),
  endAt: zIsoDateTime.optional(),
  wheelchairAccessible: boolQuery.optional(),
  parkingType: enumOf(ParkingType).optional(),
  verifiedMeterOnly: boolQuery.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(500).default(0),
});
export type SearchChargersInput = z.input<typeof SearchChargersSchema>;

export const AvailabilityQuerySchema = z.object({
  date: zLocalDate,
  durationMinutes: z.coerce.number().int().min(15).max(1440).default(60),
});

// ---------- Bookings ----------
export const QuoteBookingSchema = z.object({
  chargerId: zUuid,
  vehicleId: zUuid,
  connectorType: zConnectorType,
  startAt: zIsoDateTime,
  endAt: zIsoDateTime,
});
export type QuoteBookingInput = z.input<typeof QuoteBookingSchema>;

export const CreateBookingSchema = QuoteBookingSchema.extend({
  /** Driver acknowledges cancellation, safety and metering policies. */
  acceptPolicies: z.literal(true),
});
export type CreateBookingInput = z.input<typeof CreateBookingSchema>;

export const CancelBookingSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const DeclineBookingSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const BookingListQuerySchema = z.object({
  scope: z.enum(['upcoming', 'past', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ---------- Sessions / meter ----------
export const MeterReadingSchema = z.object({
  phase: enumOf(MeterPhase),
  readingKwh: zKwhReading,
  /** Evidence photo previously uploaded via the evidence upload endpoint. */
  evidenceId: zUuid.optional(),
  note: z.string().trim().max(300).optional(),
});
export type MeterReadingInput = z.input<typeof MeterReadingSchema>;

// ---------- Payments ----------
export const CreatePaymentOrderSchema = z.object({ bookingId: zUuid });
export const VerifyPaymentSchema = z.object({
  bookingId: zUuid,
  providerOrderId: z.string().min(3).max(100),
  providerPaymentId: z.string().min(3).max(100),
  signature: z.string().min(10).max(200),
});
export const DemoPaymentSchema = z.object({
  bookingId: zUuid,
  outcome: z.enum(['SUCCESS', 'FAILURE']),
});

// ---------- Reviews / favourites ----------
export const CreateReviewSchema = z.object({
  bookingId: zUuid,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
export const ReviewReplySchema = z.object({ reply: z.string().trim().min(1).max(1000) });

// ---------- Support / incidents / disputes ----------
export const CreateTicketSchema = z.object({
  category: enumOf(TicketCategory),
  subject: z.string().trim().min(4).max(120),
  description: z.string().trim().min(10).max(4000),
  bookingId: zUuid.optional(),
});
export const TicketMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  internal: z.boolean().optional(),
});
export const UpdateTicketSchema = z.object({
  status: enumOf(TicketStatus).optional(),
  priority: enumOf(Priority).optional(),
  assigneeId: zUuid.optional().nullable(),
});

export const CreateIncidentSchema = z.object({
  type: enumOf(IncidentType),
  severity: enumOf(Priority),
  description: z.string().trim().min(10).max(4000),
  chargerId: zUuid.optional(),
  bookingId: zUuid.optional(),
});
export const UpdateIncidentSchema = z.object({
  status: enumOf(IncidentStatus),
  resolutionNotes: z.string().trim().max(4000).optional(),
});

export const CreateDisputeSchema = z.object({
  bookingId: zUuid,
  reason: enumOf(DisputeReason),
  description: z.string().trim().min(10).max(4000),
});

export const ResolveDisputeSchema = z.object({
  outcome: z.enum(['RESOLVED_DRIVER_FAVOUR', 'RESOLVED_HOST_FAVOUR', 'RESOLVED_SPLIT']),
  /** For kWh bookings: the energy admin determined should be billed. */
  billableEnergyWh: z.number().int().min(0).optional(),
  /** Explicit refund to issue to the driver (paise). */
  refundAmountMinor: z.number().int().min(0).optional(),
  notes: z.string().trim().min(5).max(4000),
});

// ---------- Admin ----------
const zReason = z.string().trim().min(5, 'A reason is required for the audit log').max(1000);

export const KycDecisionSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  reason: zReason,
});
export const DocumentReviewSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  notes: zReason,
});
export const CHARGER_APPROVAL_CHECKLIST = [
  'hostIdentityVerified',
  'propertyAuthorizationReviewed',
  'electricalSafetyCertificateReviewed',
  'installationDetailsReviewed',
  'listingContentReviewed',
  'photosReviewed',
] as const;
export const ChargerDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  checklist: z.record(z.enum(CHARGER_APPROVAL_CHECKLIST), z.boolean()).optional(),
  reason: zReason,
});
export const SuspendSchema = z.object({ reason: zReason });
export const AdminRefundSchema = z.object({
  bookingId: zUuid,
  amountMinor: z.number().int().positive(),
  reason: zReason,
});
export const CreatePayoutSchema = z.object({ hostId: zUuid, reason: zReason });
export const MarkPayoutPaidSchema = z.object({
  /** Bank UTR or provider payout ID confirming the transfer. */
  externalReference: z.string().trim().min(6).max(100),
  reason: zReason,
});
export const MarkPayoutFailedSchema = z.object({ reason: zReason });
export const UpdateSettingSchema = z.object({ value: z.unknown(), reason: zReason });
export const AuditQuerySchema = z.object({
  resourceType: z.string().max(60).optional(),
  resourceId: z.string().max(60).optional(),
  actorId: zUuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export const PaginationSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
