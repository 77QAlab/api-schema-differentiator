# Integrating api-schema-differentiator with Karate Framework

This guide shows how to add **automatic API schema drift detection** to your existing Karate test suite. Your Gherkin feature files keep working exactly as before — you just add one or two lines per scenario to check for schema drift.

---

## Setup (One-Time, ~5 minutes)

### Step 1: Install Node.js & api-schema-differentiator

api-schema-differentiator is a Node.js CLI tool. Install it alongside your Karate project:

```bash
# In your Karate project root
npm init -y
npm install api-schema-differentiator
```

Or, if you cloned api-schema-differentiator separately:

```bash
cd api-schema-differentiator
npm install
npm run build
```

### Step 2: Verify it works

```bash
npx api-schema-differentiator --version
```

### Step 3: Create a schemas directory

```bash
mkdir schemas
```

Add `schemas/` to your `.gitignore` if you don't want to version-control the baselines, **or keep it tracked** (recommended) so baselines are shared across team members.

### Step 4: Add the global helper to `karate-config.js`

Add these two helper functions to your existing `karate-config.js`:

```javascript
function fn() {
  var config = {};

  // ... your existing config ...

  config.schemaStore = './schemas';

  // Schema drift check helper
  config.schemaCheck = function(key, responseBody) {
    var fs = Java.type('java.io.File');
    var fw = Java.type('java.io.FileWriter');
    var tmpFile = new fs('target/tmp-schema-' + java.lang.System.currentTimeMillis() + '.json');
    var writer = new fw(tmpFile);
    writer.write(JSON.stringify(responseBody));
    writer.close();

    var exitCode = karate.exec('npx api-schema-differentiator check'
      + ' -k "' + key + '"'
      + ' -d "' + tmpFile.getAbsolutePath() + '"'
      + ' -s ' + config.schemaStore
      + ' --fail-on breaking');

    tmpFile.delete();
    return exitCode;
  };

  // Schema snapshot (baseline) helper
  config.schemaSnapshot = function(key, responseBody) {
    var fs = Java.type('java.io.File');
    var fw = Java.type('java.io.FileWriter');
    var tmpFile = new fs('target/tmp-snapshot-' + java.lang.System.currentTimeMillis() + '.json');
    var writer = new fw(tmpFile);
    writer.write(JSON.stringify(responseBody));
    writer.close();

    var exitCode = karate.exec('npx api-schema-differentiator snapshot'
      + ' -k "' + key + '"'
      + ' -d "' + tmpFile.getAbsolutePath() + '"'
      + ' -s ' + config.schemaStore);

    tmpFile.delete();
    return exitCode;
  };

  return config;
}
```

That's it for setup!

---

## Usage in Your Existing Feature Files

### The simplest change — add ONE line per scenario

Your existing tests stay exactly the same. Just add one line after each API call:

#### Before (your existing test):

```gherkin
Scenario: Get user by ID
  Given url baseUrl + '/api/v2/users/1'
  When method get
  Then status 200
  And match response.id == '#number'
  And match response.name == '#string'
```

#### After (with schema drift detection):

```gherkin
Scenario: Get user by ID
  Given url baseUrl + '/api/v2/users/1'
  When method get
  Then status 200
  And match response.id == '#number'
  And match response.name == '#string'
  # 👇 This one line adds automatic schema drift detection
  * assert schemaCheck('GET /api/v2/users/:id', response) == 0
```

**That's it.** One line. Your test now:
1. First run → auto-saves the response schema as a baseline
2. Every subsequent run → compares the live response against the saved baseline
3. If a breaking change is detected → the assertion fails and the test fails

---

## Common Patterns

### Pattern 1: Basic drift check (most common)

```gherkin
Scenario: List all products
  Given url baseUrl + '/api/products'
  When method get
  Then status 200
  * assert schemaCheck('GET /api/products', response) == 0
```

### Pattern 2: Check with POST/PUT responses

```gherkin
Scenario: Create a new order
  Given url baseUrl + '/api/orders'
  And request { product: 'Widget', quantity: 5 }
  When method post
  Then status 201
  * assert schemaCheck('POST /api/orders', response) == 0
```

### Pattern 3: Establish baselines explicitly (optional)

If you want to explicitly control when baselines are taken:

```gherkin
@baseline
Scenario: Take baseline snapshots
  # Users endpoint
  Given url baseUrl + '/api/v2/users/1'
  When method get
  Then status 200
  * def result = schemaSnapshot('GET /api/v2/users/:id', response)

  # Orders endpoint
  Given url baseUrl + '/api/v2/orders'
  When method get
  Then status 200
  * def result = schemaSnapshot('GET /api/v2/orders', response)
```

Run this once: `mvn test -Dkarate.options="--tags @baseline"`

### Pattern 4: Schema check as a reusable feature

Create a shared `check-schema.feature`:

```gherkin
# check-schema.feature
@ignore
Feature: Reusable schema drift check

  Scenario:
    * assert schemaCheck(key, responseBody) == 0
```

Call it from any test:

```gherkin
Scenario: Get user
  Given url baseUrl + '/api/users/1'
  When method get
  Then status 200
  * call read('check-schema.feature') { key: 'GET /api/users/:id', responseBody: '#(response)' }
```

### Pattern 5: Use in Scenario Outline for multiple endpoints

```gherkin
Scenario Outline: Schema drift check for <endpoint>
  Given url baseUrl + '<path>'
  When method get
  Then status 200
  * assert schemaCheck('<endpoint>', response) == 0

  Examples:
    | endpoint              | path               |
    | GET /api/users        | /api/users         |
    | GET /api/products     | /api/products      |
    | GET /api/orders       | /api/orders        |
    | GET /api/config       | /api/config        |
```

---

## CI/CD Integration

### Maven (typical Karate setup)

Add a post-test step to your CI pipeline:

```xml
<!-- pom.xml: ensure Node.js is available -->
<plugin>
  <groupId>com.github.eirslett</groupId>
  <artifactId>frontend-maven-plugin</artifactId>
  <version>1.15.0</version>
  <executions>
    <execution>
      <id>install-node</id>
      <goals><goal>install-node-and-npm</goal></goals>
      <configuration>
        <nodeVersion>v20.11.0</nodeVersion>
      </configuration>
    </execution>
    <execution>
      <id>npm-install</id>
      <goals><goal>npm</goal></goals>
      <configuration>
        <arguments>install</arguments>
      </configuration>
    </execution>
  </executions>
</plugin>
```

### GitHub Actions

```yaml
jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # Install api-schema-differentiator
      - run: npm install

      # Run Karate tests (schema checks happen inside the tests)
      - run: mvn test

      # Commit updated schemas back (optional)
      - run: |
          git add schemas/
          git diff --staged --quiet || git commit -m "chore: update API schema baselines"
          git push
```

### Gradle

```groovy
task installSchemaSentinel(type: Exec) {
    commandLine 'npm', 'install'
}

test.dependsOn installSchemaSentinel
```

---

## How It Works Under the Hood

```
┌──────────────────────────────────────────────────────────────────┐
│  Your Karate Feature File                                        │
│  ┌──────────────────────────────────────┐                        │
│  │ Given url '.../api/users/1'          │                        │
│  │ When method get                      │                        │
│  │ Then status 200                      │                        │
│  │ * assert schemaCheck(key, resp) == 0 │──┐                     │
│  └──────────────────────────────────────┘  │                     │
└────────────────────────────────────────────┼─────────────────────┘
                                             │
                                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  api-schema-differentiator CLI                                             │
│                                                                  │
│  1. Reads the response JSON                                      │
│  2. Infers the schema (types, formats, nullable, nesting)        │
│  3. Loads baseline from ./schemas/                               │
│     • First run? → Auto-saves as baseline, returns OK            │
│     • Baseline exists? → Compares ↓                              │
│  4. Diff engine detects:                                         │
│     🔴 Fields removed, types changed, nesting changed            │
│     🟡 Nullable drift, array type changes, renames               │
│     🟢 New fields added, format changes                          │
│  5. Returns exit code: 0 = OK, 1 = breaking drift found         │
└──────────────────────────────────────────────────────────────────┘
```

---

## FAQ

**Q: Do I need to write JSON schemas manually?**
No. api-schema-differentiator auto-infers the schema from the first response it sees.

**Q: What if a legitimate API change happens?**
Re-run the baseline: `npx api-schema-differentiator snapshot -k "GET /api/users" -d new-response.json -s ./schemas`
Or run your `@baseline` tagged scenarios.

**Q: Does this replace my existing Karate assertions?**
No. Keep your existing `match` assertions. Schema drift detection is an *additional* safety layer — it catches things you didn't think to assert on.

**Q: What if the test environment returns different data each time?**
That's fine. Schema-sentinel checks the *shape* (types, field names, structure), not the *values*. Different users with different names still have the same schema.

**Q: Can I use this with Karate's parallel execution?**
Yes. Each schema key gets its own file in the store, so parallel tests don't conflict.

