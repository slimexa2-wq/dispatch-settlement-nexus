# 数据迁移、审批流、权限开通与账户中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有祥能 HRMS 中补齐可用于正式数据迁移的批量上传中心、管理员可快速配置的审批流、权限申请与开通中心、各端口统一账户管理，并完成测试、文档和 GitHub 完整源码交付。

**Architecture:** 保留 Fastify + Prisma + PostgreSQL + React + Taro 架构。新增四个独立领域服务和对应持久化模型；审批流采用顺序节点卡片与条件配置，不引入复杂 BPMN；旧 `User.role` 继续兼容，新增多端口与多角色授权能力。

**Tech Stack:** Node.js 22、TypeScript、Fastify 5、Prisma 6、PostgreSQL、React 18、Ant Design 6、XLSX、Vitest/Node test。

## Global Constraints

- 不删除现有数据导入、账号、权限和报销能力。
- 管理员可通过增加节点、选择审批人、设置条件、排序、预览和发布完成审批流搭建。
- 数据迁移必须先预览校验，再提交；保留原始行号、错误下载、批次审计和可控撤销。
- 权限开通必须包含端口、角色、数据范围、生效期和审批记录。
- 一个人只有一个主账号，可开通多个端口和多个角色。
- 完整依赖不可用时，必须运行 Node 内置测试、架构检查和静态契约检查，不得虚报完整构建通过。
- GitHub 必须上传正常可浏览源码树，不使用 Base64 分片或补丁替代完整源码。

---

### Task 1: 四个领域内核与测试
- [x] 先写数据迁移、审批流、权限开通、账户中心失败测试。
- [x] 运行并确认因模块不存在而失败。
- [x] 实现纯领域函数并运行测试通过。

### Task 2: Prisma 模型与数据库迁移
- [x] 增加迁移模板/批次/行结果、审批模板/版本/实例/任务、权限申请/开通任务、端口访问/账户生命周期模型。
- [x] 添加索引、唯一约束和迁移 SQL。
- [x] 使用静态结构检查验证关系完整性。

### Task 3: API 路由与审计
- [x] 增加 `/migration-center`、`/workflow-templates`、`/access-requests`、`/account-center` 路由。
- [x] 接入权限、分页、事务、审计和错误处理。
- [x] 注册到应用并补 API 契约测试。

### Task 4: 管理后台页面
- [x] 新增数据迁移中心页面。
- [x] 新增简单审批流搭建页面。
- [x] 新增权限开通页面。
- [x] 新增各端口账户管理页面。
- [x] 增加路由、导航、领域类型和 API 调用。

### Task 5: 文档、验证与 GitHub
- [x] 更新权限矩阵、迁移手册、审批流手册、账户管理手册。
- [x] 运行可执行测试、项目架构检查、源码敏感数据扫描和 git diff 检查。
- [x] 打包完整源码。
- [ ] 上传 GitHub 功能分支并创建 PR，旧补丁 PR 标注被替代。
