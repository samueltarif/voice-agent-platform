import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseInstance } from '../client/connection.js';
import {
  OUTBOUND_BATCH_MAX_SIZE,
  type OutboundCallJob,
  type ScheduleBatchJobItemInput,
  type ScheduleBatchJobsInput,
} from '@voice-agent/contracts';
import { BadRequestError, NotFoundError, ConflictError } from '@voice-agent/errors';
import { outboundCallJobs, outboundCampaigns } from '../schema/outbound.js';
import { agentVersions } from '../schema/agents.js';
import { mapOutboundCallJob } from './outbound-mapping.js';

interface PreparedBatchItem {
  destinationPhone: string;
  recipientName?: string | undefined;
  scheduledAt: Date;
  maxAttempts: number;
  effectiveKey: string;
}

type TxInstance = Parameters<Parameters<DatabaseInstance['transaction']>[0]>[0];

function resolveItemKey(itemKey?: string, batchKey?: string, index?: number): string {
  const key = itemKey ?? (batchKey ? `${batchKey}:${index}` : undefined);
  if (!key || key.trim().length === 0) {
    throw new BadRequestError(
      `Item at index ${index} must have an idempotencyKey or batchIdempotencyKey must be provided.`,
    );
  }
  return key.trim();
}

interface ItemPreparationOptions {
  batchKey: string | undefined;
  seenKeys: Set<string>;
}

function prepareSingleItem(
  item: ScheduleBatchJobItemInput,
  index: number,
  options: ItemPreparationOptions,
): PreparedBatchItem {
  const phone = item.destinationPhone?.trim();
  if (!phone) {
    throw new BadRequestError(`Item at index ${index} must have a valid destination phone.`);
  }
  const key = resolveItemKey(item.idempotencyKey, options.batchKey, index);
  if (options.seenKeys.has(key)) {
    throw new BadRequestError(`Duplicate idempotency key '${key}' within batch.`);
  }
  options.seenKeys.add(key);

  return {
    destinationPhone: phone,
    recipientName: item.recipientName?.trim(),
    scheduledAt: item.scheduledAt ?? new Date(),
    maxAttempts: item.maxAttempts ?? 3,
    effectiveKey: key,
  };
}

function prepareAndValidateItems(input: ScheduleBatchJobsInput): PreparedBatchItem[] {
  const { items, batchIdempotencyKey } = input;
  if (!items || items.length === 0) {
    throw new BadRequestError('Batch cannot be empty.');
  }
  if (items.length > OUTBOUND_BATCH_MAX_SIZE) {
    throw new BadRequestError(
      `Batch size exceeds maximum allowed of ${OUTBOUND_BATCH_MAX_SIZE} items.`,
    );
  }
  const options: ItemPreparationOptions = {
    batchKey: batchIdempotencyKey,
    seenKeys: new Set<string>(),
  };
  return items.map((item, index) => prepareSingleItem(item, index, options));
}

async function assertCampaignAndPublishedVersion(
  tx: TxInstance,
  orgId: string,
  campId: string,
): Promise<{ id: string; agentId: string; agentVersionId: string }> {
  const [campaign] = await tx
    .select()
    .from(outboundCampaigns)
    .where(and(eq(outboundCampaigns.id, campId), eq(outboundCampaigns.organizationId, orgId)))
    .limit(1);

  if (!campaign) {
    throw new NotFoundError(`Campaign '${campId}' not found for tenant '${orgId}'.`);
  }

  const [version] = await tx
    .select({ id: agentVersions.id, status: agentVersions.status })
    .from(agentVersions)
    .where(
      and(
        eq(agentVersions.id, campaign.agentVersionId),
        eq(agentVersions.agentId, campaign.agentId),
        eq(agentVersions.organizationId, orgId),
      ),
    )
    .limit(1);

  if (!version || version.status !== 'PUBLISHED') {
    throw new BadRequestError(
      `Agent version '${campaign.agentVersionId}' must be PUBLISHED to schedule outbound jobs.`,
    );
  }
  return campaign;
}

async function checkExistingBatchJobs(
  tx: TxInstance,
  orgId: string,
  keyList: string[],
): Promise<OutboundCallJob[] | null> {
  const existing = await tx
    .select()
    .from(outboundCallJobs)
    .where(
      and(
        eq(outboundCallJobs.organizationId, orgId),
        inArray(outboundCallJobs.idempotencyKey, keyList),
      ),
    );

  if (existing.length === keyList.length) {
    return existing.map(mapOutboundCallJob);
  }
  if (existing.length > 0) {
    throw new ConflictError(
      `Idempotency conflict: ${existing.length} of ${keyList.length} jobs already exist with conflicting keys.`,
    );
  }
  return null;
}

export async function scheduleBatchJobs(
  db: DatabaseInstance,
  input: ScheduleBatchJobsInput,
): Promise<OutboundCallJob[]> {
  const prepared = prepareAndValidateItems(input);
  const { organizationId, campaignId } = input;

  return db.transaction(async (tx) => {
    const campaign = await assertCampaignAndPublishedVersion(tx, organizationId, campaignId);
    const keyList = prepared.map((p) => p.effectiveKey);
    const existing = await checkExistingBatchJobs(tx, organizationId, keyList);
    if (existing) return existing;

    const rowsToInsert = prepared.map((item) => ({
      organizationId,
      campaignId: campaign.id,
      agentId: campaign.agentId,
      agentVersionId: campaign.agentVersionId,
      destinationPhone: item.destinationPhone,
      recipientName: item.recipientName ?? null,
      status: 'SCHEDULED' as const,
      scheduledAt: item.scheduledAt,
      maxAttempts: item.maxAttempts,
      idempotencyKey: item.effectiveKey,
    }));

    const inserted = await tx.insert(outboundCallJobs).values(rowsToInsert).returning();
    return inserted.map(mapOutboundCallJob);
  });
}
