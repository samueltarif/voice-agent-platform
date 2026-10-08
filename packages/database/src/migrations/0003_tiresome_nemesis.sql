CREATE TYPE "public"."outbound_call_job_status" AS ENUM('SCHEDULED', 'CLAIMED', 'DISPATCHED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'COMPLETED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."outbound_campaign_status" AS ENUM('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED');--> statement-breakpoint
CREATE TABLE "outbound_call_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"campaign_id" uuid,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"destination_phone" text NOT NULL,
	"recipient_name" text,
	"status" "outbound_call_job_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"last_error" text,
	"idempotency_key" text NOT NULL,
	"call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_call_jobs_phone_chk" CHECK (char_length("outbound_call_jobs"."destination_phone") > 0),
	CONSTRAINT "outbound_call_jobs_attempts_chk" CHECK ("outbound_call_jobs"."attempts" >= 0),
	CONSTRAINT "outbound_call_jobs_max_attempts_chk" CHECK ("outbound_call_jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "outbound_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "outbound_campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_campaigns_name_chk" CHECK (char_length("outbound_campaigns"."name") > 0)
);
--> statement-breakpoint
ALTER TABLE "outbound_call_jobs" ADD CONSTRAINT "outbound_call_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_call_jobs" ADD CONSTRAINT "outbound_call_jobs_campaign_id_outbound_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outbound_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_call_jobs" ADD CONSTRAINT "outbound_call_jobs_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_call_jobs" ADD CONSTRAINT "outbound_call_jobs_agent_org_fk" FOREIGN KEY ("agent_id","organization_id") REFERENCES "public"."agents"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_campaigns" ADD CONSTRAINT "outbound_campaigns_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_campaigns" ADD CONSTRAINT "outbound_campaigns_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_campaigns" ADD CONSTRAINT "outbound_campaigns_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_call_jobs_org_idempotency_uidx" ON "outbound_call_jobs" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "outbound_call_jobs_org_status_scheduled_idx" ON "outbound_call_jobs" USING btree ("organization_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "outbound_call_jobs_org_campaign_idx" ON "outbound_call_jobs" USING btree ("organization_id","campaign_id");--> statement-breakpoint
CREATE INDEX "outbound_campaigns_org_idx" ON "outbound_campaigns" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "outbound_campaigns_org_status_idx" ON "outbound_campaigns" USING btree ("organization_id","status");