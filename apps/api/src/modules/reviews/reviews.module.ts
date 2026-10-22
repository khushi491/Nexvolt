import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateReviewSchema, ReviewReplySchema, type ReviewDto } from '@nexvolt/shared';
import type { Review } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { AppError, isUniqueViolation } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

class CreateReviewDto extends createZodDto(CreateReviewSchema) {}
class ReviewReplyDto extends createZodDto(ReviewReplySchema) {}

const toDto = (r: Review & { author: { name: string | null } }): ReviewDto => ({
  id: r.id,
  bookingId: r.bookingId,
  chargerId: r.chargerId,
  rating: r.rating,
  comment: r.comment,
  authorName: (r.author.name ?? 'Nexvolt driver').split(' ')[0]!,
  hostReply: r.hostReply,
  createdAt: r.createdAt.toISOString(),
});

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Only the driver of a completed booking can review it, once. Aggregates update atomically. */
  async create(
    user: AuthUser,
    input: { bookingId: string; rating: number; comment?: string },
  ): Promise<ReviewDto> {
    const b = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      include: { charger: true },
    });
    if (!b || b.driverId !== user.id) throw AppError.notFound('Booking');
    if (!['COMPLETED', 'SETTLED'].includes(b.status))
      throw AppError.unprocessable(
        'NOT_REVIEWABLE',
        'You can review after the charging session is completed',
      );
    try {
      const r = await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            bookingId: b.id,
            authorId: user.id,
            chargerId: b.chargerId,
            rating: input.rating,
            comment: input.comment ?? null,
          },
          include: { author: { select: { name: true } } },
        });
        await tx.charger.update({
          where: { id: b.chargerId },
          data: { ratingSum: { increment: input.rating }, ratingCount: { increment: 1 } },
        });
        await tx.hostProfile.update({
          where: { id: b.charger.hostId },
          data: { ratingSum: { increment: input.rating }, ratingCount: { increment: 1 } },
        });
        return review;
      });
      return toDto(r);
    } catch (e) {
      if (isUniqueViolation(e))
        throw AppError.conflict('ALREADY_REVIEWED', 'You already reviewed this booking');
      throw e;
    }
  }

  async reply(user: AuthUser, id: string, reply: string): Promise<ReviewDto> {
    const r = await this.prisma.review.findUnique({ where: { id }, include: { charger: true } });
    if (!r || r.charger.hostId !== user.hostProfileId) throw AppError.notFound('Review');
    if (r.hostReply)
      throw AppError.conflict('ALREADY_REPLIED', 'You already replied to this review');
    return toDto(
      await this.prisma.review.update({
        where: { id },
        data: { hostReply: reply },
        include: { author: { select: { name: true } } },
      }),
    );
  }

  async mine(user: AuthUser): Promise<ReviewDto[]> {
    const rows = await this.prisma.review.findMany({
      where: { authorId: user.id },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  async forHost(user: AuthUser): Promise<ReviewDto[]> {
    if (!user.hostProfileId) throw AppError.forbidden('Complete host onboarding first');
    const rows = await this.prisma.review.findMany({
      where: { charger: { hostId: user.hostProfileId } },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toDto);
  }
}

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateReviewDto) {
    return this.reviews.create(user, body);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.reviews.mine(user);
  }

  @Roles('HOST')
  @Get('host')
  host(@CurrentUser() user: AuthUser) {
    return this.reviews.forHost(user);
  }

  @Roles('HOST')
  @Post(':id/reply')
  reply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReviewReplyDto,
  ) {
    return this.reviews.reply(user, id, body.reply);
  }
}

@Module({ controllers: [ReviewsController], providers: [ReviewsService] })
export class ReviewsModule {}
