ALTER TYPE "public"."lead_status_change_origin" ADD VALUE 'CALL_OUTCOME';--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_question_generation" text;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_question_delivered_seq" integer;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_source" text;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD CONSTRAINT "scheduling_protocol_states_opt_out_source_chk" CHECK (("scheduling_protocol_states"."opt_out_recorded_at" IS NULL AND "scheduling_protocol_states"."opt_out_source" IS NULL)
        OR ("scheduling_protocol_states"."opt_out_recorded_at" IS NOT NULL
          AND "scheduling_protocol_states"."opt_out_source" IN ('LEAD_UTTERANCE', 'CLARIFICATION', 'AGENT_TOOL')));