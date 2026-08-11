import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(here, '..', 'public');
const distRoot = resolve(here, '..', 'dist');

mkdirSync(distRoot, { recursive: true });
for (const name of readdirSync(publicRoot)) {
  copyFileSync(join(publicRoot, name), join(distRoot, name));
}

const indexPath = join(distRoot, 'index.html');
let index = readFileSync(indexPath, 'utf8');
if (!index.includes('manifest.webmanifest')) {
  index = index.replace('</head>', '  <link rel="manifest" href="/manifest.webmanifest" />\n  <meta name="theme-color" content="#2563eb" />\n</head>');
  writeFileSync(indexPath, index, 'utf8');
}
