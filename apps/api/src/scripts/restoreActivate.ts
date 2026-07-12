import { readFile } from 'node:fs/promises';
import { activateRestoredBackup, type RestoredProjectMapping } from '../services/restoreActivationService';

const [stagingRoot, mappingsFile] = process.argv.slice(2);
if (!stagingRoot || !mappingsFile) {
  throw new Error('Usage: pnpm --filter @pi-agents/api restore:activate <staging-dir> <project-mappings.json>');
}

const projects = JSON.parse(await readFile(mappingsFile, 'utf8')) as RestoredProjectMapping[];
const activated = await activateRestoredBackup({ stagingRoot, projects });
console.log(`Activated ${activated.length} restored project(s) from ${stagingRoot}`);
