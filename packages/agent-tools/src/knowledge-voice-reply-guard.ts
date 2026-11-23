import {
  knowledgeAgentProjectionSchema,
  knowledgeVoiceReplySchema,
  type KnowledgeAgentProjection,
  type KnowledgeSearchV2UnavailableReason,
  type KnowledgeVoiceReply,
} from '@voice-agent/contracts';
import {
  isProjectionConsistent,
  preflightProjectionShape,
} from './knowledge-voice-reply-consistency.js';
import { composeKnowledgeVoiceReply } from './knowledge-voice-reply.js';
import { verifyReplyAgainstProjection } from './knowledge-voice-reply-verification.js';

/**
 * Cadeia da B2c dentro da ferramenta v2 (DEC-072): pré-checagem rasa →
 * `safeParse` da projeção → coerência → composição → schema da resposta →
 * verificação por remontagem. Qualquer etapa reprovada ⇒ indisponível com
 * motivo interno; nunca projeção parcial, nunca v1.
 */
export type VerifiedVoiceReplyOutcome =
  | {
      readonly status: 'OK';
      readonly projection: KnowledgeAgentProjection;
      readonly reply: KnowledgeVoiceReply;
    }
  | { readonly status: 'UNAVAILABLE'; readonly reason: KnowledgeSearchV2UnavailableReason };

const unavailable = (reason: KnowledgeSearchV2UnavailableReason): VerifiedVoiceReplyOutcome => ({
  status: 'UNAVAILABLE',
  reason,
});

function composeVerified(projection: KnowledgeAgentProjection): VerifiedVoiceReplyOutcome {
  try {
    const composed = composeKnowledgeVoiceReply(projection);
    const reply = knowledgeVoiceReplySchema.safeParse(composed.reply);
    if (!reply.success) return unavailable('REPLY_INVALID');
    const verified = verifyReplyAgainstProjection({
      projection,
      reply: reply.data,
      selection: composed.selection,
    });
    return verified
      ? { status: 'OK', projection, reply: reply.data }
      : unavailable('REPLY_INVALID');
  } catch {
    // Exceção do compositor é defeito: falha controlada com motivo, sem conteúdo.
    return unavailable('REPLY_INVALID');
  }
}

export function buildVerifiedVoiceReply(raw: unknown): VerifiedVoiceReplyOutcome {
  const preflight = preflightProjectionShape(raw);
  if (preflight !== 'OK') return unavailable(preflight);
  const parsed = knowledgeAgentProjectionSchema.safeParse(raw);
  if (!parsed.success) return unavailable('INVALID_PROJECTION');
  if (!isProjectionConsistent(parsed.data)) return unavailable('INCONSISTENT_PROJECTION');
  return composeVerified(parsed.data);
}
