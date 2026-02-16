@schema-drift-hooks
Feature: Schema Drift Detection with Karate Hooks
  A reusable approach where schema checking happens automatically
  after every API call using Karate's hooks mechanism.

  Background:
    # Store directory for schema baselines
    * def schemaStore = './schemas'
    # Helper function to check schema drift after each API call
    * def checkSchema =
    """
    function(key, responseBody) {
      var fs = Java.type('java.io.File');
      var fw = Java.type('java.io.FileWriter');

      // Write response to temp file
      var tmpFile = new fs('target/tmp-response-' + java.lang.System.currentTimeMillis() + '.json');
      var writer = new fw(tmpFile);
      writer.write(JSON.stringify(responseBody));
      writer.close();

      // Run api-schema-differentiator
      var cmd = 'node api-schema-differentiator/dist/cli.js check'
        + ' -k "' + key + '"'
        + ' -d "' + tmpFile.getAbsolutePath() + '"'
        + ' -s ' + schemaStore
        + ' --fail-on breaking'
        + ' -f json';

      var result = karate.exec(cmd);

      // Clean up
      tmpFile.delete();

      return result;
    }
    """

  Scenario: GET /api/v2/users - List users
    Given url 'https://api.example.com/v2/users'
    And param limit = 10
    When method get
    Then status 200
    # Functional assertions
    * match response.data == '#array'
    * match each response.data contains { id: '#number', name: '#string' }
    # Schema drift check
    * def schemaResult = checkSchema('GET /api/v2/users', response)
    * assert schemaResult == 0

  Scenario: GET /api/v2/users/:id - Single user
    Given url 'https://api.example.com/v2/users/1'
    When method get
    Then status 200
    # Functional assertions
    * match response.id == '#number'
    * match response.name == '#string'
    # Schema drift check
    * def schemaResult = checkSchema('GET /api/v2/users/:id', response)
    * assert schemaResult == 0

  Scenario: POST /api/v2/orders - Create order
    Given url 'https://api.example.com/v2/orders'
    And request { product: 'Widget', quantity: 5 }
    When method post
    Then status 201
    # Functional assertions
    * match response.orderId == '#string'
    # Schema drift check
    * def schemaResult = checkSchema('POST /api/v2/orders', response)
    * assert schemaResult == 0

