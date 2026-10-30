import { operationMessage } from './operation-messages';
import { operationsOrgHeaders } from './operations-org-header';

/** Erro normalizado do BFF: mensagem já segura para exibição. */
export class OperationsRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperationsRequestError';
  }
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorOf(status: number, payload: unknown): OperationsRequestError {
  const code =
    payload &&
    typeof payload === 'object' &&
    typeof (payload as { code?: unknown }).code === 'string'
      ? (payload as { code: string }).code
      : 'API_ERROR';
  return new OperationsRequestError(status, code, operationMessage(code));
}

/**
 * Chamada do navegador para o BFF de operações (mesma origem). Sempre declara
 * a organização exibida na tela; erros viram `OperationsRequestError`.
 */
export async function operationsRequest<T>(
  orgSlug: string,
  path: string,
  init: { readonly method?: string; readonly body?: unknown; readonly signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...operationsOrgHeaders(orgSlug),
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    ...(init.signal ? { signal: init.signal } : {}),
  });
  const payload = await readJson(res);
  if (!res.ok) throw errorOf(res.status, payload);
  return payload as T;
}
