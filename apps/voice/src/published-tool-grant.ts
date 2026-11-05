import type {
  AgentConfigurationSnapshotV1,
  CallBootstrap,
  CanonicalToolName,
} from '@voice-agent/contracts';

/**
 * D8b complementar (DEC-048) — concessão de ferramentas da versão publicada.
 *
 * Duas propriedades distintas:
 * 1. LEGITIMIDADE DA CONCESSÃO: só objetos emitidos por este módulo constam do
 *    registro privado `issuedGrants`; um objeto com o mesmo formato (cópia,
 *    JSON, spread) não vale.
 * 2. ORIGEM DO BOOTSTRAP: a emissão só acontece em
 *    `issueToolGrantForConsumedBootstrap`, chamada exclusivamente pelo
 *    `CallLifecycleGateway` (teste de fronteira de import), quando o bootstrap
 *    foi preparado pela MESMA instância do gateway (`prepareCall`) e consumido
 *    com sucesso uma única vez, com os mesmos IDs e o mesmo objeto de snapshot.
 *
 * Limite: dentro do mesmo processo, código do servidor ainda pode importar e
 * chamar o emissor; a garantia é contra dados não confiáveis (modelo, cliente,
 * transcrição, argumentos de ferramenta, JSON desserializado), não contra
 * código malicioso já em execução no servidor.
 */
export interface PublishedToolGrant {
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly callId: string;
  readonly snapshot: AgentConfigurationSnapshotV1;
  /** Cópia própria e congelada do toolset no momento da emissão. */
  readonly tools: readonly CanonicalToolName[];
}

/** Registro do que o gateway preparou (mantido em memória pela instância). */
export interface PreparedToolGrantSource {
  readonly bootstrapId: string;
  readonly callId: string;
  readonly organizationId: string;
  readonly agentId: string;
  readonly agentVersionId: string;
  readonly snapshot: AgentConfigurationSnapshotV1;
}

const issuedGrants = new WeakSet<object>();

export function isIssuedPublishedToolGrant(value: unknown): value is PublishedToolGrant {
  return typeof value === 'object' && value !== null && issuedGrants.has(value);
}

const sameBinding = (prepared: PreparedToolGrantSource, consumed: CallBootstrap): boolean =>
  consumed.bootstrapId === prepared.bootstrapId &&
  consumed.callId === prepared.callId &&
  consumed.organizationId === prepared.organizationId &&
  consumed.agentId === prepared.agentId &&
  consumed.agentVersionId === prepared.agentVersionId &&
  consumed.agentSnapshot === prepared.snapshot;

/**
 * @internal Uso exclusivo do `CallLifecycleGateway`, depois de `consume` ter
 * sucesso. Devolve `null` (sem concessão) se faltar o registro de preparo, se
 * o status não for `CONSUMED` ou se qualquer vínculo divergir.
 */
export function issueToolGrantForConsumedBootstrap(
  prepared: PreparedToolGrantSource | undefined,
  consumed: CallBootstrap,
): PublishedToolGrant | null {
  if (!prepared || consumed.status !== 'CONSUMED' || !sameBinding(prepared, consumed)) {
    return null;
  }
  const tools = Object.freeze([...(prepared.snapshot.tools ?? [])]);
  const grant: PublishedToolGrant = Object.freeze({
    organizationId: prepared.organizationId,
    agentId: prepared.agentId,
    agentVersionId: prepared.agentVersionId,
    callId: prepared.callId,
    snapshot: prepared.snapshot,
    tools,
  });
  issuedGrants.add(grant);
  return grant;
}
