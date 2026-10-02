import fs from 'node:fs';
import path from 'node:path';

export function upload(route, sanitizedContent, outputDir) {
  const name = route.replace(/^\//, '').replace(/\//g, '_') || 'index';
  const outputPath = path.join(outputDir, `${name}.md`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, sanitizedContent, 'utf-8');

  console.log(`[upload] (stub) arquivo pronto para envio: ${outputPath} (rota: ${route})`);
}
