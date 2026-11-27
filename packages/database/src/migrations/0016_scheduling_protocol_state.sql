CREATE TABLE "scheduling_protocol_states" (
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_protocol_states_pk" PRIMARY KEY("organization_id","session_id"),
	CONSTRAINT "scheduling_protocol_states_seq_chk" CHECK ("scheduling_protocol_states"."seq" >= 0 AND "scheduling_protocol_states"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD CONSTRAINT "scheduling_protocol_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduling_protocol_states" ADD CONSTRAINT "scheduling_protocol_states_session_org_fk" FOREIGN KEY ("session_id","organization_id") REFERENCES "public"."call_sessions"("id","organization_id") ON DELETE cascade ON UPDATE no action;