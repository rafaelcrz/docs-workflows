
// Funções para ler algumas variáveis de ambiente e argumentos passados para o script

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { listDocFiles } from './read-docs-files.js';
import {
  listPages,
  extractImages,
  readSiteConfig,
  buildRouteIndex,
  resolveRouteForSource,
} from './read-docusaurus-output.js';
import { sanitize } from './sanitize.js';
import { upload } from './upload.js';

const { values } = parseArgs({
  options: {
    path: { type: 'string' }, // docs source, para sanitização
    'build-path': { type: 'string' }, // build/, para paths + imagens
    'output-path': { type: 'string', default: './output' }, // saída local do upload (stub)
  },
  strict: false,
});

if (!values.path || !values['build-path']) {
  console.error('Uso: node sanitize-and-upload.js --path <docs-dir> --build-path <build-dir> [--output-path <dir>]');
  process.exit(1);
}

console.log('Path do docs:', values.path);
console.log('Path do build:', values['build-path']);

console.log('CLIENT_ID definido?', !!process.env.STACKSPOT_CLIENT_ID);
console.log('Tamanho:', process.env.STACKSPOT_CLIENT_ID?.length);

// o docusaurus.config.* fica na raiz do módulo, um nível acima da pasta docs
const { siteUrl, baseUrl } = await readSiteConfig(path.dirname(path.resolve(values.path)));
const pages = listPages(values['build-path']);
const images = extractImages(pages, siteUrl, baseUrl);

console.log(`Páginas encontradas: ${pages.length}`);
console.log(pages);
console.log(`Imagens encontradas: ${images.length}`);
console.log(images);

const routeIndex = buildRouteIndex(pages);

for (const file of listDocFiles(values.path)) {
  const route = resolveRouteForSource(file, values.path, routeIndex, '/docs');
  const sanitized = sanitize(file, fs.readFileSync(file, 'utf-8'));
  upload(route, sanitized, values['output-path']);
}

console.log('Concluído (stub — nada foi enviado para o StackSpot).');
