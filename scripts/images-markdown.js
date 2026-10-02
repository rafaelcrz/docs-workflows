import fs from 'node:fs';
import path from 'node:path';

// Nome com "_" inicial: não colide com os arquivos gerados a partir de rotas (docs_intro.md)
const IMAGES_FILE_NAME = '_images.md';

export function writeImagesMarkdown(images, outputDir) {
  const byPage = new Map();
  for (const { imageUrl, page } of images) {
    if (!byPage.has(page)) byPage.set(page, new Set());
    byPage.get(page).add(imageUrl);
  }

  const lines = ['# Imagens encontradas', ''];
  if (byPage.size === 0) {
    lines.push('Nenhuma imagem encontrada.');
  } else {
    for (const [page, urls] of byPage) {
      lines.push(`## ${page}`, '', ...[...urls].map((url) => `- ${url}`), '');
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, IMAGES_FILE_NAME);
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');

  console.log(`[images] lista de imagens gravada em: ${outputPath}`);
  return outputPath;
}
