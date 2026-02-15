/**
 * File-based Schema Snapshot Store
 *
 * Stores schema snapshots as JSON files on the local filesystem.
 * No database required. Git-friendly format for version control.
 *
 * Directory structure:
 *   <storeDir>/
 *     <sanitized-key>/
 *       latest.json        → symlink/copy of the latest version
 *       v1.json
 *       v2.json
 *       ...
 */

import * as fs from 'fs';
import * as path from 'path';
import { SchemaStore, SchemaSnapshot } from '../core/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sanitize a key to be a valid directory name.
 */
function sanitizeKey(key: string): string {
  return key
    .replace(/[^a-zA-Z0-9_\-./]/g, '_')
    .replace(/\//g, '__')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200); // reasonable length limit
}

// ─── File Store Implementation ──────────────────────────────────────────────

export class FileStore implements SchemaStore {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  /**
   * Ensure the directory for a key exists.
   */
  private ensureDir(key: string): string {
    const dir = path.join(this.baseDir, sanitizeKey(key));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Get the path for a specific version file.
   */
  private versionPath(key: string, version: number): string {
    return path.join(this.baseDir, sanitizeKey(key), `v${version}.json`);
  }

  /**
   * Get the path for the latest.json file.
   */
  private latestPath(key: string): string {
    return path.join(this.baseDir, sanitizeKey(key), 'latest.json');
  }

  /**
   * Save a schema snapshot. Writes both the versioned file and latest.json.
   */
  async save(snapshot: SchemaSnapshot): Promise<void> {
    this.ensureDir(snapshot.key);
    const data = JSON.stringify(snapshot, null, 2);

    // Write versioned file
    const vPath = this.versionPath(snapshot.key, snapshot.version);
    fs.writeFileSync(vPath, data, 'utf-8');

    // Write/overwrite latest.json
    const lPath = this.latestPath(snapshot.key);
    fs.writeFileSync(lPath, data, 'utf-8');
  }

  /**
   * Load the latest snapshot for a key.
   */
  async load(key: string): Promise<SchemaSnapshot | null> {
    const lPath = this.latestPath(key);
    if (!fs.existsSync(lPath)) return null;

    try {
      const data = fs.readFileSync(lPath, 'utf-8');
      return JSON.parse(data) as SchemaSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * Load a specific version.
   */
  async loadVersion(key: string, version: number): Promise<SchemaSnapshot | null> {
    const vPath = this.versionPath(key, version);
    if (!fs.existsSync(vPath)) return null;

    try {
      const data = fs.readFileSync(vPath, 'utf-8');
      return JSON.parse(data) as SchemaSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * List all versions for a key, sorted by version number ascending.
   */
  async listVersions(key: string): Promise<SchemaSnapshot[]> {
    const dir = path.join(this.baseDir, sanitizeKey(key));
    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f));
    const snapshots: SchemaSnapshot[] = [];

    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(dir, file), 'utf-8');
        snapshots.push(JSON.parse(data) as SchemaSnapshot);
      } catch {
        // Skip corrupted files
      }
    }

    return snapshots.sort((a, b) => a.version - b.version);
  }

  /**
   * List all known keys (directories in the store).
   */
  async listKeys(): Promise<string[]> {
    if (!fs.existsSync(this.baseDir)) return [];

    const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
    const keys: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Read any version file to get the original key
        const latestFile = path.join(this.baseDir, entry.name, 'latest.json');
        if (fs.existsSync(latestFile)) {
          try {
            const data = fs.readFileSync(latestFile, 'utf-8');
            const snapshot = JSON.parse(data) as SchemaSnapshot;
            keys.push(snapshot.key);
          } catch {
            keys.push(entry.name); // Fallback to directory name
          }
        }
      }
    }

    return keys;
  }

  /**
   * Delete a key and all its versions.
   */
  async delete(key: string): Promise<void> {
    const dir = path.join(this.baseDir, sanitizeKey(key));
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

