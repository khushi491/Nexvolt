/**
 * API response shapes (JSON). Dates are ISO-8601 UTC strings; money is integer paise;
 * energy is integer Wh. These are the contract between API, web and mobile.
 */
import type {
  ApprovalMode,
  BookingStatus,
  CancellationPolicy,
  ConnectorType,
  CurrentType,
  DisputeReason,
  DisputeStatus,
  DocumentStatus,
  DocumentType,
  HostType,
  IncidentStatus,
  IncidentType,
  KycStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  MeterPhase,
  MeterType,
  NotificationType,
  ParkingType,
  PaymentProviderName,
  PaymentStatus,
  PayoutMethod,
  PayoutStatus,
  PayoutAccountStatus,
  PricingUnit,
  Priority,
  RefundStatus,
  Role,
  ChargerStatus,
  SessionMode,
  SessionStatus,
  TicketCategory,
  TicketStatus,
  UserStatus,
  VerificationDecision,
  ActorType,
  ReadingSource,
} from './enums';
import type { MeterAssessment } from './metering';
import type { LineItem } from './pricing';
import type { NotificationPrefs } from './schemas';

export type ISODate = string;

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
  requestId?: string;
}

// ---------- Auth / users ----------
export interface OtpRequestResponse {
  expiresAt: ISODate;
  resendAfterSeconds: number;
  /** 'emulator' means no SMS was sent: local development only. */
  deliveryChannel: 'sms' | 'emulator';
}

export interface HostProfileDto {
  id: string;
  userId: string;
  displayName: string;
  hostType: HostType;
  bio: string | null;
  kycStatus: KycStatus;
  payoutAccountStatus: PayoutAccountStatus;
  attestationAcceptedAt: ISODate | null;
  verifiedAt: ISODate | null;
  suspendedAt: ISODate | null;
  ratingAvg: number | null;
  ratingCount: number;
  createdAt: ISODate;
}

export interface UserDto {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  roles: Role[];
  status: UserStatus;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notificationPrefs: NotificationPrefs;
  consentAcceptedAt: ISODate | null;
  hostProfile: HostProfileDto | null;
  createdAt: ISODate;
}

export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: ISODate;
  refreshToken: string;
  user: UserDto;
}

// ---------- Vehicles ----------
export interface VehicleDto {
  id: string;
  catalogModelId: string | null;
  manufacturer: string;
  model: string;
  nickname: string | null;
  connectors: ConnectorType[];
  maxAcKw: number;
  maxDcKw: number | null;
  isDefault: boolean;
}

export interface VehicleCatalogDto {
  id: string;
  manufacturer: string;
  model: string;
  variant: string | null;
  connectors: ConnectorType[];
  maxAcKw: number;
  maxDcKw: number | null;
  batteryKwh: number | null;
  isActive: boolean;
}

// ---------- Chargers ----------
export interface LatLngDto {
  lat: number;
  lng: number;
}

export interface ChargerConnectorDto {
  connectorType: ConnectorType;
  powerKw: number;
}

export interface CompatibilityDto {
  vehicleId: string;
  compatible: boolean;
  reason?: string;
  bestConnector?: ConnectorType;
  effectiveKw?: number;
}

export interface ChargerHostSummaryDto {
  displayName: string;
  hostType: HostType;
  identityVerified: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  memberSince: ISODate;
}

export interface ChargerPhotoDto {
  id: string;
  url: string;
}

/** Public view: approximate location only. Never contains the exact address. */
export interface ChargerPublicDto {
  id: string;
  title: string;
  description: string | null;
  currentType: CurrentType;
  maxPowerKw: number;
  connectors: ChargerConnectorDto[];
  chargerMake: string | null;
  chargerModel: string | null;
  meterType: MeterType;
  verifiedMeter: boolean;
  smartCapable: boolean;
  parkingType: ParkingType;
  parkingNotes: string | null;
  wheelchairAccessible: boolean;
  safetyNotes: string | null;
  pricingUnit: PricingUnit;
  unitPriceMinor: number;
  cancellationPolicy: CancellationPolicy;
  cancellationPolicyText: string;
  approvalMode: ApprovalMode;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  bufferMinutes: number;
  approxLocation: LatLngDto;
  locality: string;
  city: string;
  state: string;
  photos: ChargerPhotoDto[];
  host: ChargerHostSummaryDto;
  ratingAvg: number | null;
  ratingCount: number;
  isSample: boolean;
  /** Paused listings stay viewable (e.g. from favourites) but cannot be booked. */
  isPaused: boolean;
  isFavorite?: boolean;
  compatibility?: CompatibilityDto;
}

export interface ChargerSearchResultDto {
  id: string;
  title: string;
  currentType: CurrentType;
  maxPowerKw: number;
  connectors: ChargerConnectorDto[];
  pricingUnit: PricingUnit;
  unitPriceMinor: number;
  approxLocation: LatLngDto;
  /** Distance to the APPROXIMATE location, rounded to 0.1 km. */
  approxDistanceKm: number;
  locality: string;
  city: string;
  parkingType: ParkingType;
  wheelchairAccessible: boolean;
  verifiedMeter: boolean;
  approvalMode: ApprovalMode;
  ratingAvg: number | null;
  ratingCount: number;
  photoUrl: string | null;
  hostIdentityVerified: boolean;
  isSample: boolean;
  /** null when no time window was requested. */
  availableForRequestedSlot: boolean | null;
  compatibility?: CompatibilityDto;
}

export interface AvailabilityRuleDto {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityExceptionDto {
  id: string;
  date: string;
  type: 'BLACKOUT' | 'CUSTOM_HOURS';
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
}

export interface DocumentDto {
  id: string;
  docType: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  chargerId: string | null;
  reviewNotes: string | null;
  reviewedAt: ISODate | null;
  createdAt: ISODate;
}

export interface ChargerVerificationDto {
  id: string;
  status: VerificationDecision;
  submittedAt: ISODate;
  decidedAt: ISODate | null;
  notes: string | null;
  checklist: Record<string, boolean> | null;
}

/** Host/admin view with private fields. */
export interface ChargerManageDto extends Omit<ChargerPublicDto, 'host' | 'isFavorite' | 'compatibility'> {
  hostId: string;
  status: ChargerStatus;
  isPublished: boolean;
  pausedAt: ISODate | null;
  pauseReason: string | null;
  serialNumber: string | null;
  integrationProvider: string | null;
  accessInstructions: string | null;
  address: {
    line1: string;
    line2: string | null;
    locality: string;
    city: string;
    state: string;
    pincode: string;
  };
  exactLocation: LatLngDto;
  rules: AvailabilityRuleDto[];
  exceptions: AvailabilityExceptionDto[];
  documents: DocumentDto[];
  verifications: ChargerVerificationDto[];
  kwhPricingAllowed: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface SlotDto {
  startAt: ISODate;
  endAt: ISODate;
}

export interface AvailabilityDto {
  chargerId: string;
  date: string;
  timezone: 'Asia/Kolkata';
  durationMinutes: number;
  slots: SlotDto[];
}

// ---------- Bookings ----------
export interface PricingDto {
  pricingUnit: PricingUnit;
  unitPriceMinor: number;
  durationMinutes: number;
  estimatedEnergyWh: number;
  chargingFeeMinor: number;
  serviceFeeMinor: number;
  serviceFeeTaxMinor: number;
  totalMinor: number;
  isEstimate: boolean;
  lineItems: LineItem[];
  currency: 'INR';
}

export interface HostPricingViewDto {
  commissionBps: number;
  commissionMinor: number;
  hostEarningsBeforeGatewayFeesMinor: number;
}

export interface QuoteDto {
  valid: boolean;
  rejection?: string;
  rejectionMessage?: string;
  compatibility: CompatibilityDto;
  pricing: PricingDto | null;
  cancellationPolicy: CancellationPolicy;
  cancellationPolicyText: string;
  approvalMode: ApprovalMode;
}

export interface PaymentSummaryDto {
  id: string;
  provider: PaymentProviderName;
  isDemo: boolean;
  status: PaymentStatus;
  amountMinor: number;
  amountRefundedMinor: number;
  method: string | null;
  capturedAt: ISODate | null;
}

export interface MeterReadingDto {
  id: string;
  phase: MeterPhase;
  readingKwh: string;
  recordedByRole: ActorType;
  source: ReadingSource;
  hasEvidence: boolean;
  recordedAt: ISODate;
}

export interface SessionDto {
  id: string;
  bookingId: string;
  mode: SessionMode;
  status: SessionStatus;
  startedAt: ISODate | null;
  endedAt: ISODate | null;
  durationMinutes: number | null;
  /** ESTIMATE from booking — never presented as measured. */
  estimatedEnergyWh: number;
  /** Verified energy, only set once both parties agree or admin reconciles. */
  meteredEnergyWh: number | null;
  readings: MeterReadingDto[];
  assessment: MeterAssessment | null;
  driverStartConfirmedAt: ISODate | null;
  hostStartConfirmedAt: ISODate | null;
  driverEndConfirmedAt: ISODate | null;
  hostEndConfirmedAt: ISODate | null;
  /** Always false in this release: no live telemetry from hardware. */
  liveTelemetryAvailable: false;
}

export interface BookingDto {
  id: string;
  code: string;
  status: BookingStatus;
  startAt: ISODate;
  endAt: ISODate;
  holdExpiresAt: ISODate | null;
  connectorType: ConnectorType;
  approvalMode: ApprovalMode;
  cancellationPolicy: CancellationPolicy;
  charger: {
    id: string;
    title: string;
    locality: string;
    city: string;
    approxLocation: LatLngDto;
    photoUrl: string | null;
    isSample: boolean;
  };
  vehicle: { id: string; label: string };
  driver?: { id: string; name: string | null; phoneMasked: string };
  pricing: PricingDto;
  hostView?: HostPricingViewDto;
  payment: PaymentSummaryDto | null;
  session: SessionDto | null;
  /** When the exact address becomes available to the driver. */
  accessAvailableAt: ISODate | null;
  canCancel: boolean;
  hasReview: boolean;
  hasOpenDispute: boolean;
  cancelReason: string | null;
  createdAt: ISODate;
}

export interface BookingAccessDto {
  bookingId: string;
  address: {
    line1: string;
    line2: string | null;
    locality: string;
    city: string;
    state: string;
    pincode: string;
  };
  location: LatLngDto;
  accessInstructions: string | null;
  parkingNotes: string | null;
  navigationUrl: string;
}

export interface BookingEventDto {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorType: ActorType;
  reason: string | null;
  createdAt: ISODate;
}

export interface CancellationPreviewDto {
  refundMinor: number;
  retainedMinor: number;
  refundBps: number;
  reason: string;
}

export interface ReceiptDto {
  receiptNumber: string;
  bookingCode: string;
  issuedAt: ISODate;
  status: BookingStatus;
  isDemoPayment: boolean;
  chargerTitle: string;
  locality: string;
  city: string;
  hostDisplayName: string;
  startAt: ISODate;
  endAt: ISODate;
  actualDurationMinutes: number | null;
  pricingUnit: PricingUnit;
  unitPriceMinor: number;
  estimatedEnergyWh: number;
  meteredEnergyWh: number | null;
  lineItems: LineItem[];
  paidMinor: number;
  refundedMinor: number;
  netPaidMinor: number;
  paymentMethod: string | null;
  providerPaymentId: string | null;
  notes: string[];
}

// ---------- Payments ----------
export interface PaymentOrderDto {
  paymentId: string;
  provider: PaymentProviderName;
  isDemo: boolean;
  providerOrderId: string;
  amountMinor: number;
  currency: 'INR';
  /** Razorpay public key id (safe for clients). Null for DEMO. */
  keyId: string | null;
  bookingCode: string;
  description: string;
  expiresAt: ISODate | null;
}

export interface RefundDto {
  id: string;
  paymentId: string;
  bookingId: string;
  amountMinor: number;
  status: RefundStatus;
  reason: string;
  providerRefundId: string | null;
  createdAt: ISODate;
}

// ---------- Reviews / notifications ----------
export interface ReviewDto {
  id: string;
  bookingId: string;
  chargerId: string;
  rating: number;
  comment: string | null;
  authorName: string;
  hostReply: string | null;
  createdAt: ISODate;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, string> | null;
  readAt: ISODate | null;
  createdAt: ISODate;
}

// ---------- Support ----------
export interface TicketMessageDto {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  internal: boolean;
  createdAt: ISODate;
}

export interface TicketDto {
  id: string;
  reference: string;
  category: TicketCategory;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  bookingId: string | null;
  requesterId: string;
  requesterName: string | null;
  assigneeId: string | null;
  messages?: TicketMessageDto[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface IncidentDto {
  id: string;
  type: IncidentType;
  severity: Priority;
  status: IncidentStatus;
  description: string;
  chargerId: string | null;
  bookingId: string | null;
  reporterId: string;
  chargerAutoSuspended: boolean;
  resolutionNotes: string | null;
  createdAt: ISODate;
}

export interface DisputeDto {
  id: string;
  bookingId: string;
  bookingCode: string;
  reason: DisputeReason;
  status: DisputeStatus;
  description: string;
  raisedById: string;
  raisedByRole: ActorType;
  resolutionNotes: string | null;
  assessment: MeterAssessment | null;
  createdAt: ISODate;
  resolvedAt: ISODate | null;
}

// ---------- Host finance ----------
export interface LedgerEntryDto {
  id: string;
  type: LedgerEntryType;
  status: LedgerEntryStatus;
  amountMinor: number;
  description: string;
  bookingId: string | null;
  bookingCode: string | null;
  payoutId: string | null;
  createdAt: ISODate;
  eligibleAt: ISODate | null;
}

export interface EarningsSummaryDto {
  grossMinor: number;
  commissionMinor: number;
  paymentFeesMinor: number;
  refundsMinor: number;
  adjustmentsMinor: number;
  /** Net earnings awaiting completion / dispute window. */
  pendingMinor: number;
  /** Net amount eligible for the next payout. NOT yet transferred. */
  eligibleMinor: number;
  /** Included in a payout batch not yet confirmed paid. */
  inPayoutMinor: number;
  /** Confirmed paid (provider confirmation or bank reference). */
  paidOutMinor: number;
  payoutAccountStatus: PayoutAccountStatus;
}

export interface PayoutDto {
  id: string;
  hostId: string;
  hostDisplayName: string;
  amountMinor: number;
  status: PayoutStatus;
  method: PayoutMethod;
  externalReference: string | null;
  failureReason: string | null;
  entryCount: number;
  createdAt: ISODate;
  confirmedAt: ISODate | null;
}

// ---------- Admin ----------
export interface AdminOverviewDto {
  activeHosts: number;
  verifiedChargers: number;
  pendingChargerReviews: number;
  pendingHostReviews: number;
  bookingsTotal: number;
  bookingsLast30d: number;
  /** Gross merchandise value: captured payments minus refunds. Excludes DEMO payments when realOnly. */
  gmvMinor: number;
  commissionRecognizedMinor: number;
  cancellations: number;
  disputes: number;
  disputeRatio: number;
  openTickets: number;
  openIncidents: number;
  demoMode: boolean;
  includesDemoPayments: boolean;
}

export interface AuditLogDto {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  oldValue: unknown;
  newValue: unknown;
  ip: string | null;
  createdAt: ISODate;
}

export interface GeoClusterDto {
  city: string;
  state: string;
  /** Cell centroid of approximate locations (privacy-preserving). */
  center: LatLngDto;
  chargers: number;
  verified: number;
  bookings30d: number;
}

export interface HealthDto {
  status: 'ok' | 'degraded';
  version: string;
  demoMode: boolean;
  checks: Record<string, 'ok' | 'fail' | 'disabled'>;
  integrations: Record<string, 'configured' | 'not_configured' | 'demo'>;
}
