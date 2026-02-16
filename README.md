# 🛡️ api-schema-differentiator

**Know when your APIs change before your users do.**

API Schema Differentiator is a zero-config API schema drift detector. Point it at any API response — it automatically learns the schema, snapshots it, and alerts you when things change. No OpenAPI spec required. No manual schema writing. It just works.

---

## Table of Contents

- [The Problem](#the-problem)
- [Installation](#installation)
- [Quick Start (30 seconds)](#quick-start-30-seconds)
- [Usage as a Library](#usage-as-a-library)
- [Usage as a CLI Tool](#usage-as-a-cli-tool)
- [Usage in Test Frameworks](#usage-in-test-frameworks)
- [Usage in CI/CD Pipelines](#usage-in-cicd-pipelines)
- [Watch Mode (Monitoring)](#watch-mode-monitoring)
- [Report Formats](#report-formats)
- [What Drift Gets Detected](#what-drift-gets-detected)
- [Multi-Sample Learning](#multi-sample-learning)
- [Supported Formats](#supported-formats)
- [API Reference](#api-reference)
- [CLI Reference](#cli-reference)
- [Configuration](#configuration)

---

## The Problem

Your app consumes `/api/v2/users` which returns:

```json
{ "id": 123, "name": "Alice", "role": "admin" }
```

The backend team deploys a refactor. Now it returns:

```json
{ "id": "123", "name": "Alice", "roles": ["admin"] }
```

Three things broke silently: `id` changed from number to string, `role` was renamed to `roles`, and its type changed from string to array. Nobody noticed until customers filed support tickets.

**API Schema Differentiator catches that automatically.**

---

## Installation

```bash
npm install api-schema-differentiator
```

Or install globally to use the CLI anywhere:

```bash
npm install -g api-schema-differentiator
```

---

## Quick Start (30 seconds)

### Option A: As a Library (in your tests)

```typescript
import { SchemaGuard } from 'api-schema-differentiator';

const guard = new SchemaGuard({ store: './schemas' });

// Fetch your API
const response = await fetch('https://api.example.com/v2/users/1');
const data = await response.json();

// First run: auto-learns and saves the schema
// Every run after: compares against saved schema and reports drift
const report = await guard.check('GET /users/:id', data);

if (report.hasBreakingChanges) {
  console.log(guard.format(report)); // pretty console output
  throw new Error(`API schema broke! ${report.summary.breaking} breaking changes detected.`);
}
```

### Option B: As a CLI Tool

```bash
# Step 1: Save a baseline schema from a response file
api-schema-differentiator snapshot --key "GET /api/users" --data response.json

# Step 2: Later, check a new response against the baseline
api-schema-differentiator check --key "GET /api/users" --data new-response.json
```

Output:

```
🔍 Schema Drift Report: GET /api/users
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 BREAKING  Field removed: "role" (was: string)
🔴 BREAKING  Type changed at "id" (number → string)
🟡 WARNING   Field possibly renamed: "role" → "roles"
🟢 INFO      Field added: "updated_at" (string)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary: 2 breaking | 1 warnings | 1 info
Compatibility Score: 68%
```

---

## Usage as a Library

### Basic Check

```typescript
import { SchemaGuard } from 'api-schema-differentiator';

// Create a guard with a local store directory
const guard = new SchemaGuard({ store: './schemas' });

// Check any data — objects, arrays, strings, JSON...
const report = await guard.check('my-endpoint', { id: 1, name: 'Alice' });

// Inspect the report
console.log(report.hasBreakingChanges);   // true/false
console.log(report.compatibilityScore);   // 0-100
console.log(report.summary.breaking);     // number of breaking changes
console.log(report.changes);              // detailed list of every change
```

### Direct Comparison (No Store Needed)

Compare two response objects directly without saving anything:

```typescript
const guard = new SchemaGuard({ store: './schemas' });

const before = { id: 1, name: 'Alice', role: 'admin' };
const after  = { id: '1', name: 'Alice', roles: ['admin'] };

const report = guard.diffData(before, after);
console.log(guard.format(report)); // pretty-printed drift report
```

### Compare Stored Versions

```typescript
const guard = new SchemaGuard({ store: './schemas' });

// Compare version 1 and version 3 of a saved schema
const report = await guard.diff('GET /users/:id', 1, 3);
console.log(guard.format(report, 'markdown'));
```

### Multi-Sample Learning

Feed multiple responses to teach the tool which fields are always present (required) vs sometimes present (optional):

```typescript
const guard = new SchemaGuard({ store: './schemas' });

// Sample 1: has email
await guard.learn('GET /users/:id', { id: 1, name: 'Alice', email: 'a@b.com' });

// Sample 2: no email
await guard.learn('GET /users/:id', { id: 2, name: 'Bob' });

// Now the schema knows "email" is optional, "id" and "name" are required
// Future checks won't flag missing "email" as a breaking change
```

### Configuring Options

```typescript
const guard = new SchemaGuard({
  store: './schemas',           // Where to save snapshots (directory path)
  autoSnapshot: true,           // Auto-save schema on first check (default: true)
  autoUpdate: false,            // Auto-update schema when drift detected (default: false)
  minSeverity: 'warning',       // Filter out 'info' changes from reports (default: 'info')
  metadata: {                   // Custom metadata saved with each snapshot
    team: 'backend',
    environment: 'staging',
  },
});
```

### Get Reports in Different Formats

```typescript
const report = await guard.check('GET /users/:id', data);

// Console (colored terminal output)
console.log(guard.format(report, 'console'));

// JSON (machine-readable, perfect for CI)
fs.writeFileSync('report.json', guard.format(report, 'json'));

// Markdown (great for PR comments)
fs.writeFileSync('report.md', guard.format(report, 'markdown'));

// HTML (standalone report with dark theme UI)
fs.writeFileSync('report.html', guard.format(report, 'html'));
```

### Low-Level Access (Advanced)

Use the inference and diff engines directly:

```typescript
import { inferSchema, diffSchemas, mergeSchemas, formatReport } from 'api-schema-differentiator';

// Infer a schema from any data
const schema = inferSchema({ id: 1, name: 'Alice', tags: ['admin'] });
// => { type: 'object', properties: { id: { type: 'number', ... }, ... } }

// Diff two schemas
const changes = diffSchemas(oldSchema, newSchema);

// Merge schemas from multiple samples
const merged = mergeSchemas(schema1, schema2);
```

---

## Usage as a CLI Tool

### 1. `snapshot` — Save a Baseline Schema

```bash
# From a file
api-schema-differentiator snapshot --key "GET /api/users" --data response.json

# From a specific store directory
api-schema-differentiator snapshot --key "GET /api/users" --data response.json --store ./my-schemas
```

### 2. `check` — Detect Drift Against Baseline

```bash
# Check and print to console
api-schema-differentiator check --key "GET /api/users" --data new-response.json

# Check with JSON output
api-schema-differentiator check --key "GET /api/users" --data new-response.json --format json

# Check and write report to file
api-schema-differentiator check --key "GET /api/users" --data new-response.json --format html --output report.html

# Fail on warnings (not just breaking)
api-schema-differentiator check --key "GET /api/users" --data new-response.json --fail-on warning
```

**Exit codes:**
- `0` = No drift (or drift below the `--fail-on` threshold)
- `1` = Drift detected at or above the `--fail-on` severity

### 3. `diff` — Compare Two Responses Directly

```bash
# Compare two response files
api-schema-differentiator diff --before old-response.json --after new-response.json

# Compare with markdown output
api-schema-differentiator diff --before v1.json --after v2.json --format markdown

# Compare two stored versions
api-schema-differentiator diff --key "GET /api/users" --v1 1 --v2 3
```

### 4. `list` — See All Monitored Endpoints

```bash
api-schema-differentiator list --store ./schemas
```

Output:

```
📋 Monitored endpoints (3):

  • GET /api/v2/users
    Latest: v3 (2024-06-15T10:30:00Z)
    Samples: 5

  • POST /api/v2/orders
    Latest: v1 (2024-06-10T08:00:00Z)
    Samples: 1

  • GET /api/v2/products
    Latest: v2 (2024-06-14T15:00:00Z)
    Samples: 3
```

### 5. `history` — View Version Timeline

```bash
api-schema-differentiator history --key "GET /api/v2/users" --store ./schemas
```

Output:

```
📜 Version history for "GET /api/v2/users":

  v1 — 2024-06-01T10:00:00Z (1 samples)
  v2 — 2024-06-08T10:00:00Z (3 samples)
  v3 — 2024-06-15T10:00:00Z (5 samples)
```

### 6. `watch` — Monitor an Endpoint for Drift

```bash
# Poll every hour
api-schema-differentiator watch --url "https://api.example.com/v2/users/1" --interval 1h

# With auth headers
api-schema-differentiator watch \
  --url "https://api.stripe.com/v1/charges" \
  --header "Authorization: Bearer sk_test_..." \
  --interval 6h

# With Slack webhook alerts
api-schema-differentiator watch \
  --url "https://api.example.com/v2/users" \
  --interval 30m \
  --alert-webhook "https://hooks.slack.com/services/T.../B.../xxx"
```

---

## Usage in Test Frameworks

### Jest

```typescript
import { SchemaGuard } from 'api-schema-differentiator';

const guard = new SchemaGuard({ store: './api-schemas' });

describe('API Schema Tests', () => {
  test('Users API schema has not drifted', async () => {
    const res = await fetch('http://localhost:3000/api/users/1');
    const data = await res.json();

    const report = await guard.check('GET /users/:id', data);

    expect(report.hasBreakingChanges).toBe(false);
    expect(report.compatibilityScore).toBeGreaterThanOrEqual(90);
  });

  test('Orders API schema has not drifted', async () => {
    const res = await fetch('http://localhost:3000/api/orders');
    const data = await res.json();

    const report = await guard.check('GET /orders', data);

    expect(report.summary.breaking).toBe(0);
  });
});
```

### pytest (Python-style pseudocode — same concept)

```python
from schema_sentinel import SchemaGuard

guard = SchemaGuard(store="./schemas")

def test_users_api_schema():
    response = requests.get("https://api.example.com/v2/users/1")
    report = guard.check("GET /users/:id", response.json())
    assert report.breaking_changes == 0, f"API broke: {report.summary()}"
```

### Mocha / Chai

```typescript
import { SchemaGuard } from 'api-schema-differentiator';
import { expect } from 'chai';

const guard = new SchemaGuard({ store: './api-schemas' });

describe('API Contracts', () => {
  it('should not have breaking schema changes', async () => {
    const res = await fetch('http://localhost:3000/api/users');
    const data = await res.json();

    const report = await guard.check('GET /users', data);

    expect(report.hasBreakingChanges).to.be.false;
  });
});
```

---

## Usage in CI/CD Pipelines

### GitHub Actions

```yaml
# .github/workflows/api-schema-check.yml
name: API Schema Drift Check

on: [push, pull_request]

jobs:
  schema-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install

      # Run your API tests that generate response files
      - run: npm test

      # Check for schema drift
      - run: npx api-schema-differentiator check --key "GET /api/users" --data test/responses/users.json --fail-on breaking

      # Or check multiple endpoints
      - run: |
          npx api-schema-differentiator check -k "GET /api/users" -d test/responses/users.json --fail-on breaking
          npx api-schema-differentiator check -k "GET /api/orders" -d test/responses/orders.json --fail-on breaking
          npx api-schema-differentiator check -k "GET /api/products" -d test/responses/products.json --fail-on warning

      # Generate a PR comment with the report
      - run: npx api-schema-differentiator diff --before schemas/users/latest.json --after test/responses/users.json --format markdown > drift-report.md
```

### GitLab CI

```yaml
schema-drift-check:
  stage: test
  script:
    - npm install api-schema-differentiator
    - npx api-schema-differentiator check -k "GET /api/users" -d responses/users.json --fail-on breaking
  artifacts:
    when: on_failure
    paths:
      - schemas/
```

### Generic CI (any platform)

```bash
# Exit code 0 = no breaking drift, 1 = breaking drift detected
api-schema-differentiator check \
  --key "GET /api/users" \
  --data ./test-responses/users.json \
  --store ./schemas \
  --fail-on breaking

# Use --fail-on to control sensitivity:
#   --fail-on breaking   → only fail on breaking changes (default)
#   --fail-on warning    → fail on warnings too
#   --fail-on info       → fail on any change at all
```

---

## Watch Mode (Monitoring)

Monitor third-party or internal APIs you don't control. Schema Sentinel polls at a set interval and alerts you when the response shape changes.

```bash
# Basic: poll every hour
api-schema-differentiator watch --url "https://api.example.com/v2/users/1" --interval 1h

# With authentication
api-schema-differentiator watch \
  --url "https://api.stripe.com/v1/charges" \
  --header "Authorization: Bearer sk_test_abc123" \
  --interval 6h

# With Slack notifications
api-schema-differentiator watch \
  --url "https://partner-api.example.com/data" \
  --interval 30m \
  --alert-webhook "https://hooks.slack.com/services/T.../B.../xxx"

# POST request with body
api-schema-differentiator watch \
  --url "https://api.example.com/graphql" \
  --method POST \
  --header "Content-Type: application/json" \
  --body '{"query": "{ users { id name } }"}' \
  --interval 1h
```

Interval formats: `30s` (seconds), `5m` (minutes), `1h` (hours)

---

## Report Formats

| Format | Flag | Best For |
|---|---|---|
| **Console** | `--format console` | Terminal output, local development |
| **JSON** | `--format json` | CI/CD pipelines, machine processing |
| **Markdown** | `--format markdown` | PR comments, documentation |
| **HTML** | `--format html` | Standalone reports, email attachments |

---

## What Drift Gets Detected

| Change | Severity | Example |
|---|---|---|
| Field Added | `info` | New field `email` appeared |
| Field Removed | `breaking` | Field `role` no longer present |
| Type Changed | `breaking` | `id` changed from `number` to `string` |
| Nullable Changed | `warning` | `name` was non-null, now can be `null` |
| Array Items Changed | `warning` | `tags` items changed from `string` to `number` |
| Nesting Changed | `breaking` | `role` changed from `string` to `object` |
| Field Renamed | `warning` | `role` removed, `roles` added (heuristic) |
| Format Changed | `info` | `created` changed from ISO date to datetime |
| Required → Optional | `warning` | Field `email` is no longer always present |
| Homogeneity Changed | `warning` | Array went from all-same-type to mixed types |

**Severity levels:**
- 🔴 **Breaking** — Will likely cause downstream failures
- 🟡 **Warning** — Might cause issues, should investigate
- 🟢 **Info** — Safe additive changes, good to know about

---

## Multi-Sample Learning

Feed multiple API responses to teach Schema Sentinel which fields are always present vs sometimes present:

```typescript
const guard = new SchemaGuard({ store: './schemas' });

// Response 1: full profile
await guard.learn('GET /users/:id', {
  id: 1, name: 'Alice', email: 'alice@example.com', bio: 'Hello!'
});

// Response 2: minimal profile
await guard.learn('GET /users/:id', {
  id: 2, name: 'Bob'
});

// Response 3: with nullable field
await guard.learn('GET /users/:id', {
  id: 3, name: 'Charlie', email: null
});

// Now the schema understands:
// - id, name → required (always present)
// - email → optional, nullable
// - bio → optional
```

---

## Supported Formats

| Format | Auto-Detected | Notes |
|---|---|---|
| **JSON** | ✅ | Objects, arrays, nested structures |
| **XML/SOAP** | ✅ | Converted to object then inferred |
| **GraphQL** | ✅ | Extracts `data` field from `{ data, errors }` responses |

Pass any of these as a string and Schema Sentinel will auto-detect the format:

```typescript
// JSON string
await guard.check('my-api', '{"id": 1, "name": "Alice"}');

// XML string
await guard.check('soap-api', '<user><id>1</id><name>Alice</name></user>');
```

---

## API Reference

### `new SchemaGuard(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `store` | `string \| SchemaStore` | (required) | Path to store directory, or custom store instance |
| `autoSnapshot` | `boolean` | `true` | Auto-save schema on first check |
| `autoUpdate` | `boolean` | `false` | Auto-update schema when drift is detected |
| `minSeverity` | `'info' \| 'warning' \| 'breaking'` | `'info'` | Minimum severity to include in reports |
| `metadata` | `Record<string, unknown>` | `{}` | Custom metadata to save with snapshots |

### `guard.check(key, response)` → `Promise<DriftReport>`

Check a response against the stored schema. Auto-snapshots on first call.

### `guard.snapshot(key, response, version?)` → `Promise<SchemaSnapshot>`

Explicitly save a schema snapshot.

### `guard.learn(key, response)` → `Promise<SchemaSnapshot>`

Feed a sample for multi-sample learning (merges with existing schema).

### `guard.diff(key, versionA, versionB)` → `Promise<DriftReport>`

Compare two stored schema versions.

### `guard.diffData(before, after)` → `DriftReport`

Compare two response objects directly (no store needed).

### `guard.format(report, format?)` → `string`

Format a report. Formats: `'console'`, `'json'`, `'markdown'`, `'html'`.

### `guard.listKeys()` → `Promise<string[]>`

List all monitored endpoint keys.

### `guard.listVersions(key)` → `Promise<SchemaSnapshot[]>`

List all schema versions for a key.

---

## CLI Reference

```
api-schema-differentiator <command> [options]

Commands:
  snapshot   Save a schema snapshot from a response file
  check      Check a response against a stored snapshot
  diff       Compare two responses or schema versions
  list       List all monitored endpoints
  history    Show version history for an endpoint
  watch      Poll an endpoint and alert on drift

Global Options:
  -s, --store <dir>    Schema store directory (default: ./schemas)
  -f, --format <fmt>   Report format: console, json, markdown, html
  -o, --output <file>  Write report to a file
  -h, --help           Show help
  -V, --version        Show version
```

---

## Configuration

### Schema Store

Schemas are stored as JSON files in a directory structure:

```
schemas/
  GET__api__v2__users/
    v1.json
    v2.json
    latest.json
  POST__api__v2__orders/
    v1.json
    latest.json
```

**Tip:** Commit the `schemas/` directory to Git to track API schema changes over time alongside your code.

### Custom Store

Implement the `SchemaStore` interface for custom storage (database, S3, etc.):

```typescript
import { SchemaStore, SchemaSnapshot } from 'api-schema-differentiator';

class MyCustomStore implements SchemaStore {
  async save(snapshot: SchemaSnapshot): Promise<void> { /* ... */ }
  async load(key: string): Promise<SchemaSnapshot | null> { /* ... */ }
  async loadVersion(key: string, version: number): Promise<SchemaSnapshot | null> { /* ... */ }
  async listVersions(key: string): Promise<SchemaSnapshot[]> { /* ... */ }
  async listKeys(): Promise<string[]> { /* ... */ }
  async delete(key: string): Promise<void> { /* ... */ }
}

const guard = new SchemaGuard({ store: new MyCustomStore() });
```

---

## License

MIT

