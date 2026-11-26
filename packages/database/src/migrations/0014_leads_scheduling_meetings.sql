CREATE TYPE "public"."lead_status_change_origin" AS ENUM('CREATED', 'MANUAL', 'OPT_OUT', 'MEETING_BOOKED', 'MEETING_CANCELED');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'NOT_INTERESTED', 'DO_NOT_CALL');--> statement-breakpoint
CREATE TYPE "public"."scheduling_actor_type" AS ENUM('USER', 'AGENT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."availability_exception_kind" AS ENUM('UNAVAILABLE', 'AVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."meeting_slot_offer_status" AS ENUM('OFFERED', 'ACCEPTED');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('SCHEDULED', 'CANCELED');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"status_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_org_contact_unique" UNIQUE("organization_id","contact_id"),
	CONSTRAINT "leads_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "leads_status_version_chk" CHECK ("leads"."status_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "scheduling_availability_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"kind" "availability_exception_kind" NOT NULL,
	"start_minute" smallint,
	"end_minute" smallint,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_availability_exceptions_window_chk" CHECK (("scheduling_availability_exceptions"."start_minute" IS NULL AND "scheduling_availability_exceptions"."end_minute" IS NULL AND "scheduling_availability_exceptions"."kind" = 'UNAVAILABLE')
        OR ("scheduling_availability_exceptions"."start_minute" IS NOT NULL AND "scheduling_availability_exceptions"."end_minute" IS NOT NULL
          AND "scheduling_availability_exceptions"."start_minute" >= 0 AND "scheduling_availability_exceptions"."end_minute" <= 1440
          AND "scheduling_availability_exceptions"."start_minute" < "scheduling_availability_exceptions"."end_minute")),
	CONSTRAINT "scheduling_availability_exceptions_reason_chk" CHECK ("scheduling_availability_exceptions"."reason" IS NULL OR char_length("scheduling_availability_exceptions"."reason") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "scheduling_availability_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	CONSTRAINT "scheduling_availability_rules_window_chk" CHECK ("scheduling_availability_rules"."weekday" BETWEEN 1 AND 7
        AND "scheduling_availability_rules"."start_minute" >= 0 AND "scheduling_availability_rules"."end_minute" <= 1440
        AND "scheduling_availability_rules"."start_minute" < "scheduling_availability_rules"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "scheduling_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timezone" text NOT NULL,
	"slot_duration_minutes" integer NOT NULL,
	"buffer_minutes" integer DEFAULT 0 NOT NULL,
	"minimum_notice_minutes" integer DEFAULT 0 NOT NULL,
	"booking_horizon_days" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_calendars_org_name_unique" UNIQUE("organization_id","name"),
	CONSTRAINT "scheduling_calendars_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "scheduling_calendars_name_chk" CHECK (char_length("scheduling_calendars"."name") BETWEEN 1 AND 120),
	CONSTRAINT "scheduling_calendars_timezone_chk" CHECK (char_length("scheduling_calendars"."timezone") BETWEEN 1 AND 64),
	CONSTRAINT "scheduling_calendars_policy_chk" CHECK ("scheduling_calendars"."slot_duration_minutes" BETWEEN 5 AND 480
        AND "scheduling_calendars"."buffer_minutes" BETWEEN 0 AND 240
        AND "scheduling_calendars"."minimum_notice_minutes" BETWEEN 0 AND 43200
        AND "scheduling_calendars"."booking_horizon_days" BETWEEN 1 AND 365),
	CONSTRAINT "scheduling_calendars_version_chk" CHECK ("scheduling_calendars"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "meeting_slot_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"source_attempt_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "meeting_slot_offer_status" DEFAULT 'OFFERED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_slot_offers_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "meeting_slot_offers_interval_chk" CHECK ("meeting_slot_offers"."ends_at" > "meeting_slot_offers"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "meeting_status" DEFAULT 'SCHEDULED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"source_attempt_id" uuid,
	"slot_offer_id" uuid,
	"booked_by_type" "scheduling_actor_type" NOT NULL,
	"booked_by_id" text NOT NULL,
	"canceled_at" timestamp with time zone,
	"canceled_by_type" "scheduling_actor_type",
	"canceled_by_id" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "meetings_org_idempotency_unique" UNIQUE("organization_id","idempotency_key"),
	CONSTRAINT "meetings_interval_chk" CHECK ("meetings"."ends_at" > "meetings"."starts_at"),
	CONSTRAINT "meetings_version_chk" CHECK ("meetings"."version" > 0),
	CONSTRAINT "meetings_idempotency_key_chk" CHECK (char_length("meetings"."idempotency_key") BETWEEN 8 AND 128),
	CONSTRAINT "meetings_fingerprint_chk" CHECK ("meetings"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "meetings_cancellation_chk" CHECK (("meetings"."status" = 'SCHEDULED' AND "meetings"."canceled_at" IS NULL)
        OR ("meetings"."status" = 'CANCELED' AND "meetings"."canceled_at" IS NOT NULL
          AND "meetings"."canceled_by_type" IS NOT NULL AND "meetings"."canceled_by_id" IS NOT NULL)),
	CONSTRAINT "meetings_cancel_reason_chk" CHECK ("meetings"."cancel_reason" IS NULL OR char_length("meetings"."cancel_reason") BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "lead_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" "lead_status",
	"to_status" "lead_status" NOT NULL,
	"origin" "lead_status_change_origin" NOT NULL,
	"actor_type" "scheduling_actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text,
	"meeting_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_status_changes_reason_chk" CHECK ("lead_status_changes"."reason" IS NULL OR char_length("lead_status_changes"."reason") BETWEEN 1 AND 500),
	CONSTRAINT "lead_status_changes_actor_chk" CHECK (char_length("lead_status_changes"."actor_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_availability_exceptions" ADD CONSTRAINT "scheduling_availability_exceptions_calendar_org_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "public"."scheduling_calendars"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_availability_rules" ADD CONSTRAINT "scheduling_availability_rules_calendar_org_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "public"."scheduling_calendars"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_calendars" ADD CONSTRAINT "scheduling_calendars_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_slot_offers" ADD CONSTRAINT "meeting_slot_offers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_slot_offers" ADD CONSTRAINT "meeting_slot_offers_calendar_org_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "public"."scheduling_calendars"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_slot_offers" ADD CONSTRAINT "meeting_slot_offers_lead_org_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_slot_offers" ADD CONSTRAINT "meeting_slot_offers_attempt_org_fk" FOREIGN KEY ("source_attempt_id","organization_id") REFERENCES "public"."call_attempts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_calendar_org_fk" FOREIGN KEY ("calendar_id","organization_id") REFERENCES "public"."scheduling_calendars"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_lead_org_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_attempt_org_fk" FOREIGN KEY ("source_attempt_id","organization_id") REFERENCES "public"."call_attempts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_slot_offer_org_fk" FOREIGN KEY ("slot_offer_id","organization_id") REFERENCES "public"."meeting_slot_offers"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_changes" ADD CONSTRAINT "lead_status_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_changes" ADD CONSTRAINT "lead_status_changes_lead_org_fk" FOREIGN KEY ("lead_id","organization_id") REFERENCES "public"."leads"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_changes" ADD CONSTRAINT "lead_status_changes_meeting_org_fk" FOREIGN KEY ("meeting_id","organization_id") REFERENCES "public"."meetings"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_org_status_updated_idx" ON "leads" USING btree ("organization_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "scheduling_availability_exceptions_calendar_date_idx" ON "scheduling_availability_exceptions" USING btree ("calendar_id","local_date");--> statement-breakpoint
CREATE INDEX "scheduling_availability_rules_calendar_idx" ON "scheduling_availability_rules" USING btree ("calendar_id","weekday");--> statement-breakpoint
CREATE INDEX "meeting_slot_offers_org_lead_created_idx" ON "meeting_slot_offers" USING btree ("organization_id","lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_one_active_per_lead_uidx" ON "meetings" USING btree ("organization_id","lead_id") WHERE "meetings"."status" = 'SCHEDULED';--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_one_active_per_attempt_uidx" ON "meetings" USING btree ("organization_id","source_attempt_id") WHERE "meetings"."status" = 'SCHEDULED' AND "meetings"."source_attempt_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_slot_offer_uidx" ON "meetings" USING btree ("slot_offer_id") WHERE "meetings"."slot_offer_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "meetings_org_calendar_starts_idx" ON "meetings" USING btree ("organization_id","calendar_id","starts_at");--> statement-breakpoint
CREATE INDEX "lead_status_changes_org_lead_created_idx" ON "lead_status_changes" USING btree ("organization_id","lead_id","created_at");--> statement-breakpoint
-- E1 (DEC-074): nenhuma sobreposição de reuniões ATIVAS na mesma agenda,
-- garantida pelo banco mesmo sob reservas concorrentes. `btree_gist` é
-- extensão confiável do PostgreSQL (contrib) e permite a igualdade de uuid no GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_no_overlap_excl" EXCLUDE USING gist ("calendar_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&) WHERE ("status" = 'SCHEDULED');--> statement-breakpoint
-- E1 (auditoria M5): o CONTEÚDO do histórico de status é imutável no banco.
-- UPDATE é recusado; DELETE só ocorre pela cascata do lead/organização.
CREATE FUNCTION "lead_status_changes_reject_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'lead_status_changes is append-only' USING ERRCODE = 'P0001';
END
$$;--> statement-breakpoint
CREATE TRIGGER "lead_status_changes_no_update" BEFORE UPDATE ON "lead_status_changes" FOR EACH ROW EXECUTE FUNCTION "lead_status_changes_reject_update"();
