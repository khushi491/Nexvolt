/**
 * Domain enums. String values MUST stay identical to the Prisma enums in
 * apps/api/prisma/schema.prisma (a unit test in the API asserts this).
 */

const values = <T extends string>(...v: T[]) => v;

export const Role = { DRIVER: 'DRIVER', HOST: 'HOST', ADMIN: 'ADMIN', SUPPORT: 'SUPPORT' } as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLES = values<Role>('DRIVER', 'HOST', 'ADMIN', 'SUPPORT');

export const UserStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED', DELETED: 'DELETED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * Connector types relevant to the Indian market.
 * BHARAT_AC_001 / BHARAT_DC_001 are legacy government-spec standards.
 * DOMESTIC_15A is a 3-pin 15A socket used with portable (Level-1-like) chargers.
 */
export const ConnectorType = {
  TYPE_2: 'TYPE_2',
  CCS2: 'CCS2',
  CHADEMO: 'CHADEMO',
  GBT: 'GBT',
  TYPE_1: 'TYPE_1',
  BHARAT_AC_001: 'BHARAT_AC_001',
  BHARAT_DC_001: 'BHARAT_DC_001',
  DOMESTIC_15A: 'DOMESTIC_15A',
} as const;
export type ConnectorType = (typeof ConnectorType)[keyof typeof ConnectorType];
export const CONNECTOR_TYPES = Object.values(ConnectorType) as ConnectorType[];

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
  TYPE_2: 'Type 2 (AC)',
  CCS2: 'CCS2 (DC)',
  CHADEMO: 'CHAdeMO (DC)',
  GBT: 'GB/T',
  TYPE_1: 'Type 1 (AC)',
  BHARAT_AC_001: 'Bharat AC-001',
  BHARAT_DC_001: 'Bharat DC-001',
  DOMESTIC_15A: '15A socket',
};

export const CurrentType = { AC: 'AC', DC: 'DC' } as const;
export type CurrentType = (typeof CurrentType)[keyof typeof CurrentType];

export const HostType = {
  INDIVIDUAL: 'INDIVIDUAL',
  APARTMENT_SOCIETY: 'APARTMENT_SOCIETY',
  BUSINESS: 'BUSINESS',
  PARKING_OPERATOR: 'PARKING_OPERATOR',
} as const;
export type HostType = (typeof HostType)[keyof typeof HostType];

/** Identity/KYC review status. VERIFIED can only be set by an admin action. */
export const KycStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const PayoutAccountStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
} as const;
export type PayoutAccountStatus = (typeof PayoutAccountStatus)[keyof typeof PayoutAccountStatus];

/**
 * Charger lifecycle. Only VERIFIED + published + not paused chargers are
 * discoverable or bookable. VERIFIED requires an admin approval action.
 */
export const ChargerStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type ChargerStatus = (typeof ChargerStatus)[keyof typeof ChargerStatus];

export const MeterType = {
  NONE: 'NONE',
  CHARGER_DISPLAY: 'CHARGER_DISPLAY',
  SEPARATE_SUBMETER: 'SEPARATE_SUBMETER',
  SMART_OCPP: 'SMART_OCPP',
} as const;
export type MeterType = (typeof MeterType)[keyof typeof MeterType];

export const PricingUnit = { PER_HOUR: 'PER_HOUR', PER_KWH: 'PER_KWH' } as const;
export type PricingUnit = (typeof PricingUnit)[keyof typeof PricingUnit];

export const ApprovalMode = { AUTOMATIC: 'AUTOMATIC', MANUAL: 'MANUAL' } as const;
export type ApprovalMode = (typeof ApprovalMode)[keyof typeof ApprovalMode];

export const CancellationPolicy = { FLEXIBLE: 'FLEXIBLE', MODERATE: 'MODERATE', STRICT: 'STRICT' } as const;
export type CancellationPolicy = (typeof CancellationPolicy)[keyof typeof CancellationPolicy];

export const ParkingType = {
  PRIVATE_DRIVEWAY: 'PRIVATE_DRIVEWAY',
  GATED_SOCIETY: 'GATED_SOCIETY',
  BASEMENT: 'BASEMENT',
  OPEN_LOT: 'OPEN_LOT',
  STREET_ADJACENT: 'STREET_ADJACENT',
  COMMERCIAL_GARAGE: 'COMMERCIAL_GARAGE',
} as const;
export type ParkingType = (typeof ParkingType)[keyof typeof ParkingType];

export const ExceptionType = { BLACKOUT: 'BLACKOUT', CUSTOM_HOURS: 'CUSTOM_HOURS' } as const;
export type ExceptionType = (typeof ExceptionType)[keyof typeof ExceptionType];

export const DocumentType = {
  IDENTITY_PROOF: 'IDENTITY_PROOF',
  PROPERTY_AUTHORIZATION: 'PROPERTY_AUTHORIZATION',
  SOCIETY_NOC: 'SOCIETY_NOC',
  ELECTRICAL_SAFETY_CERT: 'ELECTRICAL_SAFETY_CERT',
  INSTALLATION_CERT: 'INSTALLATION_CERT',
  METER_CALIBRATION_CERT: 'METER_CALIBRATION_CERT',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DocumentStatus = {
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
} as const;
export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const VerificationDecision = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
} as const;
export type VerificationDecision = (typeof VerificationDecision)[keyof typeof VerificationDecision];

/**
 * Booking states. "AVAILABLE" in the product spec is a property of a slot,
 * not a booking, so it is not a persisted booking state.
 * AWAITING_HOST_APPROVAL is an extension for chargers with MANUAL approval.
 */
export const BookingStatus = {
  AWAITING_HOST_APPROVAL: 'AWAITING_HOST_APPROVAL',
  HELD: 'HELD',
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  CHARGING: 'CHARGING',
  COMPLETED: 'COMPLETED',
  SETTLED: 'SETTLED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  NO_SHOW: 'NO_SHOW',
  FAILED: 'FAILED',
  DISPUTED: 'DISPUTED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

/** Statuses that occupy charger capacity (enforced by a DB exclusion constraint). */
export const CAPACITY_BLOCKING_STATUSES: BookingStatus[] = [
  'AWAITING_HOST_APPROVAL',
  'HELD',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'CHARGING',
];

export const ActorType = { DRIVER: 'DRIVER', HOST: 'HOST', ADMIN: 'ADMIN', SYSTEM: 'SYSTEM' } as const;
export type ActorType = (typeof ActorType)[keyof typeof ActorType];

export const SessionMode = { MANUAL_METER: 'MANUAL_METER', SMART_INTEGRATION: 'SMART_INTEGRATION' } as const;
export type SessionMode = (typeof SessionMode)[keyof typeof SessionMode];

export const SessionStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  CONFIRMED: 'CONFIRMED',
  DISPUTED: 'DISPUTED',
  RECONCILED: 'RECONCILED',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const MeterPhase = { START: 'START', END: 'END' } as const;
export type MeterPhase = (typeof MeterPhase)[keyof typeof MeterPhase];

export const ReadingSource = {
  MANUAL_ENTRY: 'MANUAL_ENTRY',
  CHARGER_INTEGRATION: 'CHARGER_INTEGRATION',
  ADMIN_RECONCILIATION: 'ADMIN_RECONCILIATION',
} as const;
export type ReadingSource = (typeof ReadingSource)[keyof typeof ReadingSource];

export const PaymentProviderName = { RAZORPAY: 'RAZORPAY', DEMO: 'DEMO' } as const;
export type PaymentProviderName = (typeof PaymentProviderName)[keyof typeof PaymentProviderName];

export const PaymentStatus = {
  CREATED: 'CREATED',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RefundStatus = { PENDING: 'PENDING', PROCESSED: 'PROCESSED', FAILED: 'FAILED' } as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

export const LedgerEntryType = {
  BOOKING_GROSS: 'BOOKING_GROSS',
  PLATFORM_COMMISSION: 'PLATFORM_COMMISSION',
  PAYMENT_FEE: 'PAYMENT_FEE',
  REFUND_REVERSAL: 'REFUND_REVERSAL',
  COMMISSION_REVERSAL: 'COMMISSION_REVERSAL',
  ADJUSTMENT: 'ADJUSTMENT',
  PAYOUT: 'PAYOUT',
} as const;
export type LedgerEntryType = (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const LedgerEntryStatus = {
  PENDING: 'PENDING',
  ELIGIBLE: 'ELIGIBLE',
  IN_PAYOUT: 'IN_PAYOUT',
  PAID_OUT: 'PAID_OUT',
  VOID: 'VOID',
} as const;
export type LedgerEntryStatus = (typeof LedgerEntryStatus)[keyof typeof LedgerEntryStatus];

/** PAID is only set after provider confirmation or an admin-entered bank reference. */
export const PayoutStatus = {
  READY_FOR_PAYOUT: 'READY_FOR_PAYOUT',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

export const PayoutMethod = { MANUAL_BANK_TRANSFER: 'MANUAL_BANK_TRANSFER', PROVIDER_ROUTE: 'PROVIDER_ROUTE' } as const;
export type PayoutMethod = (typeof PayoutMethod)[keyof typeof PayoutMethod];

export const ReviewStatus = { PUBLISHED: 'PUBLISHED', HIDDEN: 'HIDDEN' } as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const TicketCategory = {
  BOOKING: 'BOOKING',
  PAYMENT: 'PAYMENT',
  REFUND: 'REFUND',
  CHARGER_ISSUE: 'CHARGER_ISSUE',
  ACCOUNT: 'ACCOUNT',
  SAFETY: 'SAFETY',
  OTHER: 'OTHER',
} as const;
export type TicketCategory = (typeof TicketCategory)[keyof typeof TicketCategory];

export const TicketStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  AWAITING_USER: 'AWAITING_USER',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const Priority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' } as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const IncidentType = {
  ELECTRICAL_HAZARD: 'ELECTRICAL_HAZARD',
  FIRE_OR_SMOKE: 'FIRE_OR_SMOKE',
  INJURY: 'INJURY',
  VEHICLE_DAMAGE: 'VEHICLE_DAMAGE',
  ACCESS_ISSUE: 'ACCESS_ISSUE',
  HARASSMENT: 'HARASSMENT',
  OTHER: 'OTHER',
} as const;
export type IncidentType = (typeof IncidentType)[keyof typeof IncidentType];

export const IncidentStatus = {
  OPEN: 'OPEN',
  INVESTIGATING: 'INVESTIGATING',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const DisputeReason = {
  METER_DISCREPANCY: 'METER_DISCREPANCY',
  NO_ACCESS: 'NO_ACCESS',
  CHARGER_FAULT: 'CHARGER_FAULT',
  OVERCHARGE: 'OVERCHARGE',
  DAMAGE: 'DAMAGE',
  OTHER: 'OTHER',
} as const;
export type DisputeReason = (typeof DisputeReason)[keyof typeof DisputeReason];

export const DisputeStatus = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RESOLVED_DRIVER_FAVOUR: 'RESOLVED_DRIVER_FAVOUR',
  RESOLVED_HOST_FAVOUR: 'RESOLVED_HOST_FAVOUR',
  RESOLVED_SPLIT: 'RESOLVED_SPLIT',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type DisputeStatus = (typeof DisputeStatus)[keyof typeof DisputeStatus];

export const NotificationType = {
  BOOKING_REQUESTED: 'BOOKING_REQUESTED',
  BOOKING_APPROVED: 'BOOKING_APPROVED',
  BOOKING_DECLINED: 'BOOKING_DECLINED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_REMINDER: 'BOOKING_REMINDER',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_EXPIRED: 'BOOKING_EXPIRED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  CHARGING_STARTED: 'CHARGING_STARTED',
  CHARGING_CONFIRMATION_NEEDED: 'CHARGING_CONFIRMATION_NEEDED',
  CHARGING_COMPLETED: 'CHARGING_COMPLETED',
  PAYMENT_STATUS: 'PAYMENT_STATUS',
  REFUND_STATUS: 'REFUND_STATUS',
  PAYOUT_STATUS: 'PAYOUT_STATUS',
  DISPUTE_UPDATE: 'DISPUTE_UPDATE',
  SAFETY_ALERT: 'SAFETY_ALERT',
  VERIFICATION_UPDATE: 'VERIFICATION_UPDATE',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** Notification types that users may opt out of. Safety and transactional receipts are always sent in-app. */
export const NotificationCategory = {
  BOOKINGS: 'bookings',
  PAYMENTS: 'payments',
  REMINDERS: 'reminders',
  MARKETING: 'marketing',
} as const;
export type NotificationCategory = (typeof NotificationCategory)[keyof typeof NotificationCategory];
