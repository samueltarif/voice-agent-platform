import type { KnowledgeChunkingPolicy } from './knowledge-chunk-contracts.js';

export interface KnowledgePolicyIdentity {
  readonly policyVersion: string;
  readonly maxChunkChars: number;
  readonly overlapChars: number;
}

export function toPolicyIdentity(policy: KnowledgeChunkingPolicy): KnowledgePolicyIdentity {
  return {
    policyVersion: policy.policyVersion,
    maxChunkChars: policy.maxChunkChars,
    overlapChars: policy.overlapChars,
  };
}

export function arePolicyIdentitiesEqual(
  a: KnowledgePolicyIdentity | undefined,
  b: KnowledgePolicyIdentity | undefined,
): boolean {
  if (!a || !b) return false;
  return (
    a.policyVersion === b.policyVersion &&
    a.maxChunkChars === b.maxChunkChars &&
    a.overlapChars === b.overlapChars
  );
}

export function isUnknownPolicyIdentity(
  value:
    | KnowledgePolicyIdentity
    | { policyVersion?: string | null; maxChunkChars?: number | null; overlapChars?: number | null }
    | undefined
    | null,
): boolean {
  if (!value) return true;
  const v = value as {
    policyVersion?: unknown;
    maxChunkChars?: unknown;
    overlapChars?: unknown;
  };
  return (
    typeof v.policyVersion !== 'string' ||
    v.policyVersion.length === 0 ||
    typeof v.maxChunkChars !== 'number' ||
    typeof v.overlapChars !== 'number'
  );
}

export const UNKNOWN_POLICY_CONFLICT_MESSAGE =
  'Conflicting duplicate document source already exists with unknown effective chunking policy';
