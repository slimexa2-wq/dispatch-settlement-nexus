# 内部组织“分公司部门化”修正验证报告

**验证日期：** 2026-07-27  
**依据文件：** `202606  集团花名册.xlsx`  
**工作分支：** `feat/reimbursement-permissions`

## 1. 花名册结论

花名册的组织字段应按以下含义使用：

```text
集团
└─ 所属中心
   └─ 所属部门
```

其中“宜宾分公司、绵阳分公司、双流分公司、郫都分公司、保安公司”等名称虽然包含“分公司/公司”，但在花名册中位于“所属部门”列，因此属于内部管理部门，不是独立的内部组织层级。

“合同主体”是员工劳动合同对应的法律公司，必须独立于所属部门保存。花名册中同一部门出现多个合同主体，例如：

- 宜宾分公司：至少出现 4 个合同主体；
- 郫都分公司：至少出现 4 个合同主体；
- 绵阳分公司：至少出现 2 个合同主体；
- 双流分公司：至少出现 2 个合同主体；
- 保安公司：至少出现 2 个合同主体。

因此，不能建立“一个业务部门只能绑定一个合同主体”的关系。

## 2. 修正后的模型边界

### 内部人力资源线

- `OrganizationUnit`：仅用于集团、中心、业务部门；
- `InternalEmployee.organizationUnitId`：员工当前管理归属；
- `InternalEmployee.legalEntityId`：员工当前合同主体；
- `InternalEmployment`：分别记录历史部门、岗位、职级和合同主体；
- 岗位自动权限范围：本人、业务部门、中心、集团；
- 员工报销：默认归属业务部门，不再归属内部“分公司”。

### 项目经营线

`Branch` 继续保留，用于项目、招聘需求、派遣/外包人员、项目费用等经营区域或项目归属。此次修正没有删除项目线的 `Branch`。

## 3. 数据库迁移

新增迁移：

```text
prisma/migrations/20260727130000_internal_departments_not_branches/migration.sql
```

迁移内容：

1. 旧内部 `OrganizationUnit.type = BRANCH` 转为 `DEPARTMENT`；
2. 删除组织单元上的 `legal_entity_id`、`branch_id`；
3. 删除内部员工和任职历史上的 `branch_id`；
4. 旧岗位 `BRANCH` 数据范围转换为员工当前部门的 `ORG_UNIT`；
5. 无法确认员工部门的旧岗位范围直接失效，不扩大授权；
6. 内部员工关联账号清除旧 `users.branch_id` 快捷字段并刷新令牌；
7. 仅清理员工型报销批次的 `branch_id`，项目型费用仍可保留经营分公司。

## 4. 验证结果

### 4.1 内部组织结构断言

```text
internal_org_model_checks=passed
```

覆盖：

- 内部员工新增、调动、查询不再接收或写入 `branchId`；
- 岗位权限配置不再允许 `BRANCH` 范围；
- 业务部门权限绑定 `ORG_UNIT`，中心权限绑定所属中心；
- 员工自助报销只带出部门；
- PC、小程序和演示模式不再展示内部报销“所属分公司”；
- Prisma 内部员工、任职历史和组织单元模型不再保留旧分公司字段；
- 项目模块的 `Branch` 仍然存在。

### 4.2 TypeScript 语法解析

```text
typescript_syntax_files=255 failed=0
```

此检查覆盖 `apps`、`packages`、`scripts` 下全部 TS、TSX、MTS、CTS 文件，只证明语法结构有效，不能代替安装依赖后的完整类型检查。

### 4.3 报销领域规则

```text
reimbursement_domain_assertions=23 passed
```

### 4.4 SQL 结构检查

```text
sql_structural_statements=23 parentheses_balanced=true lexical_state=closed required_fragments=5
```

该检查确认迁移脚本括号、字符串和语句终止结构完整，并包含关键字段删除、类型转换和索引创建语句。它不是连接 PostgreSQL 后的真实迁移执行结果。

### 4.5 Git 文本检查

```text
git diff --check
```

结果无行尾空格或冲突标记错误。

### 4.6 原生项目测试

执行 `corepack pnpm test` 时，Corepack 在下载 `pnpm@11.7.0` 阶段失败：

```text
getaddrinfo EAI_AGAIN registry.npmjs.org
```

因此 Vitest 没有真正启动。本报告不宣称完整测试、类型检查或生产构建通过。

## 5. 上线前必须验证

在可访问 npm、具备 PostgreSQL 测试库的环境执行：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

备份数据库后，在测试库先执行：

```bash
pnpm db:migrate
```

重点核对：

1. 宜宾、绵阳、双流等业务部门原有员工数量；
2. 员工合同主体是否保持原值；
3. 原岗位分公司范围是否正确转换为部门范围；
4. 项目、招聘需求和外派人员的经营 `Branch` 是否保持不变；
5. 调岗、离职、账号换绑后旧会话是否失效。
