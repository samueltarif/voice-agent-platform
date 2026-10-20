ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_id_agent_org_unique" UNIQUE("id","agent_id","organization_id");
--> statement-breakpoint
ALTER TABLE "outbound_call_jobs" ADD CONSTRAINT "outbound_call_jobs_id_org_unique" UNIQUE("id","organization_id");
--> statement-breakpoint
ALTER TABLE "outbound_campaigns" ADD CONSTRAINT "outbound_campaigns_id_org_unique" UNIQUE("id","organization_id");
--> statement-breakpoint
CREATE TYPE "public"."organization_phone_number_status" AS ENUM('ACTIVE', 'RELEASED');
--> statement-breakpoint
CREATE TYPE "public"."call_attempt_state" AS ENUM('CREATED', 'ORIGINATION_PENDING', 'ORIGINATION_SENT', 'ORIGINATION_ACCEPTED', 'OUTCOME_UNKNOWN', 'RECONCILIATION_PENDING', 'ORIGINATION_REJECTED', 'NOT_ORIGINATED', 'CLOSED', 'CANCELED');
--> statement-breakpoint
CREATE TYPE "public"."call_session_runtime_state" AS ENUM('CREATED', 'CONNECTING', 'ACTIVE', 'ENDING', 'ENDED', 'FAILED');
--> statement-breakpoint
CREATE TYPE "public"."call_event_application_result" AS ENUM('APPLIED', 'STALE', 'REJECTED');
--> statement-breakpoint
CREATE TYPE "public"."call_event_source" AS ENUM('INTERNAL', 'PROVIDER');
--> statement-breakpoint
CREATE TABLE "organization_phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"e164_number" text NOT NULL,
	"twilio_phone_number_sid" text,
	"status" "organization_phone_number_status" DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_phone_numbers_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "organization_phone_numbers_e164_chk" CHECK ("organization_phone_numbers"."e164_number" ~ '^\+[1-9][0-9]{7,14}$'),
	CONSTRAINT "organization_phone_numbers_sid_chk" CHECK ("organization_phone_numbers"."twilio_phone_number_sid" IS NULL OR char_length("organization_phone_numbers"."twilio_phone_number_sid") BETWEEN 1 AND 64),
	CONSTRAINT "organization_phone_numbers_version_chk" CHECK ("organization_phone_numbers"."version" > 0),
	CONSTRAINT "organization_phone_numbers_released_chk" CHECK (("organization_phone_numbers"."status" = 'RELEASED') = ("organization_phone_numbers"."released_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "call_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"campaign_id" uuid,
	"attempt_number" integer NOT NULL,
	"correlation_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"state" "call_attempt_state" NOT NULL,
	"state_version" integer DEFAULT 1 NOT NULL,
	"origination_authority_id" text,
	"provider_reference" text,
	"call_session_id" uuid,
	"reconciliation_attempts" integer DEFAULT 0 NOT NULL,
	"requires_manual_review" boolean DEFAULT false NOT NULL,
	"claim_owner" text,
	"fencing_token" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"send_started_at" timestamp with time zone,
	"last_reconciliation_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_attempts_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "call_attempts_attempt_number_chk" CHECK ("call_attempts"."attempt_number" > 0),
	CONSTRAINT "call_attempts_state_version_chk" CHECK ("call_attempts"."state_version" > 0),
	CONSTRAINT "call_attempts_fencing_chk" CHECK ("call_attempts"."fencing_token" >= 0),
	CONSTRAINT "call_attempts_reconciliation_chk" CHECK ("call_attempts"."reconciliation_attempts" >= 0),
	CONSTRAINT "call_attempts_idempotency_chk" CHECK (char_length("call_attempts"."idempotency_key") > 0),
	CONSTRAINT "call_attempts_lease_owner_chk" CHECK ("call_attempts"."lease_expires_at" IS NULL OR "call_attempts"."claim_owner" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "call_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version_id" uuid NOT NULL,
	"current_attempt_id" uuid,
	"runtime_state" "call_session_runtime_state" DEFAULT 'CREATED' NOT NULL,
	"state_version" integer DEFAULT 1 NOT NULL,
	"provider_call_reference" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_sessions_id_org_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "call_sessions_id_org_attempt_unique" UNIQUE("id","organization_id","current_attempt_id"),
	CONSTRAINT "call_sessions_state_version_chk" CHECK ("call_sessions"."state_version" > 0),
	CONSTRAINT "call_sessions_ended_chk" CHECK (("call_sessions"."runtime_state" IN ('ENDED', 'FAILED')) = ("call_sessions"."ended_at" IS NOT NULL)),
	CONSTRAINT "call_sessions_failure_reason_chk" CHECK ("call_sessions"."failure_reason" IS NULL OR char_length("call_sessions"."failure_reason") <= 200)
);
--> statement-breakpoint
CREATE TABLE "call_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "call_events_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"event_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"attempt_id" uuid,
	"call_session_id" uuid,
	"source" "call_event_source" DEFAULT 'INTERNAL' NOT NULL,
	"provider" text,
	"provider_call_id" text,
	"provider_event_id" text,
	"event_type" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"payload_hash" text,
	"occurred_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"application_result" "call_event_application_result" NOT NULL,
	"rejection_reason" text,
	CONSTRAINT "call_events_correlation_chk" CHECK ("call_events"."attempt_id" IS NOT NULL OR "call_events"."call_session_id" IS NOT NULL),
	CONSTRAINT "call_events_attributes_chk" CHECK (jsonb_typeof("call_events"."attributes") = 'object'),
	CONSTRAINT "call_events_type_chk" CHECK (char_length("call_events"."event_type") BETWEEN 1 AND 64),
	CONSTRAINT "call_events_fingerprint_chk" CHECK ("call_events"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "call_events_payload_hash_chk" CHECK ("call_events"."payload_hash" IS NULL OR "call_events"."payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "call_events_rejection_chk" CHECK (("call_events"."application_result" = 'REJECTED') = ("call_events"."rejection_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "organization_phone_numbers" ADD CONSTRAINT "organization_phone_numbers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_job_org_fk" FOREIGN KEY ("job_id","organization_id") REFERENCES "public"."outbound_call_jobs"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_campaign_org_fk" FOREIGN KEY ("campaign_id","organization_id") REFERENCES "public"."outbound_campaigns"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_agent_version_org_fk" FOREIGN KEY ("agent_version_id","agent_id","organization_id") REFERENCES "public"."agent_versions"("id","agent_id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_session_binding_fk" FOREIGN KEY ("call_session_id","organization_id","id") REFERENCES "public"."call_sessions"("id","organization_id","current_attempt_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_attempt_org_fk" FOREIGN KEY ("current_attempt_id","organization_id") REFERENCES "public"."call_attempts"("id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_agent_version_org_fk" FOREIGN KEY ("agent_version_id","agent_id","organization_id") REFERENCES "public"."agent_versions"("id","agent_id","organization_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_attempt_org_fk" FOREIGN KEY ("attempt_id","organization_id") REFERENCES "public"."call_attempts"("id","organization_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_session_org_fk" FOREIGN KEY ("call_session_id","organization_id") REFERENCES "public"."call_sessions"("id","organization_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_phone_numbers_e164_uidx" ON "organization_phone_numbers" USING btree ("e164_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_phone_numbers_twilio_sid_uidx" ON "organization_phone_numbers" USING btree ("twilio_phone_number_sid") WHERE "organization_phone_numbers"."twilio_phone_number_sid" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "organization_phone_numbers_org_status_idx" ON "organization_phone_numbers" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX "call_attempts_job_number_uidx" ON "call_attempts" USING btree ("organization_id","job_id","attempt_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "call_attempts_org_idempotency_uidx" ON "call_attempts" USING btree ("organization_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "call_attempts_single_open_per_job_uidx" ON "call_attempts" USING btree ("organization_id","job_id") WHERE "call_attempts"."state" NOT IN ('ORIGINATION_REJECTED', 'NOT_ORIGINATED', 'CLOSED', 'CANCELED');
--> statement-breakpoint
CREATE INDEX "call_attempts_org_state_lease_idx" ON "call_attempts" USING btree ("organization_id","state","lease_expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "call_sessions_attempt_uidx" ON "call_sessions" USING btree ("organization_id","current_attempt_id") WHERE "call_sessions"."current_attempt_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "call_events_event_id_uidx" ON "call_events" USING btree ("event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "call_events_sequence_uidx" ON "call_events" USING btree ("sequence");
--> statement-breakpoint
CREATE INDEX "call_events_org_attempt_seq_idx" ON "call_events" USING btree ("organization_id","attempt_id","sequence");
--> statement-breakpoint
CREATE INDEX "call_events_org_session_seq_idx" ON "call_events" USING btree ("organization_id","call_session_id","sequence");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "call_events_block_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'call_events is append-only (% blocked)', TG_OP USING ERRCODE = 'P0001';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "call_events_append_only" BEFORE UPDATE OR DELETE ON "call_events" FOR EACH ROW EXECUTE FUNCTION "call_events_block_mutation"();--> statement-breakpoint
CREATE TRIGGER "call_events_no_truncate" BEFORE TRUNCATE ON "call_events" FOR EACH STATEMENT EXECUTE FUNCTION "call_events_block_mutation"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "call_attempts_guard_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.job_id <> OLD.job_id
    OR NEW.attempt_number <> OLD.attempt_number OR NEW.idempotency_key <> OLD.idempotency_key
    OR NEW.correlation_id <> OLD.correlation_id OR NEW.agent_id <> OLD.agent_id
    OR NEW.agent_version_id <> OLD.agent_version_id OR NEW.created_at <> OLD.created_at
    OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id THEN
    RAISE EXCEPTION 'call_attempts identity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.state IN ('ORIGINATION_REJECTED', 'NOT_ORIGINATED', 'CLOSED', 'CANCELED') AND NEW.state <> OLD.state THEN
    RAISE EXCEPTION 'call_attempts terminal state is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.call_session_id IS NOT NULL AND NEW.call_session_id IS DISTINCT FROM OLD.call_session_id THEN
    RAISE EXCEPTION 'call_attempts session binding is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.fencing_token < OLD.fencing_token OR NEW.state_version <= OLD.state_version THEN
    RAISE EXCEPTION 'call_attempts versions must advance' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "call_attempts_identity_guard" BEFORE UPDATE ON "call_attempts" FOR EACH ROW EXECUTE FUNCTION "call_attempts_guard_identity"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "call_sessions_guard_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.agent_id <> OLD.agent_id
    OR NEW.agent_version_id <> OLD.agent_version_id OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'call_sessions identity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.current_attempt_id IS NOT NULL AND NEW.current_attempt_id IS DISTINCT FROM OLD.current_attempt_id THEN
    RAISE EXCEPTION 'call_sessions attempt binding is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.runtime_state IN ('ENDED', 'FAILED') AND NEW.runtime_state <> OLD.runtime_state THEN
    RAISE EXCEPTION 'call_sessions terminal state is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.state_version <= OLD.state_version THEN
    RAISE EXCEPTION 'call_sessions versions must advance' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "call_sessions_identity_guard" BEFORE UPDATE ON "call_sessions" FOR EACH ROW EXECUTE FUNCTION "call_sessions_guard_identity"();--> statement-breakpoint
CREATE OR REPLACE FUNCTION "organization_phone_numbers_guard_identity"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.organization_id <> OLD.organization_id OR NEW.e164_number <> OLD.e164_number
    OR (OLD.twilio_phone_number_sid IS NOT NULL AND NEW.twilio_phone_number_sid IS DISTINCT FROM OLD.twilio_phone_number_sid) THEN
    RAISE EXCEPTION 'organization_phone_numbers identity is immutable' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'RELEASED' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'organization_phone_numbers RELEASED is terminal' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version <= OLD.version THEN
    RAISE EXCEPTION 'organization_phone_numbers versions must advance' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "organization_phone_numbers_identity_guard" BEFORE UPDATE ON "organization_phone_numbers" FOR EACH ROW EXECUTE FUNCTION "organization_phone_numbers_guard_identity"();
