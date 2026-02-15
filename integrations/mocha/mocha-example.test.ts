/**
 * schema-sentinel + Mocha / Chai Example
 *
 * Install:  npm install schema-sentinel mocha chai
 * Run:      npx mocha schema-drift.test.ts
 */

import { expect } from 'chai';
import { SchemaGuard } from 'schema-sentinel';

const guard = new SchemaGuard({ store: './schemas' });

describe('API Schema Drift Tests', () => {
  it('GET /api/users/:id — no breaking schema drift', async () => {
    const res = await fetch('https://api.example.com/v2/users/1');
    const data = await res.json();

    const report = await guard.check('GET /api/v2/users/:id', data);

    expect(report.hasBreakingChanges).to.be.false;
    expect(report.compatibilityScore).to.be.at.least(90);
  });

  it('GET /api/products — schema is stable', async () => {
    const res = await fetch('https://api.example.com/v2/products');
    const data = await res.json();

    const report = await guard.check('GET /api/v2/products', data);

    expect(report.summary.breaking).to.equal(0);
  });
});

