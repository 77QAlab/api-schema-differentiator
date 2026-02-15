/**
 * Tests for the SchemaGuard main API
 */

import * as fs from 'fs';
import * as path from 'path';
import { SchemaGuard } from '../src/guard';

const TEST_STORE = path.join(__dirname, '.test-schemas');

// Clean up test store before and after tests
beforeEach(() => {
  if (fs.existsSync(TEST_STORE)) {
    fs.rmSync(TEST_STORE, { recursive: true, force: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_STORE)) {
    fs.rmSync(TEST_STORE, { recursive: true, force: true });
  }
});

describe('SchemaGuard', () => {
  // ─── Auto-Snapshot ────────────────────────────────────────────────────

  describe('Auto-snapshot on first check', () => {
    test('creates snapshot on first check', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });
      const response = { id: 1, name: 'Alice' };

      const report = await guard.check('GET /users/1', response);

      expect(report.changes).toHaveLength(0);
      expect(report.compatibilityScore).toBe(100);
      expect(report.hasBreakingChanges).toBe(false);

      // Verify snapshot was saved
      const keys = await guard.listKeys();
      expect(keys).toContain('GET /users/1');
    });

    test('does not create snapshot when autoSnapshot is false', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE, autoSnapshot: false });
      const response = { id: 1, name: 'Alice' };

      await guard.check('GET /users/1', response);

      const keys = await guard.listKeys();
      expect(keys).toHaveLength(0);
    });
  });

  // ─── Drift Detection ─────────────────────────────────────────────────

  describe('Drift detection', () => {
    test('detects drift on second check', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });

      // First check — establishes baseline
      await guard.check('GET /users/1', { id: 1, name: 'Alice', role: 'admin' });

      // Second check — with drift
      const report = await guard.check('GET /users/1', {
        id: '1', // type changed
        name: 'Alice',
        // role removed
        email: 'alice@example.com', // added
      });

      expect(report.hasBreakingChanges).toBe(true);
      expect(report.summary.breaking).toBeGreaterThan(0);
      expect(report.changes.length).toBeGreaterThan(0);
    });

    test('returns clean report when no drift', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });

      await guard.check('GET /users/1', { id: 1, name: 'Alice' });
      const report = await guard.check('GET /users/1', { id: 2, name: 'Bob' });

      expect(report.changes).toHaveLength(0);
      expect(report.compatibilityScore).toBe(100);
    });
  });

  // ─── Multi-Sample Learning ────────────────────────────────────────────

  describe('Multi-sample learning', () => {
    test('learn() accumulates samples without creating new version', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });

      await guard.learn('GET /users/1', { id: 1, name: 'Alice', email: 'a@b.com' });
      const snap = await guard.learn('GET /users/1', { id: 2, name: 'Bob' }); // no email

      expect(snap.sampleCount).toBe(2);
      // After learning from both, email should be optional
      const emailInRequired = snap.schema.required?.includes('email') ?? false;
      expect(emailInRequired).toBe(false);
    });
  });

  // ─── Direct Diff ──────────────────────────────────────────────────────

  describe('Direct data diffing', () => {
    test('diffData compares two objects directly', () => {
      const guard = new SchemaGuard({ store: TEST_STORE });

      const report = guard.diffData(
        { id: 1, name: 'Alice' },
        { id: '1', name: 'Alice', email: 'a@b.com' }
      );

      expect(report.changes.length).toBeGreaterThan(0);
      expect(report.hasBreakingChanges).toBe(true);
    });
  });

  // ─── Version History ──────────────────────────────────────────────────

  describe('Version history', () => {
    test('stores and retrieves versions', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE, autoUpdate: true });

      // Version 1
      await guard.check('GET /users/1', { id: 1, name: 'Alice' });

      // Version 2 (drift triggers auto-update)
      await guard.check('GET /users/1', { id: 1, name: 'Alice', email: 'a@b.com' });

      const versions = await guard.listVersions('GET /users/1');
      expect(versions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Report Formatting ───────────────────────────────────────────────

  describe('Report formatting', () => {
    test('formats as console output', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });
      await guard.check('GET /users/1', { id: 1, name: 'Alice' });
      const report = await guard.check('GET /users/1', { id: '1', name: 'Alice' });

      const formatted = guard.format(report, 'console');
      expect(formatted).toContain('Schema Drift Report');
    });

    test('formats as JSON', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });
      await guard.check('GET /users/1', { id: 1, name: 'Alice' });
      const report = await guard.check('GET /users/1', { id: '1', name: 'Alice' });

      const formatted = guard.format(report, 'json');
      const parsed = JSON.parse(formatted);
      expect(parsed.key).toBe('GET /users/1');
      expect(parsed.changes).toBeDefined();
    });

    test('formats as markdown', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });
      await guard.check('GET /users/1', { id: 1, name: 'Alice' });
      const report = await guard.check('GET /users/1', { id: '1', name: 'Alice' });

      const formatted = guard.format(report, 'markdown');
      expect(formatted).toContain('# 🔍 Schema Drift Report');
    });

    test('formats as HTML', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });
      await guard.check('GET /users/1', { id: 1, name: 'Alice' });
      const report = await guard.check('GET /users/1', { id: '1', name: 'Alice' });

      const formatted = guard.format(report, 'html');
      expect(formatted).toContain('<!DOCTYPE html>');
      expect(formatted).toContain('Schema Drift Report');
    });
  });

  // ─── String Input Parsing ────────────────────────────────────────────

  describe('String input parsing', () => {
    test('auto-parses JSON string input', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE });
      const jsonStr = '{"id": 1, "name": "Alice"}';

      const report = await guard.check('GET /users/1', jsonStr);
      expect(report.compatibilityScore).toBe(100);
    });
  });

  // ─── Severity Filtering ──────────────────────────────────────────────

  describe('Severity filtering', () => {
    test('filters out info changes when minSeverity is warning', async () => {
      const guard = new SchemaGuard({ store: TEST_STORE, minSeverity: 'warning' });

      await guard.check('GET /users/1', { id: 1, name: 'Alice' });
      const report = await guard.check('GET /users/1', {
        id: 1,
        name: 'Alice',
        email: 'a@b.com', // info-level addition
      });

      // The field_added change should be filtered out
      expect(report.summary.info).toBe(0);
    });
  });
});

