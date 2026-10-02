// Mock dos endpoints do StackSpot usados em scripts/stackspot-client.js
// Uso: npm run mock  (porta 4010, ou PORT=...)
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4010);
const BASE = `http://localhost:${PORT}`;

// Quantas consultas de status até o upload virar INDEXED
const POLLS_UNTIL_INDEXED = Number(process.env.MOCK_POLLS_UNTIL_INDEXED ?? 3);
// MOCK_FAIL=1 faz o upload terminar em ERROR
const FAIL = process.env.MOCK_FAIL === '1';

const knowledgeSources = new Map(); // slug -> { slug, name, description, type }
const objects = new Map(); // slug -> [{ id, file_name }]
const uploads = new Map(); // id -> { id, file_name, target_id, polls, created, uploadedBytes }

// nomes dos arquivos de um zip, lendo o diretório central (assinatura PK\x01\x02)
function zipEntryNames(buffer) {
  const names = [];
  for (let i = buffer.indexOf('PK\x01\x02', 0, 'latin1'); i !== -1; i = buffer.indexOf('PK\x01\x02', i + 4, 'latin1')) {
    const nameLength = buffer.readUInt16LE(i + 28);
    names.push(buffer.toString('utf8', i + 46, i + 46 + nameLength));
  }
  return names;
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function readJson(req) {
  const raw = (await readBody(req)).toString();
  return raw ? JSON.parse(raw) : {};
}

function isAuthorized(req) {
  return /^Bearer .+/.test(req.headers.authorization ?? '');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const route = `${req.method} ${url.pathname}`;
  console.log(`[mock] ${route}`);

  try {
    // POST /{realm}/oidc/oauth/token
    if (req.method === 'POST' && /^\/[^/]+\/oidc\/oauth\/token$/.test(url.pathname)) {
      const params = new URLSearchParams((await readBody(req)).toString());
      if (params.get('grant_type') !== 'client_credentials' || !params.get('client_id') || !params.get('client_secret')) {
        return send(res, 400, { error: 'invalid_request' });
      }
      return send(res, 200, { access_token: 'mock-jwt', token_type: 'Bearer', expires_in: 1200 });
    }

    // POST /s3-upload/{id}: simula o S3 pré-assinado (sem Authorization, como o S3 real)
    const s3 = url.pathname.match(/^\/s3-upload\/([^/]+)$/);
    if (req.method === 'POST' && s3) {
      const upload = uploads.get(s3[1]);
      if (!upload) return send(res, 404, { error: 'upload not found' });
      const body = await readBody(req);
      if (!body.toString('latin1').includes('name="key"')) {
        return send(res, 400, { error: 'campos do form ausentes' });
      }
      upload.uploadedBytes = body.length;
      upload.entryNames = zipEntryNames(body);
      res.writeHead(204);
      return res.end();
    }

    // Demais endpoints exigem Bearer
    if (!isAuthorized(req)) return send(res, 401, { error: 'unauthorized' });

    // POST /v1/knowledge-sources
    if (route === 'POST /v1/knowledge-sources') {
      const { slug, name, type } = await readJson(req);
      if (!slug || !name || !['api', 'snippet', 'custom'].includes(type)) {
        return send(res, 400, { error: 'slug, name e type (api|snippet|custom) são obrigatórios' });
      }
      if (knowledgeSources.has(slug)) return send(res, 409, { error: 'slug já existe' });
      knowledgeSources.set(slug, { slug, name, type });
      return send(res, 201, knowledgeSources.get(slug));
    }

    // POST /v2/file-upload/form
    if (route === 'POST /v2/file-upload/form') {
      const { file_name, target_id, target_type } = await readJson(req);
      if (!file_name || !target_id || target_type !== 'KNOWLEDGE_SOURCE') {
        return send(res, 400, { error: 'file_name, target_id e target_type=KNOWLEDGE_SOURCE são obrigatórios' });
      }
      const id = randomUUID();
      uploads.set(id, { id, file_name, target_id, polls: 0, created: false, uploadedBytes: 0 });
      return send(res, 200, {
        id,
        url: `${BASE}/s3-upload/${id}`,
        form: {
          key: `mock/${id}/${file_name}`,
          'x-amz-algorithm': 'AWS4-HMAC-SHA256',
          'x-amz-credential': 'mock',
          'x-amz-date': '20260101T000000Z',
          'x-amz-security-token': 'mock',
          policy: 'mock',
          'x-amz-signature': 'mock',
        },
      });
    }

    // POST /v1/file-upload/{id}/knowledge-objects
    const ko = url.pathname.match(/^\/v1\/file-upload\/([^/]+)\/knowledge-objects$/);
    if (req.method === 'POST' && ko) {
      const upload = uploads.get(ko[1]);
      if (!upload) return send(res, 404, { error: 'upload not found' });
      if (!upload.uploadedBytes) return send(res, 409, { error: 'arquivo ainda não foi enviado ao S3' });
      const { split_strategy } = await readJson(req);
      const valid = ['NONE', 'LINES_QUANTITY', 'TOKENS_QUANTITY', 'CHARACTERS_QUANTITY', 'SYNTACTIC', 'ENDPOINT'];
      if (!valid.includes(split_strategy)) return send(res, 400, { error: 'split_strategy inválido' });
      upload.created = true;
      const list = objects.get(upload.target_id) ?? [];
      for (const name of upload.entryNames ?? [upload.file_name]) {
        list.push({ id: randomUUID(), file_name: name });
      }
      objects.set(upload.target_id, list);
      return send(res, 200, {});
    }

    // GET /v1/knowledge-sources/{slug}/objects  |  DELETE .../objects/{id}
    const objs = url.pathname.match(/^\/v1\/knowledge-sources\/([^/]+)\/objects(?:\/([^/]+))?$/);
    if (objs) {
      const [, slug, objectId] = objs;
      const list = objects.get(slug) ?? [];
      if (req.method === 'GET' && !objectId) return send(res, 200, list);
      if (req.method === 'DELETE' && objectId) {
        if (!list.some((o) => o.id === objectId)) return send(res, 404, { error: 'object not found' });
        objects.set(slug, list.filter((o) => o.id !== objectId));
        res.writeHead(204);
        return res.end();
      }
    }

    // GET /v1/file-upload/{id}
    const status = url.pathname.match(/^\/v1\/file-upload\/([^/]+)$/);
    if (req.method === 'GET' && status) {
      const upload = uploads.get(status[1]);
      if (!upload) return send(res, 404, { error: 'upload not found' });
      upload.polls += 1;

      const base = { id: upload.id, file_name: upload.file_name, target_id: upload.target_id, target_type: 'KNOWLEDGE_SOURCE' };
      if (!upload.created) return send(res, 200, { ...base, status: 'NEW' });
      if (upload.polls < POLLS_UNTIL_INDEXED) return send(res, 200, { ...base, status: 'PROCESSING' });
      if (FAIL) return send(res, 200, { ...base, status: 'ERROR', error_description: 'falha simulada pelo mock' });
      return send(res, 200, { ...base, status: 'INDEXED', summary: { added: upload.entryNames?.length ?? 1, preserved: 0, removed: 0, errors: {} } });
    }

    send(res, 404, { error: `rota não mockada: ${route}` });
  } catch (error) {
    send(res, 500, { error: String(error) });
  }
});

server.listen(PORT, () => {
  console.log(`[mock] StackSpot mock em ${BASE}`);
  console.log(`[mock] STACKSPOT_IDM_URL=${BASE} STACKSPOT_API_URL=${BASE}`);
});
