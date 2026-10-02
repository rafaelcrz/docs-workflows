import fs from 'node:fs';
import path from 'node:path';

// Fluxo: https://ai.stackspot.com/docs/knowledge-source/create-update-via-api
// As variáveis STACKSPOT_* permitem apontar para o mock-server/ nos testes locais
const IDM_URL = process.env.STACKSPOT_IDM_URL ?? 'https://idm.stackspot.com';
const API_URL = process.env.STACKSPOT_API_URL ?? 'https://data-integration-api.stackspot.com';

const POLL_INTERVAL_MS = Number(process.env.STACKSPOT_POLL_INTERVAL_MS ?? 2 * 60 * 1000);
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${url} falhou: ${response.status} ${await response.text()}`);
  }
  return response;
}

// OAuth2 client credentials. Credencial precisa das permissões ai_dev e ai_admin.
export async function getToken({ realm, clientId, clientSecret }) {
  const response = await request(`${IDM_URL}/${realm}/oidc/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  return (await response.json()).access_token;
}

function jsonHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Só necessário na primeira vez; depois a KS já existe e o zip só atualiza os objetos.
export async function createKnowledgeSource(token, { slug, name, description, type = 'custom' }) {
  await request(`${API_URL}/v1/knowledge-sources`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ slug, name, description, type }),
  });
}

// 1) pede o form pré-assinado do S3
async function requestUploadForm(token, { fileName, ksSlug }) {
  const response = await request(`${API_URL}/v2/file-upload/form`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      file_name: fileName,
      target_id: ksSlug,
      target_type: 'KNOWLEDGE_SOURCE',
      expiration: 600,
    }),
  });
  return response.json(); // { id, url, form }
}

// 2) envia o arquivo ao S3 (os campos do form vêm antes do file)
async function uploadToS3({ url, form }, filePath) {
  const body = new FormData();
  for (const [key, value] of Object.entries(form)) body.append(key, value);
  body.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  await request(url, { method: 'POST', body });
}

// 3) dispara a criação dos knowledge objects a partir do upload
async function createKnowledgeObjects(token, uploadId, { splitStrategy, splitQuantity, splitOverlap }) {
  const body = { split_strategy: splitStrategy };
  if (splitQuantity != null) body.split_quantity = splitQuantity;
  if (splitOverlap != null) body.split_overlap = splitOverlap;

  await request(`${API_URL}/v1/file-upload/${uploadId}/knowledge-objects`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
}

// 4) status: NEW | PROCESSING | SPLITTED | INDEXED | SPLIT_ERROR | ERROR
async function waitForIndexing(token, uploadId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await request(`${API_URL}/v1/file-upload/${uploadId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = await response.json();
    console.log(`[stackspot] status do upload: ${status.status}`);

    if (status.status === 'INDEXED') return status; // status.summary: added/preserved/removed/errors
    if (status.status === 'ERROR' || status.status === 'SPLIT_ERROR') {
      throw new Error(`Upload ${uploadId} falhou: ${status.error_description ?? status.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timeout aguardando indexação do upload ${uploadId}`);
}

// Orquestra o envio de um .zip para uma KS existente
export async function uploadZipToKnowledgeSource({
  credentials,
  ksSlug,
  zipPath,
  split = { splitStrategy: 'NONE' },
}) {
  const token = await getToken(credentials);
  const upload = await requestUploadForm(token, { fileName: path.basename(zipPath), ksSlug });
  await uploadToS3(upload, zipPath);
  await createKnowledgeObjects(token, upload.id, split);
  return waitForIndexing(token, upload.id);
}
