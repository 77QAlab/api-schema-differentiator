/**
 * Example karate-config.js showing how to set up api-schema-differentiator
 * globally so it's available in all feature files.
 *
 * Place this in your Karate project root as karate-config.js
 */
function fn() {
  var config = {};

  // Your existing config
  config.baseUrl = 'https://api.example.com';
  config.env = karate.env || 'dev';

  // ─── Schema Sentinel Configuration ──────────────────────────────
  config.schemaStore = './schemas';
  config.schemaSentinelCli = 'node api-schema-differentiator/dist/cli.js';

  /**
   * Global helper: Check API response for schema drift.
   *
   * Usage in .feature files:
   *   * def result = schemaCheck('GET /api/users/:id', response)
   *   * assert result == 0
   */
  config.schemaCheck = function(key, responseBody) {
    var fs = Java.type('java.io.File');
    var fw = Java.type('java.io.FileWriter');

    // Write response to temp file
    var tmpFile = new fs('target/tmp-schema-' + java.lang.System.currentTimeMillis() + '.json');
    var writer = new fw(tmpFile);
    writer.write(JSON.stringify(responseBody));
    writer.close();

    // Run api-schema-differentiator CLI
    var cmd = config.schemaSentinelCli
      + ' check'
      + ' -k "' + key + '"'
      + ' -d "' + tmpFile.getAbsolutePath() + '"'
      + ' -s ' + config.schemaStore
      + ' --fail-on breaking';

    var exitCode = karate.exec(cmd);

    // Clean up temp file
    tmpFile.delete();

    return exitCode;
  };

  /**
   * Global helper: Take a schema snapshot (baseline).
   *
   * Usage:
   *   * def result = schemaSnapshot('GET /api/users/:id', response)
   */
  config.schemaSnapshot = function(key, responseBody) {
    var fs = Java.type('java.io.File');
    var fw = Java.type('java.io.FileWriter');

    var tmpFile = new fs('target/tmp-snapshot-' + java.lang.System.currentTimeMillis() + '.json');
    var writer = new fw(tmpFile);
    writer.write(JSON.stringify(responseBody));
    writer.close();

    var cmd = config.schemaSentinelCli
      + ' snapshot'
      + ' -k "' + key + '"'
      + ' -d "' + tmpFile.getAbsolutePath() + '"'
      + ' -s ' + config.schemaStore;

    var exitCode = karate.exec(cmd);
    tmpFile.delete();

    return exitCode;
  };

  return config;
}

