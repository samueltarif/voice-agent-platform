CREATE TYPE "public"."catalog_item_kind" AS ENUM('PRODUCT', 'SERVICE');--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "catalog_item_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sku" text,
	"active" boolean DEFAULT true NOT NULL,
	"price_cents" integer,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_name_chk" CHECK (char_length("catalog_items"."name") > 0),
	CONSTRAINT "catalog_items_price_cents_chk" CHECK ("catalog_items"."price_cents" IS NULL OR "catalog_items"."price_cents" >= 0),
	CONSTRAINT "catalog_items_currency_chk" CHECK ("catalog_items"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_items_org_sku_uidx" ON "catalog_items" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE INDEX "catalog_items_org_active_idx" ON "catalog_items" USING btree ("organization_id","active");--> statement-breakpoint
CREATE INDEX "catalog_items_org_kind_active_idx" ON "catalog_items" USING btree ("organization_id","kind","active");--> statement-breakpoint
CREATE INDEX "catalog_items_org_name_idx" ON "catalog_items" USING btree ("organization_id","name");