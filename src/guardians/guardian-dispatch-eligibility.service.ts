import { Injectable } from '@nestjs/common';
import { AssignmentStatus, Prisma } from '@prisma/client';
import { normalizeDistrict } from '../common/district.util';
import { PresenceService } from '../redis/presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { DISPATCH_POOL_SIZE } from '../queue/queue.constants';

type GuardianRow = { id: string };

const TERMINAL_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.DECLINED,
  AssignmentStatus.EXPIRED,
  AssignmentStatus.CANCELLED,
];

@Injectable()
export class GuardianDispatchEligibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  normalizeDistrict(district: string): string {
    return normalizeDistrict(district);
  }

  async countEligibleGuardians(
    district: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    const normalized = this.normalizeDistrict(district);
    const rows = await db.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM guardian.guardians g
      INNER JOIN guardian.guardian_shift_state s ON s.guardian_id = g.id
      WHERE s.shift_status = 'AVAILABLE'
        AND s.available_for_jobs = true
        AND g.status = 'ACTIVE'
        AND g.verification_status = 'VERIFIED'
        AND (
          LOWER(TRIM(g.district_base)) = ${normalized}
          OR EXISTS (
            SELECT 1 FROM unnest(g.coverage_districts) AS d(val)
            WHERE LOWER(TRIM(d.val)) = ${normalized}
          )
        )
        AND EXISTS (
          SELECT 1 FROM guardian.certifications c
          WHERE c.guardian_id = g.id
            AND c.verification_status = 'VERIFIED'
            AND (c.expiry_date IS NULL OR c.expiry_date >= CURRENT_DATE)
        )
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async listEligibleGuardianIds(
    district: string,
    limit: number,
    excludeIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<GuardianRow[]> {
    const db = tx ?? this.prisma;
    const normalized = this.normalizeDistrict(district);
    const poolLimit = limit + excludeIds.length;

    const rows = await db.$queryRaw<GuardianRow[]>`
      SELECT g.id::text AS id
      FROM guardian.guardians g
      INNER JOIN guardian.guardian_shift_state s ON s.guardian_id = g.id
      WHERE s.shift_status = 'AVAILABLE'
        AND s.available_for_jobs = true
        AND g.status = 'ACTIVE'
        AND g.verification_status = 'VERIFIED'
        AND (
          LOWER(TRIM(g.district_base)) = ${normalized}
          OR EXISTS (
            SELECT 1 FROM unnest(g.coverage_districts) AS d(val)
            WHERE LOWER(TRIM(d.val)) = ${normalized}
          )
        )
        AND EXISTS (
          SELECT 1 FROM guardian.certifications c
          WHERE c.guardian_id = g.id
            AND c.verification_status = 'VERIFIED'
            AND (c.expiry_date IS NULL OR c.expiry_date >= CURRENT_DATE)
        )
      ORDER BY g.reliability_score DESC
      FOR UPDATE OF g SKIP LOCKED
      LIMIT ${poolLimit}
    `;

    return rows.filter((row) => !excludeIds.includes(row.id));
  }

  async getTriedGuardianIds(
    jobId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Set<string>> {
    const db = tx ?? this.prisma;
    const attempts = await db.jobAssignment.findMany({
      where: {
        jobId,
        status: { in: TERMINAL_ASSIGNMENT_STATUSES },
      },
      select: { guardianId: true },
    });
    return new Set(attempts.map((a) => a.guardianId));
  }

  async getExcludedGuardianIds(
    jobId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    return [...(await this.getTriedGuardianIds(jobId, tx))];
  }

  async hasActiveOffer(jobId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
    const db = tx ?? this.prisma;
    const active = await db.jobAssignment.findFirst({
      where: { jobId, status: AssignmentStatus.OFFERED },
      select: { id: true },
    });
    return Boolean(active);
  }

  filterReachable(guardianIds: string[]): Promise<string[]> {
    return this.presence.filterReachableGuardianIds(guardianIds);
  }

  defaultPoolLimit(): number {
    return DISPATCH_POOL_SIZE;
  }

  async pickNextReachableGuardian(
    district: string,
    jobId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{
    guardian: GuardianRow | null;
    excludedCount: number;
    poolCount: number;
    candidateCount: number;
    reachableCount: number;
    eligibleIds: string[];
    reachableIds: string[];
  }> {
    const excludedGuardianIds = await this.getExcludedGuardianIds(jobId, tx);
    const candidates = await this.listEligibleGuardianIds(
      district,
      DISPATCH_POOL_SIZE,
      excludedGuardianIds,
      tx,
    );
    const eligibleIds = candidates.map((c) => c.id);

    if (!candidates.length) {
      return {
        guardian: null,
        excludedCount: excludedGuardianIds.length,
        poolCount: excludedGuardianIds.length,
        candidateCount: 0,
        reachableCount: 0,
        eligibleIds: [],
        reachableIds: [],
      };
    }

    const reachableIds = await this.filterReachable(eligibleIds);
    const chosen = candidates.find((r) => reachableIds.includes(r.id));
    return {
      guardian: chosen ?? null,
      excludedCount: excludedGuardianIds.length,
      poolCount: candidates.length + excludedGuardianIds.length,
      candidateCount: candidates.length,
      reachableCount: reachableIds.length,
      eligibleIds,
      reachableIds,
    };
  }

  async pickParallelReachableGuardians(
    district: string,
    jobId: string,
    count: number,
    tx: Prisma.TransactionClient,
  ): Promise<{
    guardians: GuardianRow[];
    excludedCount: number;
    candidateCount: number;
    reachableCount: number;
    eligibleIds: string[];
    reachableIds: string[];
  }> {
    const excludedGuardianIds = await this.getExcludedGuardianIds(jobId, tx);
    const candidates = await this.listEligibleGuardianIds(
      district,
      DISPATCH_POOL_SIZE,
      excludedGuardianIds,
      tx,
    );
    const eligibleIds = candidates.map((c) => c.id);
    const reachableIds = await this.filterReachable(eligibleIds);
    const guardians = candidates
      .filter((r) => reachableIds.includes(r.id))
      .slice(0, count);

    return {
      guardians,
      excludedCount: excludedGuardianIds.length,
      candidateCount: candidates.length,
      reachableCount: reachableIds.length,
      eligibleIds,
      reachableIds,
    };
  }
}
