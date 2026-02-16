/**
 * api-schema-differentiator + Playwright Example
 *
 * Install:  npm install api-schema-differentiator @playwright/test
 * Run:      npx playwright test
 */

import { test, expect } from '@playwright/test';
import { SchemaGuard } from 'api-schema-differentiator';

const guard = new SchemaGuard({ store: './schemas' });

test.describe('API Schema Drift Tests', () => {
  test('GET /api/users/:id — no breaking drift', async ({ request }) => {
    const response = await request.get('https://api.example.com/v2/users/1');
    const data = await response.json();

    const report = await guard.check('GET /api/v2/users/:id', data);

    expect(report.hasBreakingChanges).toBe(false);
    expect(report.compatibilityScore).toBeGreaterThanOrEqual(90);
  });

  test('POST /api/orders — response schema stable', async ({ request }) => {
    const response = await request.post('https://api.example.com/v2/orders', {
      data: { product: 'Widget', quantity: 5 },
    });
    const data = await response.json();

    const report = await guard.check('POST /api/v2/orders', data);

    expect(report.summary.breaking).toBe(0);
  });
});

