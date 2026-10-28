CREATE TYPE "public"."contact_suppression_reason" AS ENUM('OPT_OUT', 'DO_NOT_CALL_REGISTRY', 'MANUAL');--> statement-breakpoint
CREATE TABLE "contact_list_members" (
	"list_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_list_members_pk" PRIMARY KEY("list_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "contact_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_lists_org_name_unique" UNIQUE("organization_id","name"),
	CONSTRAINT "contact_lists_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "contact_lists_name_chk" CHECK (char_length("contact_lists"."name") BETWEEN 1 AND 120)
);
--> statement-breakpoint
CREATE TABLE "contact_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"reason" "contact_suppression_reason" NOT NULL,
	"evidence_reference" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_suppressions_org_phone_unique" UNIQUE("organization_id","phone_e164"),
	CONSTRAINT "contact_suppressions_phone_e164_chk" CHECK ("contact_suppressions"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "contact_suppressions_evidence_chk" CHECK ("contact_suppressions"."evidence_reference" IS NULL OR char_length("contact_suppressions"."evidence_reference") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"display_name" text,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_reference" text,
	"consent_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_org_phone_unique" UNIQUE("organization_id","phone_e164"),
	CONSTRAINT "contacts_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "contacts_phone_e164_chk" CHECK ("contacts"."phone_e164" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "contacts_name_chk" CHECK ("contacts"."display_name" IS NULL OR char_length("contacts"."display_name") <= 500),
	CONSTRAINT "contacts_variables_chk" CHECK (jsonb_typeof("contacts"."variables") = 'object'),
	CONSTRAINT "contacts_consent_chk" CHECK ("contacts"."consent_reference" IS NULL OR char_length("contacts"."consent_reference") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_list_org_fk" FOREIGN KEY ("list_id","organization_id") REFERENCES "public"."contact_lists"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_list_members" ADD CONSTRAINT "contact_list_members_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_lists" ADD CONSTRAINT "contact_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_suppressions" ADD CONSTRAINT "contact_suppressions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_list_members_org_contact_idx" ON "contact_list_members" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "outbound_call_jobs_block_suppressed"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 008-MVP1: destino suprimido nunca vira job. Comparação exata em E.164: a
  -- originação só aceita E.164, logo outro formato jamais é discado.
  IF EXISTS (
    SELECT 1 FROM "contact_suppressions" s
    WHERE s.organization_id = NEW.organization_id AND s.phone_e164 = NEW.destination_phone
  ) THEN
    RAISE EXCEPTION 'outbound destination is suppressed for this organization'
      USING ERRCODE = '23514', CONSTRAINT = 'outbound_call_jobs_destination_not_suppressed';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "outbound_call_jobs_suppression_guard" BEFORE INSERT OR UPDATE OF "destination_phone", "organization_id" ON "outbound_call_jobs" FOR EACH ROW EXECUTE FUNCTION "outbound_call_jobs_block_suppressed"();