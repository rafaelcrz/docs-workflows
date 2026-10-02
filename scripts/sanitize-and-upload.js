
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
import { zipFiles } from './zip.js';
import { uploadZipToKnowledgeSource } from './stackspot-client.js';

const { values } = parseArgs({
  options: {
    path: { type: 'string' }, // docs source, para sanitização
    'build-path': { type: 'string' }, // build/, para paths + imagens
    'output-path': { type: 'string', default: './output' }, // saída local do upload (stub)
    'zip-path': { type: 'string', default: './knowledge-source.zip' }, // zip enviado ao StackSpot
    'ks-slug': { type: 'string' }, // slug da KS; padrão: env KS_SLUG (nome do repo do módulo)
    publish: { type: 'boolean', default: false }, // envia o zip ao StackSpot
  },
  strict: false,
});

if (!values.path || !values['build-path']) {
  console.error('Uso: node sanitize-and-upload.js --path <docs-dir> --build-path <build-dir> [--output-path <dir>] [--zip-path <file>] [--publish [--ks-slug <slug>]]');
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

const outputFiles = [];

for (const file of listDocFiles(values.path)) {
  const route = resolveRouteForSource(file, values.path, routeIndex, '/docs');
  const sanitized = sanitize(file, fs.readFileSync(file, 'utf-8'));
  outputFiles.push(upload(route, sanitized, values['output-path']));
}

// zipa só o que foi gerado nesta execução (evita arquivos velhos da pasta de saída)
zipFiles(outputFiles, values['zip-path']);

if (!values.publish) {
  console.log('Concluído (nada foi enviado ao StackSpot; use --publish para enviar).');
  process.exit(0);
}

const ksSlug = values['ks-slug'] ?? process.env.KS_SLUG;
const { STACKSPOT_REALM, STACKSPOT_CLIENT_ID, STACKSPOT_CLIENT_SECRET } = process.env;
if (!ksSlug || !STACKSPOT_REALM || !STACKSPOT_CLIENT_ID || !STACKSPOT_CLIENT_SECRET) {
  console.error('--publish exige o slug (--ks-slug ou env KS_SLUG) e as variáveis STACKSPOT_REALM, STACKSPOT_CLIENT_ID e STACKSPOT_CLIENT_SECRET');
  process.exit(1);
}

const result = await uploadZipToKnowledgeSource({
  credentials: {
    realm: STACKSPOT_REALM,
    clientId: STACKSPOT_CLIENT_ID,
    clientSecret: STACKSPOT_CLIENT_SECRET,
  },
  ksSlug,
  zipPath: values['zip-path'],
});
console.log('Concluído. Resumo do StackSpot:', result.summary);
