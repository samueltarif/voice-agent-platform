import { createHash } from 'node:crypto';
import { Zlib, strToU8, zlibSync } from 'fflate';

/**
 * SOMENTE TESTES (DEC-066): gerador determinístico de PDFs mínimos, sem
 * arquivos binários no repositório. Cada PDF tem xref e `%%EOF` válidos.
 */
export interface PdfObject {
  readonly dict: string;
  readonly stream?: Uint8Array | undefined;
}

const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function objectBytes(n: number, obj: PdfObject): Uint8Array {
  if (!obj.stream) return latin1(`${n} 0 obj\n${obj.dict}\nendobj\n`);
  const dict = obj.dict.replace(/>>\s*$/, ` /Length ${obj.stream.length} >>`);
  return concat([
    latin1(`${n} 0 obj\n${dict}\nstream\n`),
    obj.stream,
    latin1('\nendstream\nendobj\n'),
  ]);
}

/** Monta o arquivo: objetos numerados a partir de 1; o 1º é o catálogo. */
export function serializePdf(objects: readonly PdfObject[], trailerExtra = ''): Uint8Array {
  const parts: Uint8Array[] = [latin1('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')];
  const offsets: number[] = [];
  let size = parts[0]!.length;
  objects.forEach((obj, i) => {
    offsets.push(size);
    const bytes = objectBytes(i + 1, obj);
    parts.push(bytes);
    size += bytes.length;
  });
  const rows = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  parts.push(
    latin1(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}` +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>\n` +
        `startxref\n${size}\n%%EOF\n`,
    ),
  );
  return concat(parts);
}

const escapePdf = (text: string) => text.replace(/([\\()])/g, '\\$1');

/** Conteúdo de página: uma linha de texto por item (Helvetica, WinAnsi). */
export function textContent(lines: readonly string[]): Uint8Array {
  const ops = lines.map((line, i) => `${i === 0 ? '' : '0 -16 Td '}(${escapePdf(line)}) Tj`);
  return latin1(`BT /F1 12 Tf 72 720 Td ${ops.join(' ')} ET`);
}

export interface PdfSpec {
  /** Linhas de texto por página; `null` = página só com imagem (digitalizada). */
  readonly pages: ReadonlyArray<readonly string[] | null>;
  readonly catalogExtra?: string | undefined;
  readonly pageExtra?: string | undefined;
  readonly extraObjects?: readonly PdfObject[] | undefined;
  /** Força o `/Count` da árvore de páginas (para testar contagem mentirosa). */
  readonly declaredCount?: number | undefined;
  readonly compress?: boolean | undefined;
  readonly trailerExtra?: string | undefined;
}

const FONT = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
const IMAGE_CONTENT = latin1('q 100 0 0 100 72 600 cm /Im1 Do Q');

/**
 * Objetos: 1 catálogo, 2 páginas, 3 fonte, 4 imagem 1×1, depois extras e,
 * por fim, pares (página, conteúdo).
 */
export function buildPdf(spec: PdfSpec): Uint8Array {
  const extras = spec.extraObjects ?? [];
  const first = 5 + extras.length;
  const kids = spec.pages.map((_, i) => `${first + i * 2} 0 R`).join(' ');
  const count = spec.declaredCount ?? spec.pages.length;
  const pageObjects = spec.pages.flatMap((lines, i): PdfObject[] => {
    const raw = lines ? textContent(lines) : IMAGE_CONTENT;
    const stream = spec.compress ? zlibSync(raw) : raw;
    const filter = spec.compress ? '/Filter /FlateDecode ' : '';
    return [
      {
        dict:
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${first + i * 2 + 1} 0 R ` +
          `/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >> ${spec.pageExtra ?? ''}>>`,
      },
      { dict: `<< ${filter}>>`, stream },
    ];
  });
  return serializePdf(
    [
      { dict: `<< /Type /Catalog /Pages 2 0 R ${spec.catalogExtra ?? ''}>>` },
      { dict: `<< /Type /Pages /Kids [${kids}] /Count ${count} >>` },
      { dict: FONT },
      {
        dict: '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 >>',
        stream: new Uint8Array([128]),
      },
      ...extras,
      ...pageObjects,
    ],
    spec.trailerExtra,
  );
}

/** Stream Flate que descompacta para `inflatedBytes` zeros, gerado em blocos (pouca memória). */
export function flateBomb(inflatedBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  const deflater = new Zlib({ level: 9 }, (chunk) => void chunks.push(chunk));
  const block = new Uint8Array(1024 * 1024);
  for (let left = inflatedBytes; left > 0; left -= block.length) {
    deflater.push(block.subarray(0, Math.min(block.length, left)), left <= block.length);
  }
  return concat(chunks);
}

export const md5 = (data: Uint8Array) => new Uint8Array(createHash('md5').update(data).digest());
export const textBytes = strToU8;
export { concat as concatBytes, latin1 as latin1Bytes };
