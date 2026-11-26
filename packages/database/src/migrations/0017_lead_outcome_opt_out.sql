ALTER TYPE "public"."lead_status_change_origin" ADD VALUE 'CALL_OUTCOME';--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "lead_turn_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "last_final_turn_id" text;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "lead_final_utterances" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_question_generation" text;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_question_delivered_seq" integer;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_source" text;--> statement-breakpoint
-- Auditoria consolidada E2: início de fala legado SEM turno do transporte é descartado (a
-- próxima fala final é ignorada; nenhuma evidência é inventada nem consentimento herdado).
UPDATE "scheduling_protocol_states" SET "lead_speech_started_seq" = NULL WHERE "lead_turn_id" IS NULL AND "lead_speech_started_seq" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD CONSTRAINT "scheduling_protocol_states_opt_out_source_chk" CHECK (("scheduling_protocol_states"."opt_out_recorded_at" IS NULL AND "scheduling_protocol_states"."opt_out_source" IS NULL)
        OR ("scheduling_protocol_states"."opt_out_recorded_at" IS NOT NULL AND "scheduling_protocol_states"."opt_out_source" IS NOT NULL
          AND "scheduling_protocol_states"."opt_out_source" IN ('LEAD_UTTERANCE', 'CLARIFICATION', 'RECOVERY')));--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD CONSTRAINT "scheduling_protocol_states_lead_turn_chk" CHECK (("scheduling_protocol_states"."lead_speech_started_seq" IS NULL AND "scheduling_protocol_states"."lead_turn_id" IS NULL)
        OR ("scheduling_protocol_states"."lead_speech_started_seq" IS NOT NULL AND "scheduling_protocol_states"."lead_turn_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD CONSTRAINT "scheduling_protocol_states_finals_chk" CHECK ("scheduling_protocol_states"."lead_final_utterances" >= 0);