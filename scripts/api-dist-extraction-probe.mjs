// Executado SÓ pelo smoke da API compilada, com cwd = apps/api e o resolvedor do
// dist: extrai um DOCX e um PDF mínimos pelo PROCESSO FILHO real (DEC-066,
// `--permission`) e imprime apenas OK/WRONG. O PDF traz ações e link para um
// IP externo de documentação: nada disso pode ser acessado.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function tinyPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /URI /URI (http://198.51.100.7/a) >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /Annots [6 0 R] >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Annot /Subtype /Link /Rect [0 0 9 9] /A << /S /URI /URI (http://198.51.100.7/b) >> >>',
  ];
  const content = 'BT /F1 12 Tf 72 720 Td (Transmissor de pressao QT-310) Tj ET';
  objects[3] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  let body = '%PDF-1.7\n';
  const offsets = objects.map((obj, i) => {
    const at = body.length;
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    return at;
  });
  const xref = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;
  return Buffer.from(body, 'latin1').toString('base64');
}

const entry = join(process.cwd(), 'dist/packages/knowledge-extraction/src/index.js');
const { createKnowledgeUploadExtractor } = await import(pathToFileURL(entry).href);
const extractor = createKnowledgeUploadExtractor();
const docx = await extractor.extract({
  fileName: 'smoke.docx',
  contentBase64: process.env.SMOKE_DOCX ?? '',
});
const pdf = await extractor.extract({ fileName: 'smoke.pdf', contentBase64: tinyPdf() });
const ok = docx.text.includes('QT-310') && pdf.text.includes('QT-310') && pdf.format === 'PDF';
process.stdout.write(ok ? 'EXTRACTION_OK' : 'EXTRACTION_WRONG');
