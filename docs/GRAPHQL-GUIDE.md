# GraphQL Integration Guide

**api-schema-differentiator** fully supports GraphQL responses! This guide shows you how to use it with GraphQL endpoints, including SharePoint/SPFx and Power Apps GraphQL APIs.

---

## How GraphQL Support Works

The library automatically detects and parses GraphQL responses. GraphQL responses have this structure:

```json
{
  "data": { ... },
  "errors": [ ... ],
  "extensions": { ... }
}
```

**api-schema-differentiator** extracts the `data` field and infers the schema from it, just like any other JSON response.

---

## Basic GraphQL Usage

### Option 1: Direct Library Usage

```typescript
import { SchemaGuard } from 'api-schema-differentiator';
import { parseGraphqlResponse } from 'api-schema-differentiator';

const guard = new SchemaGuard({ store: './schemas' });

// Fetch GraphQL response
const response = await fetch('https://your-api.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          email
          posts {
            title
            content
          }
        }
      }
    `,
    variables: { id: '1' }
  })
});

const graphqlData = await response.json();

// Option A: Let it auto-detect (recommended)
const report = await guard.check('GraphQL:GetUser', graphqlData);

// Option B: Explicitly extract data field
const dataOnly = parseGraphqlResponse(graphqlData);
const report = await guard.check('GraphQL:GetUser', dataOnly);
```

### Option 2: CLI Usage

```bash
# Save GraphQL response to a file first
curl -X POST https://your-api.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ user(id: 1) { id name } }"}' \
  > graphql-response.json

# Check for drift
api-schema-differentiator check \
  -k "GraphQL:GetUser" \
  -d graphql-response.json \
  -s ./schemas
```

---

## SharePoint / SPFx GraphQL Integration

SharePoint uses Microsoft Graph API, which supports GraphQL-style queries. Here's how to integrate:

### Example: SharePoint List Items Query

```typescript
import { SchemaGuard } from 'api-schema-differentiator';

const guard = new SchemaGuard({ store: './schemas' });

// SharePoint GraphQL query
const query = `
  query GetListItems($listId: String!) {
    list(id: $listId) {
      items {
        id
        title
        created
        author {
          displayName
          email
        }
        fields {
          ... on TextField {
            value
          }
        }
      }
    }
  }
`;

async function testSharePointSchema() {
  const response = await fetch('https://graph.microsoft.com/v1.0/$batch', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [{
        id: '1',
        method: 'POST',
        url: '/graphql',
        body: { query, variables: { listId: 'your-list-id' } }
      }]
    })
  });

  const data = await response.json();
  
  // Check schema drift
  const report = await guard.check('SharePoint:GetListItems', data);
  
  if (report.hasBreakingChanges) {
    console.error('SharePoint API schema changed!', guard.format(report));
    throw new Error('Schema drift detected');
  }
}
```

### Using with SPFx (SharePoint Framework)

```typescript
// In your SPFx solution
import { SchemaGuard } from 'api-schema-differentiator';

export class MyWebPart {
  private guard = new SchemaGuard({ store: './schemas' });

  public async onInit(): Promise<void> {
    // Your existing SPFx initialization
  }

  public async render(): Promise<void> {
    try {
      // Fetch data from SharePoint
      const response = await this.context.spHttpClient.get(
        `${this.context.pageContext.web.absoluteUrl}/_api/web/lists/getbytitle('Documents')/items`,
        SPHttpClient.configurations.v1
      );
      
      const data = await response.json();
      
      // Check schema drift
      const report = await this.guard.check('SPFx:DocumentsList', data);
      
      if (report.hasBreakingChanges) {
        console.warn('Schema drift detected:', guard.format(report, 'markdown'));
      }
      
      // Continue with your rendering logic
      this.renderItems(data.value);
    } catch (error) {
      console.error('Error:', error);
    }
  }
}
```

---

## Power Apps GraphQL Integration

Power Apps can use GraphQL through Power Platform APIs. Here's how to monitor them:

### Example: Power Apps Dataverse Query

```typescript
import { SchemaGuard } from 'api-schema-differentiator';

const guard = new SchemaGuard({ store: './schemas' });

async function testPowerAppsSchema() {
  // Power Apps Dataverse uses OData, but you can also use GraphQL-style queries
  const response = await fetch(
    'https://your-environment.crm.dynamics.com/api/data/v9.2/contacts?$select=contactid,firstname,lastname,emailaddress1',
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'Accept': 'application/json'
      }
    }
  );

  const data = await response.json();
  
  // Power Apps returns OData format: { value: [...] }
  // Check the schema of the value array
  const report = await guard.check('PowerApps:Contacts', data.value);
  
  if (report.hasBreakingChanges) {
    console.error('Power Apps schema changed!', guard.format(report));
  }
}
```

### Power Apps with GraphQL (if using GraphQL endpoint)

```typescript
const graphqlQuery = `
  query GetContacts {
    contacts {
      contactid
      firstname
      lastname
      emailaddress1
      createdon
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
const report = await guard.check('PowerApps:GraphQL:Contacts', graphqlData);
```

---

## Testing GraphQL Queries in Your Test Framework

### Jest Example

```typescript
import { SchemaGuard } from 'api-schema-differentiator';

const guard = new SchemaGuard({ store: './schemas' });

describe('GraphQL API Schema Tests', () => {
  test('GetUser query schema is stable', async () => {
    const response = await fetch('https://api.example.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetUser($id: ID!) {
            user(id: $id) {
              id
              name
              email
            }
          }
        `,
        variables: { id: '1' }
      })
    });

    const data = await response.json();
    const report = await guard.check('GraphQL:GetUser', data);

    expect(report.hasBreakingChanges).toBe(false);
    expect(report.compatibilityScore).toBeGreaterThanOrEqual(90);
  });

  test('GetPosts query schema is stable', async () => {
    const response = await fetch('https://api.example.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetPosts {
            posts {
              id
              title
              author {
                name
              }
            }
          }
        `
      })
    });

    const data = await response.json();
    const report = await guard.check('GraphQL:GetPosts', data);

    expect(report.summary.breaking).toBe(0);
  });
});
```

---

## Handling GraphQL Errors

GraphQL responses can include both `data` and `errors`. The library handles this:

```typescript
const response = await fetch('https://api.example.com/graphql', { ... });
const graphqlData = await response.json();

// If there are errors, you might want to check the data field separately
if (graphqlData.errors) {
  console.warn('GraphQL errors:', graphqlData.errors);
}

// Check schema of the data field (even if partial)
if (graphqlData.data) {
  const report = await guard.check('GraphQL:MyQuery', graphqlData);
  // This will check the schema of graphqlData.data
}
```

---

## Key Points for GraphQL

1. **Query-specific keys**: Use descriptive keys like `GraphQL:GetUser` or `GraphQL:GetPosts` to track different queries separately

2. **Variables matter**: The same query with different variables might return different schemas. Consider including variable info in the key:
   ```typescript
   const key = `GraphQL:GetUser:${JSON.stringify(variables)}`;
   ```

3. **Fragments**: GraphQL fragments are resolved before the response, so the library sees the final structure

4. **Multiple queries**: If you use batch queries, check each query's response separately:
   ```typescript
   const batchResponse = await fetch(..., {
     body: JSON.stringify({
       queries: [
         { id: '1', query: 'query GetUser { ... }' },
         { id: '2', query: 'query GetPosts { ... }' }
       ]
     })
   });
   
   const results = await batchResponse.json();
   await guard.check('GraphQL:GetUser', results['1']);
   await guard.check('GraphQL:GetPosts', results['2']);
   ```

---

## Troubleshooting

**Q: The library isn't detecting my GraphQL response correctly**
- Make sure your response has the `data` field
- Try explicitly extracting: `parseGraphqlResponse(response)`

**Q: How do I handle GraphQL subscriptions?**
- Subscriptions return streaming data. Capture a snapshot of the first message and check that schema

**Q: Can I check the schema of GraphQL introspection queries?**
- Yes! Just use the introspection response as any other GraphQL response

---

## Next Steps

- See the main [README.md](../README.md) for general usage
- Check [KARATE-INTEGRATION-GUIDE.md](./KARATE-INTEGRATION-GUIDE.md) for Karate-specific examples
- Review integration examples in the `integrations/` directory

