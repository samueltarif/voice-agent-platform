import { z } from 'zod';

export const operatingHoursToolInputSchema = z
  .object({
    query: z.string().optional(),
    callerTranscript: z.string().optional(),
    operatingHours: z.string().optional(),
  })
  .strict();

export type OperatingHoursToolInput = z.infer<typeof operatingHoursToolInputSchema>;

export interface OperatingHoursToolOutput {
  readonly handled: boolean;
  readonly responseText: string | null;
}
