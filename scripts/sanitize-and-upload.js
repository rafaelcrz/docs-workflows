
// Funções para ler algumas variáveis de ambiente e argumentos passados para o script

import path from 'node:path';
import { parseArgs } from 'node:util';
import { listPages, extractImages, readSiteConfig } from './read-docusaurus-output.js';

const { values } = parseArgs({
  options: {
    path: { type: 'string' }, // docs source, para sanitização
    'build-path': { type: 'string' }, // build/, para paths + imagens
  },
  strict: false,
});

if (!values.path || !values['build-path']) {
  console.error('Uso: node sanitize-and-upload.js --path <docs-dir> --build-path <build-dir>');
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
