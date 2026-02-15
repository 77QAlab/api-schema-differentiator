/**
 * Tests for the Schema Diff Engine
 */

import { inferSchema } from '../src/core/inferrer';
import { diffSchemas, calculateCompatibilityScore } from '../src/core/differ';
import { DriftChange } from '../src/core/types';

describe('Schema Diff Engine', () => {
  // ─── No Changes ────────────────────────────────────────────────────────

  describe('Identical schemas', () => {
    test('reports no drift for identical objects', () => {
      const before = inferSchema({ id: 1, name: 'Alice' });
      const after = inferSchema({ id: 2, name: 'Bob' });
      const changes = diffSchemas(before, after);
      expect(changes).toHaveLength(0);
    });

    test('reports no drift for identical arrays', () => {
      const before = inferSchema([1, 2, 3]);
      const after = inferSchema([4, 5, 6]);
      const changes = diffSchemas(before, after);
      expect(changes).toHaveLength(0);
    });
  });

  // ─── Field Added ──────────────────────────────────────────────────────

  describe('Field added', () => {
    test('detects new field in object', () => {
      const before = inferSchema({ id: 1, name: 'Alice' });
      const after = inferSchema({ id: 1, name: 'Alice', email: 'a@b.com' });
      const changes = diffSchemas(before, after);

      const added = changes.find((c) => c.type === 'field_added');
      expect(added).toBeDefined();
      expect(added!.path).toBe('email');
      expect(added!.severity).toBe('info');
    });

    test('detects new nested field', () => {
      const before = inferSchema({ user: { id: 1 } });
      const after = inferSchema({ user: { id: 1, role: 'admin' } });
      const changes = diffSchemas(before, after);

      const added = changes.find((c) => c.type === 'field_added');
      expect(added).toBeDefined();
      expect(added!.path).toBe('user.role');
    });
  });

  // ─── Field Removed ────────────────────────────────────────────────────

  describe('Field removed', () => {
    test('detects removed field', () => {
      const before = inferSchema({ id: 1, name: 'Alice', role: 'admin' });
      const after = inferSchema({ id: 1, name: 'Alice' });
      const changes = diffSchemas(before, after);

      const removed = changes.find((c) => c.type === 'field_removed');
      expect(removed).toBeDefined();
      expect(removed!.path).toBe('role');
      expect(removed!.severity).toBe('breaking');
    });

    test('detects removed nested field', () => {
      const before = inferSchema({ meta: { created: '2024-01-01', updated: '2024-06-01' } });
      const after = inferSchema({ meta: { created: '2024-01-01' } });
      const changes = diffSchemas(before, after);

      const removed = changes.find((c) => c.type === 'field_removed');
      expect(removed).toBeDefined();
      expect(removed!.path).toBe('meta.updated');
    });
  });

  // ─── Type Changed ────────────────────────────────────────────────────

  describe('Type changed', () => {
    test('detects type change: number → string', () => {
      const before = inferSchema({ id: 123 });
      const after = inferSchema({ id: '123' });
      const changes = diffSchemas(before, after);

      const typeChange = changes.find((c) => c.type === 'type_changed');
      expect(typeChange).toBeDefined();
      expect(typeChange!.path).toBe('id');
      expect(typeChange!.severity).toBe('breaking');
      expect(typeChange!.before).toContain('number');
      expect(typeChange!.after).toContain('string');
    });

    test('detects type change: string → boolean', () => {
      const before = inferSchema({ active: 'true' });
      const after = inferSchema({ active: true });
      const changes = diffSchemas(before, after);

      const typeChange = changes.find((c) => c.type === 'type_changed');
      expect(typeChange).toBeDefined();
      expect(typeChange!.path).toBe('active');
    });

    test('detects nesting change: string → object', () => {
      const before = inferSchema({ role: 'admin' });
      const after = inferSchema({ role: { name: 'admin', level: 5 } });
      const changes = diffSchemas(before, after);

      const nestingChange = changes.find((c) => c.type === 'nesting_changed');
      expect(nestingChange).toBeDefined();
      expect(nestingChange!.severity).toBe('breaking');
    });
  });

  // ─── Nullable Changed ────────────────────────────────────────────────

  describe('Nullable changed', () => {
    test('detects non-null → nullable', () => {
      const before = inferSchema({ name: 'Alice' });
      // Simulate nullable by modifying schema directly
      const after = inferSchema({ name: 'Alice' });
      after.properties!['name'].nullable = true;

      const changes = diffSchemas(before, after);
      const nullableChange = changes.find((c) => c.type === 'nullable_changed');
      expect(nullableChange).toBeDefined();
      expect(nullableChange!.severity).toBe('warning');
    });
  });

  // ─── Array Items Changed ──────────────────────────────────────────────

  describe('Array items changed', () => {
    test('detects array item type change', () => {
      const before = inferSchema({ tags: ['admin', 'user'] });
      const after = inferSchema({ tags: [1, 2, 3] });
      const changes = diffSchemas(before, after);

      const arrayChange = changes.find((c) => c.type === 'array_items_changed');
      expect(arrayChange).toBeDefined();
      expect(arrayChange!.path).toBe('tags');
    });
  });

  // ─── Field Renamed (Heuristic) ───────────────────────────────────────

  describe('Field renamed detection', () => {
    test('detects possible rename: role → roles (pluralization)', () => {
      const before = inferSchema({ id: 1, role: 'admin' });
      const after = inferSchema({ id: 1, roles: 'admin' });
      const changes = diffSchemas(before, after);

      const rename = changes.find((c) => c.type === 'field_renamed');
      expect(rename).toBeDefined();
      expect(rename!.before).toBe('role');
      expect(rename!.after).toBe('roles');
    });
  });

  // ─── Format Changed ──────────────────────────────────────────────────

  describe('Format changed', () => {
    test('detects format change in string field', () => {
      const before = inferSchema({ created: '2024-01-01' }); // iso-date
      const after = inferSchema({ created: '2024-01-01T10:00:00Z' }); // iso-datetime

      const changes = diffSchemas(before, after);
      const formatChange = changes.find((c) => c.type === 'format_changed');
      expect(formatChange).toBeDefined();
      expect(formatChange!.path).toBe('created');
    });
  });

  // ─── Real-World Scenario ──────────────────────────────────────────────

  describe('Real-world drift scenario', () => {
    test('detects multiple changes in API response', () => {
      const before = inferSchema({
        id: 123,
        name: 'Alice',
        role: 'admin',
        meta: { created: '2024-01-01' },
      });

      const after = inferSchema({
        id: '123', // type changed
        name: 'Alice',
        roles: ['admin'], // renamed + type changed
        meta: { created: '2024-01-01' },
        updated_at: '2024-06-15', // new field
      });

      const changes = diffSchemas(before, after);

      // Should detect: type_changed (id), field_renamed (role→roles) or field_removed+added, field_added (updated_at)
      expect(changes.length).toBeGreaterThanOrEqual(2);

      const typeChanged = changes.find(
        (c) => c.type === 'type_changed' && c.path === 'id'
      );
      expect(typeChanged).toBeDefined();

      const newField = changes.find(
        (c) => c.type === 'field_added' && c.path === 'updated_at'
      );
      expect(newField).toBeDefined();
    });
  });

  // ─── Compatibility Score ──────────────────────────────────────────────

  describe('Compatibility score', () => {
    test('returns 100 for no changes', () => {
      expect(calculateCompatibilityScore([])).toBe(100);
    });

    test('deducts 15 per breaking change', () => {
      const changes: DriftChange[] = [
        { type: 'field_removed', severity: 'breaking', path: 'x', message: '' },
      ];
      expect(calculateCompatibilityScore(changes)).toBe(85);
    });

    test('deducts 5 per warning', () => {
      const changes: DriftChange[] = [
        { type: 'nullable_changed', severity: 'warning', path: 'x', message: '' },
      ];
      expect(calculateCompatibilityScore(changes)).toBe(95);
    });

    test('deducts 1 per info', () => {
      const changes: DriftChange[] = [
        { type: 'field_added', severity: 'info', path: 'x', message: '' },
      ];
      expect(calculateCompatibilityScore(changes)).toBe(99);
    });

    test('floors at 0', () => {
      const changes: DriftChange[] = Array(10).fill({
        type: 'field_removed',
        severity: 'breaking',
        path: 'x',
        message: '',
      });
      expect(calculateCompatibilityScore(changes)).toBe(0);
    });

    test('combines severities', () => {
      const changes: DriftChange[] = [
        { type: 'field_removed', severity: 'breaking', path: 'a', message: '' },
        { type: 'nullable_changed', severity: 'warning', path: 'b', message: '' },
        { type: 'field_added', severity: 'info', path: 'c', message: '' },
      ];
      // 100 - 15 - 5 - 1 = 79
      expect(calculateCompatibilityScore(changes)).toBe(79);
    });
  });
});

