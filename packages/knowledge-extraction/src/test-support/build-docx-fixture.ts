import { strToU8, zipSync, type Zippable } from 'fflate';

/** SOMENTE TESTES: monta DOCX mínimos (válidos ou maliciosos) em memória. */
export const WORD_MAIN_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

export function contentTypesXml(mainType: string = WORD_MAIN_CONTENT_TYPE): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    `<Override PartName="/word/document.xml" ContentType="${mainType}"/></Types>`
  );
}

export function documentXml(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}</w:body></w:document>`
  );
}

export const paragraph = (text: string) =>
  `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

export interface DocxFixtureParts {
  readonly contentTypes?: string | undefined;
  readonly document?: string | undefined;
  readonly extra?: Readonly<Record<string, string | Uint8Array>> | undefined;
}

export function buildDocx(parts: DocxFixtureParts = {}): Uint8Array {
  const files: Zippable = {
    '[Content_Types].xml': strToU8(parts.contentTypes ?? contentTypesXml()),
    'word/document.xml': strToU8(parts.document ?? documentXml(paragraph('Olá'))),
  };
  for (const [name, value] of Object.entries(parts.extra ?? {})) {
    files[name] = typeof value === 'string' ? strToU8(value) : value;
  }
  return zipSync(files, { level: 6 });
}

export const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
