CREATE TABLE "outbound_campaign_audiences" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_list_id" uuid NOT NULL,
	"scheduled_start_at" timestamp with time zone,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbound_campaign_audiences" ADD CONSTRAINT "outbound_campaign_audiences_campaign_org_fk" FOREIGN KEY ("campaign_id","organization_id") REFERENCES "public"."outbound_campaigns"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_campaign_audiences" ADD CONSTRAINT "outbound_campaign_audiences_list_org_fk" FOREIGN KEY ("contact_list_id","organization_id") REFERENCES "public"."contact_lists"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_campaigns" ADD CONSTRAINT "outbound_campaigns_agent_version_org_fk" FOREIGN KEY ("agent_version_id","agent_id","organization_id") REFERENCES "public"."agent_versions"("id","agent_id","organization_id") ON DELETE restrict ON UPDATE no action;