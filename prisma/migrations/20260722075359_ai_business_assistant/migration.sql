-- CreateEnum
CREATE TYPE "AiActionStatus" AS ENUM ('PREVIEWED', 'EXECUTED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "recommender_name" VARCHAR(64);

-- AlterTable
ALTER TABLE "people" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "ethnicity" VARCHAR(32),
ADD COLUMN     "gender" VARCHAR(16),
ADD COLUMN     "origin" VARCHAR(120),
ADD COLUMN     "recommender_name" VARCHAR(64);

-- CreateTable
CREATE TABLE "ai_actions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "skill" VARCHAR(80) NOT NULL,
    "raw_instruction" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "impact" JSONB,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "AiActionStatus" NOT NULL DEFAULT 'PREVIEWED',
    "idempotency_key" VARCHAR(128),
    "result" JSONB,
    "error" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "role" "UserRole" NOT NULL,
    "raw_instruction" TEXT NOT NULL,
    "skill" VARCHAR(80) NOT NULL,
    "parameters" JSONB NOT NULL,
    "tool" VARCHAR(120) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "action_id" UUID,
    "idempotency_key" VARCHAR(128),
    "result" JSONB,
    "error" TEXT,
    "scope" JSONB NOT NULL,
    "model" VARCHAR(120),
    "route_type" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_demo_snapshots" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "person_state" JSONB NOT NULL,
    "application_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_demo_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_actions_idempotency_key_key" ON "ai_actions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ai_actions_user_id_status_expires_at_idx" ON "ai_actions"("user_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "ai_audit_logs_actor_id_created_at_idx" ON "ai_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_audit_logs_action_id_idx" ON "ai_audit_logs"("action_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_demo_snapshots_person_id_key" ON "ai_demo_snapshots"("person_id");

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_audit_logs" ADD CONSTRAINT "ai_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_demo_snapshots" ADD CONSTRAINT "ai_demo_snapshots_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
