#!/usr/bin/env node

/**
 * api-schema-differentiator CLI
 *
 * Commands:
 *   snapshot  - Take a schema snapshot from a response file or URL
 *   check     - Check a response against a stored snapshot
 *   diff      - Compare two schema versions
 *   list      - List all monitored endpoints
 *   history   - Show version history for an endpoint
 *   watch     - Watch an endpoint for drift (periodic polling)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { SchemaGuard } from './guard';
import { inferSchema } from './core/inferrer';
import { diffSchemas, calculateCompatibilityScore } from './core/differ';
import { formatReport } from './core/reporter';
import { autoParse } from './formats';
import { ReportFormat, DriftReport } from './core/types';

const program = new Command();

program
  .name('api-schema-differentiator')
  .description('Know when your APIs change before your users do.')
  .version('1.0.0');

// ─── Common Options ─────────────────────────────────────────────────────────

function getGuard(storeDir: string): SchemaGuard {
  return new SchemaGuard({ store: storeDir, autoSnapshot: true });
}

function readResponseInput(fileOrData: string): unknown {
  // If it looks like a file path, read it
  if (fs.existsSync(fileOrData)) {
    const content = fs.readFileSync(fileOrData, 'utf-8');
    return autoParse(content);
  }

  // Otherwise treat as inline data
  return autoParse(fileOrData);
}

// ─── snapshot Command ───────────────────────────────────────────────────────

program
  .command('snapshot')
  .description('Take a schema snapshot from a response file or inline JSON')
  .requiredOption('-k, --key <key>', 'Endpoint key (e.g., "GET /api/v2/users")')
  .requiredOption('-d, --data <data>', 'Response data (file path or inline JSON)')
  .option('-s, --store <dir>', 'Schema store directory', './schemas')
  .option('--version <n>', 'Force a specific version number', parseInt)
  .action(async (opts) => {
    try {
      const guard = getGuard(opts.store);
      const data = readResponseInput(opts.data);
      const snapshot = await guard.snapshot(opts.key, data, opts.version);

      console.log(`✅ Schema snapshot saved`);
      console.log(`   Key:     ${snapshot.key}`);
      console.log(`   Version: v${snapshot.version}`);
      console.log(`   Samples: ${snapshot.sampleCount}`);
      console.log(`   Stored:  ${opts.store}`);
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// ─── check Command ──────────────────────────────────────────────────────────

program
  .command('check')
  .description('Check a response against the stored schema snapshot')
  .requiredOption('-k, --key <key>', 'Endpoint key')
  .requiredOption('-d, --data <data>', 'Response data (file path or inline JSON)')
  .option('-s, --store <dir>', 'Schema store directory', './schemas')
  .option('-f, --format <format>', 'Report format: console, json, markdown, html', 'console')
  .option('--fail-on <severity>', 'Exit with code 1 on: breaking, warning, info', 'breaking')
  .option('-o, --output <file>', 'Write report to file instead of stdout')
  .action(async (opts) => {
    try {
      const guard = getGuard(opts.store);
      const data = readResponseInput(opts.data);
      const report = await guard.check(opts.key, data);

      const formatted = guard.format(report, opts.format as ReportFormat);

      if (opts.output) {
        fs.writeFileSync(opts.output, formatted, 'utf-8');
        console.log(`📄 Report written to ${opts.output}`);
      } else {
        console.log(formatted);
      }

      // Exit code based on --fail-on
      const severityOrder = { info: 0, warning: 1, breaking: 2 };
      const failThreshold = severityOrder[opts.failOn as keyof typeof severityOrder] ?? 2;

      if (report.changes.some((c) => severityOrder[c.severity] >= failThreshold)) {
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// ─── diff Command ───────────────────────────────────────────────────────────

program
  .command('diff')
  .description('Compare two response files or two schema versions')
  .option('-k, --key <key>', 'Endpoint key (for comparing stored versions)')
  .option('--before <data>', 'Before response (file path or inline JSON)')
  .option('--after <data>', 'After response (file path or inline JSON)')
  .option('--v1 <n>', 'Before version number', parseInt)
  .option('--v2 <n>', 'After version number', parseInt)
  .option('-s, --store <dir>', 'Schema store directory', './schemas')
  .option('-f, --format <format>', 'Report format: console, json, markdown, html', 'console')
  .option('-o, --output <file>', 'Write report to file')
  .action(async (opts) => {
    try {
      let report: DriftReport;

      if (opts.before && opts.after) {
        // Direct file/data comparison
        const guard = getGuard(opts.store);
        const beforeData = readResponseInput(opts.before);
        const afterData = readResponseInput(opts.after);
        report = guard.diffData(beforeData, afterData);
      } else if (opts.key && opts.v1 !== undefined && opts.v2 !== undefined) {
        // Compare stored versions
        const guard = getGuard(opts.store);
        report = await guard.diff(opts.key, opts.v1, opts.v2);
      } else {
        console.error('❌ Provide either --before/--after or --key with --v1/--v2');
        process.exit(1);
        return;
      }

      const formatted = formatReport(report, opts.format as ReportFormat);

      if (opts.output) {
        fs.writeFileSync(opts.output, formatted, 'utf-8');
        console.log(`📄 Report written to ${opts.output}`);
      } else {
        console.log(formatted);
      }
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// ─── list Command ───────────────────────────────────────────────────────────

program
  .command('list')
  .description('List all monitored endpoint keys')
  .option('-s, --store <dir>', 'Schema store directory', './schemas')
  .action(async (opts) => {
    try {
      const guard = getGuard(opts.store);
      const keys = await guard.listKeys();

      if (keys.length === 0) {
        console.log('📭 No schemas stored yet.');
        return;
      }

      console.log(`📋 Monitored endpoints (${keys.length}):\n`);
      for (const key of keys) {
        const versions = await guard.listVersions(key);
        const latest = versions[versions.length - 1];
        console.log(`  • ${key}`);
        console.log(`    Latest: v${latest?.version || '?'} (${latest?.timestamp || 'unknown'})`);
        console.log(`    Samples: ${latest?.sampleCount || '?'}`);
        console.log('');
      }
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// ─── history Command ────────────────────────────────────────────────────────

program
  .command('history')
  .description('Show version history for an endpoint')
  .requiredOption('-k, --key <key>', 'Endpoint key')
  .option('-s, --store <dir>', 'Schema store directory', './schemas')
  .action(async (opts) => {
    try {
      const guard = getGuard(opts.store);
      const versions = await guard.listVersions(opts.key);

      if (versions.length === 0) {
        console.log(`📭 No versions found for "${opts.key}"`);
        return;
      }

      console.log(`📜 Version history for "${opts.key}":\n`);
      for (const v of versions) {
        console.log(`  v${v.version} — ${v.timestamp} (${v.sampleCount} samples)`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

// ─── watch Command ──────────────────────────────────────────────────────────

program
  .command('watch')
  .description('Periodically poll an API endpoint and alert on schema drift')
  .requiredOption('-u, --url <url>', 'URL to poll')
  .option('-k, --key <key>', 'Endpoint key (defaults to URL)')
  .option('-H, --header <headers...>', 'HTTP headers (format: "Key: Value")')
  .option('-m, --method <method>', 'HTTP method', 'GET')
  .option('-b, --body <body>', 'Request body')
  .option('-i, --interval <ms>', 'Poll interval (e.g., "30s", "5m", "1h")', '1h')
  .option('-s, --store <dir>', 'Schema store directory', './schemas')
  .option('--alert-webhook <url>', 'Webhook URL for drift alerts')
  .option('--fail-on <severity>', 'Alert severity threshold', 'warning')
  .action(async (opts) => {
    const key = opts.key || opts.url;
    const intervalMs = parseInterval(opts.interval);

    const headers: Record<string, string> = {};
    if (opts.header) {
      for (const h of opts.header) {
        const [k, ...v] = h.split(':');
        headers[k.trim()] = v.join(':').trim();
      }
    }

    console.log(`👁️  Watching: ${opts.url}`);
    console.log(`   Key: ${key}`);
    console.log(`   Interval: ${opts.interval}`);
    console.log(`   Store: ${opts.store}`);
    if (opts.alertWebhook) console.log(`   Webhook: ${opts.alertWebhook}`);
    console.log('');

    const guard = getGuard(opts.store);

    const poll = async () => {
      try {
        const fetchOptions: RequestInit = {
          method: opts.method,
          headers,
        };
        if (opts.body) fetchOptions.body = opts.body;

        const res = await fetch(opts.url, fetchOptions);
        const text = await res.text();
        const data = autoParse(text);

        const report = await guard.check(key, data);
        const formatted = guard.format(report, 'console');
        console.log(`[${new Date().toISOString()}]`);
        console.log(formatted);

        // Send webhook alert if needed
        if (opts.alertWebhook && report.hasBreakingChanges) {
          await sendWebhookAlert(opts.alertWebhook, report);
        }
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] ❌ Poll failed: ${error instanceof Error ? error.message : error}`
        );
      }
    };

    // Initial poll
    await poll();

    // Schedule recurring polls
    setInterval(poll, intervalMs);
  });

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseInterval(input: string): number {
  const match = input.match(/^(\d+)(s|m|h|ms)?$/);
  if (!match) return 3600000; // default 1h

  const num = parseInt(match[1], 10);
  const unit = match[2] || 'ms';

  switch (unit) {
    case 'ms':
      return num;
    case 's':
      return num * 1000;
    case 'm':
      return num * 60 * 1000;
    case 'h':
      return num * 60 * 60 * 1000;
    default:
      return num;
  }
}

async function sendWebhookAlert(webhookUrl: string, report: DriftReport): Promise<void> {
  try {
    const payload = {
      text: `🚨 Schema Drift Detected: ${report.key}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚨 Schema Drift Detected*\n*Endpoint:* ${report.key}\n*Breaking:* ${report.summary.breaking} | *Warnings:* ${report.summary.warning} | *Info:* ${report.summary.info}\n*Compatibility:* ${report.compatibilityScore}%`,
          },
        },
      ],
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`⚠️  Webhook alert failed: ${error instanceof Error ? error.message : error}`);
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

program.parse();

