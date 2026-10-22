import { Injectable } from '@nestjs/common';
import { CHARGER_APPROVAL_CHECKLIST, maskPhone, type ConnectorType, type IncidentStatus, type Priority, type TicketStatus } from '@nexvolt/shared';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import type { RequestMeta } from '../../common/auth/decorators';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MANAGE_INCLUDE } from '../chargers/charger.mapper';
import { ChargersService } from '../chargers/chargers.service';
import { toDocumentDto } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toIncidentDto, toTicketDto } from '../support/support.service';
import { toHostProfileDto } from '../users/users.service';
import { toCatalogDto } from '../vehicles/vehicles.service';

type Page = { q?: string; status?: string; limit: number; offset: number };

/**
 * Admin verification and moderation. Every state change records actor, reason and
 * old/new values in the append-only audit log. Nothing here can mark a host or charger
 * verified without an explicit admin decision.
 */
@Injectable()
export class AdminVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly chargers: ChargersService,
  ) {}

  // ── Hosts ──
  async listHosts(p: Page) {
    const where: Prisma.HostProfileWhereInput = {
      ...(p.status ? { kycStatus: p.status as Prisma.HostProfileWhereInput['kycStatus'] } : {}),
      ...(p.q ? { OR: [{ displayName: { contains: p.q, mode: 'insensitive' } }, { user: { phone: { contains: p.q } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.hostProfile.findMany({ where, include: { user: { select: { phone: true, name: true, status: true } }, _count: { select: { chargers: true } } }, orderBy: { updatedAt: 'desc' }, take: p.limit, skip: p.offset }),
      this.prisma.hostProfile.count({ where }),
    ]);
    return {
      items: items.map((h) => ({ ...toHostProfileDto(h), userName: h.user.name, phoneMasked: maskPhone(h.user.phone), userStatus: h.user.status, chargerCount: h._count.chargers })),
      total,
      limit: p.limit,
      offset: p.offset,
    };
  }

  async hostDetail(id: string) {
    const h = await this.prisma.hostProfile.findUnique({
      where: { id },
      include: { user: { select: { phone: true, name: true, status: true, createdAt: true } }, documents: { orderBy: { createdAt: 'desc' } }, chargers: { select: { id: true, title: true, status: true, isPublished: true, city: true } } },
    });
    if (!h) throw AppError.notFound('Host');
    return {
      ...toHostProfileDto(h),
      userName: h.user.name,
      phone: h.user.phone,
      userStatus: h.user.status,
      suspensionReason: h.suspensionReason,
      documents: h.documents.map(toDocumentDto),
      chargers: h.chargers,
    };
  }

  async decideKyc(id: string, decision: 'VERIFIED' | 'REJECTED', reason: string, actor: AuthUser, meta: RequestMeta) {
    const h = await this.prisma.hostProfile.findUnique({ where: { id } });
    if (!h) throw AppError.notFound('Host');
    if (decision === 'VERIFIED') {
      const accepted = await this.prisma.verificationDocument.count({ where: { hostId: id, docType: 'IDENTITY_PROOF', status: 'ACCEPTED' } });
      if (!accepted) throw AppError.unprocessable('DOCUMENT_NOT_ACCEPTED', 'Accept an identity document before verifying this host');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.hostProfile.update({
        where: { id },
        data: decision === 'VERIFIED' ? { kycStatus: 'VERIFIED', verifiedAt: new Date(), verifiedById: actor.id } : { kycStatus: 'REJECTED', verifiedAt: null, verifiedById: null },
      });
      await this.audit.log({ actor, action: `host.kyc.${decision.toLowerCase()}`, resourceType: 'HostProfile', resourceId: id, reason, oldValue: { kycStatus: h.kycStatus }, newValue: { kycStatus: decision }, meta }, tx);
    });
    await this.notifications.notify({
      userId: h.userId,
      type: 'VERIFICATION_UPDATE',
      title: decision === 'VERIFIED' ? 'Identity verified' : 'Identity verification unsuccessful',
      body: decision === 'VERIFIED' ? 'Your host identity has been verified.' : `We could not verify your identity: ${reason}`,
    });
    return this.hostDetail(id);
  }

  /** Records an offline/manual payout-account verification decision. No bank data is stored. */
  async setPayoutAccount(id: string, status: 'ACTIVE' | 'REJECTED', reason: string, actor: AuthUser, meta: RequestMeta) {
    const h = await this.prisma.hostProfile.findUnique({ where: { id } });
    if (!h) throw AppError.notFound('Host');
    await this.prisma.$transaction(async (tx) => {
      await tx.hostProfile.update({ where: { id }, data: { payoutAccountStatus: status } });
      await this.audit.log({ actor, action: 'host.payout_account.set', resourceType: 'HostProfile', resourceId: id, reason, oldValue: { payoutAccountStatus: h.payoutAccountStatus }, newValue: { payoutAccountStatus: status }, meta }, tx);
    });
    return this.hostDetail(id);
  }

  async setHostSuspended(id: string, suspend: boolean, reason: string, actor: AuthUser, meta: RequestMeta) {
    const h = await this.prisma.hostProfile.findUnique({ where: { id } });
    if (!h) throw AppError.notFound('Host');
    await this.prisma.$transaction(async (tx) => {
      await tx.hostProfile.update({ where: { id }, data: suspend ? { suspendedAt: new Date(), suspensionReason: reason } : { suspendedAt: null, suspensionReason: null } });
      if (suspend) await tx.charger.updateMany({ where: { hostId: id }, data: { isPublished: false } });
      await this.audit.log({ actor, action: suspend ? 'host.suspend' : 'host.reinstate', resourceType: 'HostProfile', resourceId: id, reason, oldValue: { suspendedAt: h.suspendedAt }, newValue: { suspended: suspend }, meta }, tx);
    });
    await this.notifications.notify({
      userId: h.userId,
      type: 'VERIFICATION_UPDATE',
      title: suspend ? 'Host account suspended' : 'Host account reinstated',
      body: suspend ? `Your listings are hidden while we review: ${reason}` : 'Your host account is active again. Republish your chargers when ready.',
    });
    return this.hostDetail(id);
  }

  // ── Documents ──
  async listDocuments(p: Page) {
    const where: Prisma.VerificationDocumentWhereInput = { status: (p.status ?? 'PENDING_REVIEW') as Prisma.VerificationDocumentWhereInput['status'] };
    const [items, total] = await Promise.all([
      this.prisma.verificationDocument.findMany({ where, include: { host: { select: { id: true, displayName: true } }, charger: { select: { id: true, title: true } } }, orderBy: { createdAt: 'asc' }, take: p.limit, skip: p.offset }),
      this.prisma.verificationDocument.count({ where }),
    ]);
    return { items: items.map((d) => ({ ...toDocumentDto(d), host: d.host, charger: d.charger })), total, limit: p.limit, offset: p.offset };
  }

  async reviewDocument(id: string, decision: 'ACCEPTED' | 'REJECTED', notes: string, actor: AuthUser, meta: RequestMeta) {
    const d = await this.prisma.verificationDocument.findUnique({ where: { id } });
    if (!d) throw AppError.notFound('Document');
    if (d.status === 'PENDING_UPLOAD') throw AppError.unprocessable('NOT_UPLOADED', 'This document has not been uploaded');
    await this.prisma.$transaction(async (tx) => {
      await tx.verificationDocument.update({ where: { id }, data: { status: decision, reviewedById: actor.id, reviewedAt: new Date(), reviewNotes: notes } });
      if (d.docType === 'METER_CALIBRATION_CERT' && d.chargerId) {
        await tx.charger.update({ where: { id: d.chargerId }, data: { meterVerifiedAt: decision === 'ACCEPTED' ? new Date() : null } });
      }
      await this.audit.log({ actor, action: `document.${decision.toLowerCase()}`, resourceType: 'VerificationDocument', resourceId: id, reason: notes, oldValue: { status: d.status }, newValue: { status: decision, docType: d.docType }, meta }, tx);
    });
    return toDocumentDto(await this.prisma.verificationDocument.findUniqueOrThrow({ where: { id } }));
  }

  // ── Chargers ──
  async listChargers(p: Page) {
    const where: Prisma.ChargerWhereInput = {
      ...(p.status ? { status: p.status as Prisma.ChargerWhereInput['status'] } : {}),
      ...(p.q ? { OR: [{ title: { contains: p.q, mode: 'insensitive' } }, { city: { contains: p.q, mode: 'insensitive' } }, { locality: { contains: p.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.charger.findMany({ where, include: { host: { select: { id: true, displayName: true, kycStatus: true } }, connectors: true }, orderBy: { updatedAt: 'desc' }, take: p.limit, skip: p.offset }),
      this.prisma.charger.count({ where }),
    ]);
    return {
      items: items.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        isPublished: c.isPublished,
        pausedAt: c.pausedAt?.toISOString() ?? null,
        locality: c.locality,
        city: c.city,
        state: c.state,
        currentType: c.currentType,
        maxPowerKw: Number(c.maxPowerKw),
        connectors: c.connectors.map((k) => k.connectorType as ConnectorType),
        pricingUnit: c.pricingUnit,
        unitPriceMinor: c.unitPriceMinor,
        host: c.host,
        isSample: c.isSample,
        updatedAt: c.updatedAt.toISOString(),
      })),
      total,
      limit: p.limit,
      offset: p.offset,
    };
  }

  async chargerDetail(id: string) {
    const exists = await this.prisma.charger.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw AppError.notFound('Charger');
    const view = await this.chargers.manageView(id);
    const c = await this.prisma.charger.findUniqueOrThrow({ where: { id }, include: { host: { include: { user: { select: { name: true, phone: true } } } } } });
    return {
      ...view,
      suspensionReason: c.suspensionReason,
      hostDetail: { ...toHostProfileDto(c.host), userName: c.host.user.name, phoneMasked: maskPhone(c.host.user.phone) },
      checklistItems: CHARGER_APPROVAL_CHECKLIST,
    };
  }

  async decideCharger(id: string, input: { decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'; checklist?: Partial<Record<string, boolean>>; reason: string }, actor: AuthUser, meta: RequestMeta) {
    const c = await this.prisma.charger.findUnique({ where: { id }, include: { ...MANAGE_INCLUDE } });
    if (!c) throw AppError.notFound('Charger');
    if (c.status !== 'PENDING_REVIEW') throw AppError.conflict('INVALID_STATE', `Charger is ${c.status}, not pending review`);
    if (input.decision === 'APPROVED') {
      const problems: string[] = [];
      if (c.host.kycStatus !== 'VERIFIED') problems.push('Host identity is not verified');
      if (c.host.suspendedAt) problems.push('Host is suspended');
      const missing = CHARGER_APPROVAL_CHECKLIST.filter((k) => input.checklist?.[k] !== true);
      if (missing.length) problems.push(`Checklist incomplete: ${missing.join(', ')}`);
      const accepted = c.documents.filter((d) => d.status === 'ACCEPTED').map((d) => d.docType);
      if (!accepted.some((t) => t === 'PROPERTY_AUTHORIZATION' || t === 'SOCIETY_NOC')) problems.push('No accepted property authorisation / society NOC');
      if (!accepted.includes('ELECTRICAL_SAFETY_CERT')) problems.push('No accepted electrical safety certificate');
      if (problems.length) throw AppError.unprocessable('APPROVAL_REQUIREMENTS_MISSING', 'This charger cannot be approved yet', problems);
    }
    const newStatus = input.decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED';
    await this.prisma.$transaction(async (tx) => {
      await tx.charger.update({
        where: { id },
        data: input.decision === 'APPROVED' ? { status: 'VERIFIED', verifiedAt: new Date(), verifiedById: actor.id } : { status: 'REJECTED', isPublished: false },
      });
      const pending = await tx.chargerVerification.findFirst({ where: { chargerId: id, status: 'PENDING' }, orderBy: { submittedAt: 'desc' } });
      const vdata = { status: input.decision, reviewerId: actor.id, decidedAt: new Date(), checklist: (input.checklist ?? undefined) as Prisma.InputJsonValue | undefined, notes: input.reason };
      if (pending) await tx.chargerVerification.update({ where: { id: pending.id }, data: vdata });
      else await tx.chargerVerification.create({ data: { chargerId: id, ...vdata } });
      await this.audit.log({ actor, action: `charger.${input.decision.toLowerCase()}`, resourceType: 'Charger', resourceId: id, reason: input.reason, oldValue: { status: c.status }, newValue: { status: newStatus, checklist: input.checklist }, meta }, tx);
    });
    await this.notifications.notify({
      userId: c.host.userId,
      type: 'VERIFICATION_UPDATE',
      title: input.decision === 'APPROVED' ? 'Charger verified' : input.decision === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Charger not approved',
      body: input.decision === 'APPROVED' ? `${c.title} is verified. You can now publish it.` : `${c.title}: ${input.reason}`,
      data: { chargerId: id },
    });
    return this.chargerDetail(id);
  }

  async setChargerSuspended(id: string, suspend: boolean, reason: string, actor: AuthUser, meta: RequestMeta) {
    const c = await this.prisma.charger.findUnique({ where: { id }, include: { host: true } });
    if (!c) throw AppError.notFound('Charger');
    if (!suspend && c.status !== 'SUSPENDED') throw AppError.conflict('INVALID_STATE', 'Charger is not suspended');
    // Reinstated chargers return to VERIFIED only if they were verified before; they stay unpublished until the host republishes.
    const reinstateTo = c.verifiedAt ? 'VERIFIED' : 'PENDING_REVIEW';
    await this.prisma.$transaction(async (tx) => {
      await tx.charger.update({
        where: { id },
        data: suspend ? { status: 'SUSPENDED', isPublished: false, suspendedAt: new Date(), suspensionReason: reason } : { status: reinstateTo, suspendedAt: null, suspensionReason: null },
      });
      await this.audit.log({ actor, action: suspend ? 'charger.suspend' : 'charger.reinstate', resourceType: 'Charger', resourceId: id, reason, oldValue: { status: c.status }, newValue: { status: suspend ? 'SUSPENDED' : reinstateTo }, meta }, tx);
    });
    const upcoming = await this.prisma.booking.count({ where: { chargerId: id, status: { in: ['CONFIRMED', 'AWAITING_HOST_APPROVAL', 'HELD', 'PENDING_PAYMENT'] }, startAt: { gt: new Date() } } });
    await this.notifications.notify({
      userId: c.host.userId,
      type: 'VERIFICATION_UPDATE',
      title: suspend ? 'Charger suspended' : 'Charger reinstated',
      body: suspend ? `${c.title} is hidden and cannot be booked: ${reason}` : `${c.title} has been reinstated. Republish it when ready.`,
      data: { chargerId: id },
    });
    return { charger: await this.chargerDetail(id), upcomingBookings: upcoming };
  }

  // ── Users ──
  async listUsers(p: Page) {
    const where: Prisma.UserWhereInput = {
      ...(p.status ? { status: p.status as Prisma.UserWhereInput['status'] } : {}),
      ...(p.q ? { OR: [{ phone: { contains: p.q } }, { name: { contains: p.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, include: { _count: { select: { bookings: true } } }, orderBy: { createdAt: 'desc' }, take: p.limit, skip: p.offset }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: items.map((u) => ({
        id: u.id,
        name: u.name,
        phoneMasked: maskPhone(u.phone),
        roles: u.roles,
        status: u.status,
        isSample: u.isSample,
        bookings: u._count.bookings,
        deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      total,
      limit: p.limit,
      offset: p.offset,
    };
  }

  async setUserSuspended(id: string, suspend: boolean, reason: string, actor: AuthUser, meta: RequestMeta) {
    if (id === actor.id) throw AppError.unprocessable('SELF_ACTION', 'You cannot suspend your own account');
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw AppError.notFound('User');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: suspend ? 'SUSPENDED' : 'ACTIVE' } });
      if (suspend) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ actor, action: suspend ? 'user.suspend' : 'user.reinstate', resourceType: 'User', resourceId: id, reason, oldValue: { status: u.status }, newValue: { status: suspend ? 'SUSPENDED' : 'ACTIVE' }, meta }, tx);
    });
    return { id, status: suspend ? 'SUSPENDED' : 'ACTIVE' };
  }

  // ── Support & incidents ──
  async listTickets(p: Page) {
    const where: Prisma.SupportTicketWhereInput = p.status ? { status: p.status as TicketStatus } : { status: { in: ['OPEN', 'IN_PROGRESS', 'AWAITING_USER'] } };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({ where, include: { requester: { select: { name: true } } }, orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }], take: p.limit, skip: p.offset }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items: items.map((t) => toTicketDto(t, true)), total, limit: p.limit, offset: p.offset };
  }

  async updateTicket(id: string, input: { status?: TicketStatus; priority?: Priority; assigneeId?: string | null }, actor: AuthUser, meta: RequestMeta) {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t) throw AppError.notFound('Ticket');
    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({ where: { id }, data: input });
      await this.audit.log({ actor, action: 'ticket.update', resourceType: 'SupportTicket', resourceId: id, oldValue: { status: t.status, priority: t.priority, assigneeId: t.assigneeId }, newValue: input, meta }, tx);
    });
    return toTicketDto(await this.prisma.supportTicket.findUniqueOrThrow({ where: { id }, include: { requester: { select: { name: true } }, messages: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'asc' } } } }), true);
  }

  async listIncidents(p: Page) {
    const where: Prisma.IncidentReportWhereInput = p.status ? { status: p.status as IncidentStatus } : { status: { not: 'RESOLVED' } };
    const [items, total] = await Promise.all([
      this.prisma.incidentReport.findMany({ where, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: p.limit, skip: p.offset }),
      this.prisma.incidentReport.count({ where }),
    ]);
    return { items: items.map(toIncidentDto), total, limit: p.limit, offset: p.offset };
  }

  async updateIncident(id: string, input: { status: IncidentStatus; resolutionNotes?: string }, actor: AuthUser, meta: RequestMeta) {
    const i = await this.prisma.incidentReport.findUnique({ where: { id } });
    if (!i) throw AppError.notFound('Incident');
    if (input.status === 'RESOLVED' && !input.resolutionNotes) throw AppError.unprocessable('NOTES_REQUIRED', 'Resolution notes are required');
    await this.prisma.$transaction(async (tx) => {
      await tx.incidentReport.update({ where: { id }, data: { status: input.status, resolutionNotes: input.resolutionNotes, resolvedAt: input.status === 'RESOLVED' ? new Date() : null } });
      await this.audit.log({ actor, action: 'incident.update', resourceType: 'IncidentReport', resourceId: id, reason: input.resolutionNotes, oldValue: { status: i.status }, newValue: { status: input.status }, meta }, tx);
    });
    return toIncidentDto(await this.prisma.incidentReport.findUniqueOrThrow({ where: { id } }));
  }

  // ── Reviews & vehicle catalog ──
  async hideReview(id: string, reason: string, actor: AuthUser, meta: RequestMeta) {
    const r = await this.prisma.review.findUnique({ where: { id }, include: { charger: true } });
    if (!r) throw AppError.notFound('Review');
    if (r.status === 'HIDDEN') return { id, status: 'HIDDEN' };
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id }, data: { status: 'HIDDEN' } });
      await tx.charger.update({ where: { id: r.chargerId }, data: { ratingSum: { decrement: r.rating }, ratingCount: { decrement: 1 } } });
      await tx.hostProfile.update({ where: { id: r.charger.hostId }, data: { ratingSum: { decrement: r.rating }, ratingCount: { decrement: 1 } } });
      await this.audit.log({ actor, action: 'review.hide', resourceType: 'Review', resourceId: id, reason, oldValue: { status: r.status }, newValue: { status: 'HIDDEN' }, meta }, tx);
    });
    return { id, status: 'HIDDEN' };
  }

  async upsertVehicleModel(id: string | null, input: { manufacturer: string; model: string; variant?: string | null; connectors: ConnectorType[]; maxAcKw: number; maxDcKw?: number | null; batteryKwh?: number | null; isActive: boolean }, actor: AuthUser, meta: RequestMeta) {
    const data = {
      manufacturer: input.manufacturer,
      model: input.model,
      variant: input.variant ?? null,
      connectors: input.connectors,
      maxAcKw: new Prisma.Decimal(input.maxAcKw),
      maxDcKw: input.maxDcKw == null ? null : new Prisma.Decimal(input.maxDcKw),
      batteryKwh: input.batteryKwh == null ? null : new Prisma.Decimal(input.batteryKwh),
      isActive: input.isActive,
    };
    const before = id ? await this.prisma.vehicleModel.findUnique({ where: { id } }) : null;
    if (id && !before) throw AppError.notFound('Vehicle model');
    const m = id ? await this.prisma.vehicleModel.update({ where: { id }, data }) : await this.prisma.vehicleModel.create({ data });
    await this.audit.log({ actor, action: id ? 'vehicle_model.update' : 'vehicle_model.create', resourceType: 'VehicleModel', resourceId: m.id, oldValue: before ? toCatalogDto(before) : undefined, newValue: toCatalogDto(m), meta });
    return toCatalogDto(m);
  }

  async allVehicleModels() {
    return (await this.prisma.vehicleModel.findMany({ orderBy: [{ manufacturer: 'asc' }, { model: 'asc' }] })).map(toCatalogDto);
  }
}
