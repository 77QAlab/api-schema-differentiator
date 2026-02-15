/**
 * Tests for the Report Generator
 */

import { formatReport } from '../src/core/reporter';
import { DriftReport } from '../src/core/types';

function createReport(changes: DriftReport['changes'] = []): DriftReport {
  return {
    key: 'GET /api/v2/users',
    timestamp: '2024-06-15T10:00:00Z',
    previousVersion: 1,
    currentVersion: 2,
    changes,
    summary: {
      breaking: changes.filter((c) => c.severity === 'breaking').length,
      warning: changes.filter((c) => c.severity === 'warning').length,
      info: changes.filter((c) => c.severity === 'info').length,
      total: changes.length,
    },
    compatibilityScore: 100 - changes.filter((c) => c.severity === 'breaking').length * 15,
    hasBreakingChanges: changes.some((c) => c.severity === 'breaking'),
  };
}

describe('Report Generator', () => {
  // ─── Console Format ───────────────────────────────────────────────────

  describe('Console format', () => {
    test('shows clean report when no drift', () => {
      const report = createReport();
      const output = formatReport(report, 'console');
      expect(output).toContain('No schema drift detected');
    });

    test('shows changes with severity icons', () => {
      const report = createReport([
        {
          type: 'field_removed',
          severity: 'breaking',
          path: 'role',
          message: 'Field removed: "role" (was: string)',
          before: 'string',
        },
        {
          type: 'field_added',
          severity: 'info',
          path: 'email',
          message: 'Field added: "email" (string)',
          after: 'string',
        },
      ]);

      const output = formatReport(report, 'console');
      expect(output).toContain('BREAKING');
      expect(output).toContain('INFO');
      expect(output).toContain('Summary');
    });
  });

  // ─── JSON Format ──────────────────────────────────────────────────────

  describe('JSON format', () => {
    test('produces valid JSON', () => {
      const report = createReport([
        {
          type: 'type_changed',
          severity: 'breaking',
          path: 'id',
          message: 'Type changed',
          before: 'number',
          after: 'string',
        },
      ]);

      const output = formatReport(report, 'json');
      const parsed = JSON.parse(output);
      expect(parsed.key).toBe('GET /api/v2/users');
      expect(parsed.changes).toHaveLength(1);
    });
  });

  // ─── Markdown Format ──────────────────────────────────────────────────

  describe('Markdown format', () => {
    test('produces markdown with headers', () => {
      const report = createReport([
        {
          type: 'field_removed',
          severity: 'breaking',
          path: 'role',
          message: 'Field removed',
        },
      ]);

      const output = formatReport(report, 'markdown');
      expect(output).toContain('# 🔍 Schema Drift Report');
      expect(output).toContain('## 🔴 Breaking Changes');
      expect(output).toContain('**Compatibility Score:**');
    });

    test('shows clean message when no drift', () => {
      const report = createReport();
      const output = formatReport(report, 'markdown');
      expect(output).toContain('No schema drift detected');
    });
  });

  // ─── HTML Format ──────────────────────────────────────────────────────

  describe('HTML format', () => {
    test('produces valid HTML document', () => {
      const report = createReport([
        {
          type: 'type_changed',
          severity: 'breaking',
          path: 'id',
          message: 'Type changed',
          before: 'number',
          after: 'string',
        },
      ]);

      const output = formatReport(report, 'html');
      expect(output).toContain('<!DOCTYPE html>');
      expect(output).toContain('<table>');
      expect(output).toContain('BREAKING');
    });

    test('shows no-drift message for clean report', () => {
      const report = createReport();
      const output = formatReport(report, 'html');
      expect(output).toContain('No schema drift detected');
    });

    test('escapes HTML entities', () => {
      const report = createReport([
        {
          type: 'field_added',
          severity: 'info',
          path: 'data<script>',
          message: 'Test <injection>',
        },
      ]);

      const output = formatReport(report, 'html');
      expect(output).not.toContain('<script>');
      expect(output).toContain('&lt;script&gt;');
    });
  });
});

