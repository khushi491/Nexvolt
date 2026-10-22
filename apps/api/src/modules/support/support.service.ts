import { Injectable } from '@nestjs/common';
import {
  canTransition,
  type DisputeDto,
  type DisputeReason,
  type IncidentDto,
  type IncidentType,
  type MeterAssessment,
  type Priority,
  type TicketCategory,
  type TicketDto,
} from '@nexvolt/shared';
import { Prisma, type Dispute, type IncidentReport, type SupportMessage, type SupportTicket } from '@prisma/client';
import type { AuthUser } from '../../common/auth/auth-user';
import { AuditService } from '../../common/audit/audit.service';
import { humanCode } from '../../common/crypto/crypto.service';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BookingTransitionsService } from '../booking-core/booking-transitions.service';
import { BookingsService } from '../bookings/bookings.service';
import { NotificationsService, type NotifyInput } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

type TicketFull = SupportTicket & { requester: { name: string | null }; messages?: (SupportMessage & { author: { name: string | null } })[] };

export function toTicketDto(t: TicketFull, includeInternal: boolean): TicketDto {
  return {
    id: t.id,
    reference: t.reference,
    category: t.category,
    subject: t.subject,
    description: t.description,
    status: t.status,
    priority: t.priority,
    bookingId: t.bookingId,
    requesterId: t.requesterId,
    requesterName: t.requester.name,
    assigneeId: t.assigneeId,
    messages: t.messages
      ?.filter((m) => includeInternal || !m.internal)
      .map((m) => ({ id: m.id, authorId: m.authorId, authorName: m.author.name, body: m.body, internal: m.internal, createdAt: m.createdAt.toISOString() })),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export function toIncidentDto(i: IncidentReport): IncidentDto {
  return {
    id: i.id,
    type: i.type,
    severity: i.severity,
    status: i.status,
    description: i.description,
    chargerId: i.chargerId,
    bookingId: i.bookingId,
    reporterId: i.reporterId,
    chargerAutoSuspended: i.chargerAutoSuspended,
    resolutionNotes: i.resolutionNotes,
    createdAt: i.createdAt.toISOString(),
  };
}

export function toDisputeDto(d: Dispute & { booking: { code: string } }): DisputeDto {
  return {
    id: d.id,
    bookingId: d.bookingId,
    bookingCode: d.booking.code,
    reason: d.reason,
    status: d.status,
    description: d.description,
    raisedById: d.raisedById ?? '',
    raisedByRole: d.raisedByRole,
    resolutionNotes: d.resolutionNotes,
    assessment: (d.assessment as MeterAssessment | null) ?? null,
    createdAt: d.createdAt.toISOString(),
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
  };
}

const TICKET_INCLUDE = { requester: { select: { name: true } }, messages: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'asc' as const } } };

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly transitions: BookingTransitionsService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  private async staffUserIds(): Promise<string[]> {
    return (await this.prisma.user.findMany({ where: { roles: { has: 'ADMIN' }, status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id);
  }

  // ── Tickets ──
  async createTicket(user: AuthUser, input: { category: TicketCategory; subject: string; description: string; bookingId?: string }): Promise<TicketDto> {
    if (input.bookingId) this.bookings.actorFor(user, await this.bookings.load(input.bookingId), false);
    const t = await this.prisma.supportTicket.create({
      data: {
        reference: humanCode('SUP'),
        requesterId: user.id,
        bookingId: input.bookingId ?? null,
        category: input.category,
        subject: input.subject,
        description: input.description,
        priority: input.category === 'SAFETY' ? 'HIGH' : 'MEDIUM',
      },
      include: TICKET_INCLUDE,
    });
    return toTicketDto(t, false);
  }

  async myTickets(user: AuthUser): Promise<TicketDto[]> {
    const rows = await this.prisma.supportTicket.findMany({ where: { requesterId: user.id }, include: { requester: { select: { name: true } } }, orderBy: { updatedAt: 'desc' } });
    return rows.map((t) => toTicketDto(t, false));
  }

  async getTicket(user: AuthUser, id: string): Promise<TicketDto> {
    const t = await this.prisma.supportTicket.findUnique({ where: { id }, include: TICKET_INCLUDE });
    if (!t || (t.requesterId !== user.id && !user.isStaff)) throw AppError.notFound('Ticket');
    return toTicketDto(t, user.isStaff);
  }

  async addMessage(user: AuthUser, id: string, body: string, internal = false): Promise<TicketDto> {
    const t = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!t || (t.requesterId !== user.id && !user.isStaff)) throw AppError.notFound('Ticket');
    if (t.status === 'CLOSED') throw AppError.conflict('TICKET_CLOSED', 'This ticket is closed. Open a new one.');
    const staffReply = user.isStaff && t.requesterId !== user.id;
    await this.prisma.$transaction([
      this.prisma.supportMessage.create({ data: { ticketId: id, authorId: user.id, body, internal: staffReply && internal } }),
      this.prisma.supportTicket.update({
        where: { id },
        data: { status: staffReply ? (internal ? t.status : 'AWAITING_USER') : t.status === 'AWAITING_USER' || t.status === 'RESOLVED' ? 'OPEN' : t.status },
      }),
    ]);
    return this.getTicket(user, id);
  }

  // ── Incidents ──
  async reportIncident(user: AuthUser, input: { type: IncidentType; severity: Priority; description: string; chargerId?: string; bookingId?: string }): Promise<IncidentDto> {
    let chargerId = input.chargerId ?? null;
    if (input.bookingId) {
      const b = await this.bookings.load(input.bookingId);
      this.bookings.actorFor(user, b, false);
      chargerId = chargerId ?? b.chargerId;
    }
    if (!chargerId && !input.bookingId) throw AppError.unprocessable('TARGET_REQUIRED', 'Select the charger or booking this is about');
    const charger = chargerId ? await this.prisma.charger.findUnique({ where: { id: chargerId }, include: { host: true } }) : null;
    if (chargerId && !charger) throw AppError.notFound('Charger');
    const s = await this.settings.get();
    const autoSuspend = !!charger && input.severity === 'CRITICAL' && s.autoSuspendOnCriticalIncident && charger.status === 'VERIFIED';
    const incident = await this.prisma.$transaction(async (tx) => {
      const i = await tx.incidentReport.create({
        data: { reporterId: user.id, chargerId, bookingId: input.bookingId ?? null, type: input.type, severity: input.severity, description: input.description, chargerAutoSuspended: autoSuspend },
      });
      if (autoSuspend) {
        // Soft suspension: hidden from search and unbookable until an admin reviews it.
        await tx.charger.update({ where: { id: charger!.id }, data: { status: 'SUSPENDED', isPublished: false, suspendedAt: new Date(), suspensionReason: `Auto-suspended: CRITICAL incident ${i.id}` } });
        await this.audit.log({ actor: null, action: 'charger.auto_suspend', resourceType: 'Charger', resourceId: charger!.id, reason: `CRITICAL ${input.type} incident reported`, newValue: { incidentId: i.id } }, tx);
      }
      return i;
    });
    const alerts: NotifyInput[] = (await this.staffUserIds()).map((id) => ({
      userId: id,
      type: 'SAFETY_ALERT' as const,
      title: `${input.severity} safety incident`,
      body: `${input.type.replace(/_/g, ' ').toLowerCase()} reported${charger ? ` at ${charger.title}` : ''}.${autoSuspend ? ' Charger auto-suspended.' : ''}`,
      data: { incidentId: incident.id },
    }));
    if (charger && charger.host.userId !== user.id) {
      alerts.push({
        userId: charger.host.userId,
        type: 'SAFETY_ALERT',
        title: 'Safety report on your charger',
        body: autoSuspend ? `${charger.title} has been suspended pending a safety review. Do not use it until cleared.` : `A ${input.severity.toLowerCase()} safety issue was reported for ${charger.title}. Our team will follow up.`,
        data: { incidentId: incident.id, chargerId: charger.id },
      });
    }
    await this.notifications.notify(alerts);
    return toIncidentDto(incident);
  }

  async myIncidents(user: AuthUser): Promise<IncidentDto[]> {
    return (await this.prisma.incidentReport.findMany({ where: { reporterId: user.id }, orderBy: { createdAt: 'desc' } })).map(toIncidentDto);
  }

  // ── Disputes ──
  async raiseDispute(user: AuthUser, input: { bookingId: string; reason: DisputeReason; description: string }): Promise<DisputeDto> {
    const s = await this.settings.get();
    const before = await this.bookings.load(input.bookingId);
    const actor = this.bookings.actorFor(user, before, false);
    if (before.status === 'COMPLETED' && before.completedAt && Date.now() - before.completedAt.getTime() > s.disputeWindowHours * 3600_000) {
      throw AppError.unprocessable('DISPUTE_WINDOW_CLOSED', `Disputes must be raised within ${s.disputeWindowHours} hours of completion. Contact support.`);
    }
    if (!canTransition(before.status, 'DISPUTED', actor.type)) {
      throw AppError.unprocessable('NOT_DISPUTABLE', 'This booking cannot be disputed in its current state. Contact support instead.');
    }
    const d = await this.prisma.$transaction(async (tx) => {
      const locked = await this.transitions.lock(tx, input.bookingId);
      const session = await tx.chargingSession.findUnique({ where: { bookingId: input.bookingId } });
      await this.transitions.transition(tx, locked, 'DISPUTED', actor, { reason: `${input.reason}: ${input.description.slice(0, 200)}` });
      return tx.dispute.create({
        data: {
          bookingId: input.bookingId,
          raisedById: user.id,
          raisedByRole: actor.type,
          reason: input.reason,
          description: input.description,
          assessment: (session?.assessment ?? undefined) as Prisma.InputJsonValue | undefined,
          previousBookingStatus: locked.status,
        },
        include: { booking: { select: { code: true } } },
      });
    });
    const hostUserId = (await this.prisma.hostProfile.findUniqueOrThrow({ where: { id: before.charger.hostId } })).userId;
    const other = actor.type === 'DRIVER' ? hostUserId : before.driverId;
    await this.notifications.notify([
      { userId: other, type: 'DISPUTE_UPDATE', title: 'Dispute opened', body: `A dispute was opened on ${before.code}. Nexvolt support will review it; related payouts are on hold.`, data: { bookingId: before.id } },
      ...(await this.staffUserIds()).map((id) => ({ userId: id, type: 'DISPUTE_UPDATE' as const, title: 'New dispute', body: `${before.code}: ${input.reason}`, data: { disputeId: d.id } })),
    ]);
    return toDisputeDto(d);
  }

  async myDisputes(user: AuthUser): Promise<DisputeDto[]> {
    const rows = await this.prisma.dispute.findMany({
      where: { OR: [{ booking: { driverId: user.id } }, ...(user.hostProfileId ? [{ booking: { charger: { hostId: user.hostProfileId } } }] : [])] },
      include: { booking: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDisputeDto);
  }
}
