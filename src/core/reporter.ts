/**
 * Report Generator
 *
 * Produces human-readable drift reports in multiple formats:
 * Console (colored), JSON, Markdown, HTML.
 */

import chalk from 'chalk';
import { DriftReport, DriftChange, ReportFormat, DriftSeverity } from './types';

// ─── Severity Icons & Colors ────────────────────────────────────────────────

const SEVERITY_ICON: Record<DriftSeverity, string> = {
  breaking: '🔴',
  warning: '🟡',
  info: '🟢',
};

const SEVERITY_LABEL: Record<DriftSeverity, string> = {
  breaking: 'BREAKING',
  warning: 'WARNING',
  info: 'INFO',
};

// ─── Format Report ──────────────────────────────────────────────────────────

/**
 * Format a drift report in the specified format.
 */
export function formatReport(report: DriftReport, format: ReportFormat): string {
  switch (format) {
    case 'console':
      return formatConsole(report);
    case 'json':
      return formatJson(report);
    case 'markdown':
      return formatMarkdown(report);
    case 'html':
      return formatHtml(report);
    default:
      return formatConsole(report);
  }
}

// ─── Console Format ─────────────────────────────────────────────────────────

function formatConsole(report: DriftReport): string {
  const lines: string[] = [];
  const bar = '━'.repeat(50);

  lines.push('');
  lines.push(chalk.bold(`🔍 Schema Drift Report: ${report.key}`));
  lines.push(chalk.gray(bar));

  if (report.changes.length === 0) {
    lines.push(chalk.green('  ✅ No schema drift detected'));
  } else {
    // Sort: breaking first, then warning, then info
    const sorted = [...report.changes].sort((a, b) => {
      const order: Record<DriftSeverity, number> = { breaking: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    for (const change of sorted) {
      const icon = SEVERITY_ICON[change.severity];
      const label = SEVERITY_LABEL[change.severity].padEnd(8);
      const colorFn =
        change.severity === 'breaking'
          ? chalk.red
          : change.severity === 'warning'
            ? chalk.yellow
            : chalk.green;

      lines.push(`${icon} ${colorFn(label)} ${change.message}`);
    }
  }

  lines.push(chalk.gray(bar));

  // Summary
  const { breaking, warning, info } = report.summary;
  lines.push(
    `Summary: ${chalk.red(`${breaking} breaking`)} | ${chalk.yellow(`${warning} warnings`)} | ${chalk.green(`${info} info`)}`
  );
  lines.push(`Compatibility Score: ${scoreColor(report.compatibilityScore)}`);
  lines.push('');

  return lines.join('\n');
}

function scoreColor(score: number): string {
  if (score >= 90) return chalk.green(`${score}%`);
  if (score >= 70) return chalk.yellow(`${score}%`);
  return chalk.red(`${score}%`);
}

// ─── JSON Format ────────────────────────────────────────────────────────────

function formatJson(report: DriftReport): string {
  return JSON.stringify(report, null, 2);
}

// ─── Markdown Format ────────────────────────────────────────────────────────

function formatMarkdown(report: DriftReport): string {
  const lines: string[] = [];

  lines.push(`# 🔍 Schema Drift Report: ${report.key}`);
  lines.push('');
  lines.push(`**Timestamp:** ${report.timestamp}`);
  lines.push(`**Version:** v${report.previousVersion} → v${report.currentVersion}`);
  lines.push(`**Compatibility Score:** ${report.compatibilityScore}%`);
  lines.push('');

  if (report.changes.length === 0) {
    lines.push('✅ **No schema drift detected**');
    return lines.join('\n');
  }

  // Group by severity
  const grouped = groupBySeverity(report.changes);

  if (grouped.breaking.length > 0) {
    lines.push('## 🔴 Breaking Changes');
    lines.push('');
    for (const c of grouped.breaking) {
      lines.push(`- **${c.path}**: ${c.message}`);
      if (c.before || c.after) {
        lines.push(`  - Before: \`${c.before || 'N/A'}\` → After: \`${c.after || 'N/A'}\``);
      }
    }
    lines.push('');
  }

  if (grouped.warning.length > 0) {
    lines.push('## 🟡 Warnings');
    lines.push('');
    for (const c of grouped.warning) {
      lines.push(`- **${c.path}**: ${c.message}`);
      if (c.before || c.after) {
        lines.push(`  - Before: \`${c.before || 'N/A'}\` → After: \`${c.after || 'N/A'}\``);
      }
    }
    lines.push('');
  }

  if (grouped.info.length > 0) {
    lines.push('## 🟢 Info');
    lines.push('');
    for (const c of grouped.info) {
      lines.push(`- **${c.path}**: ${c.message}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    `**Summary:** ${report.summary.breaking} breaking | ${report.summary.warning} warnings | ${report.summary.info} info`
  );

  return lines.join('\n');
}

// ─── HTML Format ────────────────────────────────────────────────────────────

function formatHtml(report: DriftReport): string {
  const grouped = groupBySeverity(report.changes);

  const changeRows = report.changes
    .map(
      (c) => `
    <tr class="severity-${c.severity}">
      <td><span class="badge badge-${c.severity}">${SEVERITY_LABEL[c.severity]}</span></td>
      <td><code>${escapeHtml(c.path)}</code></td>
      <td>${escapeHtml(c.message)}</td>
      <td>${c.before ? `<code>${escapeHtml(c.before)}</code>` : '—'}</td>
      <td>${c.after ? `<code>${escapeHtml(c.after)}</code>` : '—'}</td>
    </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Schema Drift Report — ${escapeHtml(report.key)}</title>
  <style>
    :root {
      --red: #ef4444; --yellow: #f59e0b; --green: #22c55e;
      --bg: #0f172a; --surface: #1e293b; --text: #e2e8f0; --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .meta { color: var(--muted); margin-bottom: 1.5rem; font-size: 0.875rem; }
    .summary { display: flex; gap: 1rem; margin-bottom: 2rem; }
    .summary-card { background: var(--surface); border-radius: 8px; padding: 1rem 1.5rem; flex: 1; text-align: center; }
    .summary-card .count { font-size: 2rem; font-weight: 700; }
    .summary-card.breaking .count { color: var(--red); }
    .summary-card.warning .count { color: var(--yellow); }
    .summary-card.info .count { color: var(--green); }
    .summary-card .label { color: var(--muted); font-size: 0.75rem; text-transform: uppercase; }
    .score { font-size: 2.5rem; font-weight: 800; }
    .score.high { color: var(--green); }
    .score.mid { color: var(--yellow); }
    .score.low { color: var(--red); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 8px; overflow: hidden; }
    th { background: #334155; padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: var(--muted); }
    td { padding: 0.75rem 1rem; border-top: 1px solid #334155; font-size: 0.875rem; }
    code { background: #334155; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.8rem; }
    .badge { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
    .badge-breaking { background: rgba(239,68,68,0.2); color: var(--red); }
    .badge-warning { background: rgba(245,158,11,0.2); color: var(--yellow); }
    .badge-info { background: rgba(34,197,94,0.2); color: var(--green); }
    .no-drift { text-align: center; padding: 3rem; color: var(--green); font-size: 1.2rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Schema Drift Report</h1>
    <div class="meta">
      <strong>${escapeHtml(report.key)}</strong> · v${report.previousVersion} → v${report.currentVersion} · ${escapeHtml(report.timestamp)}
    </div>

    <div class="summary">
      <div class="summary-card breaking">
        <div class="count">${report.summary.breaking}</div>
        <div class="label">Breaking</div>
      </div>
      <div class="summary-card warning">
        <div class="count">${report.summary.warning}</div>
        <div class="label">Warnings</div>
      </div>
      <div class="summary-card info">
        <div class="count">${report.summary.info}</div>
        <div class="label">Info</div>
      </div>
      <div class="summary-card">
        <div class="score ${report.compatibilityScore >= 90 ? 'high' : report.compatibilityScore >= 70 ? 'mid' : 'low'}">${report.compatibilityScore}%</div>
        <div class="label">Compatibility</div>
      </div>
    </div>

    ${
      report.changes.length === 0
        ? '<div class="no-drift">✅ No schema drift detected</div>'
        : `<table>
      <thead>
        <tr><th>Severity</th><th>Path</th><th>Change</th><th>Before</th><th>After</th></tr>
      </thead>
      <tbody>
        ${changeRows}
      </tbody>
    </table>`
    }
  </div>
</body>
</html>`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function groupBySeverity(changes: DriftChange[]): Record<DriftSeverity, DriftChange[]> {
  return {
    breaking: changes.filter((c) => c.severity === 'breaking'),
    warning: changes.filter((c) => c.severity === 'warning'),
    info: changes.filter((c) => c.severity === 'info'),
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

