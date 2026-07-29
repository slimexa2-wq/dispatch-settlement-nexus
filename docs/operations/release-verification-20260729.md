# 数据迁移、审批流、权限与账户中心交付验证记录

## 本次范围

- 数据迁移中心：服务端文件上传、模板、字段映射、全量预览校验、断点续传、错误明细和批次撤销；
- 审批流中心：管理员按顺序增删审批环节、设置审批对象和条件、预览、版本保存及发布；
- 权限开通中心：端口、角色、数据范围、有效期、审批、自动开通和精确回收；
- 账户中心：内部员工、派遣外包员工、求职者、供应商账户的批量开户、端口管理、启停、重置、强制下线、微信解绑和生命周期记录。

## 已执行验证

1. API 领域测试：`node --experimental-strip-types --test apps/api/test/*.node.test.ts`
   - 38 项通过，0 项失败。
2. 项目静态与契约测试：`node --test scripts/project-tools/*.test.mjs`
   - 48 项通过，0 项失败。
3. 变更 TypeScript/TSX 语法转译检查：
   - 30 个变更文件通过，0 个语法错误。
4. 项目索引与架构检查：
   - 14 个模块检查通过；
   - 19 个历史或现有大文件提示为警告，不阻止交付；
   - 生成索引哈希：`7b647ef7509043d4`。
5. Git 工作树检查：`git diff --check` 通过。
6. 敏感凭据扫描：未发现真实密钥、私钥或访问令牌进入源码；`.env.example` 仅保留占位配置。

## 当前环境未能执行的验证

当前执行环境没有项目依赖目录，Corepack 尝试下载项目指定的 `pnpm@11.7.0` 时因 DNS 无法访问 `registry.npmjs.org`，因此本环境未重新执行：

- Prisma Client 生成与 `prisma validate`；
- 全仓 `pnpm typecheck`；
- 全仓 `pnpm test`；
- 全仓 `pnpm build`。

上述限制已明确记录，不能据此宣称完整生产构建通过。接入正常网络并安装依赖后，应依次执行：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm test
pnpm build
```
