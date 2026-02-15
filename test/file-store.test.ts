/**
 * Tests for the File Store
 */

import * as fs from 'fs';
import * as path from 'path';
import { FileStore } from '../src/store/file-store';
import { SchemaSnapshot } from '../src/core/types';

const TEST_STORE_DIR = path.join(__dirname, '.test-file-store');

beforeEach(() => {
  if (fs.existsSync(TEST_STORE_DIR)) {
    fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_STORE_DIR)) {
    fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
  }
});

function createSnapshot(key: string, version: number): SchemaSnapshot {
  return {
    key,
    schema: {
      type: 'object',
      nullable: false,
      properties: { id: { type: 'number', nullable: false } },
      required: ['id'],
    },
    timestamp: new Date().toISOString(),
    version,
    sampleCount: 1,
  };
}

describe('FileStore', () => {
  test('saves and loads a snapshot', async () => {
    const store = new FileStore(TEST_STORE_DIR);
    const snapshot = createSnapshot('GET /users', 1);

    await store.save(snapshot);
    const loaded = await store.load('GET /users');

    expect(loaded).not.toBeNull();
    expect(loaded!.key).toBe('GET /users');
    expect(loaded!.version).toBe(1);
  });

  test('returns null for non-existent key', async () => {
    const store = new FileStore(TEST_STORE_DIR);
    const loaded = await store.load('non-existent');
    expect(loaded).toBeNull();
  });

  test('saves multiple versions', async () => {
    const store = new FileStore(TEST_STORE_DIR);

    await store.save(createSnapshot('GET /users', 1));
    await store.save(createSnapshot('GET /users', 2));
    await store.save(createSnapshot('GET /users', 3));

    const v2 = await store.loadVersion('GET /users', 2);
    expect(v2).not.toBeNull();
    expect(v2!.version).toBe(2);
  });

  test('latest always reflects most recent save', async () => {
    const store = new FileStore(TEST_STORE_DIR);

    await store.save(createSnapshot('GET /users', 1));
    await store.save(createSnapshot('GET /users', 2));

    const latest = await store.load('GET /users');
    expect(latest!.version).toBe(2);
  });

  test('lists all versions sorted', async () => {
    const store = new FileStore(TEST_STORE_DIR);

    await store.save(createSnapshot('GET /users', 3));
    await store.save(createSnapshot('GET /users', 1));
    await store.save(createSnapshot('GET /users', 2));

    const versions = await store.listVersions('GET /users');
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);
    expect(versions[2].version).toBe(3);
  });

  test('lists all keys', async () => {
    const store = new FileStore(TEST_STORE_DIR);

    await store.save(createSnapshot('GET /users', 1));
    await store.save(createSnapshot('POST /orders', 1));

    const keys = await store.listKeys();
    expect(keys).toContain('GET /users');
    expect(keys).toContain('POST /orders');
  });

  test('deletes a key and all versions', async () => {
    const store = new FileStore(TEST_STORE_DIR);

    await store.save(createSnapshot('GET /users', 1));
    await store.save(createSnapshot('GET /users', 2));
    await store.delete('GET /users');

    const loaded = await store.load('GET /users');
    expect(loaded).toBeNull();

    const versions = await store.listVersions('GET /users');
    expect(versions).toHaveLength(0);
  });

  test('handles special characters in keys', async () => {
    const store = new FileStore(TEST_STORE_DIR);
    const snapshot = createSnapshot('GET /api/v2/users/:id?include=profile', 1);

    await store.save(snapshot);
    const loaded = await store.load('GET /api/v2/users/:id?include=profile');
    expect(loaded).not.toBeNull();
    expect(loaded!.key).toBe('GET /api/v2/users/:id?include=profile');
  });

  test('returns empty list for non-existent store directory', async () => {
    const store = new FileStore(path.join(TEST_STORE_DIR, 'nonexistent'));
    const keys = await store.listKeys();
    expect(keys).toHaveLength(0);
  });
});

