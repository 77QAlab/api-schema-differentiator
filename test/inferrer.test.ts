/**
 * Tests for the Schema Inference Engine
 */

import { inferSchema, mergeSchemas } from '../src/core/inferrer';
import { SchemaNode } from '../src/core/types';

describe('Schema Inference Engine', () => {
  // ─── Primitive Types ────────────────────────────────────────────────────

  describe('Primitive type inference', () => {
    test('infers string type', () => {
      const schema = inferSchema('hello');
      expect(schema.type).toBe('string');
      expect(schema.nullable).toBe(false);
    });

    test('infers number type (integer)', () => {
      const schema = inferSchema(42);
      expect(schema.type).toBe('number');
      expect(schema.nullable).toBe(false);
      expect(schema.format).toBe('integer');
    });

    test('infers number type (float)', () => {
      const schema = inferSchema(3.14);
      expect(schema.type).toBe('number');
      expect(schema.format).toBe('float');
    });

    test('infers boolean type', () => {
      const schema = inferSchema(true);
      expect(schema.type).toBe('boolean');
      expect(schema.nullable).toBe(false);
    });

    test('infers null type', () => {
      const schema = inferSchema(null);
      expect(schema.type).toBe('null');
      expect(schema.nullable).toBe(true);
    });

    test('handles undefined as unknown', () => {
      const schema = inferSchema(undefined);
      expect(schema.type).toBe('unknown');
    });
  });

  // ─── Format Hints ──────────────────────────────────────────────────────

  describe('Format hint detection', () => {
    test('detects ISO date', () => {
      const schema = inferSchema('2024-01-15');
      expect(schema.format).toBe('iso-date');
    });

    test('detects ISO datetime', () => {
      const schema = inferSchema('2024-01-15T10:30:00Z');
      expect(schema.format).toBe('iso-datetime');
    });

    test('detects ISO datetime with offset', () => {
      const schema = inferSchema('2024-01-15T10:30:00+05:30');
      expect(schema.format).toBe('iso-datetime');
    });

    test('detects UUID', () => {
      const schema = inferSchema('550e8400-e29b-41d4-a716-446655440000');
      expect(schema.format).toBe('uuid');
    });

    test('detects email', () => {
      const schema = inferSchema('user@example.com');
      expect(schema.format).toBe('email');
    });

    test('detects URL', () => {
      const schema = inferSchema('https://api.example.com/v2/users');
      expect(schema.format).toBe('url');
    });

    test('detects IPv4', () => {
      const schema = inferSchema('192.168.1.1');
      expect(schema.format).toBe('ipv4');
    });

    test('returns null format for plain strings', () => {
      const schema = inferSchema('just a regular string');
      expect(schema.format).toBeNull();
    });
  });

  // ─── Objects ───────────────────────────────────────────────────────────

  describe('Object inference', () => {
    test('infers simple flat object', () => {
      const schema = inferSchema({ id: 123, name: 'Alice' });
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.properties!['id'].type).toBe('number');
      expect(schema.properties!['name'].type).toBe('string');
      expect(schema.required).toEqual(['id', 'name']);
    });

    test('infers nested object', () => {
      const schema = inferSchema({
        user: {
          id: 1,
          profile: {
            bio: 'Hello',
            verified: true,
          },
        },
      });

      expect(schema.type).toBe('object');
      const user = schema.properties!['user'];
      expect(user.type).toBe('object');
      const profile = user.properties!['profile'];
      expect(profile.type).toBe('object');
      expect(profile.properties!['bio'].type).toBe('string');
      expect(profile.properties!['verified'].type).toBe('boolean');
    });

    test('infers empty object', () => {
      const schema = inferSchema({});
      expect(schema.type).toBe('object');
      expect(schema.properties).toEqual({});
      expect(schema.required).toEqual([]);
    });

    test('handles null values in objects', () => {
      const schema = inferSchema({ name: 'Alice', email: null });
      expect(schema.properties!['name'].type).toBe('string');
      expect(schema.properties!['email'].type).toBe('null');
      expect(schema.properties!['email'].nullable).toBe(true);
    });
  });

  // ─── Arrays ────────────────────────────────────────────────────────────

  describe('Array inference', () => {
    test('infers homogeneous string array', () => {
      const schema = inferSchema(['admin', 'user', 'moderator']);
      expect(schema.type).toBe('array');
      expect(schema.homogeneous).toBe(true);
      expect(schema.items!.type).toBe('string');
    });

    test('infers homogeneous number array', () => {
      const schema = inferSchema([1, 2, 3, 4, 5]);
      expect(schema.type).toBe('array');
      expect(schema.homogeneous).toBe(true);
      expect(schema.items!.type).toBe('number');
    });

    test('infers heterogeneous array', () => {
      const schema = inferSchema([1, 'two', true]);
      expect(schema.type).toBe('array');
      expect(schema.homogeneous).toBe(false);
      // Items should be a union
      expect(schema.items!.oneOf).toBeDefined();
    });

    test('infers empty array', () => {
      const schema = inferSchema([]);
      expect(schema.type).toBe('array');
      expect(schema.items!.type).toBe('unknown');
      expect(schema.homogeneous).toBe(true);
    });

    test('infers array of objects', () => {
      const schema = inferSchema([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ]);
      expect(schema.type).toBe('array');
      expect(schema.homogeneous).toBe(true);
      expect(schema.items!.type).toBe('object');
      expect(schema.items!.properties!['id'].type).toBe('number');
      expect(schema.items!.properties!['name'].type).toBe('string');
    });

    test('infers nested arrays', () => {
      const schema = inferSchema([[1, 2], [3, 4]]);
      expect(schema.type).toBe('array');
      expect(schema.items!.type).toBe('array');
      expect(schema.items!.items!.type).toBe('number');
    });
  });

  // ─── Real-World API Response ──────────────────────────────────────────

  describe('Real-world API response inference', () => {
    test('infers typical REST API user response', () => {
      const response = {
        id: 123,
        name: 'Alice Johnson',
        email: 'alice@example.com',
        role: 'admin',
        tags: ['admin', 'active'],
        meta: {
          created: '2024-01-01',
          last_login: '2024-06-15T10:30:00Z',
        },
        avatar_url: 'https://avatars.example.com/alice.jpg',
        verified: true,
        score: 98.5,
      };

      const schema = inferSchema(response);

      expect(schema.type).toBe('object');
      expect(schema.properties!['id'].type).toBe('number');
      expect(schema.properties!['id'].format).toBe('integer');
      expect(schema.properties!['name'].type).toBe('string');
      expect(schema.properties!['email'].format).toBe('email');
      expect(schema.properties!['tags'].type).toBe('array');
      expect(schema.properties!['tags'].items!.type).toBe('string');
      expect(schema.properties!['meta'].type).toBe('object');
      expect(schema.properties!['meta'].properties!['created'].format).toBe('iso-date');
      expect(schema.properties!['meta'].properties!['last_login'].format).toBe('iso-datetime');
      expect(schema.properties!['avatar_url'].format).toBe('url');
      expect(schema.properties!['verified'].type).toBe('boolean');
      expect(schema.properties!['score'].format).toBe('float');
    });

    test('infers paginated list response', () => {
      const response = {
        data: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        pagination: {
          page: 1,
          per_page: 20,
          total: 150,
          total_pages: 8,
        },
      };

      const schema = inferSchema(response);
      expect(schema.properties!['data'].type).toBe('array');
      expect(schema.properties!['data'].items!.type).toBe('object');
      expect(schema.properties!['pagination'].type).toBe('object');
      expect(schema.properties!['pagination'].properties!['total'].type).toBe('number');
    });
  });

  // ─── Schema Merging (Multi-Sample Learning) ───────────────────────────

  describe('Schema merging', () => {
    test('merges two identical schemas', () => {
      const a = inferSchema({ id: 1, name: 'Alice' });
      const b = inferSchema({ id: 2, name: 'Bob' });
      const merged = mergeSchemas(a, b);

      expect(merged.type).toBe('object');
      expect(merged.properties!['id'].type).toBe('number');
      expect(merged.properties!['name'].type).toBe('string');
      expect(merged.required).toEqual(['id', 'name']);
    });

    test('detects optional fields from merging', () => {
      const a = inferSchema({ id: 1, name: 'Alice', email: 'a@b.com' });
      const b = inferSchema({ id: 2, name: 'Bob' }); // no email

      const merged = mergeSchemas(a, b);

      expect(merged.required).toContain('id');
      expect(merged.required).toContain('name');
      expect(merged.required).not.toContain('email');
      expect(merged.properties!['email']).toBeDefined(); // still present
    });

    test('makes field nullable when one sample has null', () => {
      const a = inferSchema({ name: 'Alice' });
      const b = inferSchema({ name: null });

      const merged = mergeSchemas(a, b);
      expect(merged.properties!['name'].nullable).toBe(true);
    });

    test('merges different types into union', () => {
      const a = inferSchema(42);
      const b = inferSchema('hello');
      const merged = mergeSchemas(a, b);

      expect(merged.oneOf).toBeDefined();
      expect(merged.oneOf!.length).toBe(2);
    });

    test('tracks sample count', () => {
      const a = inferSchema({ id: 1 });
      const b = inferSchema({ id: 2 });
      const merged = mergeSchemas(a, b);

      expect(merged.sampleCount).toBe(2);
    });
  });
});

