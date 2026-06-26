import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, JobStatus, Prisma, PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { BillingService } from '../../src/billing/billing.service';
import { AppModule } from '../../src/app.module';
import {
  BILLING_E2E_BILLABLE_HOURS,
  BILLING_E2E_PASSWORD,
  createBillingE2eFixture,
  expectedBillingSubtotal,
} from './helpers/billing-e2e-fixture';

const runIntegration = process.env.RUN_INTEGRATION_TESTS === '1';
const describeIntegration = runIntegration ? describe : describe.skip;

async function signIn(
  app: INestApplication,
  login: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/sign-in/password')
    .send({ login, password })
    .expect((response) => {
      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`sign-in failed: ${response.status} ${JSON.stringify(response.body)}`);
      }
    });

  return res.body.data.accessToken as string;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describeIntegration('Multi-guardian billing integration (HTTP + PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let billingService: BillingService;
  let fixture: Awaited<ReturnType<typeof createBillingE2eFixture>>;

  jest.setTimeout(120_000);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }

    prisma = new PrismaClient();
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    billingService = app.get(BillingService);
    fixture = await createBillingE2eFixture(prisma, { guardianCount: 3 });
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.cleanup();
    }
    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('rejects snake_case requested_guardian_count (forbidNonWhitelisted)', async () => {
    const token = await signIn(app, fixture.ownerPhone, BILLING_E2E_PASSWORD);
    const scheduledStart = new Date(Date.now() + 3_600_000);
    const scheduledEnd = new Date(scheduledStart.getTime() + 7_200_000);

    await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set(authHeader(token))
      .send({
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        jobType: 'STANDARD_GUARDIAN',
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        requested_guardian_count: 3,
      })
      .expect(400);
  });

  it('rejects guardianCount alias (forbidNonWhitelisted)', async () => {
    const token = await signIn(app, fixture.ownerPhone, BILLING_E2E_PASSWORD);
    const scheduledStart = new Date(Date.now() + 3_600_000);
    const scheduledEnd = new Date(scheduledStart.getTime() + 7_200_000);

    await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set(authHeader(token))
      .send({
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        jobType: 'STANDARD_GUARDIAN',
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        guardianCount: 3,
      })
      .expect(400);
  });

  it('defaults requestedGuardianCount to 1 when field is omitted', async () => {
    const token = await signIn(app, fixture.ownerPhone, BILLING_E2E_PASSWORD);
    const scheduledStart = new Date(Date.now() + 3_600_000);
    const scheduledEnd = new Date(scheduledStart.getTime() + 7_200_000);

    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set(authHeader(token))
      .send({
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        jobType: 'STANDARD_GUARDIAN',
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
      })
      .expect(201);

    const jobId = res.body.data.id as string;
    const row = await prisma.job.findUnique({ where: { id: jobId } });

    expect(res.body.data.requestedGuardianCount).toBe(1);
    expect(row?.requestedGuardianCount).toBe(1);

    await prisma.outboxEvent.deleteMany({ where: { aggregateId: jobId } });
    await prisma.jobStatusHistory.deleteMany({ where: { jobId } });
    await prisma.job.delete({ where: { id: jobId } });
  });

  it('persists requestedGuardianCount=3 when camelCase field is sent', async () => {
    const token = await signIn(app, fixture.ownerPhone, BILLING_E2E_PASSWORD);
    const scheduledStart = new Date(Date.now() + 3_600_000);
    const scheduledEnd = new Date(
      scheduledStart.getTime() + BILLING_E2E_BILLABLE_HOURS * 3_600_000,
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set(authHeader(token))
      .send({
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        jobType: 'STANDARD_GUARDIAN',
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        requestedGuardianCount: 3,
      })
      .expect(201);

    const jobId = res.body.data.id as string;
    const row = await prisma.job.findUnique({ where: { id: jobId } });

    expect(res.body.data.requestedGuardianCount).toBe(3);
    expect(row?.requestedGuardianCount).toBe(3);

    await prisma.outboxEvent.deleteMany({ where: { aggregateId: jobId } });
    await prisma.jobStatusHistory.deleteMany({ where: { jobId } });
    await prisma.job.delete({ where: { id: jobId } });
  });

  it('bills rate × hours × 3 after HTTP job create and three completed guardians', async () => {
    const ownerToken = await signIn(app, fixture.ownerPhone, BILLING_E2E_PASSWORD);
    const scheduledStart = new Date('2026-06-01T08:00:00.000Z');
    const scheduledEnd = new Date('2026-06-01T10:00:00.000Z');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set(authHeader(ownerToken))
      .send({
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        jobType: 'STANDARD_GUARDIAN',
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
        requestedGuardianCount: 3,
      });

    if (createRes.status !== 201) {
      throw new Error(
        `job create failed: ${createRes.status} ${JSON.stringify(createRes.body)}`,
      );
    }

    const jobId = createRes.body.data.id as string;
    expect(createRes.body.data.requestedGuardianCount).toBe(3);

    const row = await prisma.job.findUnique({ where: { id: jobId } });
    expect(row?.requestedGuardianCount).toBe(3);

    for (let i = 0; i < fixture.guardianUsers.length; i += 1) {
      const guardian = fixture.guardianUsers[i];
      await prisma.jobAssignment.create({
        data: {
          jobId,
          guardianId: guardian.guardianId,
          assignmentRound: i + 1,
          status: AssignmentStatus.COMPLETED,
          arrivedAt: scheduledStart,
          completedAt: scheduledEnd,
          expiresAt: new Date(Date.now() + 600_000),
          payPolicyModel: 'MINIMUM_GUARANTEED',
          payMinimumHours: new Prisma.Decimal(1),
          payPolicyResolvedAt: new Date(),
          hourlyPayRateAtCommit: new Prisma.Decimal(3000),
          payApplyOnEarlyRelease: true,
        },
      });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { status: JobStatus.AWAITING_CONFIRMATION },
    });

    await billingService.createDraftInvoiceForJobId(jobId, fixture.ownerUserId);

    const invoiceRes = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/invoice`)
      .set(authHeader(ownerToken))
      .expect(200);

    const invoice = invoiceRes.body.data;
    const expectedSubtotal = expectedBillingSubtotal(3);

    expect(invoice.amounts.subtotal).toBe(String(expectedSubtotal));
    expect(invoice.billing.billableHours).toBe(String(BILLING_E2E_BILLABLE_HOURS));

    const serviceLine = invoice.lineItems.find(
      (item: { code: string }) => item.code === 'service',
    );
    expect(serviceLine?.quantity).toContain('3 guardian(s)');

    const dbInvoice = await prisma.invoice.findUnique({ where: { jobId } });
    expect(dbInvoice?.subtotal.toString()).toBe(String(expectedSubtotal));

    await prisma.guardianEarning.deleteMany({ where: { jobId } });
    await prisma.invoice.deleteMany({ where: { jobId } });
    await prisma.jobAssignment.deleteMany({ where: { jobId } });
    await prisma.jobStatusHistory.deleteMany({ where: { jobId } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: jobId } });
    await prisma.job.delete({ where: { id: jobId } });
  });
});
