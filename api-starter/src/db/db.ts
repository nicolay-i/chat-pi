import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations';

export type { DatabaseSync } from 'node:sqlite';

export function createDb(location: string | ':memory:' = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(location);
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

let singleton: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (!singleton) {
    const location = process.env.DB_PATH ?? '.data/app.db';
    singleton = createDb(location);
  }
  return singleton;
}
