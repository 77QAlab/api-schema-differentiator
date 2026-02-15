/**
 * JSON Response Parser
 *
 * Parses JSON strings into data that can be fed to the schema inferrer.
 */

/**
 * Parse a JSON string into a JavaScript value.
 * Handles common edge cases like BOM markers, trailing commas (lenient mode).
 */
export function parseJson(input: string): unknown {
  // Remove BOM if present
  let cleaned = input.trim();
  if (cleaned.charCodeAt(0) === 0xfeff) {
    cleaned = cleaned.substring(1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    // Try lenient parsing: strip trailing commas
    try {
      const lenient = cleaned.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(lenient);
    } catch {
      throw new Error(
        `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Check if a string looks like JSON.
 */
export function isJson(input: string): boolean {
  const trimmed = input.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

