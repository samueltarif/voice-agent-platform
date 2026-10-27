CREATE TYPE "public"."outbound_budget_reservation_status" AS ENUM('RESERVED', 'COMMITTED', 'RELEASED');--> statement-breakpoint
CREATE TABLE "outbound_budget_ledgers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"allocated_budget_minor_units" integer DEFAULT 0 NOT NULL,
	"reserved_amount_minor_units" integer DEFAULT 0 NOT NULL,
	"spent_carrier_minor_units" integer DEFAULT 0 NOT NULL,
	"spent_conversational_minor_units" integer DEFAULT 0 NOT NULL,
	"spent_amount_minor_units" integer DEFAULT 0 NOT NULL,
	"max_concurrent_calls" integer DEFAULT 5 NOT NULL,
	"max_daily_attempts" integer DEFAULT 50 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_budget_ledgers_org_unique" UNIQUE("organization_id"),
	CONSTRAINT "outbound_budget_ledgers_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "outbound_budget_ledgers_allocated_chk" CHECK ("outbound_budget_ledgers"."allocated_budget_minor_units" >= 0),
	CONSTRAINT "outbound_budget_ledgers_reserved_chk" CHECK ("outbound_budget_ledgers"."reserved_amount_minor_units" >= 0),
	CONSTRAINT "outbound_budget_ledgers_spent_carrier_chk" CHECK ("outbound_budget_ledgers"."spent_carrier_minor_units" >= 0),
	CONSTRAINT "outbound_budget_ledgers_spent_conversational_chk" CHECK ("outbound_budget_ledgers"."spent_conversational_minor_units" >= 0),
	CONSTRAINT "outbound_budget_ledgers_spent_total_chk" CHECK ("outbound_budget_ledgers"."spent_amount_minor_units" = "outbound_budget_ledgers"."spent_carrier_minor_units" + "outbound_budget_ledgers"."spent_conversational_minor_units"),
	CONSTRAINT "outbound_budget_ledgers_solvency_chk" CHECK ("outbound_budget_ledgers"."allocated_budget_minor_units" >= ("outbound_budget_ledgers"."reserved_amount_minor_units" + "outbound_budget_ledgers"."spent_amount_minor_units")),
	CONSTRAINT "outbound_budget_ledgers_concurrency_chk" CHECK ("outbound_budget_ledgers"."max_concurrent_calls" > 0),
	CONSTRAINT "outbound_budget_ledgers_daily_quota_chk" CHECK ("outbound_budget_ledgers"."max_daily_attempts" > 0),
	CONSTRAINT "outbound_budget_ledgers_version_chk" CHECK ("outbound_budget_ledgers"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "outbound_budget_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"reserved_amount_minor_units" integer NOT NULL,
	"reserved_carrier_minor_units" integer DEFAULT 0 NOT NULL,
	"reserved_conversational_minor_units" integer DEFAULT 0 NOT NULL,
	"settled_carrier_minor_units" integer DEFAULT 0 NOT NULL,
	"settled_conversational_minor_units" integer DEFAULT 0 NOT NULL,
	"settled_amount_minor_units" integer DEFAULT 0 NOT NULL,
	"status" "outbound_budget_reservation_status" NOT NULL,
	"idempotency_key" text NOT NULL,
	"release_reason" text,
	"reserved_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbound_budget_res_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "outbound_budget_res_reserved_chk" CHECK ("outbound_budget_reservations"."reserved_amount_minor_units" > 0),
	CONSTRAINT "outbound_budget_res_reserved_carrier_chk" CHECK ("outbound_budget_reservations"."reserved_carrier_minor_units" >= 0),
	CONSTRAINT "outbound_budget_res_reserved_conversational_chk" CHECK ("outbound_budget_reservations"."reserved_conversational_minor_units" >= 0),
	CONSTRAINT "outbound_budget_res_settled_carrier_chk" CHECK ("outbound_budget_reservations"."settled_carrier_minor_units" >= 0),
	CONSTRAINT "outbound_budget_res_settled_conversational_chk" CHECK ("outbound_budget_reservations"."settled_conversational_minor_units" >= 0),
	CONSTRAINT "outbound_budget_res_settled_total_chk" CHECK ("outbound_budget_reservations"."settled_amount_minor_units" = "outbound_budget_reservations"."settled_carrier_minor_units" + "outbound_budget_reservations"."settled_conversational_minor_units"),
	CONSTRAINT "outbound_budget_res_status_settled_chk" CHECK (("outbound_budget_reservations"."status" != 'COMMITTED') OR ("outbound_budget_reservations"."settled_at" IS NOT NULL)),
	CONSTRAINT "outbound_budget_res_status_released_chk" CHECK (("outbound_budget_reservations"."status" != 'RELEASED') OR ("outbound_budget_reservations"."released_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "outbound_budget_ledgers" ADD CONSTRAINT "outbound_budget_ledgers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_budget_reservations" ADD CONSTRAINT "outbound_budget_reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_budget_reservations" ADD CONSTRAINT "outbound_budget_res_attempt_org_fk" FOREIGN KEY ("attempt_id","organization_id") REFERENCES "public"."call_attempts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_budget_reservations" ADD CONSTRAINT "outbound_budget_res_job_org_fk" FOREIGN KEY ("job_id","organization_id") REFERENCES "public"."outbound_call_jobs"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_budget_res_org_attempt_uidx" ON "outbound_budget_reservations" USING btree ("organization_id","attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_budget_res_org_idempotency_uidx" ON "outbound_budget_reservations" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "outbound_budget_res_org_status_idx" ON "outbound_budget_reservations" USING btree ("organization_id","status");