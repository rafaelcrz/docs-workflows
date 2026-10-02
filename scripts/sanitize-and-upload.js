
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
import { writeImagesMarkdown } from './images-markdown.js';
import { zipFiles } from './zip.js';
import {
  getToken,
  listKnowledgeObjects,
  deleteKnowledgeObject,
  uploadZipToKnowledgeSource,
} from './stackspot-client.js';
import { computeDiff } from './reconcile.js';

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
  console.error('❌ Uso: node sanitize-and-upload.js --path <docs-dir> --build-path <build-dir> [--output-path <dir>] [--zip-path <file>] [--publish [--ks-slug <slug>]]');
  process.exit(1);
}

const TOTAL_STEPS = values.publish ? 8 : 5;
let currentStep = 0;
const step = (emoji, message) => console.log(`\n${emoji} [${++currentStep}/${TOTAL_STEPS}] ${message}`);

console.log('🚀 Sanitize and Upload — StackSpot');
console.log(`   📁 Docs:   ${values.path}`);
console.log(`   🏗️  Build:  ${values['build-path']}`);
console.log(`   📤 Saída:  ${values['output-path']}`);
console.log(`   🔌 Modo:   ${values.publish ? 'publicar no StackSpot' : 'somente gerar arquivos (sem enviar)'}`);

step('⚙️', 'Lendo configuração do Docusaurus');
// o docusaurus.config.* fica na raiz do módulo, um nível acima da pasta docs
const { siteUrl, baseUrl } = await readSiteConfig(path.dirname(path.resolve(values.path)));
console.log(`   🌐 siteUrl: ${siteUrl} | baseUrl: ${baseUrl}`);

step('🗂️', 'Lendo páginas geradas no build');
const pages = listPages(values['build-path']);
const routeIndex = buildRouteIndex(pages);
console.log(`   ✅ ${pages.length} página(s) encontrada(s)`);

step('🖼️', 'Extraindo imagens das páginas');
const images = extractImages(pages, siteUrl, baseUrl);
console.log(`   ✅ ${images.length} imagem(ns) encontrada(s)`);

step('🧹', 'Sanitizando e nomeando arquivos pelas rotas');
const docFiles = listDocFiles(values.path);
console.log(`   📄 ${docFiles.length} arquivo(s) .md/.mdx encontrado(s)`);

const outputFiles = [];
for (const file of docFiles) {
  const route = resolveRouteForSource(file, values.path, routeIndex, '/docs');
  const sanitized = sanitize(file, fs.readFileSync(file, 'utf-8'));
  const outputPath = upload(route, sanitized, values['output-path']);
  outputFiles.push(outputPath);
  console.log(`   ✅ ${path.relative(values.path, file)} → ${path.basename(outputPath)} (rota: ${route})`);
}
outputFiles.push(writeImagesMarkdown(images, values['output-path']));

step('📦', 'Gerando o arquivo .zip');
// zipa só o que foi gerado nesta execução (evita arquivos velhos da pasta de saída)
zipFiles(outputFiles, values['zip-path']);

if (!values.publish) {
  console.log('\n🎉 Concluído! Nada foi enviado ao StackSpot (use --publish para enviar).');
  process.exit(0);
}

const ksSlug = values['ks-slug'] ?? process.env.KS_SLUG;
const { STACKSPOT_REALM, STACKSPOT_CLIENT_ID, STACKSPOT_CLIENT_SECRET } = process.env;
if (!ksSlug || !STACKSPOT_REALM || !STACKSPOT_CLIENT_ID || !STACKSPOT_CLIENT_SECRET) {
  console.error('❌ --publish exige o slug (--ks-slug ou env KS_SLUG) e as variáveis STACKSPOT_REALM, STACKSPOT_CLIENT_ID e STACKSPOT_CLIENT_SECRET');
  process.exit(1);
}

step('🔍', 'Comparando com o que já existe na Knowledge Source');
console.log(`   🎯 Knowledge Source: ${ksSlug}`);
console.log('   🔑 Autenticando...');
const token = await getToken({
  realm: STACKSPOT_REALM,
  clientId: STACKSPOT_CLIENT_ID,
  clientSecret: STACKSPOT_CLIENT_SECRET,
});
const existingObjects = await listKnowledgeObjects(token, ksSlug);
console.log(`   📚 ${existingObjects.length} objeto(s) existente(s) na KS`);

const diff = computeDiff(outputFiles, existingObjects);
console.log(`   ➕ Criar: ${diff.create.length} | 🔄 Atualizar: ${diff.update.length} | 🗑️  Remover: ${diff.remove.length}`);
for (const { fileName } of diff.remove) console.log(`      🗑️  ${fileName} (não existe mais no build)`);

step('🗑️', 'Removendo objetos desatualizados e obsoletos');
// atualizar = apagar o objeto antigo e enviar o novo no zip
const idsToDelete = [...diff.update, ...diff.remove].flatMap(({ ids }) => ids);
for (const id of idsToDelete) {
  await deleteKnowledgeObject(token, ksSlug, id);
}
console.log(`   ✅ ${idsToDelete.length} objeto(s) removido(s)`);

step('☁️', 'Enviando para a Knowledge Source do StackSpot');
// criar + atualizar = todos os arquivos desejados, então o zip já contém exatamente isso
const result = await uploadZipToKnowledgeSource({ token, ksSlug, zipPath: values['zip-path'] });

const { added, preserved, removed } = result.summary ?? {};
console.log(`\n🎉 Concluído! Resumo: ➕ ${added ?? 0} adicionado(s) | ♻️  ${preserved ?? 0} preservado(s) | ➖ ${removed ?? 0} removido(s)`);
