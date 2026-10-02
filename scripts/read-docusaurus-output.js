// Funções que serão usadas para ler o output do Docusaurus
const fs = require('fs');
const path = require('path');
// const cheerio = require('cheerio');

function readSiteConfig(moduleDocsPath) {
  const configPath = path.join(moduleDocsPath, 'docusaurus.config.js');
  const config = require(configPath);
  return { siteUrl: config.url, baseUrl: config.baseUrl };
}

function listPages(buildDir) {
  if (!fs.existsSync(buildDir)) {
    throw new Error(`Build dir não encontrado: ${buildDir}. Rode "npm run build" antes.`);
  }

  const pages = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name === 'index.html') {
        const route = '/' + path.relative(buildDir, dir).replace(/\\/g, '/');
        pages.push({ route, htmlPath: fullPath });
      }
    }
  }

  walk(buildDir);
  return pages;
}

function extractImages(pages, siteUrl, baseUrl) {
  const images = [];

  // for (const { route, htmlPath } of pages) {
  //   const $ = cheerio.load(fs.readFileSync(htmlPath, 'utf-8'));
  //   $('img').each((_, el) => {
  //     const src = $(el).attr('src');
  //     if (!src || !src.startsWith(baseUrl)) return;
  //     images.push({ imageUrl: `${siteUrl}${src}`, page: route });
  //   });
  // }

  return images;
}

module.exports = { listPages, extractImages, readSiteConfig };
