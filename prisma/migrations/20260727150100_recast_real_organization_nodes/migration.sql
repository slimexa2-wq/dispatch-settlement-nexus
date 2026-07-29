-- Recast existing nodes only after the new enum values are committed.
UPDATE "organization_units"
SET "type" = 'LEADERSHIP', "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = '集团领导';

UPDATE "organization_units"
SET "type" = 'BUSINESS_DEPARTMENT', "updated_at" = CURRENT_TIMESTAMP
WHERE "name" IN ('企事业部', '市场拓展部', '总经办');

UPDATE "organization_units"
SET "type" = 'BRANCH', "updated_at" = CURRENT_TIMESTAMP
WHERE "name" IN (
  '双流分公司', '郫都分公司', '宜宾分公司', '绵阳分公司',
  '龙泉分公司', '广元分公司', '重庆分公司'
);

UPDATE "organization_units"
SET "type" = 'SUBSIDIARY', "updated_at" = CURRENT_TIMESTAMP
WHERE "name" = '祥能保安公司';

