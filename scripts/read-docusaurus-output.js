// Funções que serão usadas para ler o output do Docusaurus
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';
import matter from 'gray-matter';

const CONFIG_FILES = [
  'docusaurus.config.js',
  'docusaurus.config.mjs',
  'docusaurus.config.cjs',
  'docusaurus.config.ts', // requer Node >= 22.18 (type stripping)
];

async function readSiteConfig(moduleRoot) {
  const configFile = CONFIG_FILES.find((f) => fs.existsSync(path.join(moduleRoot, f)));
  if (!configFile) {
    throw new Error(`docusaurus.config.* não encontrado em: ${moduleRoot}`);
  }
  const mod = await import(pathToFileURL(path.join(moduleRoot, configFile)).href);
  const config = mod.default ?? mod;
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

  for (const { route, htmlPath } of pages) {
    const $ = cheerio.load(fs.readFileSync(htmlPath, 'utf-8'));
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (!src || !src.startsWith(baseUrl)) return;
      images.push({ imageUrl: `${siteUrl}${src}`, page: route });
    });
  }

  return images;
}

function buildRouteIndex(pages) {
  const index = new Map();
  for (const { route, htmlPath } of pages) {
    index.set(route, htmlPath);
  }
  return index;
}

function deriveDefaultRoute(sourceFilePath, docsRoot, routeBasePath = '/docs') {
  let relative = path.relative(docsRoot, sourceFilePath);
  relative = relative.replace(/\.mdx?$/, '');
  relative = relative.replace(/\\/g, '/');

  if (relative.endsWith('/index') || relative === 'index') {
    relative = relative.replace(/\/?index$/, '');
  }

  return `${routeBasePath}/${relative}`.replace(/\/+$/, '') || routeBasePath;
}

function getCustomSlug(sourceFilePath) {
  const raw = fs.readFileSync(sourceFilePath, 'utf-8');
  const { data } = matter(raw);
  return data.slug ?? null;
}

function resolveRouteForSource(sourceFilePath, docsRoot, routeIndex, routeBasePath = '/docs') {
  const customSlug = getCustomSlug(sourceFilePath);

  if (customSlug) {
    const candidate = customSlug.startsWith('/') ? customSlug : `${routeBasePath}/${customSlug}`;
    if (routeIndex.has(candidate)) return candidate;
  }

  return deriveDefaultRoute(sourceFilePath, docsRoot, routeBasePath);
}

export { listPages, extractImages, readSiteConfig, buildRouteIndex, resolveRouteForSource };
