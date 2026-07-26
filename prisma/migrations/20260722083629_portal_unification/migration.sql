-- CreateTable
CREATE TABLE "portal_favorites" (
    "user_id" UUID NOT NULL,
    "job_demand_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_favorites_pkey" PRIMARY KEY ("user_id","job_demand_id")
);

-- CreateTable
CREATE TABLE "portal_advances" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "creator_user_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'submitted',
    "reply" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_appeals" (
    "id" UUID NOT NULL,
    "creator_user_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "subject_id" VARCHAR(128),
    "description" TEXT NOT NULL,
    "requested_amount" DECIMAL(12,2),
    "expected_status" VARCHAR(64),
    "attachment_ids" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(32) NOT NULL DEFAULT 'submitted',
    "reply" TEXT,
    "handler_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_settlements" (
    "id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "due_amount" DECIMAL(14,2) NOT NULL,
    "confirmed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pending_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "disputed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending_confirmation',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_settlement_items" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "policy" TEXT NOT NULL,
    "employment_days" INTEGER NOT NULL,
    "due_amount" DECIMAL(12,2) NOT NULL,
    "actual_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',

    CONSTRAINT "portal_settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_qr_codes" (
    "id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "project_id" UUID NOT NULL,
    "job_demand_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_qr_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_favorites_job_demand_id_idx" ON "portal_favorites"("job_demand_id");

-- CreateIndex
CREATE INDEX "portal_advances_creator_user_id_status_idx" ON "portal_advances"("creator_user_id", "status");

-- CreateIndex
CREATE INDEX "portal_advances_person_id_idx" ON "portal_advances"("person_id");

-- CreateIndex
CREATE INDEX "portal_appeals_creator_user_id_status_idx" ON "portal_appeals"("creator_user_id", "status");

-- CreateIndex
CREATE INDEX "portal_appeals_handler_user_id_idx" ON "portal_appeals"("handler_user_id");

-- CreateIndex
CREATE INDEX "portal_settlements_month_status_idx" ON "portal_settlements"("month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "portal_settlements_supplier_id_month_key" ON "portal_settlements"("supplier_id", "month");

-- CreateIndex
CREATE INDEX "portal_settlement_items_person_id_idx" ON "portal_settlement_items"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_settlement_items_settlement_id_person_id_key" ON "portal_settlement_items"("settlement_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "portal_qr_codes_token_key" ON "portal_qr_codes"("token");

-- CreateIndex
CREATE INDEX "portal_qr_codes_project_id_expires_at_idx" ON "portal_qr_codes"("project_id", "expires_at");

-- AddForeignKey
ALTER TABLE "portal_favorites" ADD CONSTRAINT "portal_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_favorites" ADD CONSTRAINT "portal_favorites_job_demand_id_fkey" FOREIGN KEY ("job_demand_id") REFERENCES "job_demands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_advances" ADD CONSTRAINT "portal_advances_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_advances" ADD CONSTRAINT "portal_advances_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_appeals" ADD CONSTRAINT "portal_appeals_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_appeals" ADD CONSTRAINT "portal_appeals_handler_user_id_fkey" FOREIGN KEY ("handler_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_settlements" ADD CONSTRAINT "portal_settlements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_settlement_items" ADD CONSTRAINT "portal_settlement_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "portal_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_settlement_items" ADD CONSTRAINT "portal_settlement_items_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_qr_codes" ADD CONSTRAINT "portal_qr_codes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_qr_codes" ADD CONSTRAINT "portal_qr_codes_job_demand_id_fkey" FOREIGN KEY ("job_demand_id") REFERENCES "job_demands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_qr_codes" ADD CONSTRAINT "portal_qr_codes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
