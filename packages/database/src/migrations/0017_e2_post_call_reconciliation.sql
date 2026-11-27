ALTER TYPE "public"."lead_status_change_origin" ADD VALUE 'CALL_OUTCOME';--> statement-breakpoint
CREATE TABLE "booking_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"list_revision" integer NOT NULL,
	"option" integer NOT NULL,
	"lead_confirmation" text NOT NULL,
	"status" text DEFAULT 'PENDING_EVIDENCE' NOT NULL,
	"decision_reason" text,
	"meeting_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "booking_intents_status_chk" CHECK ("booking_intents"."status" IN ('PENDING_EVIDENCE', 'SUPERSEDED', 'BOOKED', 'REJECTED', 'NEEDS_REVIEW', 'CANCELED')),
	CONSTRAINT "booking_intents_meeting_chk" CHECK (("booking_intents"."status" = 'BOOKED') = ("booking_intents"."meeting_id" IS NOT NULL)),
	CONSTRAINT "booking_intents_option_chk" CHECK ("booking_intents"."option" BETWEEN 1 AND 3),
	CONSTRAINT "booking_intents_revision_chk" CHECK ("booking_intents"."list_revision" >= 1 AND "booking_intents"."version" >= 1),
	CONSTRAINT "booking_intents_phrase_chk" CHECK (char_length("booking_intents"."lead_confirmation") BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE TABLE "post_call_reconciliations" (
	"organization_id" uuid NOT NULL,
	"session_id" uuid,
	"attempt_id" uuid NOT NULL,
	"lead_id" uuid,
	"phone_e164" text NOT NULL,
	"status" text DEFAULT 'AWAITING_REPORT' NOT NULL,
	"proposed_outcome" text,
	"outcome_applied" text,
	"opt_out_tool_at" timestamp with time zone,
	"opt_out_tool_phrase" text,
	"report_digest" text,
	"report_received_at" timestamp with time zone,
	"report_end_reason" text,
	"conflict_digests" text[] DEFAULT '{}'::text[] NOT NULL,
	"review_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"reconciled_at" timestamp with time zone,
	"reconciled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "post_call_reconciliations_pk" PRIMARY KEY("organization_id","attempt_id"),
	CONSTRAINT "post_call_reconciliations_unbound_chk" CHECK ("post_call_reconciliations"."session_id" IS NOT NULL OR "post_call_reconciliations"."status" <> 'AWAITING_REPORT'),
	CONSTRAINT "post_call_reconciliations_status_chk" CHECK ("post_call_reconciliations"."status" IN ('AWAITING_REPORT', 'NEEDS_REVIEW', 'RECONCILED')),
	CONSTRAINT "post_call_reconciliations_outcome_chk" CHECK (("post_call_reconciliations"."proposed_outcome" IS NULL OR "post_call_reconciliations"."proposed_outcome" IN ('CONTACTED', 'QUALIFIED', 'NOT_INTERESTED'))
        AND ("post_call_reconciliations"."outcome_applied" IS NULL OR "post_call_reconciliations"."outcome_applied" IN ('CONTACTED', 'QUALIFIED', 'NOT_INTERESTED'))),
	CONSTRAINT "post_call_reconciliations_reconciled_chk" CHECK (("post_call_reconciliations"."status" = 'RECONCILED') = ("post_call_reconciliations"."reconciled_at" IS NOT NULL)),
	CONSTRAINT "post_call_reconciliations_phrase_chk" CHECK ("post_call_reconciliations"."opt_out_tool_phrase" IS NULL OR char_length("post_call_reconciliations"."opt_out_tool_phrase") <= 300),
	CONSTRAINT "post_call_reconciliations_version_chk" CHECK ("post_call_reconciliations"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD COLUMN "opt_out_source" text;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."call_sessions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_attempt_org_fk" FOREIGN KEY ("attempt_id","organization_id") REFERENCES "public"."call_attempts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_lead_org_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_offer_org_fk" FOREIGN KEY ("offer_id","organization_id") REFERENCES "public"."meeting_slot_offers"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_intents" ADD CONSTRAINT "booking_intents_meeting_org_fk" FOREIGN KEY ("meeting_id","organization_id") REFERENCES "public"."meetings"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_call_reconciliations" ADD CONSTRAINT "post_call_reconciliations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_call_reconciliations" ADD CONSTRAINT "post_call_reconciliations_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."call_sessions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_call_reconciliations" ADD CONSTRAINT "post_call_reconciliations_attempt_org_fk" FOREIGN KEY ("attempt_id","organization_id") REFERENCES "public"."call_attempts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_intents_one_pending_per_session_uidx" ON "booking_intents" USING btree ("organization_id","session_id") WHERE "booking_intents"."status" = 'PENDING_EVIDENCE';--> statement-breakpoint
CREATE INDEX "booking_intents_org_lead_idx" ON "booking_intents" USING btree ("organization_id","lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_call_reconciliations_session_uidx" ON "post_call_reconciliations" USING btree ("organization_id","session_id") WHERE "post_call_reconciliations"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "post_call_reconciliations_open_phone_idx" ON "post_call_reconciliations" USING btree ("organization_id","phone_e164") WHERE "post_call_reconciliations"."status" <> 'RECONCILED';--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD CONSTRAINT "scheduling_protocol_states_opt_out_source_chk" CHECK (("scheduling_protocol_states"."opt_out_recorded_at" IS NULL AND "scheduling_protocol_states"."opt_out_source" IS NULL)
        OR ("scheduling_protocol_states"."opt_out_recorded_at" IS NOT NULL AND "scheduling_protocol_states"."opt_out_source" IS NOT NULL
          AND "scheduling_protocol_states"."opt_out_source" IN ('TOOL', 'POST_CALL')));