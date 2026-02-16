/**
 * api-schema-differentiator + Supertest (Express.js testing) Example
 *
 * Install:  npm install api-schema-differentiator supertest
 * Run:      npx jest supertest-schema.test.ts
 */

import request from 'supertest';
import { SchemaGuard } from 'api-schema-differentiator';
import app from '../src/app'; // your Express app

const guard = new SchemaGuard({ store: './schemas' });

describe('API Schema Drift Tests (Supertest)', () => {
  test('GET /api/users/:id — no schema drift', async () => {
    const res = await request(app).get('/api/users/1').expect(200);

    const report = await guard.check('GET /api/users/:id', res.body);

    expect(report.hasBreakingChanges).toBe(false);
    expect(report.compatibilityScore).toBeGreaterThanOrEqual(90);
  });

  test('POST /api/orders — response schema stable', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ product: 'Widget', quantity: 5 })
      .expect(201);

    const report = await guard.check('POST /api/orders', res.body);

    expect(report.summary.breaking).toBe(0);
  });
});

