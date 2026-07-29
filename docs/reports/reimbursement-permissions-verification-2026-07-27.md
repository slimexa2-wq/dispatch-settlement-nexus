# 小程序报销与岗位职级权限优化验证报告

**验证日期：** 2026-07-27
**工作分支：** `feat/reimbursement-permissions`
**验证范围：** API、后台管理端、微信小程序、Prisma Schema、数据库迁移、权限与报销领域规则。

## 1. 验证结论

本次修改已完成可在当前沙箱执行的结构检查、TypeScript 语法解析、路由与文件完整性检查及纯领域规则验证。

项目原生 `pnpm typecheck`、`pnpm test` 和 `pnpm build` 未实际进入项目脚本执行阶段。原因不是代码报错，而是当前沙箱没有安装项目依赖，Corepack 需要从 npm 下载 `pnpm@11.7.0`，但环境 DNS 无法访问 `registry.npmjs.org`。

因此，本报告不能宣称完整类型检查、Vitest 和正式构建通过。上线或合并前仍必须在具备网络和依赖缓存的正常开发环境执行完整验证。

## 2. 已执行验证

### 2.1 变更文件静态检查

执行：

```bash
NODE_PATH=$(npm root -g) node /tmp/hrms-branch-static-check.cjs
```

结果：

- 检查本功能分支及当前收口修改涉及的 TypeScript/TSX/MTS/CTS 文件：52 个；
- TypeScript 语法错误：0；
- 对象字面量重复键：0；
- 源码本地相对导入缺失：0；
- `scripts/import-demo-data.mts` 仍保留基线已有的 `apps/api/node_modules/bcryptjs` 依赖路径；该路径需在安装工作区依赖后验证，不计为本次新增缺失文件；
- 小程序页面路由：24 个，缺失页面：0；
- Prisma Schema 关键模型及枚举标记均存在；
- 本次要求的数据库迁移目录均存在。

### 2.2 全仓 TypeScript 解析

使用系统全局 TypeScript 编译器 API 对 `apps`、`packages`、`prisma` 和 `scripts` 下的 TS、TSX、MTS、CTS 文件执行语法解析。

结果：

- 解析文件：255 个；
- 解析错误：0。

此检查能发现语法、括号、JSX 结构等问题，但不能替代带依赖的完整类型检查。

### 2.3 领域规则验证

执行：

```bash
node /tmp/hrms-domain-check.cjs
```

结果：23 项可独立执行的纯领域断言通过，覆盖：

1. 人民币元到分的精确换算；
2. 非法小数位拒绝；
3. 员工报销提交动作；
4. 多角色账号管理端口判断；
5. 多角色账号保留内部员工身份；
6. 供应商菜单隔离；
7. 发票金额等于付款金额允许；
8. 发票金额低于付款金额拒绝；
9. 员工报销组织归属自动带出；
10. 员工伪造组织归属拒绝；
11. 审核阶段补充材料受限；
12. 职级审批金额上限；
13. 非系统管理员不能授予集团范围；
14. 非系统管理员不能授予系统管理员角色；
15. 系统管理员可以配置集团级岗位授权；
16. 岗位角色绑定同步；
17. 清空岗位权限撤销授权并刷新令牌；
18. 账号换绑撤销旧账号并授权新账号；
19. 一个账号不能绑定两名内部员工；
20. 多个组织数据范围均被保留；
21. 合法整单最终付款凭证可用于付款登记；
22. 未提供最终付款凭证时拒绝登记；
23. 明细级原始付款截图不能充当最终付款凭证。

另外新增 2 个 Vitest 路由用例，分别验证岗位权限配置和员工账号绑定不会借用其他角色的数据范围。由于当前环境缺少依赖，这两个 Vitest 用例已完成语法检查，但未实际运行，不能表述为测试通过。

### 2.4 工作区文本质量检查

对所有变更和新增文本文件检查：

- 行尾多余空格：0；
- Git 冲突标记：0。

### 2.5 原生项目命令尝试

执行：

```bash
corepack pnpm --version
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

四个命令均在 Corepack 下载 pnpm 阶段失败，核心错误：

```text
getaddrinfo EAI_AGAIN registry.npmjs.org
```

项目脚本没有实际开始运行。

### 2.6 系统全局 tsc 尝试

执行：

```bash
tsc -p apps/api/tsconfig.json --noEmit
tsc -p apps/admin/tsconfig.json --noEmit
tsc -p apps/miniapp/tsconfig.json --noEmit
tsc -p packages/shared/tsconfig.json --noEmit
```

结果均被缺失依赖阻塞：

- API：缺少 `node`、`vitest/globals` 类型；
- 后台：缺少 `@testing-library/jest-dom`、`vite/client`、`vitest/globals`；
- 小程序：缺少 `@tarojs/taro`、`node`、`vitest/globals`；
- Shared：缺少 `zod`。

这些错误与当前源码包未包含 `node_modules`、沙箱无法下载依赖一致。

## 3. 需求覆盖核对

| 需求 | 状态 | 验证依据 |
|---|---|---|
| 小程序增加报销入口 | 已实现 | `app.config.ts` 路由及首页动态菜单存在 |
| 内部组织按花名册部门化 | 已实现 | 集团 → 中心 → 业务部门；合同主体独立；内部组织、员工及任职记录移除旧分公司字段 |
| 花名册中的“宜宾/绵阳/双流分公司”等按业务部门处理 | 已实现 | 组织单元类型统一为 `DEPARTMENT`；项目经营区域仍保留 `Branch` |
| 员工发起报销 | 已实现 | 创建页、API、组织归属自动带出规则 |
| 多条明细与金额校验 | 已实现 | 小程序表单及 `validateReimbursementLine` |
| 付款凭证与发票分开上传 | 已实现 | 附件类型和明细关联校验 |
| 审批问题与补充材料 | 已实现 | 问题接口及受限 `SUPPORTING` 上传 |
| 部门制单、负责人、财务、出纳移动办理 | 已实现 | 权限动作映射、详情页节点动作和付款登记 |
| 岗位绑定角色和数据范围 | 已实现 | `PositionRoleBinding`、配置接口和后台入口；内部岗位仅支持本人、部门、中心、集团 |
| 调岗仅替换岗位授权 | 已实现 | `POSITION` 来源授权及同步服务 |
| 职级绑定报销审批上限 | 已实现 | `JobGradeApprovalPolicy` 及负责人审核校验 |
| 内部员工绑定系统账号 | 已实现 | 新增、绑定、换绑、解绑及审计记录 |
| 多角色权限范围不交叉拼接 | 已实现 | permission-specific authorization grant |
| 岗位权限配置范围不借用其他角色 | 已实现 | `user:manage` 授权包范围及新增路由用例 |
| 员工账号绑定范围不借用其他角色 | 已实现 | `internal-employee:write` 授权包范围及新增路由用例 |
| 防止岗位配置越权 | 已实现 | 前端过滤及服务端硬校验 |
| 发票金额允许等于付款金额 | 已实现 | API、数据库、后台、演示、文档和测试口径统一 |
| 付款必须绑定整单最终付款凭证 | 已实现 | API 校验、后台与小程序入口、演示模式及纯领域断言 |

## 4. 上线前必须执行

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

随后在备份后的测试数据库执行：

```bash
pnpm db:migrate
```

并至少人工验收以下账号组合：

1. 仅普通内部员工；
2. 普通员工 + 部门制单人；
3. 普通员工 + 部门负责人；
4. 普通员工 + 财务审核；
5. 出纳；
6. 业务部门或中心范围人资；
7. 系统管理员；
8. 员工调岗、换绑账号、离职后的旧会话。

## 5. 已知限制

- 报销流程仍是七态正向流转，没有新增正式退回、拒绝、撤回、代理审批；
- 付款凭证包和发票包仍使用现有压缩包逻辑，不是真正分页排版的 PDF；
- `CENTER` 岗位授权已支持员工直接归属中心，或从员工当前业务部门解析其直接上级中心；更深层级的递归中心祖先解析仍未扩展；
- 本次没有接入 OCR、预算、重复发票识别和微信订阅消息；
- 当前环境未完成依赖级类型检查、Vitest 和生产构建，不能跳过上线前完整验证。
