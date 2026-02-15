/**
 * schema-sentinel — Karate Framework Integration
 *
 * This file is a callable JavaScript helper that Karate can invoke
 * via its built-in Java interop (karate.exec / karate.call).
 *
 * HOW IT WORKS:
 *   Karate runs API tests → captures JSON response →
 *   passes it to schema-sentinel CLI → gets drift report back.
 *
 * USAGE IN KARATE:
 *   See the accompanying .feature files for examples.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Check an API response for schema drift using schema-sentinel CLI.
 *
 * @param {string} key        - Endpoint identifier (e.g. "GET /api/users")
 * @param {object|string} response - The API response body (JSON object or string)
 * @param {object} options    - Optional: { store, failOn, format }
 * @returns {object}          - { exitCode, hasDrift, report (parsed JSON) }
 */
function checkDrift(key, response, options = {}) {
  const store = options.store || './schemas';
  const failOn = options.failOn || 'breaking';
  const format = 'json'; // always JSON for programmatic use

  // Write response to a temp file (avoids shell escaping issues)
  const tmpDir = path.join(__dirname, '.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tmpFile = path.join(tmpDir, `response-${Date.now()}.json`);
  const responseStr = typeof response === 'string' ? response : JSON.stringify(response);
  fs.writeFileSync(tmpFile, responseStr, 'utf-8');

  try {
    const cliPath = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');
    const cmd = `node "${cliPath}" check -k "${key}" -d "${tmpFile}" -s "${store}" -f ${format} --fail-on ${failOn}`;

    let stdout;
    let exitCode = 0;
    try {
      stdout = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    } catch (err) {
      stdout = err.stdout || '';
      exitCode = err.status || 1;
    }

    let report = null;
    try {
      report = JSON.parse(stdout);
    } catch {
      // If output isn't valid JSON, wrap it
      report = { raw: stdout, parseError: true };
    }

    return {
      exitCode,
      hasDrift: exitCode !== 0,
      hasBreakingChanges: report && report.hasBreakingChanges === true,
      breakingCount: report && report.summary ? report.summary.breaking : 0,
      warningCount: report && report.summary ? report.summary.warning : 0,
      infoCount: report && report.summary ? report.summary.info : 0,
      compatibilityScore: report && report.compatibilityScore != null ? report.compatibilityScore : 100,
      report,
    };
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

/**
 * Take a schema snapshot (baseline) from a response.
 */
function takeSnapshot(key, response, options = {}) {
  const store = options.store || './schemas';

  const tmpDir = path.join(__dirname, '.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const tmpFile = path.join(tmpDir, `snapshot-${Date.now()}.json`);
  const responseStr = typeof response === 'string' ? response : JSON.stringify(response);
  fs.writeFileSync(tmpFile, responseStr, 'utf-8');

  try {
    const cliPath = path.resolve(__dirname, '..', '..', 'dist', 'cli.js');
    const cmd = `node "${cliPath}" snapshot -k "${key}" -d "${tmpFile}" -s "${store}"`;

    execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    return { success: true, key, store };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// Export for require() usage
module.exports = { checkDrift, takeSnapshot };

