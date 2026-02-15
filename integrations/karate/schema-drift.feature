@schema-drift
Feature: API Schema Drift Detection
  Verify that API response schemas have not changed unexpectedly.
  Uses schema-sentinel to auto-detect breaking changes, type changes,
  missing fields, and other drift in API responses.

  Background:
    # Path to the schema-sentinel Karate helper
    * def SchemaSentinel = Java.type('com.intuit.karate.FileUtils')
    # Alternatively, use karate.exec() to call the CLI directly
    # Or use karate.call() with JavaScript files

  # ============================================================
  # APPROACH 1: Using karate.exec() — Simplest, works everywhere
  # ============================================================

  Scenario: Check Users API schema drift using CLI
    Given url 'https://api.example.com/v2/users/1'
    When method get
    Then status 200
    # Save response to a temp file
    * def responseFile = 'target/responses/users-response.json'
    * def writeResult = karate.write(response, responseFile)
    # Run schema-sentinel check via CLI
    * def result = karate.exec('node schema-sentinel/dist/cli.js check -k "GET /api/v2/users/:id" -d ' + responseFile + ' -s ./schemas --fail-on breaking -f json')
    # Assert no breaking changes (exit code 0)
    * assert result == 0

  Scenario: Check Orders API schema drift using CLI
    Given url 'https://api.example.com/v2/orders'
    When method get
    Then status 200
    * def responseFile = 'target/responses/orders-response.json'
    * def writeResult = karate.write(response, responseFile)
    * def result = karate.exec('node schema-sentinel/dist/cli.js check -k "GET /api/v2/orders" -d ' + responseFile + ' -s ./schemas --fail-on breaking -f json')
    * assert result == 0

  # ============================================================
  # APPROACH 2: Using karate.call() with JS helper — More control
  # ============================================================

  Scenario: Check Users API with detailed drift report
    Given url 'https://api.example.com/v2/users/1'
    When method get
    Then status 200
    # Call the JS helper which returns a structured result
    * def driftCheck = karate.call('classpath:schema-sentinel-karate.js')
    * def result = driftCheck.checkDrift('GET /api/v2/users/:id', response, { store: './schemas' })
    # Assert no breaking changes
    * match result.hasBreakingChanges == false
    * match result.compatibilityScore >= 90
    # Print drift details if any warnings
    * if (result.warningCount > 0) karate.log('⚠️ Schema warnings:', result.report)

  # ============================================================
  # APPROACH 3: Snapshot then Check — Two-step baseline workflow
  # ============================================================

  Scenario: Establish baseline schema (run once)
    Given url 'https://api.example.com/v2/users/1'
    When method get
    Then status 200
    * def responseFile = 'target/responses/users-baseline.json'
    * def writeResult = karate.write(response, responseFile)
    * def result = karate.exec('node schema-sentinel/dist/cli.js snapshot -k "GET /api/v2/users/:id" -d ' + responseFile + ' -s ./schemas')
    * karate.log('Baseline snapshot taken')

  Scenario: Verify schema against baseline
    Given url 'https://api.example.com/v2/users/1'
    When method get
    Then status 200
    * def responseFile = 'target/responses/users-current.json'
    * def writeResult = karate.write(response, responseFile)
    * def result = karate.exec('node schema-sentinel/dist/cli.js check -k "GET /api/v2/users/:id" -d ' + responseFile + ' -s ./schemas --fail-on breaking')
    * assert result == 0

