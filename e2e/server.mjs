/**
 * Starts the built app on an empty database of its own, for the browser tests.
 * Run `npm run build` first.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = mkdtempSync(join(tmpdir(), 'perennial-e2e-'));
process.env.DATA_DIR = directory;
process.env.ORIGIN = `http://localhost:${process.env.PORT}`;
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit());

await import('../build/index.js');
