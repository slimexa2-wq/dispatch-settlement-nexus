# 祥能 HRMS 数据模型

## 1. 数据建模原则

- 人员、内部员工、项目、供应商、组织节点均有唯一主档。
- 业务变化通过历史记录表达，避免把生命周期压缩成一个当前值。
- 所有外键列建立索引；常用等值条件在前、时间范围在后的查询建立复合索引。
- 待办、有效授权、未解决问题等高频小集合使用 PostgreSQL 部分索引。
- 金额以整数分存储，避免浮点误差。
- 高并发工作流使用 `version` 乐观锁和明确状态前置条件。

## 2. 组织与权限模型

| 模型 | 关键字段 | 说明 |
|---|---|---|
| `LegalEntity` | `id, code, name, status` | 法人主体 |
| `OrganizationUnit` | `id, type, parentId, branchId, name, path, status` | 集团、分公司、中心、部门统一组织树 |
| `Position` | `id, code, name, category, status` | 岗位字典 |
| `JobGrade` | `id, code, name, rank` | 职级字典 |
| `InternalEmployee` | `id, employeeNo, name, phone, idCard, status, userId, version` | 内部人员主档 |
| `InternalEmployment` | `employeeId, orgUnitId, positionId, gradeId, managerId, startDate, endDate, isPrimary` | 任职历史 |
| `InternalEmployeeChange` | `employeeId, type, before, after, effectiveDate, operatorId` | 入职、调动、停用、离职和归档记录 |
| `Role` | `id, code, name, isHighPrivilege` | 角色 |
| `Permission` | `id, code, resource, action` | 菜单、页面、接口、字段和业务动作权限 |
| `RolePermission` | `roleId, permissionId` | 角色权限 |
| `UserRoleAssignment` | `userId, roleId, validFrom, validTo, status` | 可叠加角色 |
| `DataScopeBinding` | `assignmentId, scopeType, targetId` | 本人、部门、中心、分公司、项目、供应商、集团范围 |

## 3. 现有主业务模型

保留并增强现有：

- `Branch`
- `Project`
- `Supplier`
- `SupplierProject`
- `JobDemand`
- `Person`
- `PersonStatusLog`
- `Application`
- `ReferralRecord`
- `ReferralReward`
- `SalaryImportBatch`
- `SalarySlip`
- `Policy`
- `Notification`
- `ImportJob`
- `AuditLog`

新增约束：

- `Person.idCard`、`Person.employeeNo` 在非空时唯一。
- 人员当前项目、供应商和状态变化必须通过正式服务写入状态日志。
- 项目、岗位需求和人员列表按范围字段、状态和更新时间建立复合索引。
- 导出使用游标或异步任务，不在单请求加载上万行对象。

## 4. 报销模型

| 模型 | 关键字段 | 说明 |
|---|---|---|
| `ReimbursementBatch` | `id, code, claimantId, orgUnitId, status, version, submittedAt, totalPaymentCents, totalInvoiceCents` | 报销批次与七态主状态 |
| `ReimbursementLine` | `id, batchId, sequence, purpose, expenseType, projectId, paymentCents, invoiceCents` | 一次录入的费用明细 |
| `ReimbursementAttachment` | `id, lineId, kind, fileObjectId, hash, ocrStatus, ocrResult, confirmedAt` | 付款凭证或发票 |
| `ReimbursementIssue` | `id, batchId, lineId, type, note, status, resolverId, resolvedAt` | 与主状态分离的问题 |
| `ReimbursementApproval` | `id, batchId, stage, decision, operatorId, beforeStatus, afterStatus, note, createdAt` | 负责人、财务审核历史 |
| `ReimbursementPayment` | `id, batchId, paidAt, amountCents, voucherFileId, cashierId` | 出纳打款 |
| `ReimbursementArtifact` | `id, batchId, type, fileObjectId, sourceVersion, generatedAt` | XLSX、付款包、发票包和封面 |

固定校验：

- 每条明细 `invoiceCents > paymentCents > 0`。
- 批次金额由明细聚合，不接受前端提交的合计覆盖。
- `(batchId, sequence)` 唯一。
- `(batchId, status, version)` 用于并发更新前置条件。
- 未解决问题存在时禁止进入“审核通过”。

## 5. 文件、导出与审计

| 模型 | 关键字段 | 说明 |
|---|---|---|
| `FileObject` | `id, provider, bucket, objectKey, originalName, mimeType, size, sha256, ownerUserId` | 本地磁盘与 COS 统一抽象 |
| `ExportJob` | `id, type, filters, status, fileObjectId, requestedBy, expiresAt` | 大数据量异步导出 |
| `IdempotencyRecord` | `key, userId, operation, requestHash, response, expiresAt` | 防止重复提交 |
| `AuditLog` | 现有字段加 `requestId, scope, result, errorCode` | 操作、授权、下载和 AI 审计 |

## 6. 索引基线

- 所有外键：单列索引。
- `InternalEmployment(employeeId, startDate desc)`。
- `InternalEmployment(orgUnitId, endDate, employeeId)`。
- `UserRoleAssignment(userId, status, validTo)`。
- `DataScopeBinding(assignmentId, scopeType, targetId)` 唯一。
- `ReimbursementBatch(orgUnitId, status, updatedAt desc)`。
- `ReimbursementBatch(claimantId, createdAt desc)`。
- `ReimbursementIssue(batchId, status)`，并对未解决状态建立部分索引。
- `AuditLog(actorUserId, createdAt desc)` 和 `AuditLog(entity, entityId, createdAt desc)`。

