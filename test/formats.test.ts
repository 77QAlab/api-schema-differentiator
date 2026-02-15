/**
 * Tests for Format Parsers
 */

import { parseJson, isJson } from '../src/formats/json';
import { parseXml, isXml } from '../src/formats/xml';
import { parseGraphqlResponse, isGraphqlResponse } from '../src/formats/graphql';
import { autoParse } from '../src/formats';

describe('Format Parsers', () => {
  // ─── JSON Parser ──────────────────────────────────────────────────────

  describe('JSON Parser', () => {
    test('parses valid JSON object', () => {
      const result = parseJson('{"id": 1, "name": "Alice"}');
      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    test('parses valid JSON array', () => {
      const result = parseJson('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    test('handles BOM marker', () => {
      const result = parseJson('\uFEFF{"id": 1}');
      expect(result).toEqual({ id: 1 });
    });

    test('handles trailing commas (lenient)', () => {
      const result = parseJson('{"id": 1, "name": "Alice",}');
      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    test('throws on invalid JSON', () => {
      expect(() => parseJson('not json at all')).toThrow();
    });

    test('isJson detects JSON objects', () => {
      expect(isJson('{"id": 1}')).toBe(true);
    });

    test('isJson detects JSON arrays', () => {
      expect(isJson('[1, 2, 3]')).toBe(true);
    });

    test('isJson rejects non-JSON', () => {
      expect(isJson('<xml>hello</xml>')).toBe(false);
    });
  });

  // ─── XML Parser ──────────────────────────────────────────────────────

  describe('XML Parser', () => {
    test('parses simple XML', () => {
      const result = parseXml('<user><id>1</id><name>Alice</name></user>') as any;
      expect(result.user.id).toBe(1);
      expect(result.user.name).toBe('Alice');
    });

    test('parses XML with attributes', () => {
      const result = parseXml('<user id="1" active="true"><name>Alice</name></user>') as any;
      expect(result.user['@_id']).toBe(1);
      expect(result.user.name).toBe('Alice');
    });

    test('isXml detects XML', () => {
      expect(isXml('<root><child /></root>')).toBe(true);
    });

    test('isXml rejects non-XML', () => {
      expect(isXml('{"id": 1}')).toBe(false);
    });
  });

  // ─── GraphQL Parser ──────────────────────────────────────────────────

  describe('GraphQL Response Parser', () => {
    test('extracts data from GraphQL response', () => {
      const response = {
        data: { user: { id: 1, name: 'Alice' } },
        errors: null,
      };

      const result = parseGraphqlResponse(response) as any;
      expect(result.user.id).toBe(1);
      expect(result.user.name).toBe('Alice');
    });

    test('extracts data from GraphQL JSON string', () => {
      const json = '{"data": {"user": {"id": 1}}, "errors": null}';
      const result = parseGraphqlResponse(json) as any;
      expect(result.user.id).toBe(1);
    });

    test('returns as-is if no data field', () => {
      const result = parseGraphqlResponse({ id: 1 });
      expect(result).toEqual({ id: 1 });
    });

    test('isGraphqlResponse detects GraphQL responses', () => {
      expect(isGraphqlResponse({ data: {}, errors: [] })).toBe(true);
    });

    test('isGraphqlResponse rejects non-GraphQL', () => {
      expect(isGraphqlResponse({ id: 1 })).toBe(false);
    });
  });

  // ─── Auto Parser ─────────────────────────────────────────────────────

  describe('Auto Parser', () => {
    test('auto-detects and parses JSON', () => {
      const result = autoParse('{"id": 1, "name": "Alice"}');
      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    test('auto-detects and parses XML', () => {
      const result = autoParse('<user><id>1</id></user>') as any;
      expect(result.user.id).toBe(1);
    });

    test('throws on unsupported format', () => {
      expect(() => autoParse('this is plain text that cannot be parsed')).toThrow();
    });
  });
});

