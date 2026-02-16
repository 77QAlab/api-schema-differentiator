/**
 * api-schema-differentiator + Jest Example
 *
 * Install:  npm install api-schema-differentiator
 * Run:      npx jest schema-drift.test.ts
 */

import { SchemaGuard } from 'api-schema-differentiator';

const guard = new SchemaGuard({ store: './schemas' });

describe('API Schema Drift Tests', () => {
  test('GET /api/users/:id — no breaking schema drift', async () => {
    const res = await fetch('https://api.example.com/v2/users/1');
    const data = await res.json();

    const report = await guard.check('GET /api/v2/users/:id', data);

    expect(report.hasBreakingChanges).toBe(false);
    expect(report.compatibilityScore).toBeGreaterThanOrEqual(90);

    // Optional: print warnings
    if (report.summary.warning > 0) {
      console.warn(guard.format(report, 'console'));
    }
  });

  test('GET /api/products — no breaking schema drift', async () => {
    const res = await fetch('https://api.example.com/v2/products');
    const data = await res.json();

    const report = await guard.check('GET /api/v2/products', data);

    expect(report.hasBreakingChanges).toBe(false);
  });

  test('POST /api/orders — response schema is stable', async () => {
    const res = await fetch('https://api.example.com/v2/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: 'Widget', quantity: 5 }),
    });
    const data = await res.json();

    const report = await guard.check('POST /api/v2/orders', data);

    expect(report.summary.breaking).toBe(0);
  });
});

