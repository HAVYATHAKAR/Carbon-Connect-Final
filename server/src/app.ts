import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.router.js';
import { listingsRouter } from './modules/listings/listings.router.js';
import { rfqsRouter } from './modules/rfqs/rfqs.router.js';
import { bidsRouter } from './modules/bids/bids.router.js';
import { contractsRouter } from './modules/contracts/contracts.router.js';
import { paymentsRouter } from './modules/payments/payments.router.js';
import { logisticsRouter } from './modules/logistics/logistics.router.js';
import { documentsRouter } from './modules/documents/documents.router.js';
import { qualityRouter } from './modules/quality/quality.router.js';
import { passportsRouter } from './modules/passports/passports.router.js';
import { mrvRouter } from './modules/mrv/mrv.router.js';
import { complianceRouter } from './modules/compliance/compliance.router.js';
import { notificationsRouter } from './modules/notifications/notifications.router.js';
import { adminRouter } from './modules/admin/admin.router.js';
import { organizationsRouter } from './modules/organizations/organizations.router.js';
import { usersRouter } from './modules/users/users.router.js';
import { facilitiesRouter } from './modules/facilities/facilities.router.js';
import { setupNotificationHandlers } from './modules/notifications/notification.handlers.js';

export function createApp(): express.Application {
  const app = express();

  // ── Security headers ──────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production',
  }));

  // ── CORS ─────────────────────────────────────────────────
  app.use(cors({
    origin: [env.FRONTEND_ORIGIN, 'http://localhost:8443', 'http://localhost:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Idempotency-Key'],
  }));

  // ── Body parsing ──────────────────────────────────────────
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // ── Request ID ────────────────────────────────────────────
  app.use((req, _res, next) => {
    (req as express.Request & { id: string }).id =
      (req.headers['x-request-id'] as string) ?? randomUUID();
    next();
  });

  // ── Health & readiness ────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
  });

  app.get('/ready', async (_req, res) => {
    try {
      const { prisma } = await import('./db/client.js');
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable' });
    }
  });

  // ── API routes ────────────────────────────────────────────
  const api = express.Router();

  api.use('/auth', authRouter);
  api.use('/organizations', organizationsRouter);
  api.use('/users', usersRouter);
  api.use('/facilities', facilitiesRouter);
  api.use('/listings', listingsRouter);
  api.use('/rfqs', rfqsRouter);
  api.use('/bids', bidsRouter);
  api.use('/contracts', contractsRouter);
  api.use('/payments', paymentsRouter);
  api.use('/shipments', logisticsRouter);
  api.use('/documents', documentsRouter);
  api.use('/quality-records', qualityRouter);
  api.use('/passports', passportsRouter);
  api.use('/mrv-records', mrvRouter);
  api.use('/compliance', complianceRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/admin', adminRouter);

  app.use('/api/v1', api);

  // ── OpenAPI docs (dev only) ───────────────────────────────
  if (env.NODE_ENV !== 'production') {
    app.get('/api/docs', (_req, res) => {
      res.redirect('https://editor.swagger.io/?url=' + encodeURIComponent(`${env.API_BASE_URL}/api/openapi.json`));
    });
    app.get('/api/openapi.json', (_req, res) => {
      res.json(buildOpenApiSpec());
    });
  }

  // ── Event handlers (notifications) ────────────────────────
  setupNotificationHandlers();

  // ── 404 handler ───────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      data: null,
      meta: { requestId: 'unknown', timestamp: new Date().toISOString() },
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // ── Global error handler ──────────────────────────────────
  app.use(errorHandler);

  return app;
}

function buildOpenApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Carbon-Connect API',
      version: '1.0.0',
      description:
        'India-first marketplace for physical captured CO₂. ' +
        'Physical CO₂ transactions only — not carbon credits, offsets, or CCTS certificates.',
      contact: { name: 'Carbon-Connect Platform', email: 'platform@carbon-connect.example' },
    },
    servers: [{ url: '/api/v1', description: 'Current server' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication and session management' },
      { name: 'RFQs', description: 'Buyer procurement requirements' },
      { name: 'Bids', description: 'Supplier bid submission and award workflow' },
      { name: 'Listings', description: 'Supplier CO₂ listings' },
      { name: 'Contracts', description: 'Awarded contract management' },
      { name: 'Payments', description: 'Payment milestones and webhooks' },
      { name: 'Logistics', description: 'Shipment tracking' },
      { name: 'Documents', description: 'Evidence and certificate management' },
      { name: 'Quality', description: 'Batch quality records' },
      { name: 'Passports', description: 'Physical CO₂ digital passports' },
      { name: 'MRV', description: 'Measurement, Reporting and Verification records' },
      { name: 'Compliance', description: 'Regulatory context and CCTS source registry' },
      { name: 'Admin', description: 'Platform administration' },
    ],
    paths: {},
  };
}
