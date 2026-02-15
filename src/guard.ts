/**
 * SchemaGuard — Main API
 *
 * The primary entry point for schema-sentinel. Provides a simple API for:
 * - Checking API responses for schema drift
 * - Snapshotting schemas
 * - Comparing schemas
 * - Generating drift reports
 */

import {
  SchemaGuardOptions,
  SchemaStore,
  SchemaSnapshot,
  SchemaNode,
  DriftReport,
  DriftChange,
  DriftSeverity,
  ReportFormat,
} from './core/types';
import { inferSchema, mergeSchemas } from './core/inferrer';
import { diffSchemas, calculateCompatibilityScore } from './core/differ';
import { formatReport } from './core/reporter';
import { FileStore } from './store/file-store';
import { autoParse } from './formats';

// ─── SchemaGuard Class ──────────────────────────────────────────────────────

export class SchemaGuard {
  private store: SchemaStore;
  private autoSnapshot: boolean;
  private autoUpdate: boolean;
  private minSeverity: DriftSeverity;
  private metadata: Record<string, unknown>;

  constructor(options: SchemaGuardOptions) {
    // Initialize store
    if (typeof options.store === 'string') {
      this.store = new FileStore(options.store);
    } else {
      this.store = options.store;
    }

    this.autoSnapshot = options.autoSnapshot ?? true;
    this.autoUpdate = options.autoUpdate ?? false;
    this.minSeverity = options.minSeverity ?? 'info';
    this.metadata = options.metadata ?? {};
  }

  /**
   * Check a response against the stored schema for a key.
   *
   * - If no snapshot exists: auto-snapshots (if enabled) and returns a clean report.
   * - If a snapshot exists: compares and returns a drift report.
   *
   * @param key      Unique identifier for this endpoint (e.g., 'GET /api/v2/users')
   * @param response The response data (parsed object, or raw string to auto-parse)
   */
  async check(key: string, response: unknown): Promise<DriftReport> {
    // Parse string input if needed
    const data = typeof response === 'string' ? autoParse(response) : response;

    // Infer schema from current response
    const currentSchema = inferSchema(data);

    // Load existing snapshot
    const existing = await this.store.load(key);

    if (!existing) {
      // No previous snapshot — auto-snapshot and return clean report
      if (this.autoSnapshot) {
        await this.snapshot(key, data);
      }

      return this.createEmptyReport(key, 1, 1);
    }

    // Compare schemas
    const allChanges = diffSchemas(existing.schema, currentSchema);
    const changes = this.filterBySeverity(allChanges);
    const score = calculateCompatibilityScore(changes);

    const report: DriftReport = {
      key,
      timestamp: new Date().toISOString(),
      previousVersion: existing.version,
      currentVersion: existing.version + 1,
      changes,
      summary: {
        breaking: changes.filter((c) => c.severity === 'breaking').length,
        warning: changes.filter((c) => c.severity === 'warning').length,
        info: changes.filter((c) => c.severity === 'info').length,
        total: changes.length,
      },
      compatibilityScore: score,
      hasBreakingChanges: changes.some((c) => c.severity === 'breaking'),
    };

    // Auto-update if enabled and changes detected
    if (this.autoUpdate && changes.length > 0) {
      await this.snapshot(key, data, existing.version + 1);
    }

    return report;
  }

  /**
   * Snapshot the schema for a response.
   */
  async snapshot(key: string, response: unknown, version?: number): Promise<SchemaSnapshot> {
    const data = typeof response === 'string' ? autoParse(response) : response;
    const schema = inferSchema(data);

    // If a version exists, merge with existing schema for multi-sample learning
    const existing = await this.store.load(key);
    let finalSchema = schema;
    let finalVersion = version ?? 1;
    let sampleCount = 1;

    if (existing && !version) {
      // Merge with existing schema (multi-sample learning)
      finalSchema = mergeSchemas(existing.schema, schema);
      finalVersion = existing.version; // Same version, more samples
      sampleCount = (existing.sampleCount || 1) + 1;
    } else if (version) {
      finalVersion = version;
    }

    const snapshot: SchemaSnapshot = {
      key,
      schema: finalSchema,
      timestamp: new Date().toISOString(),
      version: finalVersion,
      sampleCount,
      metadata: this.metadata,
    };

    await this.store.save(snapshot);
    return snapshot;
  }

  /**
   * Explicitly learn from a new sample without triggering drift detection.
   * Used for multi-sample learning to refine required/optional fields.
   */
  async learn(key: string, response: unknown): Promise<SchemaSnapshot> {
    return this.snapshot(key, response);
  }

  /**
   * Compare two specific versions of a schema.
   */
  async diff(key: string, versionA: number, versionB: number): Promise<DriftReport> {
    const a = await this.store.loadVersion(key, versionA);
    const b = await this.store.loadVersion(key, versionB);

    if (!a) throw new Error(`Version ${versionA} not found for key "${key}"`);
    if (!b) throw new Error(`Version ${versionB} not found for key "${key}"`);

    const allChanges = diffSchemas(a.schema, b.schema);
    const changes = this.filterBySeverity(allChanges);
    const score = calculateCompatibilityScore(changes);

    return {
      key,
      timestamp: new Date().toISOString(),
      previousVersion: versionA,
      currentVersion: versionB,
      changes,
      summary: {
        breaking: changes.filter((c) => c.severity === 'breaking').length,
        warning: changes.filter((c) => c.severity === 'warning').length,
        info: changes.filter((c) => c.severity === 'info').length,
        total: changes.length,
      },
      compatibilityScore: score,
      hasBreakingChanges: changes.some((c) => c.severity === 'breaking'),
    };
  }

  /**
   * Compare two raw data objects directly (without store).
   */
  diffData(before: unknown, after: unknown): DriftReport {
    const beforeData = typeof before === 'string' ? autoParse(before) : before;
    const afterData = typeof after === 'string' ? autoParse(after) : after;

    const schemaBefore = inferSchema(beforeData);
    const schemaAfter = inferSchema(afterData);

    const allChanges = diffSchemas(schemaBefore, schemaAfter);
    const changes = this.filterBySeverity(allChanges);
    const score = calculateCompatibilityScore(changes);

    return {
      key: '(direct comparison)',
      timestamp: new Date().toISOString(),
      previousVersion: 0,
      currentVersion: 0,
      changes,
      summary: {
        breaking: changes.filter((c) => c.severity === 'breaking').length,
        warning: changes.filter((c) => c.severity === 'warning').length,
        info: changes.filter((c) => c.severity === 'info').length,
        total: changes.length,
      },
      compatibilityScore: score,
      hasBreakingChanges: changes.some((c) => c.severity === 'breaking'),
    };
  }

  /**
   * Format a drift report.
   */
  format(report: DriftReport, format: ReportFormat = 'console'): string {
    return formatReport(report, format);
  }

  /**
   * Get the schema store instance.
   */
  getStore(): SchemaStore {
    return this.store;
  }

  /**
   * List all monitored endpoint keys.
   */
  async listKeys(): Promise<string[]> {
    return this.store.listKeys();
  }

  /**
   * List all versions for a key.
   */
  async listVersions(key: string): Promise<SchemaSnapshot[]> {
    return this.store.listVersions(key);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private filterBySeverity(changes: DriftChange[]): DriftChange[] {
    const severityOrder: Record<DriftSeverity, number> = {
      info: 0,
      warning: 1,
      breaking: 2,
    };
    const minOrder = severityOrder[this.minSeverity];
    return changes.filter((c) => severityOrder[c.severity] >= minOrder);
  }

  private createEmptyReport(key: string, prevVersion: number, currentVersion: number): DriftReport {
    return {
      key,
      timestamp: new Date().toISOString(),
      previousVersion: prevVersion,
      currentVersion,
      changes: [],
      summary: { breaking: 0, warning: 0, info: 0, total: 0 },
      compatibilityScore: 100,
      hasBreakingChanges: false,
    };
  }
}

