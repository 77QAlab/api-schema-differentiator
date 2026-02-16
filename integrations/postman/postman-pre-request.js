/**
 * api-schema-differentiator + Postman / Newman Example
 *
 * Use this in Postman's "Tests" tab (post-response script).
 * It saves responses to files that api-schema-differentiator can check.
 *
 * For automated checking, use Newman (Postman CLI) + api-schema-differentiator
 * in your CI pipeline — see the shell script below.
 */

// ──────────────────────────────────────────────────────────────
// OPTION 1: Postman "Tests" tab — Manual visual approach
// Paste this in the "Tests" tab of any Postman request
// ──────────────────────────────────────────────────────────────

// Save the response schema shape for manual inspection
const responseBody = pm.response.json();

// Simple type-checking helper (lightweight in-Postman check)
function getType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function inferShape(obj, path = '') {
  const shape = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    shape[fullPath] = getType(value);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(shape, inferShape(value, fullPath));
    }
  }
  return shape;
}

const shape = inferShape(responseBody);
console.log('Response schema shape:', JSON.stringify(shape, null, 2));

// Store in Postman environment for comparison
const prevShape = pm.environment.get('schema_' + pm.info.requestName);
if (prevShape) {
  const prev = JSON.parse(prevShape);
  const changes = [];
  for (const [key, type] of Object.entries(prev)) {
    if (!(key in shape)) changes.push(`REMOVED: ${key} (was: ${type})`);
    else if (shape[key] !== type) changes.push(`CHANGED: ${key} (${type} → ${shape[key]})`);
  }
  for (const key of Object.keys(shape)) {
    if (!(key in prev)) changes.push(`ADDED: ${key} (${shape[key]})`);
  }

  if (changes.length > 0) {
    console.warn('⚠️ Schema drift detected:', changes);
    pm.test('No schema drift', () => pm.expect.fail(changes.join('; ')));
  } else {
    pm.test('No schema drift', () => pm.response.to.be.ok);
  }
} else {
  // First run — save baseline
  pm.environment.set('schema_' + pm.info.requestName, JSON.stringify(shape));
  console.log('Baseline schema saved for: ' + pm.info.requestName);
}

