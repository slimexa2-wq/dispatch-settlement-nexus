# 数据迁移、审批流、权限开通与账户中心验证报告

## 验证范围

本次验证覆盖以下新增或完善能力：

- 数据迁移中心：模板下载、Excel/CSV 上传、字段映射、预览校验、断点续传、错误下载、批次提交和可控撤销；
- 审批流快速搭建：顺序审批节点、审批人类型、条件分流、退回设置、超时设置、预览、草稿、版本发布；
- 权限开通中心：端口、角色、数据范围、有效期、审批、开通和回收；
- 各端口账户中心：统一主账号、多端口开通、批量开户、启停、重置密码、强制下线、微信解绑和生命周期记录；
- 审批授权：明确指派人员优先；部门负责人只能处理本人组织范围内的审批；旧流程缺少组织上下文时保留兼容行为。

## 自动化验证结果

### Node 领域与静态契约测试

执行命令：

```bash
node --experimental-strip-types --test apps/api/test/*node.test.ts scripts/project-tools/*.test.mjs
```

结果：

- 测试总数：90
- 通过：90
- 失败：0
- 跳过：0

### TypeScript / TSX 语法解析

使用 TypeScript Compiler API 对源码进行语法解析，排除依赖、构建产物和声明文件。

结果：

- 解析文件数：282
- 语法错误：0

### 架构与生成索引检查

执行命令：

```bash
node scripts/generate-project-index.mjs
node scripts/check-architecture.mjs
node scripts/generate-project-index.mjs --check
```

结果：

- 14 个模块架构检查通过；
- 生成索引与当前源码一致；
- 存在 19 个历史大文件告警，均为建议拆分项，不属于本次功能阻断错误。

### Git 差异检查

执行命令：

```bash
git diff --check
```

结果：通过，未发现空白符错误。

### 敏感数据检查

- 未发现 GitHub Token、私钥或真实微信 AppSecret；
- 未包含 XLS/XLSX/CSV 真实业务数据文件；
- `scripts/real-data` 仅包含数据读取、标准化和测试代码，不包含真实人员数据；
- `.env.example` 仅保留空白配置项。

## 完整构建限制

当前执行环境没有预装 pnpm。通过 Corepack 获取项目指定的 pnpm 11.7.0 时，因执行环境无法解析 `registry.npmjs.org`，返回 `getaddrinfo EAI_AGAIN`，因此本环境无法完成以下依赖型验证：

- `pnpm install --frozen-lockfile`；
- Prisma Client 重新生成；
- 全量 TypeScript 类型检查；
- 管理后台、API 和小程序生产构建；
- Playwright 端到端测试。

这属于当前执行环境的外网依赖限制，不等同于上述构建已经通过。源码上传 GitHub 后，应在可访问 npm Registry 的 GitHub Actions 或本地 Codex 环境中继续执行全量依赖安装和构建验证。

## 当前结论

本次四个能力中心的领域规则、路由契约、页面操作入口、数据库结构和审批授权规则已通过现有可执行验证。完整生产构建仍需在依赖可安装的环境中复核，未将其虚报为通过。
