CREATE TYPE "RoleAssignmentSource" AS ENUM ('MANUAL', 'POSITION', 'TEMPORARY', 'LEGACY');

CREATE TABLE "position_role_bindings" (
  "id" UUID NOT NULL,
  "position_id" UUID NOT NULL,
  "role_id" UUID NOT NULL,
  "scope_type" "DataScopeType" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "position_role_bindings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_role_assignments"
  ADD COLUMN "source" "RoleAssignmentSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "position_role_binding_id" UUID;

CREATE UNIQUE INDEX "position_role_bindings_position_id_role_id_scope_type_key"
  ON "position_role_bindings"("position_id", "role_id", "scope_type");
CREATE INDEX "position_role_bindings_position_id_is_active_idx"
  ON "position_role_bindings"("position_id", "is_active");
CREATE INDEX "position_role_bindings_role_id_is_active_idx"
  ON "position_role_bindings"("role_id", "is_active");
CREATE INDEX "user_role_assignments_user_id_source_status_idx"
  ON "user_role_assignments"("user_id", "source", "status");
CREATE INDEX "user_role_assignments_position_role_binding_id_status_idx"
  ON "user_role_assignments"("position_role_binding_id", "status");

ALTER TABLE "position_role_bindings"
  ADD CONSTRAINT "position_role_bindings_position_id_fkey"
  FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "position_role_bindings"
  ADD CONSTRAINT "position_role_bindings_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_position_role_binding_id_fkey"
  FOREIGN KEY ("position_role_binding_id") REFERENCES "position_role_bindings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
