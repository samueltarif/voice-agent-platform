// Executado SÓ pelo smoke da API compilada, com cwd = apps/api e o resolvedor do
// dist: extrai um DOCX mínimo pelo worker real e imprime apenas OK/WRONG.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = join(process.cwd(), 'dist/packages/knowledge-extraction/src/index.js');
const { createKnowledgeUploadExtractor } = await import(pathToFileURL(entry).href);
const result = await createKnowledgeUploadExtractor().extract({
  fileName: 'smoke.docx',
  contentBase64: process.env.SMOKE_DOCX ?? '',
});
process.stdout.write(result.text.includes('QT-310') ? 'EXTRACTION_OK' : 'EXTRACTION_WRONG');
