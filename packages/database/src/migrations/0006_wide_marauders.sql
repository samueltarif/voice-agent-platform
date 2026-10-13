ALTER TABLE "knowledge_documents" ADD COLUMN "chunk_policy_version" text;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "chunk_max_chars" integer;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD COLUMN "chunk_overlap_chars" integer;