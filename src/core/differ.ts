/**
 * Schema Diff Engine
 *
 * Compares two SchemaNodes and produces a list of DriftChange items
 * describing every difference between them.
 */

import { SchemaNode, DriftChange, DriftType, DriftSeverity } from './types';

// ─── Severity Mapping ───────────────────────────────────────────────────────

const SEVERITY_MAP: Record<DriftType, DriftSeverity> = {
  field_added: 'info',
  field_removed: 'breaking',
  type_changed: 'breaking',
  nullable_changed: 'warning',
  array_items_changed: 'warning',
  nesting_changed: 'breaking',
  field_renamed: 'warning',
  format_changed: 'info',
  required_changed: 'warning',
  homogeneity_changed: 'warning',
};

// ─── Helper ─────────────────────────────────────────────────────────────────

function change(
  type: DriftType,
  path: string,
  message: string,
  before?: string,
  after?: string
): DriftChange {
  return {
    type,
    severity: SEVERITY_MAP[type],
    path,
    message,
    before,
    after,
  };
}

function typeLabel(node: SchemaNode): string {
  if (node.oneOf) {
    return `oneOf(${node.oneOf.map(typeLabel).join(', ')})`;
  }
  let label = node.type;
  if (node.format) label += `<${node.format}>`;
  if (node.type === 'array' && node.items) {
    label += `<${typeLabel(node.items)}>`;
  }
  return label;
}

// ─── Rename Detection ───────────────────────────────────────────────────────

/**
 * Heuristic: if a field was removed and another added at the same level,
 * and their schemas are structurally similar, flag it as a possible rename.
 */
function detectRenames(
  removed: Map<string, SchemaNode>,
  added: Map<string, SchemaNode>,
  basePath: string
): DriftChange[] {
  const renames: DriftChange[] = [];
  const matchedRemoved = new Set<string>();
  const matchedAdded = new Set<string>();

  for (const [rKey, rSchema] of removed) {
    for (const [aKey, aSchema] of added) {
      if (matchedAdded.has(aKey)) continue;

      // Same type and similar name → possible rename
      if (rSchema.type === aSchema.type && isSimilarName(rKey, aKey)) {
        renames.push(
          change(
            'field_renamed',
            basePath ? `${basePath}.${rKey}` : rKey,
            `Field possibly renamed: "${rKey}" → "${aKey}"`,
            rKey,
            aKey
          )
        );
        matchedRemoved.add(rKey);
        matchedAdded.add(aKey);
        break;
      }
    }
  }

  return renames;
}

/**
 * Check if two field names are "similar" (e.g., 'role' vs 'roles').
 */
function isSimilarName(a: string, b: string): boolean {
  const lower_a = a.toLowerCase();
  const lower_b = b.toLowerCase();

  // Pluralization
  if (lower_a + 's' === lower_b || lower_b + 's' === lower_a) return true;
  if (lower_a + 'es' === lower_b || lower_b + 'es' === lower_a) return true;

  // CamelCase ↔ snake_case of same concept
  const normalize = (s: string) =>
    s
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/[_-]/g, '');
  if (normalize(a) === normalize(b)) return true;

  // Levenshtein distance ≤ 2 for short names
  if (a.length <= 8 && b.length <= 8 && levenshtein(lower_a, lower_b) <= 2) return true;

  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

// ─── Main Diff ──────────────────────────────────────────────────────────────

/**
 * Compare two schemas and return all detected changes.
 *
 * @param before - The previous/baseline schema
 * @param after  - The current/new schema
 * @param path   - Current JSON path (used for recursion)
 */
export function diffSchemas(
  before: SchemaNode,
  after: SchemaNode,
  path: string = ''
): DriftChange[] {
  const changes: DriftChange[] = [];

  // Type changed
  if (before.type !== after.type) {
    // Special case: nesting changed (e.g., string → object, or vice versa)
    if (
      (before.type === 'object' && after.type !== 'object') ||
      (before.type !== 'object' && after.type === 'object')
    ) {
      changes.push(
        change(
          'nesting_changed',
          path || '(root)',
          `Nesting changed at "${path || '(root)'}" (${typeLabel(before)} → ${typeLabel(after)})`,
          typeLabel(before),
          typeLabel(after)
        )
      );
    } else {
      changes.push(
        change(
          'type_changed',
          path || '(root)',
          `Type changed at "${path || '(root)'}" (${typeLabel(before)} → ${typeLabel(after)})`,
          typeLabel(before),
          typeLabel(after)
        )
      );
    }
    return changes; // Don't recurse further on different types
  }

  // Nullable changed
  if (before.nullable !== after.nullable) {
    changes.push(
      change(
        'nullable_changed',
        path || '(root)',
        `Nullable changed at "${path || '(root)'}" (${before.nullable ? 'nullable' : 'non-null'} → ${after.nullable ? 'nullable' : 'non-null'})`,
        before.nullable ? 'nullable' : 'non-null',
        after.nullable ? 'nullable' : 'non-null'
      )
    );
  }

  // Format changed
  if (before.format !== after.format) {
    changes.push(
      change(
        'format_changed',
        path || '(root)',
        `Format changed at "${path || '(root)'}" (${before.format || 'none'} → ${after.format || 'none'})`,
        before.format || 'none',
        after.format || 'none'
      )
    );
  }

  // Compare object properties
  if (before.type === 'object' && after.type === 'object') {
    const beforeProps = before.properties || {};
    const afterProps = after.properties || {};
    const beforeKeys = new Set(Object.keys(beforeProps));
    const afterKeys = new Set(Object.keys(afterProps));

    const removedFields = new Map<string, SchemaNode>();
    const addedFields = new Map<string, SchemaNode>();

    // Removed fields
    for (const key of beforeKeys) {
      if (!afterKeys.has(key)) {
        removedFields.set(key, beforeProps[key]);
      }
    }

    // Added fields
    for (const key of afterKeys) {
      if (!beforeKeys.has(key)) {
        addedFields.set(key, afterProps[key]);
      }
    }

    // Detect possible renames
    const renames = detectRenames(removedFields, addedFields, path);
    const renamedBefore = new Set(renames.map((r) => r.before!));
    const renamedAfter = new Set(renames.map((r) => r.after!));
    changes.push(...renames);

    // Report remaining removals (not detected as renames)
    for (const [key, schema] of removedFields) {
      if (!renamedBefore.has(key)) {
        const fieldPath = path ? `${path}.${key}` : key;
        changes.push(
          change(
            'field_removed',
            fieldPath,
            `Field removed: "${fieldPath}" (was: ${typeLabel(schema)})`,
            typeLabel(schema),
            undefined
          )
        );
      }
    }

    // Report remaining additions (not detected as renames)
    for (const [key, schema] of addedFields) {
      if (!renamedAfter.has(key)) {
        const fieldPath = path ? `${path}.${key}` : key;
        changes.push(
          change(
            'field_added',
            fieldPath,
            `Field added: "${fieldPath}" (${typeLabel(schema)})`,
            undefined,
            typeLabel(schema)
          )
        );
      }
    }

    // Required changed
    const beforeRequired = new Set(before.required || []);
    const afterRequired = new Set(after.required || []);

    for (const key of beforeRequired) {
      if (afterKeys.has(key) && !afterRequired.has(key)) {
        const fieldPath = path ? `${path}.${key}` : key;
        changes.push(
          change(
            'required_changed',
            fieldPath,
            `Field "${fieldPath}" changed from required to optional`,
            'required',
            'optional'
          )
        );
      }
    }

    for (const key of afterRequired) {
      if (beforeKeys.has(key) && !beforeRequired.has(key)) {
        const fieldPath = path ? `${path}.${key}` : key;
        changes.push(
          change(
            'required_changed',
            fieldPath,
            `Field "${fieldPath}" changed from optional to required`,
            'optional',
            'required'
          )
        );
      }
    }

    // Recurse into shared fields
    for (const key of beforeKeys) {
      if (afterKeys.has(key)) {
        const fieldPath = path ? `${path}.${key}` : key;
        changes.push(...diffSchemas(beforeProps[key], afterProps[key], fieldPath));
      }
    }
  }

  // Compare array items
  if (before.type === 'array' && after.type === 'array') {
    if (before.items && after.items) {
      const itemChanges = diffSchemas(before.items, after.items, path ? `${path}[]` : '[]');
      if (itemChanges.length > 0) {
        // Wrap item changes under array_items_changed if type changed
        const hasTypeChange = itemChanges.some(
          (c) => c.type === 'type_changed' || c.type === 'nesting_changed'
        );
        if (hasTypeChange) {
          changes.push(
            change(
              'array_items_changed',
              path || '(root)',
              `Array items changed at "${path || '(root)'}" (${typeLabel(before.items)} → ${typeLabel(after.items)})`,
              typeLabel(before.items),
              typeLabel(after.items)
            )
          );
        } else {
          changes.push(...itemChanges);
        }
      }
    }

    // Homogeneity changed
    if (before.homogeneous !== undefined && after.homogeneous !== undefined) {
      if (before.homogeneous !== after.homogeneous) {
        changes.push(
          change(
            'homogeneity_changed',
            path || '(root)',
            `Array homogeneity changed at "${path || '(root)'}" (${before.homogeneous ? 'homogeneous' : 'mixed'} → ${after.homogeneous ? 'homogeneous' : 'mixed'})`,
            before.homogeneous ? 'homogeneous' : 'mixed',
            after.homogeneous ? 'homogeneous' : 'mixed'
          )
        );
      }
    }
  }

  return changes;
}

/**
 * Calculate a backward compatibility score (0–100).
 *
 * - 100 = identical
 * - Deductions: breaking = -15, warning = -5, info = -1
 * - Floor at 0
 */
export function calculateCompatibilityScore(changes: DriftChange[]): number {
  let score = 100;

  for (const c of changes) {
    switch (c.severity) {
      case 'breaking':
        score -= 15;
        break;
      case 'warning':
        score -= 5;
        break;
      case 'info':
        score -= 1;
        break;
    }
  }

  return Math.max(0, score);
}

