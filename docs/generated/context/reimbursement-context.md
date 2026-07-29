# 员工报销 AI 局部上下文

> 本文件由 `scripts/build-ai-context.mjs` 生成。它用于缩小阅读范围，不替代源码、测试和真实业务规则。

## 本次目标模块

- ID：`reimbursement`
- 职责：员工报销申请、部门制单、审批、财务审核、付款和打印材料。
- 文件数：20
- 源码行数：5941

## 直接依赖

- `auth` 账号、会话与权限：登录会话、多角色授权、权限定义、数据范围和账号管理。
- `notification` 通知与待办：站内通知、读取状态和业务待办提醒。
- `organization` 组织与内部员工：集团、中心、业务部门、岗位、职级、合同主体和内部员工任职关系。

## 关键数据模型

- `ReimbursementBatch`
- `ReimbursementLine`
- `ReimbursementAttachment`
- `ReimbursementIssue`
- `ReimbursementApproval`
- `ReimbursementPayment`
- `ReimbursementArtifact`

## 推荐阅读顺序

- 1. `apps/api/src/services/reimbursement-artifacts.ts`
- 2. `apps/api/src/services/reimbursements.ts`
- 3. `apps/api/src/routes/reimbursements.ts`
- 4. `apps/miniapp/src/api/services.ts`
- 5. `apps/miniapp/src/domain/reimbursements.ts`
- 6. `prisma/schema.prisma`
- 7. `apps/admin/src/pages/ReimbursementsPage.tsx`
- 8. `apps/miniapp/src/pages/reimbursements/detail/index.config.ts`
- 9. `apps/miniapp/src/pages/reimbursements/detail/index.tsx`
- 10. `apps/miniapp/src/pages/reimbursements/form/index.config.ts`
- 11. `apps/miniapp/src/pages/reimbursements/form/index.tsx`
- 12. `apps/miniapp/src/pages/reimbursements/index/index.config.ts`
- 13. `apps/miniapp/src/pages/reimbursements/index/index.tsx`
- 14. `apps/admin/src/lib/demo-reimbursement.test.ts`
- 15. `apps/admin/src/pages/ReimbursementsPage.test.tsx`
- 16. `apps/api/test/reimbursement-artifacts.test.ts`
- 17. `apps/api/test/reimbursement-domain.test.ts`
- 18. `apps/api/test/reimbursement-routes.test.ts`
- 19. `apps/api/test/reimbursements.test.ts`
- 20. `apps/miniapp/src/domain/reimbursements.test.ts`

## 模块验证命令

- `pnpm test:module:reimbursement`

## 超大文件提醒

- `apps/api/src/routes/reimbursements.ts`：1025 行，建议阈值 500 行
- `apps/admin/src/pages/ReimbursementsPage.tsx`：914 行，建议阈值 500 行

## 未纳入文本上下文的二进制文件

- 无

## 本次默认不应修改

除非需求明确跨模块，否则不要修改以下模块：

- `ai` AI 业务助手
- `import-export` 导入导出与数据安全
- `payroll` 工资与工资条
- `platform` 平台与工程基础
- `portal` 员工、供应商与公开端体验
- `project` 项目与经营区域
- `recruitment` 招聘需求与进度
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

## 文档：`docs/modules/reimbursement/MODULE.md`

# 员工报销模块

## 定位

员工报销申请、部门制单、审批、财务审核、付款和打印材料。

## 本模块负责

- 员工报销申请与明细
- 部门制单和审批状态
- 财务、付款、问题和打印材料

## 本模块不负责

- 员工组织事实
- 权限计算底座
- 合同主体和项目经营区域

## 直接依赖

`auth`、`organization`、`notification`

## 主要入口

- `apps/api/src/routes/reimbursements.ts`
- `apps/api/src/services/reimbursements.ts`
- `apps/admin/src/pages/ReimbursementsPage.tsx`
- `apps/miniapp/src/pages/reimbursements/`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`ReimbursementBatch`、`ReimbursementLine`、`ReimbursementAttachment`、`ReimbursementIssue`、`ReimbursementApproval`、`ReimbursementPayment`、`ReimbursementArtifact`

## 业务规则文档

- `docs/business-rules/reimbursement.md`

## 固定边界

- 员工报销归属业务部门
- 付款截图、发票和最终付款凭证语义分离
- 推进状态必须校验版本、问题和授权包

## 验证命令

- `pnpm test:module:reimbursement`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- reimbursement`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。

## 文档：`docs/business-rules/reimbursement.md`

# 员工报销业务规则

## 1. 人员与组织归属

报销申请人必须关联内部员工档案。员工自助报销自动使用当前有效业务部门，不能自行选择合同主体、项目经营区域、供应商或其他部门绕过范围。

## 2. 明细与金额

一笔费用只录入一次。每条明细包含统一序号、用途、付款金额和发票金额；系统根据明细自动生成费用类型汇总、报销人汇总和明细汇总。金额以整数分保存，发票金额不得低于付款金额。

## 3. 状态流转

当前主流程为：

```text
待提交 → 部门制单中 → 负责人审核中 → 财务审核中 → 审核通过 → 待打款 → 已打款
```

状态推进必须校验当前状态、预期版本、操作权限和未解决问题。禁止跳级推进；并发版本不一致时要求刷新。

## 4. 附件语义

- 明细付款凭证：费用发生时的原始付款截图，关联具体明细。
- 发票：关联具体明细，单独整理。
- 补充材料：用于解释或补齐审核问题。
- 整单最终付款凭证：出纳实际打款后的凭证，不关联明细。

登记付款必须指定当前报销单的整单最终付款凭证，不能用原始付款截图顶替。

## 5. 制单与打印材料

付款凭证和发票分开生成打印材料，均按同一明细序号排列，不能混排。部门制单成果基于员工已提交数据自动生成，不要求部门重复录入。

## 6. 权限

- 申请人：本人申请、草稿和允许的补充材料。
- 部门制单人：授权业务部门内整理与提交。
- 部门负责人：授权范围内负责人审核，并受职级审批额度限制。
- 财务审核：授权范围内财务审核、问题处理和导出。
- 出纳：授权范围内上传最终付款凭证并登记付款。

每一步都按拥有对应报销权限的授权包范围判断，不能与其他角色范围交叉拼接。

## 7. 审计与并发

创建、修改、附件、问题、审核、状态流转、材料生成和付款必须记录操作人、时间和业务对象。状态流转使用版本号或等效乐观锁，防止重复审批和覆盖。

## 文档：`docs/modules/auth/MODULE.md`

# 账号、会话与权限模块

## 定位

登录会话、多角色授权、权限定义、数据范围和账号管理。

## 本模块负责

- 登录和会话
- 角色、权限和数据范围
- 账号绑定后的授权计算

## 本模块不负责

- 内部员工任职事实
- 项目和供应商主数据
- 具体业务审批规则

## 直接依赖

`organization`

## 主要入口

- `apps/api/src/authorization.ts`
- `apps/api/src/session-user.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/users.ts`
- `packages/shared/src/permissions.ts`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`Role`、`PermissionDefinition`、`RolePermission`、`UserRoleAssignment`、`DataScopeBinding`、`User`、`UserProject`

## 业务规则文档

- `docs/business-rules/authorization.md`

## 固定边界

- 权限与范围按同一授权包判断
- 客户端声明不能替代服务端授权

## 验证命令

- `pnpm test:module:authorization`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- auth`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。

## 文档：`docs/business-rules/authorization.md`

# 账号与权限业务规则

## 1. 授权包

一个有效授权包由以下内容组成：

- 用户角色分配；
- 角色拥有的功能权限；
- 该角色分配绑定的数据范围；
- 授权来源；
- 生效与失效时间；
- 状态和审计信息。

服务端判断业务操作时，必须先找到拥有目标权限的有效授权包，再使用该授权包自身的数据范围判断目标数据。禁止把一个角色的功能权限与另一个角色的数据范围组合。

## 2. 授权来源

- `POSITION`：由员工当前岗位自动生成；入职、调岗、账号绑定和岗位配置变化时可以重算。
- `MANUAL`：管理员明确授予的长期例外，不随岗位变化自动删除。
- `TEMPORARY`：兼岗、代理或临时授权，必须设置有效期和原因，到期自动失效。

岗位同步只能替换 `POSITION` 来源授权。

## 3. 数据范围

内部业务可使用本人、业务部门、中心和集团范围；项目业务可使用经营区域、指定项目或指定供应商范围。合同主体不是内部组织数据范围。

集团范围、高权限角色和敏感导出必须由服务端校验授予资格，不能依赖前端隐藏选项。

## 4. 会话刷新

员工调岗、离职、账号绑定、换绑、解绑、角色变化或范围变化后，必须提升账号令牌版本或采取等效机制，使旧会话失效。停用账号不能继续访问任何业务接口。

## 5. 敏感字段

工资、银行卡、身份证、合同和报销附件按独立权限判断。拥有列表读取权限不等于拥有敏感字段读取或导出权限。

## 6. AI 与权限

AI 工具使用真实登录会话和同一授权服务，不接受模型生成的范围、角色或 SQL。模型不能提升权限；写操作必须重新校验授权、目标状态和确认令牌。

## 文档：`docs/modules/notification/MODULE.md`

# 通知与待办模块

## 定位

站内通知、读取状态和业务待办提醒。

## 本模块负责

- 站内通知
- 通知读取状态
- 业务事件提醒

## 本模块不负责

- 业务流程最终状态
- 微信平台配置本身
- 业务对象权限

## 直接依赖

`auth`

## 主要入口

- `apps/api/src/routes/notifications.ts`

完整文件清单以 `docs/generated/module-index.md` 为准。

## 关键 Prisma 模型

`Notification`、`PortalNotificationRead`

## 业务规则文档

- 无独立业务规则文档，遵循依赖模块和总体架构

## 固定边界

- 通知失败不得伪报成功
- 通知不能替代业务状态和审计记录

## 验证命令

- `pnpm --filter @xiangneng/api exec vitest run test/notifications.test.ts`

## 安全修改方式

1. 先生成本模块局部上下文：`pnpm project:context -- notification`。
2. 默认只修改本模块文件和直接依赖中确有必要的接口。
3. 业务事实由依赖模块提供，不在本模块复制主数据逻辑。
4. 新增入口、模型、依赖或测试命令后同步更新 `config/project-modules.json`。
5. 完成后运行模块验证、`pnpm project:index` 和 `pnpm project:check`。

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
