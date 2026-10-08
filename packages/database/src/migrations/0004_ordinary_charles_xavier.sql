CREATE TYPE "public"."knowledge_document_status" AS ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_type" AS ENUM('MANUAL_UPLOAD', 'PRODUCT_MANUAL', 'FAQ', 'POLICY', 'SALES_SCRIPT', 'HELP_CENTER_IMPORT', 'OTHER');--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"text" text NOT NULL,
	"policy_version" text NOT NULL,
	"content_identity_value" text,
	"chunk_identity" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_chunks_ordinal_chk" CHECK ("knowledge_chunks"."ordinal" >= 0),
	CONSTRAINT "knowledge_chunks_text_chk" CHECK (char_length("knowledge_chunks"."text") > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_type" "knowledge_source_type" NOT NULL,
	"source_locator" text NOT NULL,
	"source_version" text,
	"content_identity_algorithm" text,
	"content_identity_value" text,
	"status" "knowledge_document_status" DEFAULT 'PENDING' NOT NULL,
	"collection" text,
	"agent_id" uuid,
	"agent_version_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_docs_title_chk" CHECK (char_length("knowledge_documents"."title") > 0),
	CONSTRAINT "knowledge_docs_locator_chk" CHECK (char_length("knowledge_documents"."source_locator") > 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_doc_ordinal_uidx" ON "knowledge_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_doc_chunk_ident_uidx" ON "knowledge_chunks" USING btree ("document_id","chunk_identity");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_org_doc_idx" ON "knowledge_chunks" USING btree ("organization_id","document_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_org_idx" ON "knowledge_chunks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_docs_org_idx" ON "knowledge_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_docs_org_status_idx" ON "knowledge_documents" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_docs_org_content_ident_idx" ON "knowledge_documents" USING btree ("organization_id","content_identity_value");--> statement-breakpoint
CREATE INDEX "knowledge_docs_org_collection_idx" ON "knowledge_documents" USING btree ("organization_id","collection");