import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

// Limite de 10 MB por arquivo da Knowledge Source (docs do StackSpot)
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function zipFiles(filePaths, zipPath) {
  const zip = new AdmZip();
  for (const filePath of filePaths) {
    zip.addLocalFile(filePath); // entra na raiz do zip, com o nome do arquivo
  }

  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  zip.writeZip(zipPath);

  const { size } = fs.statSync(zipPath);
  if (size > MAX_SIZE_BYTES) {
    throw new Error(`Zip excede 10 MB (${size} bytes): ${zipPath}`);
  }

  console.log(`   ✅ ${filePaths.length} arquivo(s) zipado(s) em ${zipPath} (${(size / 1024).toFixed(1)} KB)`);
  return zipPath;
}
