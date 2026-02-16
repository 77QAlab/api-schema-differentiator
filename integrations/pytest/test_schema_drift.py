"""
api-schema-differentiator + Python (pytest / requests) Example

Since api-schema-differentiator is a Node.js tool, use the CLI via subprocess.
Or wait for the native Python port (coming soon).

Install:  npm install -g api-schema-differentiator
          pip install requests pytest
Run:      pytest test_schema_drift.py -v
"""

import json
import subprocess
import tempfile
import os
import requests
import pytest


def check_schema_drift(key: str, response_data: dict, store: str = "./schemas", fail_on: str = "breaking") -> dict:
    """
    Run api-schema-differentiator CLI and return the parsed drift report.
    """
    # Write response to a temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(response_data, f)
        tmp_path = f.name

    try:
        result = subprocess.run(
            [
                "npx", "api-schema-differentiator", "check",
                "-k", key,
                "-d", tmp_path,
                "-s", store,
                "-f", "json",
                "--fail-on", fail_on,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        report = json.loads(result.stdout) if result.stdout.strip() else {}
        return {
            "exit_code": result.returncode,
            "has_drift": result.returncode != 0,
            "has_breaking": report.get("hasBreakingChanges", False),
            "breaking_count": report.get("summary", {}).get("breaking", 0),
            "warning_count": report.get("summary", {}).get("warning", 0),
            "compatibility_score": report.get("compatibilityScore", 100),
            "report": report,
        }
    finally:
        os.unlink(tmp_path)


class TestAPISchemas:
    """API Schema Drift Tests"""

    def test_users_api_no_breaking_drift(self):
        response = requests.get("https://api.example.com/v2/users/1")
        result = check_schema_drift("GET /api/v2/users/:id", response.json())

        assert not result["has_breaking"], (
            f"Users API has {result['breaking_count']} breaking changes! "
            f"Compatibility: {result['compatibility_score']}%"
        )

    def test_products_api_no_breaking_drift(self):
        response = requests.get("https://api.example.com/v2/products")
        result = check_schema_drift("GET /api/v2/products", response.json())

        assert not result["has_breaking"]
        assert result["compatibility_score"] >= 90

    def test_orders_api_no_breaking_drift(self):
        response = requests.post(
            "https://api.example.com/v2/orders",
            json={"product": "Widget", "quantity": 5},
        )
        result = check_schema_drift("POST /api/v2/orders", response.json())

        assert result["breaking_count"] == 0

