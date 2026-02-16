/**
 * api-schema-differentiator
 *
 * Know when your APIs change before your users do.
 *
 * @example
 * ```typescript
 * import { SchemaGuard } from 'api-schema-differentiator';
 *
 * const guard = new SchemaGuard({ store: './schemas' });
 *
 * // First run: auto-learns and saves schema
 * // Subsequent runs: compares and reports drift
 * const report = await guard.check('GET /users/:id', responseData);
 *
 * if (report.hasBreakingChanges) {
 *   console.log(guard.format(report, 'console'));
 * }
 * ```
 */

// ─── Main API ───────────────────────────────────────────────────────────────
export { SchemaGuard } from './guard';

// ─── Core Types ─────────────────────────────────────────────────────────────
export {
  SchemaNode,
  SchemaType,
  FormatHint,
  SchemaSnapshot,
  DriftChange,
  DriftReport,
  DriftSeverity,
  DriftType,
  ReportFormat,
  SchemaStore,
  SchemaGuardOptions,
  WatchOptions,
} from './core/types';

// ─── Core Engines (for advanced usage) ──────────────────────────────────────
export { inferSchema, mergeSchemas, schemaToString } from './core/inferrer';
export { diffSchemas, calculateCompatibilityScore } from './core/differ';
export { formatReport } from './core/reporter';

// ─── Store ──────────────────────────────────────────────────────────────────
export { FileStore } from './store/file-store';

// ─── Format Parsers ─────────────────────────────────────────────────────────
export { parseJson, isJson, parseXml, isXml, parseGraphqlResponse, isGraphqlResponse, autoParse } from './formats';

