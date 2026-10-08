import { z } from 'zod';

export const OUTBOUND_BATCH_MAX_SIZE = 100;

export const scheduleBatchJobItemInputSchema = z
  .object({
    destinationPhone: z.string().trim().min(1, 'Destination phone cannot be empty'),
    recipientName: z.string().trim().optional(),
    scheduledAt: z.coerce.date().optional(),
    maxAttempts: z.number().int().positive().default(3),
    idempotencyKey: z.string().trim().min(1).optional(),
  })
  .strict();

export type ScheduleBatchJobItemInput = z.input<typeof scheduleBatchJobItemInputSchema>;

export const scheduleBatchJobsHttpBodySchema = z
  .object({
    batchIdempotencyKey: z.string().trim().min(1).optional(),
    items: z
      .array(scheduleBatchJobItemInputSchema)
      .min(1, 'Batch must contain at least one item')
      .max(
        OUTBOUND_BATCH_MAX_SIZE,
        `Batch size exceeds maximum allowed of ${OUTBOUND_BATCH_MAX_SIZE} items`,
      ),
  })
  .strict();

export type ScheduleBatchJobsHttpBody = z.infer<typeof scheduleBatchJobsHttpBodySchema>;

export interface ScheduleBatchJobsInput {
  readonly organizationId: string;
  readonly campaignId: string;
  readonly batchIdempotencyKey?: string | undefined;
  readonly items: readonly ScheduleBatchJobItemInput[];
}
