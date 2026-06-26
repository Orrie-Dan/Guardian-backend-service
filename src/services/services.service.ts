import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobType, Prisma } from '@prisma/client';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { ServiceResponseDto } from './dto/service-response.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

function toServiceResponse(service: {
  id: string;
  code: JobType;
  name: string;
  description: string | null;
  hourlyRate: Prisma.Decimal;
  currency: string;
  isActive: boolean;
  requiresLicense: boolean;
}): ServiceResponseDto {
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    description: service.description,
    hourlyRate: service.hourlyRate.toString(),
    currency: service.currency,
    isActive: service.isActive,
    requiresLicense: service.requiresLicense,
  };
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listActive(): Promise<ServiceResponseDto[]> {
    return this.prisma.service
      .findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })
      .then((rows) => rows.map(toServiceResponse));
  }

  listAll() {
    return this.prisma.service.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getByCode(code: JobType) {
    const service = await this.prisma.service.findUnique({ where: { code } });
    if (!service || !service.isActive) {
      throw new NotFoundException(`Service not found for type ${code}`);
    }
    return service;
  }

  async getHourlyRateForJobType(code: JobType): Promise<{
    hourlyRate: Prisma.Decimal;
    currency: string;
    serviceName: string;
  }> {
    const service = await this.getByCode(code);
    return {
      hourlyRate: service.hourlyRate,
      currency: service.currency,
      serviceName: service.name,
    };
  }

  async create(dto: CreateServiceDto, actorUserId: string) {
    const existing = await this.prisma.service.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Service already exists for ${dto.code}`);
    }

    const service = await this.prisma.service.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        hourlyRate: dto.hourlyRate,
        isActive: dto.isActive ?? true,
        requiresLicense: dto.requiresLicense ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'SERVICE_CREATED',
      entityType: 'billing.services',
      entityId: service.id,
      afterState: { code: service.code, hourlyRate: service.hourlyRate.toString() },
    });

    return service;
  }

  async update(id: string, dto: UpdateServiceDto, actorUserId: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const updated = await this.prisma.service.update({
      where: { id },
      data: dto,
    });

    await this.audit.log({
      actorUserId,
      action: 'SERVICE_UPDATED',
      entityType: 'billing.services',
      entityId: id,
      beforeState: { hourlyRate: service.hourlyRate.toString() },
      afterState: { hourlyRate: updated.hourlyRate.toString() },
    });

    return updated;
  }

  async remove(id: string, actorUserId: string) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    await this.prisma.service.delete({ where: { id } });

    await this.audit.log({
      actorUserId,
      action: 'SERVICE_DELETED',
      entityType: 'billing.services',
      entityId: id,
      beforeState: { code: service.code },
    });

    return { deleted: true };
  }
}
