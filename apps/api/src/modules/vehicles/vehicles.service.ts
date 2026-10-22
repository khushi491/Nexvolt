import { Injectable } from '@nestjs/common';
import type { ConnectorType, VehicleCatalogDto, VehicleDto } from '@nexvolt/shared';
import { Prisma, type Vehicle, type VehicleConnector, type VehicleModel } from '@prisma/client';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/prisma/prisma.service';

const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d));

export function toVehicleDto(v: Vehicle & { connectors: VehicleConnector[] }): VehicleDto {
  return {
    id: v.id,
    catalogModelId: v.catalogModelId,
    manufacturer: v.manufacturer,
    model: v.model,
    nickname: v.nickname,
    connectors: v.connectors.map((c) => c.connectorType as ConnectorType),
    maxAcKw: Number(v.maxAcKw),
    maxDcKw: num(v.maxDcKw),
    isDefault: v.isDefault,
  };
}

export function toCatalogDto(m: VehicleModel): VehicleCatalogDto {
  return {
    id: m.id,
    manufacturer: m.manufacturer,
    model: m.model,
    variant: m.variant,
    connectors: m.connectors as ConnectorType[],
    maxAcKw: Number(m.maxAcKw),
    maxDcKw: num(m.maxDcKw),
    batteryKwh: num(m.batteryKwh),
    isActive: m.isActive,
  };
}

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async catalog(q?: string): Promise<VehicleCatalogDto[]> {
    const rows = await this.prisma.vehicleModel.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { manufacturer: { contains: q, mode: 'insensitive' } },
                { model: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ manufacturer: 'asc' }, { model: 'asc' }],
      take: 100,
    });
    return rows.map(toCatalogDto);
  }

  async list(ownerId: string): Promise<VehicleDto[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: { ownerId, deletedAt: null },
      include: { connectors: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(toVehicleDto);
  }

  async getOwned(ownerId: string, id: string) {
    const v = await this.prisma.vehicle.findFirst({
      where: { id, ownerId, deletedAt: null },
      include: { connectors: true },
    });
    if (!v) throw AppError.notFound('Vehicle');
    return v;
  }

  async create(
    ownerId: string,
    input: {
      catalogModelId?: string;
      manufacturer: string;
      model: string;
      nickname?: string;
      connectors: ConnectorType[];
      maxAcKw: number;
      maxDcKw?: number | null;
      isDefault?: boolean;
    },
  ): Promise<VehicleDto> {
    if (input.catalogModelId) {
      const m = await this.prisma.vehicleModel.findFirst({
        where: { id: input.catalogModelId, isActive: true },
      });
      if (!m) throw AppError.notFound('Vehicle model');
    }
    const count = await this.prisma.vehicle.count({ where: { ownerId, deletedAt: null } });
    if (count >= 10)
      throw AppError.unprocessable('VEHICLE_LIMIT', 'You can save up to 10 vehicles');
    const isDefault = input.isDefault ?? count === 0;
    const v = await this.prisma.$transaction(async (tx) => {
      if (isDefault)
        await tx.vehicle.updateMany({ where: { ownerId }, data: { isDefault: false } });
      return tx.vehicle.create({
        data: {
          ownerId,
          catalogModelId: input.catalogModelId ?? null,
          manufacturer: input.manufacturer,
          model: input.model,
          nickname: input.nickname ?? null,
          maxAcKw: new Prisma.Decimal(input.maxAcKw),
          maxDcKw: input.maxDcKw == null ? null : new Prisma.Decimal(input.maxDcKw),
          isDefault,
          connectors: { create: input.connectors.map((connectorType) => ({ connectorType })) },
        },
        include: { connectors: true },
      });
    });
    return toVehicleDto(v);
  }

  async update(
    ownerId: string,
    id: string,
    input: {
      nickname?: string;
      connectors?: ConnectorType[];
      maxAcKw?: number;
      maxDcKw?: number | null;
      isDefault?: boolean;
    },
  ): Promise<VehicleDto> {
    await this.getOwned(ownerId, id);
    const v = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault)
        await tx.vehicle.updateMany({ where: { ownerId }, data: { isDefault: false } });
      if (input.connectors) {
        await tx.vehicleConnector.deleteMany({ where: { vehicleId: id } });
        await tx.vehicleConnector.createMany({
          data: [...new Set(input.connectors)].map((connectorType) => ({
            vehicleId: id,
            connectorType,
          })),
        });
      }
      return tx.vehicle.update({
        where: { id },
        data: {
          nickname: input.nickname,
          maxAcKw: input.maxAcKw == null ? undefined : new Prisma.Decimal(input.maxAcKw),
          maxDcKw:
            input.maxDcKw === undefined
              ? undefined
              : input.maxDcKw === null
                ? null
                : new Prisma.Decimal(input.maxDcKw),
          isDefault: input.isDefault,
        },
        include: { connectors: true },
      });
    });
    return toVehicleDto(v);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.getOwned(ownerId, id);
    // Soft delete: historical bookings keep their vehicle reference.
    await this.prisma.vehicle.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }
}
