/** Corpo padrão das operações (JSON pequeno): acima disso → 413 sem bufferizar. */
export const DEFAULT_OPERATION_BODY_BYTES = 64 * 1024;

export type BoundedBody =
  { readonly kind: 'OK'; readonly text: string } | { readonly kind: 'TOO_LARGE' };

function declaredTooLarge(req: Request, maxBytes: number): boolean {
  const declared = Number(req.headers.get('content-length') ?? '');
  return Number.isFinite(declared) && declared > maxBytes;
}

/**
 * Lê o corpo com teto de bytes, abortando a leitura assim que o limite é
 * ultrapassado (inclusive em transferências sem `content-length`).
 */
export async function readBoundedBody(req: Request, maxBytes: number): Promise<BoundedBody> {
  if (declaredTooLarge(req, maxBytes)) return { kind: 'TOO_LARGE' };
  if (!req.body) return { kind: 'OK', text: '' };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { kind: 'TOO_LARGE' };
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: 'OK', text: new TextDecoder().decode(merged) };
}
