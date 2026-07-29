-- Internal HR organization follows the roster: group -> center -> business department.
-- Branch remains available for project / external staffing geography, but is removed
-- from internal employee, position authorization and employee reimbursement records.

-- Organization nodes previously typed as BRANCH are business departments in the
-- internal roster. Each employee keeps an independent legal_entity_id for the contract company.
UPDATE "organization_units"
SET
  "type" = 'DEPARTMENT',
  "branch_id" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'BRANCH';

UPDATE "organization_units"
SET
  "branch_id" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "type" IN ('CENTER', 'DEPARTMENT')
  AND "branch_id" IS NOT NULL;

-- Organization structure is a management hierarchy only. Contract legal entity and
-- project/operating branch are stored on their own business records, not on departments.
DROP INDEX IF EXISTS "organization_units_legal_entity_id_type_is_active_idx";
DROP INDEX IF EXISTS "organization_units_branch_id_type_is_active_idx";

ALTER TABLE "organization_units"
  DROP CONSTRAINT IF EXISTS "organization_units_legal_entity_id_fkey",
  DROP CONSTRAINT IF EXISTS "organization_units_branch_id_fkey",
  DROP COLUMN IF EXISTS "legal_entity_id",
  DROP COLUMN IF EXISTS "branch_id";

-- Preserve an existing ORG_UNIT binding when the same position / role was configured
-- twice under the old model, and redirect assignment history before removing duplicate rows.
WITH duplicate_bindings AS (
  SELECT
    old_binding."id" AS old_id,
    org_binding."id" AS replacement_id
  FROM "position_role_bindings" old_binding
  JOIN "position_role_bindings" org_binding
    ON org_binding."position_id" = old_binding."position_id"
   AND org_binding."role_id" = old_binding."role_id"
   AND org_binding."scope_type" = 'ORG_UNIT'
  WHERE old_binding."scope_type" = 'BRANCH'
)
UPDATE "user_role_assignments" assignment
SET
  "position_role_binding_id" = duplicate_bindings.replacement_id,
  "updated_at" = CURRENT_TIMESTAMP
FROM duplicate_bindings
WHERE assignment."position_role_binding_id" = duplicate_bindings.old_id;

DELETE FROM "position_role_bindings" old_binding
USING "position_role_bindings" org_binding
WHERE old_binding."scope_type" = 'BRANCH'
  AND org_binding."scope_type" = 'ORG_UNIT'
  AND org_binding."position_id" = old_binding."position_id"
  AND org_binding."role_id" = old_binding."role_id";

UPDATE "position_role_bindings"
SET
  "scope_type" = 'ORG_UNIT',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "scope_type" = 'BRANCH';

-- Internal positions previously configured as “branch manager” now represent business
-- department managers. Project/manual branch-manager assignments are deliberately untouched.
WITH role_ids AS (
  SELECT
    (SELECT "id" FROM "roles" WHERE "code" = 'BRANCH_MANAGER' LIMIT 1) AS old_role_id,
    (SELECT "id" FROM "roles" WHERE "code" = 'DEPARTMENT_MANAGER' LIMIT 1) AS new_role_id
), assignment_pairs AS (
  SELECT
    old_assignment."id" AS old_assignment_id,
    replacement."id" AS replacement_assignment_id
  FROM "user_role_assignments" old_assignment
  CROSS JOIN role_ids
  JOIN "user_role_assignments" replacement
    ON replacement."user_id" = old_assignment."user_id"
   AND replacement."role_id" = role_ids.new_role_id
   AND replacement."valid_from" = old_assignment."valid_from"
  WHERE old_assignment."source" = 'POSITION'
    AND old_assignment."role_id" = role_ids.old_role_id
    AND role_ids.old_role_id IS NOT NULL
    AND role_ids.new_role_id IS NOT NULL
)
UPDATE "data_scope_bindings" scope
SET
  "role_assignment_id" = assignment_pairs.replacement_assignment_id,
  "updated_at" = CURRENT_TIMESTAMP
FROM assignment_pairs
WHERE scope."role_assignment_id" = assignment_pairs.old_assignment_id;

WITH role_ids AS (
  SELECT
    (SELECT "id" FROM "roles" WHERE "code" = 'BRANCH_MANAGER' LIMIT 1) AS old_role_id,
    (SELECT "id" FROM "roles" WHERE "code" = 'DEPARTMENT_MANAGER' LIMIT 1) AS new_role_id
)
DELETE FROM "user_role_assignments" old_assignment
USING role_ids, "user_role_assignments" replacement
WHERE old_assignment."source" = 'POSITION'
  AND old_assignment."role_id" = role_ids.old_role_id
  AND replacement."user_id" = old_assignment."user_id"
  AND replacement."role_id" = role_ids.new_role_id
  AND replacement."valid_from" = old_assignment."valid_from";

WITH role_ids AS (
  SELECT
    (SELECT "id" FROM "roles" WHERE "code" = 'BRANCH_MANAGER' LIMIT 1) AS old_role_id,
    (SELECT "id" FROM "roles" WHERE "code" = 'DEPARTMENT_MANAGER' LIMIT 1) AS new_role_id
)
UPDATE "user_role_assignments" assignment
SET
  "role_id" = role_ids.new_role_id,
  "updated_at" = CURRENT_TIMESTAMP
FROM role_ids
WHERE assignment."source" = 'POSITION'
  AND assignment."role_id" = role_ids.old_role_id
  AND role_ids.new_role_id IS NOT NULL;

WITH role_ids AS (
  SELECT
    (SELECT "id" FROM "roles" WHERE "code" = 'BRANCH_MANAGER' LIMIT 1) AS old_role_id,
    (SELECT "id" FROM "roles" WHERE "code" = 'DEPARTMENT_MANAGER' LIMIT 1) AS new_role_id
), duplicate_bindings AS (
  SELECT
    old_binding."id" AS old_id,
    replacement."id" AS replacement_id
  FROM "position_role_bindings" old_binding
  CROSS JOIN role_ids
  JOIN "position_role_bindings" replacement
    ON replacement."position_id" = old_binding."position_id"
   AND replacement."role_id" = role_ids.new_role_id
   AND replacement."scope_type" = old_binding."scope_type"
  WHERE old_binding."role_id" = role_ids.old_role_id
    AND role_ids.old_role_id IS NOT NULL
    AND role_ids.new_role_id IS NOT NULL
)
UPDATE "user_role_assignments" assignment
SET
  "position_role_binding_id" = duplicate_bindings.replacement_id,
  "updated_at" = CURRENT_TIMESTAMP
FROM duplicate_bindings
WHERE assignment."position_role_binding_id" = duplicate_bindings.old_id;

WITH role_ids AS (
  SELECT
    (SELECT "id" FROM "roles" WHERE "code" = 'BRANCH_MANAGER' LIMIT 1) AS old_role_id,
    (SELECT "id" FROM "roles" WHERE "code" = 'DEPARTMENT_MANAGER' LIMIT 1) AS new_role_id
)
DELETE FROM "position_role_bindings" old_binding
USING role_ids, "position_role_bindings" replacement
WHERE old_binding."role_id" = role_ids.old_role_id
  AND replacement."position_id" = old_binding."position_id"
  AND replacement."role_id" = role_ids.new_role_id
  AND replacement."scope_type" = old_binding."scope_type";

WITH role_ids AS (
  SELECT
    (SELECT "id" FROM "roles" WHERE "code" = 'BRANCH_MANAGER' LIMIT 1) AS old_role_id,
    (SELECT "id" FROM "roles" WHERE "code" = 'DEPARTMENT_MANAGER' LIMIT 1) AS new_role_id
)
UPDATE "position_role_bindings" binding
SET
  "role_id" = role_ids.new_role_id,
  "updated_at" = CURRENT_TIMESTAMP
FROM role_ids
WHERE binding."role_id" = role_ids.old_role_id
  AND role_ids.new_role_id IS NOT NULL;

-- Convert active position-generated branch scopes to the employee's current department.
UPDATE "data_scope_bindings" scope
SET
  "type" = 'ORG_UNIT',
  "organization_unit_id" = employee."organization_unit_id",
  "branch_id" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
FROM "user_role_assignments" assignment
JOIN "internal_employees" employee
  ON employee."user_id" = assignment."user_id"
WHERE scope."role_assignment_id" = assignment."id"
  AND assignment."source" = 'POSITION'
  AND scope."type" = 'BRANCH'
  AND employee."organization_unit_id" IS NOT NULL;

-- A position authorization without an internal employee / department cannot be safely
-- inferred. Revoke that scope rather than silently granting a wider range.
UPDATE "data_scope_bindings" scope
SET
  "is_active" = false,
  "valid_to" = COALESCE(scope."valid_to", CURRENT_TIMESTAMP),
  "revoked_at" = COALESCE(scope."revoked_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
FROM "user_role_assignments" assignment
WHERE scope."role_assignment_id" = assignment."id"
  AND assignment."source" = 'POSITION'
  AND scope."type" = 'BRANCH';

-- Internal employee records and employment history use organization_unit_id only.
DROP INDEX IF EXISTS "internal_employees_status_branch_id_organization_unit_id_idx";
DROP INDEX IF EXISTS "internal_employments_branch_id_ended_at_idx";

ALTER TABLE "internal_employees"
  DROP CONSTRAINT IF EXISTS "internal_employees_branch_id_fkey",
  DROP COLUMN IF EXISTS "branch_id";

ALTER TABLE "internal_employments"
  DROP CONSTRAINT IF EXISTS "internal_employments_branch_id_fkey",
  DROP COLUMN IF EXISTS "branch_id";

CREATE INDEX IF NOT EXISTS "internal_employees_status_organization_unit_id_idx"
ON "internal_employees"("status", "organization_unit_id");

-- Remove the legacy branch shortcut only for users linked to an internal employee.
UPDATE "users" account
SET
  "branch_id" = NULL,
  "token_version" = account."token_version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE account."branch_id" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "internal_employees" employee
    WHERE employee."user_id" = account."id"
  );

-- Employee reimbursements inherit the applicant's department. Project/supplier expense
-- records can still retain branch_id because that field has a separate operational meaning.
UPDATE "reimbursement_batches" batch
SET
  "branch_id" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE batch."branch_id" IS NOT NULL
  AND batch."organization_unit_id" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "internal_employees" employee
    WHERE employee."user_id" = batch."applicant_user_id"
  );
