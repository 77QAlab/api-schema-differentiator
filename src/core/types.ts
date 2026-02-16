/**
 * Canonical schema type definitions for api-schema-differentiator.
 * These types represent the internal schema format used across the tool.
 */

// ─── Primitive & Composite Types ────────────────────────────────────────────

export type SchemaType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'object'
  | 'array'
  | 'unknown';

export type FormatHint =
  | 'iso-date'
  | 'iso-datetime'
  | 'uuid'
  | 'email'
  | 'url'
  | 'uri'
  | 'ipv4'
  | 'ipv6'
  | 'unix-timestamp'
  | 'integer'
  | 'float'
  | null;

// ─── Schema Node ────────────────────────────────────────────────────────────

export interface SchemaNode {
  /** Primary type of this node */
  type: SchemaType;

  /** Whether this field can be null */
  nullable: boolean;

  /** Format hint for strings/numbers (e.g., 'iso-date', 'uuid', 'email') */
  format?: FormatHint;

  /** For objects: child properties */
  properties?: Record<string, SchemaNode>;

  /** For objects: which keys are required (present in every sample) */
  required?: string[];

  /** For arrays: schema of array items */
  items?: SchemaNode;

  /** For arrays: whether items are homogeneous (all same type) */
  homogeneous?: boolean;

  /** For union types (field seen as multiple types across samples) */
  oneOf?: SchemaNode[];

  /** Number of samples this node was inferred from */
  sampleCount?: number;
}

// ─── Schema Snapshot ────────────────────────────────────────────────────────

export interface SchemaSnapshot {
  /** Unique key for this endpoint/schema (e.g., 'GET /api/v2/users') */
  key: string;

  /** The inferred schema */
  schema: SchemaNode;

  /** ISO timestamp when this snapshot was created */
  timestamp: string;

  /** Version number (incremented on each change) */
  version: number;

  /** Number of response samples used to infer this schema */
  sampleCount: number;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ─── Drift Detection ────────────────────────────────────────────────────────

export type DriftSeverity = 'breaking' | 'warning' | 'info';

export type DriftType =
  | 'field_added'
  | 'field_removed'
  | 'type_changed'
  | 'nullable_changed'
  | 'array_items_changed'
  | 'nesting_changed'
  | 'field_renamed'
  | 'format_changed'
  | 'required_changed'
  | 'homogeneity_changed';

export interface DriftChange {
  /** Type of drift */
  type: DriftType;

  /** Severity of this change */
  severity: DriftSeverity;

  /** JSON path to the affected field (e.g., 'user.address.city') */
  path: string;

  /** Human-readable description of the change */
  message: string;

  /** Previous value/state (for context) */
  before?: string;

  /** New value/state (for context) */
  after?: string;
}

// ─── Drift Report ───────────────────────────────────────────────────────────

export interface DriftReport {
  /** The endpoint/schema key */
  key: string;

  /** Timestamp of the comparison */
  timestamp: string;

  /** Previous schema version */
  previousVersion: number;

  /** Current schema version */
  currentVersion: number;

  /** All detected changes */
  changes: DriftChange[];

  /** Summary counts */
  summary: {
    breaking: number;
    warning: number;
    info: number;
    total: number;
  };

  /** Backward compatibility score (0-100) */
  compatibilityScore: number;

  /** Whether any breaking changes were found */
  hasBreakingChanges: boolean;
}

// ─── Report Format ──────────────────────────────────────────────────────────

export type ReportFormat = 'console' | 'json' | 'markdown' | 'html';

// ─── Store Interface ────────────────────────────────────────────────────────

export interface SchemaStore {
  /** Save a schema snapshot */
  save(snapshot: SchemaSnapshot): Promise<void>;

  /** Load the latest snapshot for a key */
  load(key: string): Promise<SchemaSnapshot | null>;

  /** Load a specific version */
  loadVersion(key: string, version: number): Promise<SchemaSnapshot | null>;

  /** List all versions for a key */
  listVersions(key: string): Promise<SchemaSnapshot[]>;

  /** List all known keys */
  listKeys(): Promise<string[]>;

  /** Delete a key and all its versions */
  delete(key: string): Promise<void>;
}

// ─── Guard Options ──────────────────────────────────────────────────────────

export interface SchemaGuardOptions {
  /** Path to store directory or a custom SchemaStore instance */
  store: string | SchemaStore;

  /** Whether to auto-save on first check (default: true) */
  autoSnapshot?: boolean;

  /** Whether to auto-update snapshot when drift is detected (default: false) */
  autoUpdate?: boolean;

  /** Minimum severity to include in reports (default: 'info') */
  minSeverity?: DriftSeverity;

  /** Custom metadata to include with snapshots */
  metadata?: Record<string, unknown>;
}

// ─── Watch Mode Options ─────────────────────────────────────────────────────

export interface WatchOptions {
  /** URL to poll */
  url: string;

  /** HTTP headers */
  headers?: Record<string, string>;

  /** HTTP method (default: GET) */
  method?: string;

  /** Request body (for POST, etc.) */
  body?: string;

  /** Poll interval in ms (default: 3600000 = 1 hour) */
  interval?: number;

  /** Webhook URL for alerts */
  alertWebhook?: string;

  /** Minimum severity to alert on (default: 'warning') */
  alertSeverity?: DriftSeverity;
}

