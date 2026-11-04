import type { CallLegRole } from './call-leg.js';

/**
 * 008-OF5a (S1) — Ressalva R-1: um segundo identificador ligado à mesma
 * tentativa NÃO prova duplicidade (pode ser a perna do agente de IA, uma
 * transferência ou um redirecionamento). Esta classificação NUNCA encerra
 * chamada: a única ação possível é alertar e encaminhar para revisão humana.
 */
export interface SecondReferenceEvidence {
  /** Papel do endpoint ASSINADO que recebeu o evento (não pode ser forjado). */
  readonly endpointRole: CallLegRole;
  readonly incomingReference: string;
  readonly boundContactReference: string;
  readonly parentReference: string | null;
  readonly transferRecorded: boolean;
  /** Consulta autenticada à operadora; `null` enquanto não houver confirmação. */
  readonly operatorConfirmation: {
    readonly bothAreParentCalls: boolean;
    readonly sameDestination: boolean;
    readonly overlappingInTime: boolean;
  } | null;
}

export type SecondReferenceClassification =
  | 'SAME_REFERENCE'
  | 'LEGITIMATE_CHILD_LEG'
  | 'TRANSFER_LEG'
  | 'UNVERIFIED_SECOND_REFERENCE'
  | 'PROVEN_DUPLICATE_ORIGINATION';

/** Não existe ação de encerramento neste contrato (R-1). */
export type SecondReferenceAction = 'NONE' | 'ALERT_AND_REVIEW';

export interface SecondReferenceAssessment {
  readonly classification: SecondReferenceClassification;
  readonly action: SecondReferenceAction;
}

function isProvenDuplicate(evidence: SecondReferenceEvidence): boolean {
  const confirmation = evidence.operatorConfirmation;
  return (
    evidence.endpointRole === 'CONTACT_LEG' &&
    evidence.parentReference !== evidence.boundContactReference &&
    confirmation !== null &&
    confirmation.bothAreParentCalls &&
    confirmation.sameDestination &&
    confirmation.overlappingInTime
  );
}

export function classifySecondProviderReference(
  evidence: SecondReferenceEvidence,
): SecondReferenceAssessment {
  if (evidence.incomingReference === evidence.boundContactReference) {
    return { classification: 'SAME_REFERENCE', action: 'NONE' };
  }
  const isChildOfContact = evidence.parentReference === evidence.boundContactReference;
  if (evidence.endpointRole !== 'CONTACT_LEG' && isChildOfContact) {
    return { classification: 'LEGITIMATE_CHILD_LEG', action: 'NONE' };
  }
  if (evidence.transferRecorded) {
    return { classification: 'TRANSFER_LEG', action: 'NONE' };
  }
  if (isProvenDuplicate(evidence)) {
    return { classification: 'PROVEN_DUPLICATE_ORIGINATION', action: 'ALERT_AND_REVIEW' };
  }
  return { classification: 'UNVERIFIED_SECOND_REFERENCE', action: 'ALERT_AND_REVIEW' };
}
