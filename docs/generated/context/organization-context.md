# 组织与内部员工 AI 局部上下文

> 本文件由 `scripts/build-ai-context.mjs` 生成。它用于缩小阅读范围，不替代源码、测试和真实业务规则。

## 本次目标模块

- ID：`organization`
- 职责：集团、中心、业务部门、岗位、职级、合同主体和内部员工任职关系。
- 文件数：21
- 源码行数：4523

## 直接依赖

- 无直接依赖

## 关键数据模型

- `LegalEntity`
- `OrganizationUnit`
- `Position`
- `JobGrade`
- `JobGradeApprovalPolicy`
- `InternalEmployee`
- `InternalEmployment`
- `InternalEmployeeChange`

## 推荐阅读顺序

- 1. `apps/api/src/services/position-authorizations.ts`
- 2. `apps/api/src/services/internal-employees.ts`
- 3. `apps/api/src/routes/internal-employees.ts`
- 4. `prisma/schema.prisma`
- 5. `apps/admin/src/pages/InternalEmployeesPage.tsx`
- 6. `apps/admin/src/pages/InternalEmployeesPage.test.tsx`
- 7. `apps/api/test/internal-employee-domain.test.ts`
- 8. `apps/api/test/internal-employee-routes.test.ts`
- 9. `apps/api/test/position-authorizations.test.ts`

## 模块验证命令

- `pnpm test:module:organization`

## 超大文件提醒

- `apps/admin/src/pages/InternalEmployeesPage.tsx`：875 行，建议阈值 500 行
- `apps/api/src/routes/internal-employees.ts`：713 行，建议阈值 500 行

## 未纳入文本上下文的二进制文件

- `prisma/migrations/20260718150000_init/migration.sql`
- `prisma/migrations/20260722075359_ai_business_assistant/migration.sql`
- `prisma/migrations/20260722083629_portal_unification/migration.sql`
- `prisma/migrations/20260722083919_portal_notification_reads/migration.sql`
- `prisma/migrations/20260726230500_internal_hr_rbac/migration.sql`
- `prisma/migrations/20260726234000_reimbursement_domain/migration.sql`
- `prisma/migrations/20260727090000_position_role_bindings/migration.sql`
- `prisma/migrations/20260727091000_reimbursement_invoice_cover/migration.sql`
- `prisma/migrations/20260727100000_job_grade_reimbursement_policies/migration.sql`
- `prisma/migrations/20260727101000_internal_employee_account_binding/migration.sql`
- `prisma/migrations/20260727130000_internal_departments_not_branches/migration.sql`
- `prisma/migrations/migration_lock.toml`

## 本次默认不应修改

除非需求明确跨模块，否则不要修改以下模块：

- `ai` AI 业务助手
- `auth` 账号、会话与权限
- `import-export` 导入导出与数据安全
- `notification` 通知与待办
- `payroll` 工资与工资条
- `platform` 平台与工程基础
- `portal` 员工、供应商与公开端体验
- `project` 项目与经营区域
- `recruitment` 招聘需求与进度
- `reimbursement` 员工报销
- `reporting` 统计与经营看板
- `supplier` 供应商与政策
- `workforce` 求职者与派遣外包人员

## 规则与模块文档

## 文档：`AI_PROJECT_MAP.md`

# 祥能 HRMS AI 项目地图

> 这是 AI、Codex 和开发人员修改本仓库前的第一阅读入口。它只描述当前真实架构和业务边界，不替代具体模块文档、业务规则、源码与测试。

## 1. 系统定位

本项目是一个 **pnpm 模块化单体**：一套仓库、一套 Fastify API、一套 Prisma/PostgreSQL 业务数据库，同时服务 PC 管理后台、Portal 手机网页、小程序和公开展示站。当前不拆微服务，优先通过清晰模块边界、局部上下文和模块级验证控制维护成本。

## 2. 修改任务的标准读取顺序

1. 阅读本文件。
2. 在 `config/project-modules.json` 确认目标模块和直接依赖。
3. 阅读 `docs/modules/<module-id>/MODULE.md`。
4. 阅读该模块列出的 `docs/business-rules/*.md`。
5. 运行 `pnpm project:context -- <module-id>` 生成局部上下文。
6. 只阅读上下文列出的目标模块、直接依赖和测试文件。
7. 修改前写明允许修改、禁止修改、验收标准和回滚点。
8. 先跑模块测试，再跑关联模块测试，发布前再跑全量检查。

不要在没有需求证据时扫描、重构或搬迁整个仓库。代码不是仓鼠笼，不需要每次清理都把所有木屑倒出来。

## 3. 业务边界

### 3.1 内部组织

内部花名册固定采用：

```text
集团 → 中心 → 业务部门
```

- “宜宾分公司、绵阳分公司、双流分公司、郫都分公司、保安公司”等在内部花名册中属于业务部门。
- 合同主体是独立法律公司，保存在员工及任职记录上；同一业务部门可以存在多个合同主体。
- `Branch` 只用于项目经营区域、招聘需求、派遣外包和项目型业务，不是内部花名册组织层级。

### 3.2 权限

- 岗位决定默认职责角色。
- 职级只控制审批额度或审批层级，不直接授予财务、出纳或集团权限。
- 中心、业务部门、项目、供应商和本人关系决定数据范围。
- 权限和数据范围必须按同一授权包判断，禁止把角色 A 的权限与角色 B 的范围自由拼接。
- `POSITION`、`MANUAL`、`TEMPORARY` 授权来源分开管理。

### 3.3 报销

- 报销申请人必须来自内部员工档案。
- 员工报销只归属当前业务部门，不归属项目经营 `Branch`。
- 原始付款截图、发票、补充材料和整单最终付款凭证是不同附件语义。
- 部门制单、负责人审核、财务审核和出纳付款使用各自授权包。

## 4. 模块目录

| 模块 ID | 模块 | 主要职责 |
|---|---|---|
| `platform` | 平台与工程基础 | 工作区、部署、演示、构建和工程脚本 |
| `auth` | 账号、会话与权限 | 登录、多角色、权限、数据范围、账号管理 |
| `organization` | 组织与内部员工 | 中心、业务部门、岗位、职级、合同主体、任职 |
| `workforce` | 求职者与派遣外包人员 | 人员主档、附件和生命周期 |
| `recruitment` | 招聘需求与进度 | 岗位需求、报名、面试、推荐和奖励 |
| `project` | 项目与经营区域 | 项目、经营 Branch、项目图片和负责人 |
| `supplier` | 供应商与政策 | 供应商、项目合作和政策 |
| `reimbursement` | 员工报销 | 申请、制单、审批、财务、付款和材料 |
| `payroll` | 工资与工资条 | 工资批次、工资条和员工查询 |
| `reporting` | 统计与经营看板 | 只读汇总、领导驾驶舱和跨模块指标 |
| `notification` | 通知与待办 | 站内通知、读取状态和业务提醒 |
| `import-export` | 导入导出与数据安全 | Excel、模板、预览、导入和数据安全 |
| `ai` | AI 业务助手 | 意图、受控工具、确认、模型和审计 |
| `portal` | 多端体验 | Portal、公开站、供应商和个人端体验 |

详细路径、依赖和模型以 `config/project-modules.json` 及 `docs/generated/module-index.md` 为准。

## 5. 自动索引和局部上下文

```bash
# 重新生成架构索引
pnpm project:index

# 验证提交的索引是否与源码一致
pnpm project:index:check

# 生成单模块 AI 上下文
pnpm project:context -- reimbursement
pnpm project:context -- organization

# 校验模块注册、依赖、文档和索引
pnpm project:check

# 运行维护基础设施的完整验证
pnpm project:verify
```

自动生成内容位于 `docs/generated/`，不要手工编辑。

## 6. 事实来源优先级

出现冲突时按以下顺序判断：

1. 用户最新确认的真实业务要求；
2. 数据库迁移、Prisma 模型和已通过测试表达的行为；
3. `docs/business-rules/`；
4. 模块文档和本项目地图；
5. 自动生成索引；
6. 旧说明、截图和演示文案。

发现冲突必须先修正文档或测试，不能默默选一个自己喜欢的版本。

## 7. 大文件治理

`docs/generated/large-files-report.md` 记录渐进拆分候选。本阶段不强制搬迁源文件；新需求触及超大文件时，优先围绕本次业务职责提取小型纯函数、服务或组件，并保持原接口兼容。禁止为了“看起来模块化”一次性移动几十个文件。

## 8. 任务交付最低要求

- 说明目标模块和直接依赖。
- 列出实际修改文件。
- 给出业务规则对应关系。
- 运行模块级测试或说明环境阻断。
- 更新模块文档、注册表或自动索引。
- 不声称未执行的测试已经通过。

## 文档：`docs/modules/organization/MODULE.md`

# 组织与内部员工模块

## 定位

集团、中心、业务部门、岗位、职级、合同主体和内部员工任职关系。

## 本模块负责

- 集团、中心和业务部门
- 合同主体、岗位和职级
- 内部员工与任职历史

## 本模块不负责

- 项目经营区域 Branch
- 派遣外包人员主档
- 工资和报销状态流转

## 直接依赖

无直接依赖

## 主要入口

- `apps/api/src/routes/internal-employees.ts`
- `apps/api/src/services/internal-employees.ts`
- `apps/api/src/services/position-authorizations.ts`
- `apps/admin/src/pages/InternalEmployeesPage.tsx`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`LegalEntity`、`OrganizationUnit`、`Position`、`JobGrade`、`JobGradeApprovalPolicy`、`InternalEmployee`、`InternalEmployment`、`InternalEmployeeChange`

## 业务规则文档

- `docs/business-rules/organization.md`

## 固定边界

- 内部结构固定为集团到中心到业务部门
- 合同主体独立于组织
- 调岗保留历史并刷新岗位授权

## 验证命令

- `pnpm test:module:organization`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- organization`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。

## 文档：`docs/business-rules/organization.md`

# 组织与内部员工业务规则

## 1. 组织结构

内部员工管理使用固定层级：

```text
集团 → 中心 → 业务部门
```

花名册中的宜宾分公司、绵阳分公司、双流分公司、郫都分公司和保安公司等按业务部门处理，不增加内部“分公司”层级。

## 2. 合同主体

合同主体是员工签订劳动合同的法律公司，独立于管理组织。同一业务部门允许出现多个合同主体；一个合同主体也可以覆盖多个业务部门。组织单元不能绑定唯一合同主体。

## 3. 项目经营区域

`Branch` 保留给项目、招聘需求、派遣外包、经营区域负责人和项目型费用。内部员工主档、任职历史、岗位授权和员工报销不得使用 `Branch` 表示部门。

## 4. 任职与变动

员工当前组织、岗位、职级和合同主体来自有效任职。调岗或调部门必须结束旧任职、创建新任职、记录变动并刷新岗位授权，不能覆盖历史记录。

离职或停用必须结束有效任职、撤销岗位来源授权并使旧会话失效。错误建档只有在不存在账号、任职、业务单据和审计关联时才允许物理删除。

## 5. 岗位与职级

- 岗位绑定默认职责角色和数据范围类型。
- 岗位变化只重算 `POSITION` 来源授权。
- 职级用于审批额度和审批层级，不直接授予业务权限。
- 集团级角色和集团范围只能由具备授权资格的管理员配置。

## 6. 账号绑定

一个系统账号最多绑定一名内部员工，一名内部员工最多绑定一个系统账号。绑定、换绑和解绑必须记录变更、重算岗位授权并刷新相关账号令牌。
