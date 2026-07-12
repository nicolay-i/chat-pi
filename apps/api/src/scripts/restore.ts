import { restoreBackup } from '../services/backupService';

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  throw new Error('Usage: pnpm --filter @pi-agents/api restore <backup-dir> <empty-staging-dir>');
}

const manifest = await restoreBackup(source, destination);
console.log(`Backup restored to ${destination} (${manifest.files.length} files)`);
