#!/bin/bash
# ──────────────────────────────────────────────────────────────
# OPTION 2: Newman (Postman CLI) + api-schema-differentiator
# Run Postman collections, save responses, check for drift.
# ──────────────────────────────────────────────────────────────

# Step 1: Run Newman and export responses
newman run my-collection.json \
  --environment my-env.json \
  --reporters cli,json \
  --reporter-json-export newman-results.json

# Step 2: Extract responses and check each for schema drift
# (Requires jq: https://stedolan.github.io/jq/)
ENDPOINTS=$(jq -r '.run.executions[] | .item.name' newman-results.json)

for endpoint in $ENDPOINTS; do
  echo "Checking: $endpoint"
  
  # Extract response body for this endpoint
  jq -r ".run.executions[] | select(.item.name == \"$endpoint\") | .response.stream" \
    newman-results.json > "tmp-response.json"
  
  # Check for schema drift
  npx api-schema-differentiator check \
    -k "$endpoint" \
    -d tmp-response.json \
    -s ./schemas \
    --fail-on breaking
  
  if [ $? -ne 0 ]; then
    echo "❌ Schema drift detected for: $endpoint"
    exit 1
  fi
done

echo "✅ All API schemas are stable"
rm -f tmp-response.json

