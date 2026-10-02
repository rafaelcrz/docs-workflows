import path from 'node:path';

// Reconciliação "desired state vs actual state":
//   desejado = arquivos gerados nesta execução; atual = knowledge objects já existentes na KS.
// A chave de comparação é o nome do arquivo (docs_intro.md), que é 1:1 com a rota.
export function computeDiff(desiredFilePaths, existingObjects) {
  const desired = new Set(desiredFilePaths.map((filePath) => path.basename(filePath)));

  // um arquivo pode virar mais de um objeto dependendo do split_strategy
  const existing = new Map();
  for (const { id, fileName } of existingObjects) {
    if (!existing.has(fileName)) existing.set(fileName, []);
    existing.get(fileName).push(id);
  }

  const create = [];
  const update = [];
  for (const fileName of desired) {
    if (existing.has(fileName)) update.push({ fileName, ids: existing.get(fileName) });
    else create.push({ fileName });
  }

  const remove = [];
  for (const [fileName, ids] of existing) {
    if (!desired.has(fileName)) remove.push({ fileName, ids });
  }

  return { create, update, remove };
}
