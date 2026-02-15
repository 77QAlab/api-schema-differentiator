/**
 * Format Parsers — Barrel export
 */

export { parseJson, isJson } from './json';
export { parseXml, isXml } from './xml';
export { parseGraphqlResponse, isGraphqlResponse } from './graphql';

/**
 * Auto-detect format and parse input string into a JavaScript value.
 */
import { isJson, parseJson } from './json';
import { isXml, parseXml } from './xml';

export function autoParse(input: string): unknown {
  const trimmed = input.trim();

  if (isJson(trimmed)) {
    return parseJson(trimmed);
  }

  if (isXml(trimmed)) {
    return parseXml(trimmed);
  }

  // Try JSON as fallback (e.g., bare strings, numbers)
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(
      'Unable to auto-detect format. Supported formats: JSON, XML. ' +
        'Please provide data in a supported format.'
    );
  }
}

