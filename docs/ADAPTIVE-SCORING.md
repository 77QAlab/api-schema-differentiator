# Adaptive Compatibility Scoring

## Overview

The compatibility score now **adapts based on your baseline schema structure**, making it more accurate and fair for different API sizes.

---

## How It Works

### Before (Fixed Scoring)
- Breaking change: **-15 points** (always)
- Warning: **-5 points** (always)  
- Info: **-1 point** (always)

**Problem**: A breaking change in a simple API (3 fields) has the same penalty as a breaking change in a complex API (50+ fields).

### After (Adaptive Scoring)
The score now considers:

1. **Schema Complexity**
   - Simple schemas (1-5 fields): Full penalty (100% of base)
   - Medium schemas (6-20 fields): 80% of base penalty
   - Large schemas (21+ fields): 60% of base penalty

2. **Field Count**
   - APIs with 20+ fields get an additional 20% penalty reduction
   - This accounts for the fact that larger APIs naturally have more fields that can change

3. **Baseline Structure**
   - The score adapts to your specific baseline
   - More complex baselines = more lenient scoring

---

## Examples

### Example 1: Simple API (3 fields)

**Baseline:**
```json
{ "id": 1, "name": "Alice", "email": "a@b.com" }
```

**Change:** Field `email` removed

**Score:**
- Complexity: Low (3 fields) → Factor: 1.0
- Penalty: 15 × 1.0 = **-15 points**
- **Final Score: 85%**

### Example 2: Complex API (25 fields)

**Baseline:**
```json
{
  "id": 1, "name": "...", "email": "...", /* ... 22 more fields ... */
}
```

**Change:** Field `email` removed

**Score:**
- Complexity: High (25 fields) → Factor: 0.6
- Field count > 20 → Additional 20% reduction
- Penalty: 15 × 0.6 × 0.8 = **-7.2 points**
- **Final Score: 93%** (more lenient!)

---

## Always Compares from Latest Snapshot

✅ **The library already does this!** Every `check()` call:

1. Loads the **latest snapshot** for the key: `await this.store.load(key)`
2. Compares against that latest snapshot
3. If you update the baseline, the next check uses the new baseline

### When You Intentionally Update Baselines

```typescript
// Scenario: API structure legitimately changed
// Step 1: Update the baseline
await guard.snapshot('GET /users', newResponse, 2); // Version 2

// Step 2: Future checks automatically use version 2
const report = await guard.check('GET /users', latestResponse);
// This compares against version 2, not version 1
```

### Auto-Update Feature

If you enable `autoUpdate: true`:

```typescript
const guard = new SchemaGuard({
  store: './schemas',
  autoUpdate: true  // Automatically update baseline when drift detected
});

// First check: Creates baseline v1
await guard.check('GET /users', response1);

// Second check: Detects drift, auto-updates to v2
await guard.check('GET /users', response2); // Auto-creates v2

// Third check: Compares against v2 (the latest)
await guard.check('GET /users', response3);
```

---

## Multi-Sample Learning

This feature helps the library understand which fields are **always present** vs **sometimes present**.

### How It Works

```typescript
// Sample 1: Full profile
await guard.learn('GET /users/:id', {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com',  // Present
  phone: '555-1234',           // Present
  bio: 'Hello!'                // Present
});

// Sample 2: Minimal profile
await guard.learn('GET /users/:id', {
  id: 2,
  name: 'Bob'
  // email, phone, bio are missing
});

// Sample 3: Partial profile
await guard.learn('GET /users/:id', {
  id: 3,
  name: 'Charlie',
  email: null  // Present but null
});
```

**Result:**
- `id`, `name` → **Required** (present in all samples)
- `email` → **Optional, nullable** (present in 2/3, null in one)
- `phone`, `bio` → **Optional** (present in 1/3)

**Future checks:**
- Missing `phone` or `bio` → ✅ Not flagged (they're optional)
- Missing `id` or `name` → 🔴 Breaking change (they're required)
- `email` being `null` → ✅ Not flagged (it's nullable)

### Perfect for Power Apps / SharePoint

Power Apps and SharePoint responses often have:
- Fields that appear based on permissions
- Optional metadata fields
- Conditional fields based on item type

Multi-sample learning captures all these variations automatically!

---

## Configuration Options

```typescript
const guard = new SchemaGuard({
  store: './schemas',
  
  // Auto-create baseline on first check
  autoSnapshot: true,
  
  // Auto-update baseline when drift detected
  autoUpdate: false,  // Set to true for automatic baseline updates
  
  // Minimum severity to report
  minSeverity: 'warning',  // 'info' | 'warning' | 'breaking'
  
  // Custom metadata
  metadata: {
    environment: 'production',
    team: 'backend'
  }
});
```

---

## Best Practices

1. **Use descriptive keys**: `PowerApps:Contacts:Admin` vs `PowerApps:Contacts:User`
2. **Multi-sample learning**: Feed 5-10 varied samples to establish a robust baseline
3. **Version your baselines**: When structure legitimately changes, create a new version
4. **Review adaptive scores**: Large APIs will have more lenient scores (by design)

---

## Technical Details

The adaptive scoring algorithm:

```typescript
// Calculate complexity
complexity = 1 + (fieldCount × 0.5) + (nestedComplexity × 0.3)

// Determine factor
if (complexity > 20) factor = 0.6      // Large API
else if (complexity > 5) factor = 0.8  // Medium API
else factor = 1.0                       // Simple API

// Apply penalties
penalty = basePenalty × factor

// Additional reduction for very large APIs
if (fieldCount > 20) penalty *= 0.8

// Final score
score = 100 - sum(allPenalties)
score = max(0, round(score))
```

---

## Questions?

- See [README.md](../README.md) for general usage
- See [POWER-APPS-SPFX-GUIDE.md](./POWER-APPS-SPFX-GUIDE.md) for Power Apps integration
- See [GRAPHQL-GUIDE.md](./GRAPHQL-GUIDE.md) for GraphQL usage

