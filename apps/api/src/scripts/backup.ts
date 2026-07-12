import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getDb } from '../db';
import { createProjectsRepository } from '../db/repositories/projectsRepository';
import { createBackup } from '../services/backupService';

const destination = process.argv[2] ?? join(process.cwd(), 'backups', new Date().toISOString().replaceAll(':', '-'));
await mkdir(destination, { recursive: true });
const db = getDb();
const manifest = await createBackup({ db, projects: createProjectsRepository(db).list(), destination });
console.log(`Backup written to ${destination} (${manifest.files.length} files)`);
