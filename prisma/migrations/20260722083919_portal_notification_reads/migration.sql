-- CreateTable
CREATE TABLE "portal_notification_reads" (
    "user_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_notification_reads_pkey" PRIMARY KEY ("user_id","notification_id")
);

-- CreateIndex
CREATE INDEX "portal_notification_reads_notification_id_idx" ON "portal_notification_reads"("notification_id");

-- AddForeignKey
ALTER TABLE "portal_notification_reads" ADD CONSTRAINT "portal_notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_notification_reads" ADD CONSTRAINT "portal_notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
