import type { ExtractionJobHeader } from './extraction-job.js';

const MAX_HEADER_BYTES = 4096;

function splitHeader(buffer: Buffer): { header: ExtractionJobHeader; body: Buffer } | null {
  const newline = buffer.indexOf(0x0a);
  if (newline < 0) return null;
  const header = JSON.parse(buffer.subarray(0, newline).toString('utf8')) as ExtractionJobHeader;
  return { header, body: buffer.subarray(newline + 1) };
}

/**
 * Lê da stdin: 1 linha JSON (cabeçalho) + exatamente `length` bytes. Entrada
 * maior que a declarada, cabeçalho grande demais ou incompleto ⇒ erro.
 */
export async function readExtractionJob(
  input: AsyncIterable<Buffer>,
  maxBodyBytes: number,
): Promise<{ header: ExtractionJobHeader; bytes: Uint8Array }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of input) {
    total += chunk.length;
    if (total > MAX_HEADER_BYTES + maxBodyBytes) throw new Error('Extraction input too large');
    chunks.push(chunk);
  }
  const parsed = splitHeader(Buffer.concat(chunks));
  if (!parsed || parsed.header.length !== parsed.body.length) {
    throw new Error('Extraction input does not match its header');
  }
  return { header: parsed.header, bytes: new Uint8Array(parsed.body) };
}
