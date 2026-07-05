#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const taskId = process.argv[2];
if (!taskId) {
  console.error('Usage: node scripts/verify-subagent-result.mjs <TASK_ID>');
  process.exit(1);
}

const manifestPath = path.join(process.cwd(), '.agents/tasks/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const task = manifest.tasks.find((t) => t.id === taskId);
if (!task) {
  console.error(`Unknown task: ${taskId}`);
  process.exit(1);
}

console.log(`# Verification checklist for ${task.id} — ${task.title}`);
console.log('\nAcceptance:');
for (const item of task.acceptance) console.log(`- [ ] ${item}`);
console.log('\nCommands:');
for (const cmd of task.verificationCommands) console.log(`- ${cmd}`);
console.log('\nRequired report format is in .agents/tasks/' + task.id + '.md');
