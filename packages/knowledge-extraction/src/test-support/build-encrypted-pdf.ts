import { concatBytes, latin1Bytes, md5, serializePdf, textContent } from './build-pdf-fixture.js';

/**
 * SOMENTE TESTES (DEC-066): PDF REALMENTE criptografado pelo manipulador
 * padrão (RC4 40 bits, revisão 2 — ISO 32000-1, algoritmos 2, 3 e 4). O
 * conteúdo da página é cifrado; o teste comprova abrindo com a senha certa.
 */
const PADDING = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);
const PERMISSIONS = -44; // sem cópia de conteúdo
const FILE_ID = Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 3);

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i += 1) {
    j = (j + s[i]! + key[i % key.length]!) & 0xff;
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n += 1) {
    i = (i + 1) & 0xff;
    j = (j + s[i]!) & 0xff;
    [s[i], s[j]] = [s[j]!, s[i]!];
    out[n] = data[n]! ^ s[(s[i]! + s[j]!) & 0xff]!;
  }
  return out;
}

const pad = (password: string) => concatBytes([latin1Bytes(password), PADDING]).subarray(0, 32);
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

function securityValues(userPassword: string, ownerPassword: string) {
  const owner = rc4(md5(pad(ownerPassword || userPassword)).subarray(0, 5), pad(userPassword));
  const p = new Uint8Array(4);
  new DataView(p.buffer).setInt32(0, PERMISSIONS, true);
  const key = md5(concatBytes([pad(userPassword), owner, p, FILE_ID])).subarray(0, 5);
  return { key, owner, user: rc4(key, PADDING) };
}

/** Chave por objeto (algoritmo 1): MD5(chave + nº do objeto + geração). */
function objectKey(key: Uint8Array, objectNumber: number): Uint8Array {
  const suffix = Uint8Array.from([objectNumber & 0xff, (objectNumber >> 8) & 0xff, 0, 0, 0]);
  return md5(concatBytes([key, suffix])).subarray(0, key.length + 5);
}

export interface EncryptedPdfOptions {
  readonly lines: readonly string[];
  /** Vazia ⇒ abre sem senha (só restrições do proprietário). */
  readonly userPassword: string;
  readonly ownerPassword: string;
  /** Grafia do nome da chave no trailer (ex.: `/Encr#79pt`, escape válido de nome PDF). */
  readonly encryptKeyName?: string | undefined;
}

export function buildEncryptedPdf(options: EncryptedPdfOptions): Uint8Array {
  const { key, owner, user } = securityValues(options.userPassword, options.ownerPassword);
  const content = rc4(objectKey(key, 6), textContent(options.lines));
  const encryptDict =
    `<< /Filter /Standard /V 1 /R 2 /Length 40 /P ${PERMISSIONS} ` +
    `/O <${hex(owner)}> /U <${hex(user)}> >>`;
  return serializePdf(
    [
      { dict: '<< /Type /Catalog /Pages 2 0 R >>' },
      { dict: '<< /Type /Pages /Kids [5 0 R] /Count 1 >>' },
      { dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' },
      { dict: encryptDict },
      {
        dict: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 3 0 R >> >> >>',
      },
      { dict: '<< >>', stream: content },
    ],
    `${options.encryptKeyName ?? '/Encrypt'} 4 0 R /ID [<${hex(FILE_ID)}> <${hex(FILE_ID)}>] `,
  );
}
