/**
 * XML Response Parser
 *
 * Parses XML/SOAP responses into a JavaScript object that can be fed
 * to the schema inferrer.
 */

import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
});

/**
 * Parse an XML string into a JavaScript object.
 */
export function parseXml(input: string): unknown {
  try {
    return xmlParser.parse(input);
  } catch (error) {
    throw new Error(
      `Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if a string looks like XML.
 */
export function isXml(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>');
}

