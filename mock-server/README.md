# Mock do StackSpot

Servidor local que simula os endpoints usados por `scripts/stackspot-client.js`, sem dependências.

```bash
npm run mock   # porta 4010 (PORT=... para trocar)
```

Em outro terminal, aponte o script para o mock:

```bash
STACKSPOT_IDM_URL=http://localhost:4010 \
STACKSPOT_API_URL=http://localhost:4010 \
STACKSPOT_POLL_INTERVAL_MS=500 \
STACKSPOT_REALM=meu-realm STACKSPOT_CLIENT_ID=id STACKSPOT_CLIENT_SECRET=secret \
KS_SLUG=checkout \
node scripts/sanitize-and-upload.js --path <docs> --build-path <build> --publish
```

| Variável do mock | Efeito |
|---|---|
| `MOCK_POLLS_UNTIL_INDEXED` | consultas de status até `INDEXED` (padrão 3) |
| `MOCK_FAIL=1` | o upload termina em `ERROR` |

Endpoints: token, `POST /v1/knowledge-sources`, `POST /v2/file-upload/form`, upload S3 (`/s3-upload/{id}`),
`POST /v1/file-upload/{id}/knowledge-objects` e `GET /v1/file-upload/{id}`.
O mock valida o Bearer e os campos obrigatórios, mas não guarda nem processa o conteúdo do zip.

## Como remover os mocks (instruções para o agente)

Faça os passos na ordem. Ao final, a action fala direto com o StackSpot real.

1. **Apague esta pasta inteira:** `mock-server/` (este README some junto, por isso ele é o último a ser lido).

2. **`package.json`:** remova a linha `"mock": "node mock-server/server.js",` de `scripts`.

3. **`scripts/stackspot-client.js`:** remova os overrides por variável de ambiente e volte às constantes fixas:
   ```js
   const IDM_URL = 'https://idm.stackspot.com';
   const API_URL = 'https://data-integration-api.stackspot.com';

   const POLL_INTERVAL_MS = 2 * 60 * 1000;
   const POLL_TIMEOUT_MS = 10 * 60 * 1000;
   ```
   Apague também o comentário `// As variáveis STACKSPOT_* permitem apontar para o mock-server/...`.

4. **`.github/workflows/sanitize-upload-stackspot.yml`:**
   - Em `inputs`, apague `use-mock`. Mantenha `stackspot-realm` e troque para `required: true` (sem `default`), porque o realm real passa a ser obrigatório.
   - Apague os steps **"Subir mock do StackSpot"** e **"Log do mock do StackSpot"**.
   - No step **"Sanitizar e enviar ao StackSpot"**, apague o bloco `if [ "${{ inputs.use-mock }}" = "true" ]; then ... fi`. O `run` fica só com o `node scripts-repo/scripts/sanitize-and-upload.js ... --publish`. Mantenha o `env` (`KS_SLUG`, `STACKSPOT_REALM`, `STACKSPOT_CLIENT_ID`, `STACKSPOT_CLIENT_SECRET`).

5. **Workflows que chamam este (ex.: `main-doc/.github/workflows/main.yml`):** se passarem `use-mock`, remova. Passe `stackspot-realm` em `with:`.

6. **Verifique:** a busca abaixo não pode retornar nada fora de `node_modules`:
   ```bash
   grep -rniE "mock|STACKSPOT_IDM_URL|STACKSPOT_API_URL|STACKSPOT_POLL_INTERVAL_MS|4010" . --exclude-dir=node_modules --exclude-dir=.git
   ```

7. **Publicação:** os workflows chamadores usam a tag `@v1`. Mova ou recrie a tag `v1` no repo `docs-workflows` para a mudança valer.
