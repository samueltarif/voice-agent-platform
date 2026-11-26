CREATE TYPE "public"."scheduling_calendar_source" AS ENUM('CAMPAIGN', 'AGENT_VERSION', 'ORGANIZATION_DEFAULT');--> statement-breakpoint
CREATE TABLE "scheduling_session_contexts" (
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"resolution" text NOT NULL,
	"calendar_id" uuid,
	"calendar_source" "scheduling_calendar_source",
	"blocked_reason" text,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_session_contexts_pk" PRIMARY KEY("organization_id","session_id"),
	CONSTRAINT "scheduling_session_contexts_resolution_chk" CHECK (("scheduling_session_contexts"."resolution" = 'RESOLVED' AND "scheduling_session_contexts"."calendar_id" IS NOT NULL
          AND "scheduling_session_contexts"."calendar_source" IS NOT NULL AND "scheduling_session_contexts"."blocked_reason" IS NULL)
        OR ("scheduling_session_contexts"."resolution" = 'ABSENT' AND "scheduling_session_contexts"."calendar_id" IS NULL
          AND "scheduling_session_contexts"."calendar_source" IS NULL AND "scheduling_session_contexts"."blocked_reason" IS NULL)
        OR ("scheduling_session_contexts"."resolution" = 'BLOCKED' AND "scheduling_session_contexts"."calendar_id" IS NULL
          AND "scheduling_session_contexts"."calendar_source" IS NOT NULL AND "scheduling_session_contexts"."blocked_reason" IS NOT NULL
          AND "scheduling_session_contexts"."blocked_reason" IN ('CALENDAR_NOT_FOUND', 'AGENT_CONFIGURATION_INVALID')))
);
--> statement-breakpoint
ALTER TABLE "outbound_campaigns" ADD COLUMN "scheduling_calendar_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduling_calendars" ADD COLUMN "is_organization_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduling_session_contexts" ADD CONSTRAINT "scheduling_session_contexts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_session_contexts" ADD CONSTRAINT "scheduling_session_contexts_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."call_sessions"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_campaigns" ADD CONSTRAINT "outbound_campaigns_scheduling_calendar_org_fk" FOREIGN KEY ("scheduling_calendar_id","organization_id") REFERENCES "public"."scheduling_calendars"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scheduling_calendars_org_default_uidx" ON "scheduling_calendars" USING btree ("organization_id") WHERE "scheduling_calendars"."is_organization_default";