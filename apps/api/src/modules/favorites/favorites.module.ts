import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ChargerPublicDto } from '@nexvolt/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChargerMapper, PUBLIC_INCLUDE } from '../chargers/charger.mapper';
import { PublicChargersService } from '../chargers/public-chargers.service';

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chargers: PublicChargersService,
    private readonly mapper: ChargerMapper,
  ) {}

  /** Only currently discoverable chargers are listed; hidden ones simply drop out. */
  async list(user: AuthUser): Promise<ChargerPublicDto[]> {
    const favs = await this.prisma.favorite.findMany({
      where: {
        userId: user.id,
        charger: { status: 'VERIFIED', isPublished: true, host: { suspendedAt: null } },
      },
      include: { charger: { include: PUBLIC_INCLUDE } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      favs.map(async (f) => ({ ...(await this.mapper.toPublic(f.charger)), isFavorite: true })),
    );
  }

  async add(user: AuthUser, chargerId: string): Promise<void> {
    await this.chargers.getDiscoverable(chargerId);
    await this.prisma.favorite.upsert({
      where: { userId_chargerId: { userId: user.id, chargerId } },
      create: { userId: user.id, chargerId },
      update: {},
    });
  }

  async remove(user: AuthUser, chargerId: string): Promise<void> {
    await this.prisma.favorite.deleteMany({ where: { userId: user.id, chargerId } });
  }
}

@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.favorites.list(user);
  }

  @Put(':chargerId')
  @HttpCode(204)
  async add(@CurrentUser() user: AuthUser, @Param('chargerId', ParseUUIDPipe) chargerId: string) {
    await this.favorites.add(user, chargerId);
  }

  @Delete(':chargerId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('chargerId', ParseUUIDPipe) chargerId: string,
  ) {
    await this.favorites.remove(user, chargerId);
  }
}

@Module({ controllers: [FavoritesController], providers: [FavoritesService] })
export class FavoritesModule {}
