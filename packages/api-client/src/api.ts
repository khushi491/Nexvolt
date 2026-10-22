import type {
  AdminOverviewDto,
  AuditLogDto,
  AuthResponse,
  AvailabilityDto,
  AvailabilityExceptionDto,
  AvailabilityInput,
  BookingAccessDto,
  BookingDto,
  BookingEventDto,
  CancellationPreviewDto,
  ChargerManageDto,
  ChargerPublicDto,
  ChargerSearchResultDto,
  ConnectorType,
  CreateBookingInput,
  CreateChargerInput,
  DisputeDto,
  DisputeReason,
  DocumentDto,
  DocumentType,
  EarningsSummaryDto,
  GeoClusterDto,
  HealthDto,
  HostProfileDto,
  HostType,
  IncidentDto,
  IncidentStatus,
  IncidentType,
  LedgerEntryDto,
  NotificationDto,
  NotificationPrefs,
  OtpRequestResponse,
  Paginated,
  PaymentOrderDto,
  PayoutDto,
  Priority,
  QuoteBookingInput,
  QuoteDto,
  ReceiptDto,
  RefundDto,
  ReviewDto,
  SearchChargersInput,
  SessionDto,
  TicketCategory,
  TicketDto,
  TicketStatus,
  UserDto,
  VehicleCatalogDto,
  VehicleDto,
} from '@nexvolt/shared';
import { HttpClient, type ClientOptions, type Query } from './client';

export interface PresignedUpload {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface PaymentOrderWithCheckout extends PaymentOrderDto {
  /** Hosted checkout page (works in a browser tab or a mobile WebView). */
  checkoutUrl: string;
}

export interface PaymentApplyResult {
  paymentStatus: string;
  bookingStatus: string;
  bookingId: string;
}

export interface SessionView extends SessionDto {
  controlCapability: 'NONE';
  notice: string;
}

export interface AvailabilityUpdateResult {
  charger: ChargerManageDto;
  conflicts: Array<{ bookingId: string; code: string; startAt: string }>;
}

export interface VehicleInput {
  catalogModelId?: string;
  manufacturer: string;
  model: string;
  nickname?: string;
  connectors: ConnectorType[];
  maxAcKw: number;
  maxDcKw?: number | null;
  isDefault?: boolean;
}

export interface SettingRow {
  key: string;
  value: unknown;
  defaultValue: unknown;
  description: string;
  overridden: boolean;
  updatedAt: string | null;
}

type PageQuery = { q?: string; status?: string; limit?: number; offset?: number };

/** Typed Nexvolt API. All money is integer paise; energy integer Wh; dates ISO UTC. */
export class NexvoltApi {
  readonly http: HttpClient;

  constructor(opts: ClientOptions) {
    this.http = new HttpClient(opts);
  }

  private get = <T>(path: string, query?: Query) => this.http.request<T>('GET', path, { query });
  private post = <T>(path: string, body?: unknown, idempotencyKey?: string | true) => this.http.request<T>('POST', path, { body, idempotencyKey });
  private put = <T>(path: string, body?: unknown) => this.http.request<T>('PUT', path, { body });
  private patch = <T>(path: string, body?: unknown) => this.http.request<T>('PATCH', path, { body });
  private del = <T>(path: string) => this.http.request<T>('DELETE', path);

  health = () => this.get<HealthDto>('/health');

  auth = {
    requestOtp: (phone: string) => this.http.request<OtpRequestResponse>('POST', '/auth/otp/request', { body: { phone }, auth: false }),
    verifyOtp: (input: { phone: string; code: string; acceptTerms?: boolean; termsVersion?: string }) =>
      this.http.request<AuthResponse>('POST', '/auth/otp/verify', { body: input, auth: false }),
    logout: (refreshToken: string) => this.http.request<void>('POST', '/auth/logout', { body: { refreshToken }, auth: false }),
    terms: () => this.http.request<{ termsVersion: string; notice: string }>('POST', '/auth/terms', { auth: false }),
  };

  users = {
    me: () => this.get<UserDto>('/users/me'),
    update: (input: {
      name?: string;
      email?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      notificationPrefs?: Partial<NotificationPrefs>;
    }) => this.patch<UserDto>('/users/me', input),
    registerDevice: (token: string, platform: 'ios' | 'android' | 'web') => this.post<void>('/users/me/devices', { token, platform }),
    requestDeletion: () => this.post<{ requestedAt: string; note: string }>('/users/me/deletion-request'),
  };

  vehicles = {
    catalog: (q?: string) => this.get<VehicleCatalogDto[]>('/vehicles/catalog', { q }),
    list: () => this.get<VehicleDto[]>('/vehicles'),
    create: (input: VehicleInput) => this.post<VehicleDto>('/vehicles', input),
    update: (id: string, input: Partial<VehicleInput>) => this.patch<VehicleDto>(`/vehicles/${id}`, input),
    remove: (id: string) => this.del<void>(`/vehicles/${id}`),
  };

  hosts = {
    onboard: (input: { displayName: string; hostType: HostType; attestAuthority: true; attestElectricalSafety: true; attestationVersion: string }) =>
      this.post<HostProfileDto>('/hosts/onboard', input),
    me: () => this.get<HostProfileDto>('/hosts/me'),
    update: (input: { displayName?: string; hostType?: HostType; bio?: string | null }) => this.patch<HostProfileDto>('/hosts/me', input),
    submitKyc: () => this.post<HostProfileDto>('/hosts/me/kyc/submit'),
    payoutOnboarding: () => this.post<{ status: string; providerFlowAvailable: boolean; message: string }>('/hosts/me/payout-onboarding'),
    earnings: () => this.get<EarningsSummaryDto>('/hosts/me/earnings'),
    ledger: (limit = 100) => this.get<LedgerEntryDto[]>('/hosts/me/ledger', { limit }),
    payouts: () => this.get<PayoutDto[]>('/hosts/me/payouts'),
  };

  documents = {
    createUpload: (input: { docType: DocumentType; chargerId?: string; fileName: string; mimeType: string; sizeBytes: number }) =>
      this.post<{ document: DocumentDto; upload: PresignedUpload }>('/documents/uploads', input),
    complete: (id: string) => this.post<DocumentDto>(`/documents/${id}/complete`),
    list: (chargerId?: string) => this.get<DocumentDto[]>('/documents', { chargerId }),
    url: (id: string) => this.get<{ url: string | null }>(`/documents/${id}/url`),
    remove: (id: string) => this.del<void>(`/documents/${id}`),
  };

  search = {
    chargers: (q: SearchChargersInput) => this.get<{ items: ChargerSearchResultDto[]; approximate: true }>('/search/chargers', q as unknown as Query),
  };

  chargers = {
    get: (id: string, vehicleId?: string) => this.get<ChargerPublicDto>(`/chargers/${id}`, { vehicleId }),
    availability: (id: string, date: string, durationMinutes = 60) => this.get<AvailabilityDto>(`/chargers/${id}/availability`, { date, durationMinutes }),
    reviews: (id: string) => this.get<ReviewDto[]>(`/chargers/${id}/reviews`),
    // host management
    mine: () => this.get<ChargerManageDto[]>('/chargers/mine'),
    manage: (id: string) => this.get<ChargerManageDto>(`/chargers/${id}/manage`),
    create: (input: CreateChargerInput) => this.post<ChargerManageDto>('/chargers', input),
    update: (id: string, input: Partial<CreateChargerInput>) => this.patch<ChargerManageDto>(`/chargers/${id}`, input),
    submit: (id: string) => this.post<ChargerManageDto>(`/chargers/${id}/submit`),
    publish: (id: string) => this.post<ChargerManageDto>(`/chargers/${id}/publish`),
    unpublish: (id: string) => this.post<ChargerManageDto>(`/chargers/${id}/unpublish`),
    pause: (id: string, reason?: string) => this.post<{ charger: ChargerManageDto; upcomingBookings: number; notice: string | null }>(`/chargers/${id}/pause`, { reason }),
    resume: (id: string) => this.post<{ charger: ChargerManageDto; upcomingBookings: number; notice: string | null }>(`/chargers/${id}/resume`, {}),
    setAvailability: (id: string, input: AvailabilityInput) => this.put<AvailabilityUpdateResult>(`/chargers/${id}/availability`, input),
    addException: (id: string, input: Omit<AvailabilityExceptionDto, 'id'>) => this.post<AvailabilityUpdateResult>(`/chargers/${id}/exceptions`, input),
    removeException: (id: string, exceptionId: string) => this.del<ChargerManageDto>(`/chargers/${id}/exceptions/${exceptionId}`),
    photoUpload: (id: string, mimeType: string, sizeBytes: number) => this.post<{ photoId: string; upload: PresignedUpload }>(`/chargers/${id}/photos`, { mimeType, sizeBytes }),
    photoComplete: (id: string, photoId: string) => this.post<ChargerManageDto>(`/chargers/${id}/photos/${photoId}/complete`),
    photoRemove: (id: string, photoId: string) => this.del<ChargerManageDto>(`/chargers/${id}/photos/${photoId}`),
  };

  bookings = {
    quote: (input: QuoteBookingInput) => this.post<QuoteDto>('/bookings/quote', input),
    /** Pass a stable idempotency key from the checkout screen so double taps/retries create one booking. */
    create: (input: CreateBookingInput, idempotencyKey: string) => this.post<BookingDto>('/bookings', input, idempotencyKey),
    list: (scope: 'upcoming' | 'past' | 'all' = 'all') => this.get<BookingDto[]>('/bookings', { scope }),
    hostQueue: (scope: 'upcoming' | 'past' | 'all' = 'upcoming', status?: string) => this.get<BookingDto[]>('/bookings/host', { scope, status }),
    get: (id: string) => this.get<BookingDto>(`/bookings/${id}`),
    access: (id: string) => this.get<BookingAccessDto>(`/bookings/${id}/access`),
    events: (id: string) => this.get<BookingEventDto[]>(`/bookings/${id}/events`),
    receipt: (id: string) => this.get<ReceiptDto>(`/bookings/${id}/receipt`),
    cancellationPreview: (id: string) => this.get<CancellationPreviewDto>(`/bookings/${id}/cancellation-preview`),
    cancel: (id: string, reason: string) => this.post<BookingDto>(`/bookings/${id}/cancel`, { reason }),
    approve: (id: string) => this.post<BookingDto>(`/bookings/${id}/approve`),
    decline: (id: string, reason: string) => this.post<BookingDto>(`/bookings/${id}/decline`, { reason }),
    checkIn: (id: string) => this.post<BookingDto>(`/bookings/${id}/check-in`),
    noShow: (id: string) => this.post<BookingDto>(`/bookings/${id}/no-show`),
  };

  payments = {
    createOrder: (bookingId: string, idempotencyKey: string) => this.post<PaymentOrderWithCheckout>('/payments/orders', { bookingId }, idempotencyKey),
    verify: (input: { bookingId: string; providerOrderId: string; providerPaymentId: string; signature: string }) => this.post<PaymentApplyResult>('/payments/verify', input),
    demoComplete: (bookingId: string, outcome: 'SUCCESS' | 'FAILURE') => this.post<PaymentApplyResult>('/payments/demo/complete', { bookingId, outcome }),
    forBooking: (bookingId: string) => this.get<{ payments: Array<Record<string, unknown>>; refunds: RefundDto[] }>(`/payments/booking/${bookingId}`),
  };

  sessions = {
    get: (bookingId: string) => this.get<SessionView>(`/charging-sessions/${bookingId}`),
    start: (bookingId: string, input: { readingKwh?: string; evidenceId?: string; note?: string } = {}) => this.post<SessionView>(`/charging-sessions/${bookingId}/start`, input),
    end: (bookingId: string, input: { readingKwh?: string; evidenceId?: string; note?: string } = {}) => this.post<SessionView>(`/charging-sessions/${bookingId}/end`, input),
    complete: (bookingId: string, idempotencyKey: string) => this.post<SessionView>(`/charging-sessions/${bookingId}/complete`, undefined, idempotencyKey),
    evidenceUpload: (bookingId: string, mimeType: string, sizeBytes: number) => this.post<{ evidenceId: string; upload: PresignedUpload }>(`/charging-sessions/${bookingId}/evidence`, { mimeType, sizeBytes }),
    evidenceComplete: (bookingId: string, evidenceId: string) => this.post<{ evidenceId: string }>(`/charging-sessions/${bookingId}/evidence/${evidenceId}/complete`),
  };

  reviews = {
    create: (input: { bookingId: string; rating: number; comment?: string }) => this.post<ReviewDto>('/reviews', input),
    mine: () => this.get<ReviewDto[]>('/reviews/mine'),
    forHost: () => this.get<ReviewDto[]>('/reviews/host'),
    reply: (id: string, reply: string) => this.post<ReviewDto>(`/reviews/${id}/reply`, { reply }),
  };

  favorites = {
    list: () => this.get<ChargerPublicDto[]>('/favorites'),
    add: (chargerId: string) => this.put<void>(`/favorites/${chargerId}`),
    remove: (chargerId: string) => this.del<void>(`/favorites/${chargerId}`),
  };

  notifications = {
    list: (limit = 50) => this.get<{ items: NotificationDto[]; unread: number }>('/notifications', { limit }),
    read: (id: string) => this.post<void>(`/notifications/${id}/read`),
    readAll: () => this.post<void>('/notifications/read-all'),
  };

  support = {
    createTicket: (input: { category: TicketCategory; subject: string; description: string; bookingId?: string }) => this.post<TicketDto>('/support/tickets', input),
    tickets: () => this.get<TicketDto[]>('/support/tickets'),
    ticket: (id: string) => this.get<TicketDto>(`/support/tickets/${id}`),
    message: (id: string, body: string, internal?: boolean) => this.post<TicketDto>(`/support/tickets/${id}/messages`, { body, internal }),
    reportIncident: (input: { type: IncidentType; severity: Priority; description: string; chargerId?: string; bookingId?: string }) => this.post<IncidentDto>('/incidents', input),
    myIncidents: () => this.get<IncidentDto[]>('/incidents/mine'),
    raiseDispute: (input: { bookingId: string; reason: DisputeReason; description: string }) => this.post<DisputeDto>('/disputes', input),
    myDisputes: () => this.get<DisputeDto[]>('/disputes/mine'),
  };

  admin = {
    overview: () => this.get<AdminOverviewDto>('/admin/overview'),
    geo: () => this.get<GeoClusterDto[]>('/admin/geo'),
    hosts: (q: PageQuery = {}) => this.get<Paginated<HostProfileDto & { userName: string | null; phoneMasked: string; userStatus: string; chargerCount: number }>>('/admin/hosts', q),
    host: (id: string) => this.get<HostProfileDto & { userName: string | null; phone: string; userStatus: string; suspensionReason: string | null; documents: DocumentDto[]; chargers: Array<{ id: string; title: string; status: string; isPublished: boolean; city: string }> }>(`/admin/hosts/${id}`),
    decideKyc: (id: string, decision: 'VERIFIED' | 'REJECTED', reason: string) => this.post<unknown>(`/admin/hosts/${id}/kyc`, { decision, reason }),
    setPayoutAccount: (id: string, status: 'ACTIVE' | 'REJECTED', reason: string) => this.post<unknown>(`/admin/hosts/${id}/payout-account`, { status, reason }),
    suspendHost: (id: string, reason: string) => this.post<unknown>(`/admin/hosts/${id}/suspend`, { reason }),
    reinstateHost: (id: string, reason: string) => this.post<unknown>(`/admin/hosts/${id}/reinstate`, { reason }),
    documents: (q: PageQuery = {}) => this.get<Paginated<DocumentDto & { host: { id: string; displayName: string } | null; charger: { id: string; title: string } | null }>>('/admin/documents', q),
    reviewDocument: (id: string, decision: 'ACCEPTED' | 'REJECTED', notes: string) => this.post<DocumentDto>(`/admin/documents/${id}/review`, { decision, notes }),
    chargers: (q: PageQuery = {}) => this.get<Paginated<AdminChargerRow>>('/admin/chargers', q),
    charger: (id: string) => this.get<ChargerManageDto & { suspensionReason: string | null; hostDetail: HostProfileDto & { userName: string | null; phoneMasked: string }; checklistItems: string[] }>(`/admin/chargers/${id}`),
    decideCharger: (id: string, input: { decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'; checklist?: Record<string, boolean>; reason: string }) => this.post<unknown>(`/admin/chargers/${id}/decision`, input),
    suspendCharger: (id: string, reason: string) => this.post<unknown>(`/admin/chargers/${id}/suspend`, { reason }),
    reinstateCharger: (id: string, reason: string) => this.post<unknown>(`/admin/chargers/${id}/reinstate`, { reason }),
    users: (q: PageQuery = {}) => this.get<Paginated<AdminUserRow>>('/admin/users', q),
    suspendUser: (id: string, reason: string) => this.post<unknown>(`/admin/users/${id}/suspend`, { reason }),
    reinstateUser: (id: string, reason: string) => this.post<unknown>(`/admin/users/${id}/reinstate`, { reason }),
    bookings: (q: PageQuery = {}) => this.get<Paginated<BookingDto>>('/admin/bookings', q),
    booking: (id: string) => this.get<AdminBookingDetail>(`/admin/bookings/${id}`),
    cancelBooking: (id: string, reason: string) => this.post<BookingDto>(`/admin/bookings/${id}/cancel`, { reason }),
    payments: (q: PageQuery = {}) => this.get<Paginated<AdminPaymentRow>>('/admin/payments', q),
    refunds: (q: PageQuery = {}) => this.get<Paginated<RefundDto & { failureReason: string | null }>>('/admin/refunds', q),
    refund: (input: { bookingId: string; amountMinor: number; reason: string }, idempotencyKey: string) => this.post<RefundDto>('/admin/refunds', input, idempotencyKey),
    disputes: (q: PageQuery = {}) => this.get<Paginated<DisputeDto>>('/admin/disputes', q),
    reviewDispute: (id: string) => this.post<unknown>(`/admin/disputes/${id}/review`),
    resolveDispute: (id: string, input: { outcome: 'RESOLVED_DRIVER_FAVOUR' | 'RESOLVED_HOST_FAVOUR' | 'RESOLVED_SPLIT'; billableEnergyWh?: number; refundAmountMinor?: number; notes: string }) =>
      this.post<DisputeDto>(`/admin/disputes/${id}/resolve`, input),
    eligiblePayouts: () => this.get<Array<{ hostId: string; hostDisplayName: string; payoutAccountStatus: string; eligibleMinor: number; entryCount: number }>>('/admin/payouts/eligible'),
    payouts: (q: PageQuery = {}) => this.get<PayoutDto[]>('/admin/payouts', q),
    createPayout: (hostId: string, reason: string) => this.post<PayoutDto>('/admin/payouts', { hostId, reason }),
    markPayoutPaid: (id: string, externalReference: string, reason: string) => this.post<PayoutDto>(`/admin/payouts/${id}/mark-paid`, { externalReference, reason }),
    markPayoutFailed: (id: string, reason: string) => this.post<PayoutDto>(`/admin/payouts/${id}/mark-failed`, { reason }),
    tickets: (q: PageQuery = {}) => this.get<Paginated<TicketDto>>('/admin/support/tickets', q),
    updateTicket: (id: string, input: { status?: TicketStatus; priority?: Priority; assigneeId?: string | null }) => this.patch<TicketDto>(`/admin/support/tickets/${id}`, input),
    incidents: (q: PageQuery = {}) => this.get<Paginated<IncidentDto>>('/admin/incidents', q),
    updateIncident: (id: string, input: { status: IncidentStatus; resolutionNotes?: string }) => this.patch<IncidentDto>(`/admin/incidents/${id}`, input),
    hideReview: (id: string, reason: string) => this.post<unknown>(`/admin/reviews/${id}/hide`, { reason }),
    vehicleModels: () => this.get<VehicleCatalogDto[]>('/admin/vehicle-models'),
    createVehicleModel: (input: Omit<VehicleCatalogDto, 'id'>) => this.post<VehicleCatalogDto>('/admin/vehicle-models', input),
    updateVehicleModel: (id: string, input: Omit<VehicleCatalogDto, 'id'>) => this.put<VehicleCatalogDto>(`/admin/vehicle-models/${id}`, input),
    settings: () => this.get<SettingRow[]>('/admin/settings'),
    updateSetting: (key: string, value: unknown, reason: string) => this.put<{ key: string; value: unknown }>(`/admin/settings/${key}`, { value, reason }),
    auditLogs: (q: { resourceType?: string; resourceId?: string; actorId?: string; limit?: number } = {}) => this.get<AuditLogDto[]>('/admin/audit-logs', q),
    exportCsv: (type: 'bookings' | 'payments' | 'ledger' | 'payouts') => this.http.text(`/admin/exports/${type}`),
    runMaintenance: (task: string) => this.post<{ task: string; processed: number }>(`/admin/maintenance/${task}`),
  };
}

export interface AdminChargerRow {
  id: string;
  title: string;
  status: string;
  isPublished: boolean;
  pausedAt: string | null;
  locality: string;
  city: string;
  state: string;
  currentType: string;
  maxPowerKw: number;
  connectors: ConnectorType[];
  pricingUnit: string;
  unitPriceMinor: number;
  host: { id: string; displayName: string; kycStatus: string };
  isSample: boolean;
  updatedAt: string;
}

export interface AdminUserRow {
  id: string;
  name: string | null;
  phoneMasked: string;
  roles: string[];
  status: string;
  isSample: boolean;
  bookings: number;
  deletionRequestedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminPaymentRow {
  id: string;
  bookingId: string;
  bookingCode: string;
  provider: string;
  isDemo: boolean;
  status: string;
  amountMinor: number;
  amountRefundedMinor: number;
  providerFeeMinor: number | null;
  providerOrderId: string;
  providerPaymentId: string | null;
  method: string | null;
  failureReason: string | null;
  capturedAt: string | null;
  lastReconciledAt: string | null;
  createdAt: string;
}

export interface AdminBookingDetail {
  booking: BookingDto;
  events: BookingEventDto[];
  payments: Array<AdminPaymentRow & { events: Array<{ eventType: string; receivedAt: string; processedAt: string | null; processingError: string | null }> }>;
  refunds: RefundDto[];
  disputes: DisputeDto[];
  ledger: Array<{ type: string; status: string; amountMinor: number; description: string; createdAt: string }>;
}
