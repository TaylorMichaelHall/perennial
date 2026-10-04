import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

// Each test file gets an empty database of its own, so tests never touch ./data.
const directory = mkdtempSync(join(tmpdir(), 'perennial-test-'));
process.env.DATA_DIR = directory;

afterAll(() => rmSync(directory, { recursive: true, force: true }));
