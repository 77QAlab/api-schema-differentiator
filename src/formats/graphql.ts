/**
 * GraphQL Response Parser
 *
 * Parses GraphQL responses (which are JSON with a specific shape) and
 * extracts the data payload for schema inference.
 */

import { parseJson } from './json';

interface GraphQLResponse {
  data?: unknown;
  errors?: unknown[];
  extensions?: unknown;
}

/**
 * Parse a GraphQL response and extract the data payload.
 * GraphQL responses have the shape: { data: ..., errors: [...], extensions: ... }
 * We infer the schema from the `data` field.
 */
export function parseGraphqlResponse(input: string | unknown): unknown {
  let parsed: unknown;

  if (typeof input === 'string') {
    parsed = parseJson(input);
  } else {
    parsed = input;
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const gqlResponse = parsed as GraphQLResponse;

    // If it has a `data` field, treat it as a GraphQL response
    if ('data' in gqlResponse) {
      return gqlResponse.data;
    }
  }

  // Fallback: return as-is
  return parsed;
}

/**
 * Check if a value looks like a GraphQL response.
 */
export function isGraphqlResponse(input: unknown): boolean {
  if (typeof input === 'object' && input !== null) {
    return 'data' in input || 'errors' in input;
  }
  return false;
}

