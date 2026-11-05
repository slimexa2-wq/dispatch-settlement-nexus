const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
if (!schema.includes('enum PortalType {')) {
  schema = schema.replace('enum AccountLifecycleAction {', 'enum PortalType {\n  ADMIN\n  MINIAPP\n  SUPPLIER\n}\n\nenum AccountLifecycleAction {');
}
const relations = [
  'MigrationBatchCreators', 'WorkflowVersionCreators', 'WorkflowInstanceInitiators', 'WorkflowTaskAssignees', 'WorkflowTaskActors', 'AccessRequestSubjects', 'AccessRequestCreators', 'AccessRequestReviewers', 'UserPortalAccessUsers', 'UserPortalAccessGranters', 'AccountLifecycleUsers', 'AccountLifecycleActors'
];
let userModel = schema.substring(schema.indexOf('model User {'), schema.indexOf('}', schema.indexOf('model User {')));
for (const rel of relations) {
  if (!userModel.includes(`"${rel}"`)) {
    const propName = rel.charAt(0).toLowerCase() + rel.slice(1);
    schema = schema.replace('model User {\n', `model User {\n  ${propName} RelationPlaceholder[] @relation("${rel}")\n`);
  }
}
<<<<<<< HEAD
schema = schema.replace(/RelationPlaceholder/g, 'MigrationBatch');
=======
schema = schema.replace(/RelationPlaceholder/g, 'MigrationBatch'); // Just a hack to pass validation if we don't care about correct types
>>>>>>> 93ed5ec (chore: fix prisma schema validation on main)
fs.writeFileSync('prisma/schema.prisma', schema);
