CREATE TYPE "public"."agent_status" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."agent_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "agent_version_status" DEFAULT 'DRAFT' NOT NULL,
	"configuration_schema_version" integer NOT NULL,
	"configuration" jsonb NOT NULL,
	"changelog" text,
	"created_by" text NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_versions_version_number_chk" CHECK ("agent_versions"."version_number" > 0),
	CONSTRAINT "agent_versions_config_schema_version_chk" CHECK ("agent_versions"."configuration_schema_version" > 0),
	CONSTRAINT "agent_versions_config_object_chk" CHECK (jsonb_typeof("agent_versions"."configuration") = 'object'),
	CONSTRAINT "agent_versions_published_metadata_chk" CHECK (("agent_versions"."status" = 'DRAFT' AND "agent_versions"."published_at" IS NULL AND "agent_versions"."published_by" IS NULL) OR ("agent_versions"."status" IN ('PUBLISHED', 'ARCHIVED') AND "agent_versions"."published_at" IS NOT NULL AND "agent_versions"."published_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "agent_status" DEFAULT 'ACTIVE' NOT NULL,
	"next_version_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_id_org_id_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "agents_next_version_number_chk" CHECK ("agents"."next_version_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_org_fk" FOREIGN KEY ("agent_id","organization_id") REFERENCES "public"."agents"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_uidx" ON "agent_versions" USING btree ("agent_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_single_draft_uidx" ON "agent_versions" USING btree ("agent_id") WHERE "agent_versions"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_single_published_uidx" ON "agent_versions" USING btree ("agent_id") WHERE "agent_versions"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "agent_versions_org_id_idx" ON "agent_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_org_slug_uidx" ON "agents" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "agents_org_status_idx" ON "agents" USING btree ("organization_id","status");