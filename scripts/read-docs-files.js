import fs from 'node:fs';
import path from 'node:path';

export function listDocFiles(docsRoot) {
  if (!fs.existsSync(docsRoot)) {
    throw new Error(`Pasta de docs não encontrada: ${docsRoot}`);
  }

  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.mdx?$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(docsRoot);
  return files;
}
