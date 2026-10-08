import {
  OUTBOUND_BATCH_MAX_SIZE,
  type OutboundCallJob,
  type OutboundCampaign,
  type ScheduleBatchJobItemInput,
  type ScheduleBatchJobsInput,
} from '@voice-agent/contracts';

export interface InMemoryBatchSchedulingTarget {
  getCampaignById(orgId: string, campId: string): Promise<OutboundCampaign | null>;
  getJobByIdempotencyKey(orgId: string, key: string): Promise<OutboundCallJob | null>;
  createJob(input: {
    organizationId: string;
    campaignId: string;
    agentId: string;
    agentVersionId: string;
    destinationPhone: string;
    recipientName?: string | undefined;
    scheduledAt: Date;
    maxAttempts: number;
    idempotencyKey: string;
  }): Promise<OutboundCallJob>;
}

interface ResolvedBatchItem extends ScheduleBatchJobItemInput {
  destinationPhone: string;
  effectiveKey: string;
}

function resolveItemKey(
  itemKey: string | undefined,
  batchKey: string | undefined,
  i: number,
): string {
  const key = itemKey ?? (batchKey ? `${batchKey}:${i}` : undefined);
  if (!key?.trim()) throw new Error(`Item ${i} missing idempotency key.`);
  return key.trim();
}

function resolveBatchItems(
  items: readonly ScheduleBatchJobItemInput[],
  batchKey?: string,
): ResolvedBatchItem[] {
  const seen = new Set<string>();
  return items.map((it, i) => {
    const phone = it.destinationPhone?.trim();
    if (!phone) throw new Error(`Item ${i} missing phone.`);
    const key = resolveItemKey(it.idempotencyKey, batchKey, i);
    if (seen.has(key)) throw new Error(`Duplicate key '${key}'.`);
    seen.add(key);
    return { ...it, destinationPhone: phone, effectiveKey: key };
  });
}

async function findExistingJobs(
  target: InMemoryBatchSchedulingTarget,
  orgId: string,
  keys: string[],
): Promise<OutboundCallJob[]> {
  const existing: OutboundCallJob[] = [];
  for (const key of keys) {
    const found = await target.getJobByIdempotencyKey(orgId, key);
    if (found) existing.push(found);
  }
  return existing;
}

export async function scheduleInMemoryBatchJobs(
  target: InMemoryBatchSchedulingTarget,
  input: ScheduleBatchJobsInput,
): Promise<OutboundCallJob[]> {
  if (!input.items?.length) throw new Error('Batch cannot be empty.');
  if (input.items.length > OUTBOUND_BATCH_MAX_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${OUTBOUND_BATCH_MAX_SIZE}.`);
  }
  const camp = await target.getCampaignById(input.organizationId, input.campaignId);
  if (!camp) throw new Error(`Campaign '${input.campaignId}' not found.`);

  const resolved = resolveBatchItems(input.items, input.batchIdempotencyKey);
  const existing = await findExistingJobs(
    target,
    input.organizationId,
    resolved.map((r) => r.effectiveKey),
  );

  if (existing.length === resolved.length) return existing;
  if (existing.length > 0) throw new Error('Idempotency conflict: partial existing jobs.');

  return Promise.all(
    resolved.map((r) =>
      target.createJob({
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        agentId: camp.agentId,
        agentVersionId: camp.agentVersionId,
        destinationPhone: r.destinationPhone,
        recipientName: r.recipientName?.trim(),
        scheduledAt: r.scheduledAt ?? new Date(),
        maxAttempts: r.maxAttempts ?? 3,
        idempotencyKey: r.effectiveKey,
      }),
    ),
  );
}
