/**
 * Schema Inference Engine
 *
 * Takes any API response (parsed data) and produces a canonical SchemaNode.
 * Supports recursive objects, arrays, nullable detection, format hints,
 * and multi-sample learning (merging schemas from multiple responses).
 */

import { SchemaNode, SchemaType, FormatHint } from './types';

// ─── Format Detection Patterns ──────────────────────────────────────────────

const FORMAT_PATTERNS: Array<{ format: FormatHint; pattern: RegExp }> = [
  {
    format: 'iso-datetime',
    pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
  },
  {
    format: 'iso-date',
    pattern: /^\d{4}-\d{2}-\d{2}$/,
  },
  {
    format: 'uuid',
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  },
  {
    format: 'email',
    pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  },
  {
    format: 'url',
    pattern: /^https?:\/\/[^\s/$.?#].[^\s]*$/,
  },
  {
    format: 'ipv4',
    pattern: /^(\d{1,3}\.){3}\d{1,3}$/,
  },
  {
    format: 'ipv6',
    pattern: /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
  },
];

// ─── Type Detection ─────────────────────────────────────────────────────────

function detectType(value: unknown): SchemaType {
  if (value === null) return 'null';
  if (value === undefined) return 'unknown';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'object') return 'object';
  return 'unknown';
}

function detectFormat(value: string): FormatHint {
  for (const { format, pattern } of FORMAT_PATTERNS) {
    if (pattern.test(value)) return format;
  }
  return null;
}

function detectNumberFormat(value: number): FormatHint {
  if (Number.isInteger(value)) return 'integer';
  return 'float';
}

// ─── Schema Inference ───────────────────────────────────────────────────────

/**
 * Infer a SchemaNode from a single value.
 */
export function inferSchema(value: unknown): SchemaNode {
  const type = detectType(value);

  switch (type) {
    case 'null':
      return { type: 'null', nullable: true, sampleCount: 1 };

    case 'string': {
      const strVal = value as string;
      return {
        type: 'string',
        nullable: false,
        format: detectFormat(strVal),
        sampleCount: 1,
      };
    }

    case 'number': {
      const numVal = value as number;
      return {
        type: 'number',
        nullable: false,
        format: detectNumberFormat(numVal),
        sampleCount: 1,
      };
    }

    case 'boolean':
      return { type: 'boolean', nullable: false, sampleCount: 1 };

    case 'array':
      return inferArraySchema(value as unknown[]);

    case 'object':
      return inferObjectSchema(value as Record<string, unknown>);

    default:
      return { type: 'unknown', nullable: false, sampleCount: 1 };
  }
}

/**
 * Infer schema for an array value.
 */
function inferArraySchema(arr: unknown[]): SchemaNode {
  if (arr.length === 0) {
    return {
      type: 'array',
      nullable: false,
      items: { type: 'unknown', nullable: false },
      homogeneous: true,
      sampleCount: 1,
    };
  }

  // Infer schema for each item
  const itemSchemas = arr.map(inferSchema);

  // Check homogeneity — are all items the same type?
  const types = new Set(itemSchemas.map((s) => s.type));
  const homogeneous = types.size === 1;

  // Merge all item schemas into one
  let mergedItems: SchemaNode;
  if (homogeneous) {
    mergedItems = itemSchemas.reduce((merged, schema) => mergeSchemas(merged, schema));
  } else {
    // Heterogeneous: create a union
    mergedItems = createUnionSchema(itemSchemas);
  }

  return {
    type: 'array',
    nullable: false,
    items: mergedItems,
    homogeneous,
    sampleCount: 1,
  };
}

/**
 * Infer schema for an object value.
 */
function inferObjectSchema(obj: Record<string, unknown>): SchemaNode {
  const properties: Record<string, SchemaNode> = {};
  const keys = Object.keys(obj);

  for (const key of keys) {
    properties[key] = inferSchema(obj[key]);
  }

  return {
    type: 'object',
    nullable: false,
    properties,
    required: keys, // On a single sample, all present keys are "required"
    sampleCount: 1,
  };
}

// ─── Schema Merging (Multi-Sample Learning) ─────────────────────────────────

/**
 * Merge two schemas to learn from multiple samples.
 * This handles optional/required field detection, nullable drift, union types, etc.
 */
export function mergeSchemas(a: SchemaNode, b: SchemaNode): SchemaNode {
  const sampleCount = (a.sampleCount || 1) + (b.sampleCount || 1);

  // If one is null, merge with the other making it nullable
  if (a.type === 'null' && b.type === 'null') {
    return { type: 'null', nullable: true, sampleCount };
  }
  if (a.type === 'null') {
    return { ...b, nullable: true, sampleCount };
  }
  if (b.type === 'null') {
    return { ...a, nullable: true, sampleCount };
  }

  // If unknown, adopt the other
  if (a.type === 'unknown') return { ...b, sampleCount };
  if (b.type === 'unknown') return { ...a, sampleCount };

  // Different types -> union
  if (a.type !== b.type) {
    return createUnionSchema([a, b]);
  }

  // Same type — merge specifics
  const nullable = a.nullable || b.nullable;

  switch (a.type) {
    case 'string':
    case 'number':
    case 'boolean': {
      const format = a.format === b.format ? a.format : null;
      return { type: a.type, nullable, format, sampleCount };
    }

    case 'array': {
      const items =
        a.items && b.items
          ? mergeSchemas(a.items, b.items)
          : a.items || b.items || { type: 'unknown' as SchemaType, nullable: false };
      const homogeneous = (a.homogeneous ?? true) && (b.homogeneous ?? true) && items.type !== 'unknown';
      return { type: 'array', nullable, items, homogeneous, sampleCount };
    }

    case 'object': {
      return mergeObjectSchemas(a, b, sampleCount);
    }

    default:
      return { type: a.type, nullable, sampleCount };
  }
}

/**
 * Merge two object schemas, handling required/optional fields.
 */
function mergeObjectSchemas(a: SchemaNode, b: SchemaNode, sampleCount: number): SchemaNode {
  const aProps = a.properties || {};
  const bProps = b.properties || {};
  const aRequired = new Set(a.required || []);
  const bRequired = new Set(b.required || []);

  const allKeys = new Set([...Object.keys(aProps), ...Object.keys(bProps)]);
  const properties: Record<string, SchemaNode> = {};
  const required: string[] = [];

  for (const key of allKeys) {
    const inA = key in aProps;
    const inB = key in bProps;

    if (inA && inB) {
      // Present in both — merge the schemas
      properties[key] = mergeSchemas(aProps[key], bProps[key]);
      // Required only if required in both
      if (aRequired.has(key) && bRequired.has(key)) {
        required.push(key);
      }
    } else if (inA) {
      // Only in A — optional field
      properties[key] = aProps[key];
    } else {
      // Only in B — optional field
      properties[key] = bProps[key];
    }
  }

  return {
    type: 'object',
    nullable: a.nullable || b.nullable,
    properties,
    required,
    sampleCount,
  };
}

/**
 * Create a union (oneOf) schema from multiple schemas.
 */
function createUnionSchema(schemas: SchemaNode[]): SchemaNode {
  // Deduplicate by type
  const typeMap = new Map<string, SchemaNode>();
  let nullable = false;

  for (const schema of schemas) {
    if (schema.type === 'null') {
      nullable = true;
      continue;
    }
    const key = schema.type + (schema.format ? `:${schema.format}` : '');
    if (typeMap.has(key)) {
      typeMap.set(key, mergeSchemas(typeMap.get(key)!, schema));
    } else {
      typeMap.set(key, schema);
    }
  }

  const uniqueSchemas = Array.from(typeMap.values());

  if (uniqueSchemas.length === 1) {
    return { ...uniqueSchemas[0], nullable };
  }

  const totalSamples = schemas.reduce((sum, s) => sum + (s.sampleCount || 1), 0);

  return {
    type: 'unknown',
    nullable,
    oneOf: uniqueSchemas,
    sampleCount: totalSamples,
  };
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Pretty-print a schema for debugging.
 */
export function schemaToString(schema: SchemaNode, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  let result = '';

  if (schema.oneOf) {
    const types = schema.oneOf.map((s) => s.type).join(' | ');
    result += `${pad}oneOf(${types})`;
    if (schema.nullable) result += ' (nullable)';
    return result;
  }

  result += `${pad}${schema.type}`;
  if (schema.format) result += `<${schema.format}>`;
  if (schema.nullable) result += ' (nullable)';

  if (schema.type === 'object' && schema.properties) {
    result += ' {\n';
    const req = new Set(schema.required || []);
    for (const [key, value] of Object.entries(schema.properties)) {
      const optMark = req.has(key) ? '' : '?';
      result += `${pad}  "${key}"${optMark}: ${schemaToString(value, indent + 1).trimStart()}\n`;
    }
    result += `${pad}}`;
  }

  if (schema.type === 'array' && schema.items) {
    result += `[${schemaToString(schema.items).trimStart()}]`;
    if (!schema.homogeneous) result += ' (mixed)';
  }

  return result;
}

