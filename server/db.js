import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { setDriver } from './store.js';

const DATA_DIR = process.env.BARAK_DATA || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const sqlite = new DatabaseSync(process.env.BARAK_DB || path.join(DATA_DIR, 'barak.db'));
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
setDriver(sqlite, {
  sha256: (s) => crypto.createHash('sha256').update(s).digest('hex'),
  randomHex: (n) => crypto.randomBytes(n).toString('hex'),
});
export * from './store.js';
