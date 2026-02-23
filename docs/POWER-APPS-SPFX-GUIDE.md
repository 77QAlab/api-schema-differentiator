# Power Apps & SharePoint/SPFx Integration Guide

This guide shows how to use **api-schema-differentiator** with Microsoft Power Apps, SharePoint, and SPFx applications for automated API schema testing.

---

## Overview

Your use case:
- ✅ **Status code** validation
- ✅ **Logic** validation  
- ✅ **Response structure** validation ← **This is where api-schema-differentiator helps!**
- 🔄 **GraphQL endpoints** (Power Apps, SharePoint)

---

## Architecture for Power Apps / SPFx

### Recommended Test Structure

```
your-test-project/
├── tests/
│   ├── api/
│   │   ├── power-apps/
│   │   │   ├── contacts.test.ts
│   │   │   ├── accounts.test.ts
│   │   │   └── schemas/          ← Schema baselines stored here
│   │   └── sharepoint/
│   │       ├── lists.test.ts
│   │       └── schemas/
│   └── utils/
│       └── schema-guard.ts       ← Shared guard instance
└── package.json
```

---

## Setup

### 1. Install Dependencies

```bash
npm install api-schema-differentiator
npm install @microsoft/sp-http  # For SPFx
npm install @azure/msal-node     # For authentication (if needed)
```

### 2. Create Shared Schema Guard

```typescript
// tests/utils/schema-guard.ts
import { SchemaGuard } from 'api-schema-differentiator';

export const schemaGuard = new SchemaGuard({
  store: './tests/api/schemas',
  autoSnapshot: true,      // Auto-create baselines on first run
  autoUpdate: false,        // Don't auto-update (manual control)
  minSeverity: 'warning'    // Only alert on warnings and breaking changes
});
```

---

## Power Apps Integration

### Example: Testing Power Apps Dataverse API

```typescript
// tests/api/power-apps/contacts.test.ts
import { schemaGuard } from '../../utils/schema-guard';
import { Client } from '@microsoft/microsoft-graph-client';

describe('Power Apps - Contacts API', () => {
  let graphClient: Client;

  beforeAll(async () => {
    // Initialize Microsoft Graph client with authentication
    graphClient = Client.init({
      authProvider: async (done) => {
        const token = await getAccessToken(); // Your auth logic
        done(null, token);
      }
    });
  });

  test('Contacts API response structure is stable', async () => {
    // Fetch contacts from Power Apps / Dataverse
    const response = await graphClient
      .api('/contacts')
      .select('contactid,firstname,lastname,emailaddress1,createdon')
      .get();

    // 1. Status code check (your existing test)
    expect(response.status).toBe(200);

    // 2. Logic check (your existing test)
    expect(Array.isArray(response.value)).toBe(true);
    expect(response.value.length).toBeGreaterThan(0);

    // 3. Response structure check ← NEW with api-schema-differentiator
    const report = await schemaGuard.check('PowerApps:Contacts', response.value);
    
    expect(report.hasBreakingChanges).toBe(false);
    expect(report.compatibilityScore).toBeGreaterThanOrEqual(90);
    
    if (report.summary.warning > 0) {
      console.warn('Schema warnings detected:', schemaGuard.format(report, 'markdown'));
    }
  });

  test('Account entity schema is stable', async () => {
    const response = await graphClient
      .api('/accounts')
      .select('accountid,name,website,telephone1')
      .get();

    const report = await schemaGuard.check('PowerApps:Accounts', response.value);
    expect(report.summary.breaking).toBe(0);
  });
});
```

### Handling Power Apps OData Format

Power Apps returns OData format: `{ value: [...], "@odata.context": "..." }`

```typescript
// Extract the actual data array
const report = await schemaGuard.check('PowerApps:Contacts', response.value);

// Or check the entire response structure
const fullReport = await schemaGuard.check('PowerApps:Contacts:Full', response);
```

---

## SharePoint / SPFx Integration

### Example: Testing SharePoint List Items

```typescript
// tests/api/sharepoint/lists.test.ts
import { schemaGuard } from '../../utils/schema-guard';
import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';

describe('SharePoint - Lists API', () => {
  let spHttpClient: SPHttpClient;
  let webUrl: string;

  beforeAll(() => {
    // Initialize SPFx context (adjust for your setup)
    spHttpClient = new SPHttpClient();
    webUrl = 'https://yourtenant.sharepoint.com/sites/yoursite';
  });

  test('Documents list response structure is stable', async () => {
    // Fetch SharePoint list items
    const response: SPHttpClientResponse = await spHttpClient.get(
      `${webUrl}/_api/web/lists/getbytitle('Documents')/items?$select=Id,Title,Created,Author/Title&$expand=Author`,
      SPHttpClient.configurations.v1
    );

    // 1. Status code check
    expect(response.status).toBe(200);

    // 2. Logic check
    const data = await response.json();
    expect(data.value).toBeDefined();
    expect(Array.isArray(data.value)).toBe(true);

    // 3. Response structure check ← NEW
    const report = await schemaGuard.check('SharePoint:DocumentsList', data.value);
    
    expect(report.hasBreakingChanges).toBe(false);
    
    // Print detailed report if warnings exist
    if (report.changes.length > 0) {
      console.log(schemaGuard.format(report, 'markdown'));
    }
  });

  test('User profile schema is stable', async () => {
    const response = await spHttpClient.get(
      `${webUrl}/_api/SP.UserProfiles.PeopleManager/GetMyProperties`,
      SPHttpClient.configurations.v1
    );

    const data = await response.json();
    const report = await schemaGuard.check('SharePoint:UserProfile', data);
    
    expect(report.compatibilityScore).toBeGreaterThanOrEqual(85);
  });
});
```

### SPFx Web Part Integration

```typescript
// src/webparts/myWebPart/MyWebPart.ts
import { SchemaGuard } from 'api-schema-differentiator';

export default class MyWebPart extends BaseClientSideWebPart<IMyWebPartProps> {
  private schemaGuard = new SchemaGuard({ 
    store: './schemas',
    autoSnapshot: false  // Don't auto-snapshot in production
  });

  public async render(): Promise<void> {
    try {
      // Your existing data fetch
      const response = await this.context.spHttpClient.get(
        `${this.context.pageContext.web.absoluteUrl}/_api/web/lists`,
        SPHttpClient.configurations.v1
      );

      const data = await response.json();

      // Check schema (only in development/test mode)
      if (this.properties.environment === 'development') {
        const report = await this.schemaGuard.check('SPFx:Lists', data.value);
        
        if (report.hasBreakingChanges) {
          console.error('⚠️ Schema drift detected!', 
            this.schemaGuard.format(report, 'console'));
        }
      }

      // Continue with your rendering
      this.renderLists(data.value);
    } catch (error) {
      console.error('Error fetching lists:', error);
    }
  }
}
```

---

## GraphQL with Power Apps / SharePoint

If your Power Apps or SharePoint uses GraphQL endpoints:

```typescript
// tests/api/power-apps/graphql.test.ts
import { schemaGuard } from '../../utils/schema-guard';

test('GraphQL query response structure is stable', async () => {
  const graphqlQuery = `
    query GetContacts {
      contacts {
        contactid
        firstname
        lastname
        emailaddress1
      }
    }
  `;

  const response = await fetch('https://your-environment.crm.dynamics.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: graphqlQuery })
  });

  const graphqlData = await response.json();

  // Check the GraphQL response (library auto-extracts 'data' field)
  const report = await schemaGuard.check('PowerApps:GraphQL:Contacts', graphqlData);
  
  expect(report.hasBreakingChanges).toBe(false);
});
```

See [GRAPHQL-GUIDE.md](./GRAPHQL-GUIDE.md) for more GraphQL-specific details.

---

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/power-apps-api-tests.yml
name: Power Apps API Schema Tests

on: [push, pull_request]

jobs:
  api-schema-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run API schema tests
        env:
          POWER_APPS_TOKEN: ${{ secrets.POWER_APPS_TOKEN }}
        run: npm test -- tests/api/power-apps/
      
      - name: Upload schema drift reports
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: schema-drift-reports
          path: tests/api/schemas/
```

---

## Best Practices for Your Use Case

### 1. **Risk-Based Schema Keys**

Since your scope is risk-based, use descriptive keys:

```typescript
// High-risk endpoints
await schemaGuard.check('PowerApps:Contacts:Critical', response);

// Medium-risk endpoints  
await schemaGuard.check('SharePoint:Lists:Standard', response);

// Low-risk endpoints
await schemaGuard.check('PowerApps:Metadata:LowRisk', response);
```

### 2. **Multi-Sample Learning for Optional Fields**

Power Apps/SharePoint responses often have optional fields. Use multi-sample learning:

```typescript
// Sample 1: Full contact with all fields
await schemaGuard.learn('PowerApps:Contacts', {
  contactid: '123',
  firstname: 'John',
  lastname: 'Doe',
  emailaddress1: 'john@example.com',
  telephone1: '555-1234',
  address1_city: 'Seattle'
});

// Sample 2: Minimal contact (no phone, no address)
await schemaGuard.learn('PowerApps:Contacts', {
  contactid: '456',
  firstname: 'Jane',
  lastname: 'Smith',
  emailaddress1: 'jane@example.com'
});

// Now the schema knows: telephone1 and address1_city are optional
// Future checks won't flag missing fields as breaking changes
```

### 3. **Baseline Management**

When Power Apps/SharePoint structure intentionally changes:

```typescript
// Option 1: Update baseline manually
await schemaGuard.snapshot('PowerApps:Contacts', newResponse);

// Option 2: Use versioning
await schemaGuard.snapshot('PowerApps:Contacts', newResponse, 2);

// Option 3: Compare versions
const report = await schemaGuard.diff('PowerApps:Contacts', 1, 2);
console.log(schemaGuard.format(report, 'markdown'));
```

### 4. **Integration with Your Existing Tests**

```typescript
describe('Power Apps API - Full Test Suite', () => {
  test('Contacts API - Status, Logic, and Structure', async () => {
    const response = await fetchContacts();

    // ✅ Status code (your existing test)
    expect(response.status).toBe(200);

    // ✅ Logic (your existing test)
    const data = await response.json();
    expect(data.value.length).toBeGreaterThan(0);
    expect(data.value[0].firstname).toBeDefined();

    // ✅ Response structure (NEW with api-schema-differentiator)
    const report = await schemaGuard.check('PowerApps:Contacts', data.value);
    expect(report.hasBreakingChanges).toBe(false);
    expect(report.compatibilityScore).toBeGreaterThanOrEqual(90);
  });
});
```

---

## Troubleshooting

**Q: Power Apps returns different fields based on permissions. How to handle?**
- Use multi-sample learning to capture all possible field combinations
- Or create separate baselines per permission level: `PowerApps:Contacts:Admin`, `PowerApps:Contacts:User`

**Q: SharePoint responses include `@odata.context` and other metadata. Should I check those?**
- Option 1: Check only the `value` array: `schemaGuard.check('SP:Lists', data.value)`
- Option 2: Check the full response: `schemaGuard.check('SP:Lists:Full', data)`

**Q: How do I handle Power Apps pagination?**
- Check the schema of the `value` array (the actual items), not the pagination metadata
- Or check both separately: `data.value` and `data['@odata.nextLink']`

---

## Next Steps

1. **Start with one endpoint**: Pick your most critical Power Apps or SharePoint endpoint
2. **Establish baseline**: Run your test once to create the baseline schema
3. **Monitor changes**: Run tests regularly to catch schema drift
4. **Expand gradually**: Add more endpoints as you gain confidence

---

## Resources

- Main [README.md](../README.md) for general usage
- [GRAPHQL-GUIDE.md](./GRAPHQL-GUIDE.md) for GraphQL-specific details
- [KARATE-INTEGRATION-GUIDE.md](../integrations/karate/KARATE-INTEGRATION-GUIDE.md) if using Karate framework

Good luck with your API automation journey! 🚀

