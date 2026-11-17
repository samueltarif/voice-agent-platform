/** Resultado da leitura limitada: JSON lido, corpo grande demais ou inválido. */
export type BoundedJsonBody =
  | { readonly kind: 'OK'; readonly value: unknown }
  | { readonly kind: 'TOO_LARGE' }
  | { readonly kind: 'INVALID' };

async function readCapped(body: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

/**
 * Lê o corpo SEM ultrapassar `maxBytes`: recusa pelo `Content-Length` declarado
 * e, se ele mentir ou faltar, interrompe a leitura do fluxo ao passar do teto.
 */
export async function readBoundedJsonBody(
  req: Request,
  maxBytes: number,
): Promise<BoundedJsonBody> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return { kind: 'TOO_LARGE' };
  if (!req.body) return { kind: 'INVALID' };
  const chunks = await readCapped(req.body, maxBytes);
  if (!chunks) return { kind: 'TOO_LARGE' };
  try {
    return { kind: 'OK', value: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return { kind: 'INVALID' };
  }
}
