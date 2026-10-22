import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import {
  AdminRefundSchema,
  AuditQuerySchema,
  ChargerDecisionSchema,
  CreatePayoutSchema,
  DocumentReviewSchema,
  KycDecisionSchema,
  MarkPayoutFailedSchema,
  MarkPayoutPaidSchema,
  PaginationSchema,
  ResolveDisputeSchema,
  SuspendSchema,
  UpdateIncidentSchema,
  UpdateSettingSchema,
  UpdateTicketSchema,
  VehicleCatalogSchema,
} from '@nexvolt/shared';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, ReqMeta, Roles, type RequestMeta } from '../../common/auth/decorators';
import { BookingsService } from '../bookings/bookings.service';
import { LedgerService } from '../ledger/ledger.service';
import { SettingsService } from '../settings/settings.service';
import { AdminFinanceService } from './admin-finance.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import {
  MAINTENANCE_TASKS,
  MaintenanceService,
  type MaintenanceTask,
} from '../jobs/maintenance.service';
import { AdminVerificationService } from './admin-verification.service';

class PageDto extends createZodDto(PaginationSchema) {}
class KycDecisionDto extends createZodDto(KycDecisionSchema) {}
class DocumentReviewDto extends createZodDto(DocumentReviewSchema) {}
class ChargerDecisionDto extends createZodDto(ChargerDecisionSchema) {}
class SuspendDto extends createZodDto(SuspendSchema) {}
class AdminRefundDto extends createZodDto(AdminRefundSchema) {}
class CreatePayoutDto extends createZodDto(CreatePayoutSchema) {}
class MarkPayoutPaidDto extends createZodDto(MarkPayoutPaidSchema) {}
class MarkPayoutFailedDto extends createZodDto(MarkPayoutFailedSchema) {}
class UpdateSettingDto extends createZodDto(UpdateSettingSchema) {}
class AuditQueryDto extends createZodDto(AuditQuerySchema) {}
class ResolveDisputeDto extends createZodDto(ResolveDisputeSchema) {}
class UpdateTicketDto extends createZodDto(UpdateTicketSchema) {}
class UpdateIncidentDto extends createZodDto(UpdateIncidentSchema) {}
class VehicleCatalogDto extends createZodDto(VehicleCatalogSchema) {}
class PayoutAccountDto extends createZodDto(
  z.object({ status: z.enum(['ACTIVE', 'REJECTED']), reason: z.string().trim().min(5).max(1000) }),
) {}

/**
 * Admin API. ADMIN has full access; SUPPORT can read operations data and work
 * tickets/incidents/disputes but cannot change verification, money or settings.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly verify: AdminVerificationService,
    private readonly finance: AdminFinanceService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly bookings: BookingsService,
    private readonly maintenance: MaintenanceService,
    private readonly audit: AuditService,
  ) {}

  /** Run a maintenance task now (normally scheduled by BullMQ). */
  @Post('maintenance/:task')
  @HttpCode(200)
  async runMaintenance(
    @Param('task') task: string,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    if (!(MAINTENANCE_TASKS as readonly string[]).includes(task)) throw AppError.notFound('Task');
    const r = await this.maintenance.run(task as MaintenanceTask);
    await this.audit.log({
      actor: u,
      action: 'maintenance.run',
      resourceType: 'Maintenance',
      resourceId: task,
      newValue: r,
      meta: m,
    });
    return r;
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('overview')
  overview() {
    return this.finance.overview();
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('geo')
  geo() {
    return this.finance.geo();
  }

  // ── Hosts ──
  @Roles('ADMIN', 'SUPPORT')
  @Get('hosts')
  hosts(@Query() q: PageDto) {
    return this.verify.listHosts(q);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('hosts/:id')
  host(@Param('id', ParseUUIDPipe) id: string) {
    return this.verify.hostDetail(id);
  }

  @Post('hosts/:id/kyc')
  @HttpCode(200)
  kyc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: KycDecisionDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.decideKyc(id, b.decision, b.reason, u, m);
  }

  @Post('hosts/:id/payout-account')
  @HttpCode(200)
  payoutAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: PayoutAccountDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.setPayoutAccount(id, b.status, b.reason, u, m);
  }

  @Post('hosts/:id/suspend')
  @HttpCode(200)
  suspendHost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SuspendDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.setHostSuspended(id, true, b.reason, u, m);
  }

  @Post('hosts/:id/reinstate')
  @HttpCode(200)
  reinstateHost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SuspendDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.setHostSuspended(id, false, b.reason, u, m);
  }

  // ── Documents ──
  @Get('documents')
  documents(@Query() q: PageDto) {
    return this.verify.listDocuments(q);
  }

  @Post('documents/:id/review')
  @HttpCode(200)
  reviewDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: DocumentReviewDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.reviewDocument(id, b.decision, b.notes, u, m);
  }

  // ── Chargers ──
  @Roles('ADMIN', 'SUPPORT')
  @Get('chargers')
  chargers(@Query() q: PageDto) {
    return this.verify.listChargers(q);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('chargers/:id')
  charger(@Param('id', ParseUUIDPipe) id: string) {
    return this.verify.chargerDetail(id);
  }

  @Post('chargers/:id/decision')
  @HttpCode(200)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ChargerDecisionDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.decideCharger(id, b, u, m);
  }

  @Post('chargers/:id/suspend')
  @HttpCode(200)
  suspendCharger(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SuspendDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.setChargerSuspended(id, true, b.reason, u, m);
  }

  @Post('chargers/:id/reinstate')
  @HttpCode(200)
  reinstateCharger(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SuspendDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.setChargerSuspended(id, false, b.reason, u, m);
  }

  // ── Users ──
  @Roles('ADMIN', 'SUPPORT')
  @Get('users')
  users(@Query() q: PageDto) {
    return this.verify.listUsers(q);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  suspendUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SuspendDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.setUserSuspended(id, true, b.reason, u, m);
  }

  @Post('users/:id/reinstate')
  @HttpCode(200)
  reinstateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SuspendDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.setUserSuspended(id, false, b.reason, u, m);
  }

  // ── Bookings ──
  @Roles('ADMIN', 'SUPPORT')
  @Get('bookings')
  bookingList(@Query() q: PageDto, @CurrentUser() u: AuthUser) {
    return this.finance.listBookings(q, u);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('bookings/:id')
  booking(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.finance.bookingDetail(id, u);
  }

  /** Cancels on the platform's behalf with a full refund (e.g. unsafe charger). */
  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancelBooking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SuspendDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.bookings.cancel(u, id, b.reason, m);
  }

  // ── Payments, refunds, disputes ──
  @Roles('ADMIN', 'SUPPORT')
  @Get('payments')
  payments(@Query() q: PageDto) {
    return this.finance.listPayments(q);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('refunds')
  refundList(@Query() q: PageDto) {
    return this.finance.listRefunds(q);
  }

  @Post('refunds')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  refund(@Body() b: AdminRefundDto, @CurrentUser() u: AuthUser, @ReqMeta() m: RequestMeta) {
    return this.finance.refund(b, u, m);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('disputes')
  disputes(@Query() q: PageDto) {
    return this.finance.listDisputes(q);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Post('disputes/:id/review')
  @HttpCode(200)
  reviewDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.finance.markDisputeUnderReview(id, u, m);
  }

  @Post('disputes/:id/resolve')
  @HttpCode(200)
  resolveDispute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: ResolveDisputeDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.finance.resolveDispute(id, b, u, m);
  }

  // ── Payouts ──
  @Get('payouts/eligible')
  eligible() {
    return this.ledger.eligibleBalances();
  }

  @Get('payouts')
  payouts(@Query() q: PageDto) {
    return this.ledger.payouts(q.status ? { status: q.status as never } : {}, q.limit);
  }

  @Post('payouts')
  createPayout(@Body() b: CreatePayoutDto, @CurrentUser() u: AuthUser, @ReqMeta() m: RequestMeta) {
    return this.ledger.createPayout(b.hostId, b.reason, u, m);
  }

  @Post('payouts/:id/mark-paid')
  @HttpCode(200)
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: MarkPayoutPaidDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.ledger.markPayoutPaid(id, b.externalReference, b.reason, u, m);
  }

  @Post('payouts/:id/mark-failed')
  @HttpCode(200)
  markFailed(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: MarkPayoutFailedDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.ledger.markPayoutFailed(id, b.reason, u, m);
  }

  // ── Support & incidents ──
  @Roles('ADMIN', 'SUPPORT')
  @Get('support/tickets')
  tickets(@Query() q: PageDto) {
    return this.verify.listTickets(q);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Patch('support/tickets/:id')
  updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateTicketDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.updateTicket(id, b, u, m);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Get('incidents')
  incidents(@Query() q: PageDto) {
    return this.verify.listIncidents(q);
  }

  @Roles('ADMIN', 'SUPPORT')
  @Patch('incidents/:id')
  updateIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: UpdateIncidentDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.updateIncident(id, b, u, m);
  }

  // ── Moderation & catalog ──
  @Post('reviews/:id/hide')
  @HttpCode(200)
  hideReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: SuspendDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.hideReview(id, b.reason, u, m);
  }

  @Get('vehicle-models')
  vehicleModels() {
    return this.verify.allVehicleModels();
  }

  @Post('vehicle-models')
  createVehicleModel(
    @Body() b: VehicleCatalogDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.upsertVehicleModel(null, b, u, m);
  }

  @Put('vehicle-models/:id')
  updateVehicleModel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: VehicleCatalogDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.verify.upsertVehicleModel(id, b, u, m);
  }

  // ── Settings, audit, exports ──
  @Get('settings')
  settingsList() {
    return this.settings.list();
  }

  @Put('settings/:key')
  updateSetting(
    @Param('key') key: string,
    @Body() b: UpdateSettingDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
  ) {
    return this.settings.update(key, b.value, b.reason, u, m);
  }

  @Get('audit-logs')
  auditLogs(@Query() q: AuditQueryDto) {
    return this.finance.auditLogs(q);
  }

  @Get('exports/:type')
  async export(
    @Param('type') type: string,
    @CurrentUser() u: AuthUser,
    @ReqMeta() m: RequestMeta,
    @Res() res: Response,
  ) {
    const csv = await this.finance.export(type, u, m);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="nexvolt-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }
}
