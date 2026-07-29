# 内部组织按业务部门建模 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 根据集团花名册，把“宜宾分公司、绵阳分公司、保安公司”等内部管理单元统一作为运营中心下的业务部门，不再作为内部员工、报销和岗位权限的独立分公司层级。

**Architecture:** 保留 `Branch` 供项目、招聘、外派人员等经营业务使用；内部 HR 使用 `OrganizationUnit` 的 `CENTER -> DEPARTMENT` 层级，`LegalEntity` 仅表示合同法律主体。岗位自动授权只支持本人、部门、中心和集团范围，内部报销以申请人部门为归属。

**Tech Stack:** TypeScript、Fastify、Prisma、React、Taro、Vitest、PostgreSQL。

## Global Constraints

- 不删除项目模块现有 `Branch` 模型和项目归属关系。
- 内部员工新增、调动、账号权限同步不得再要求或写入 `branchId`。
- 合同主体与部门独立，组织选项必须返回全部有效合同主体。
- 名称包含“分公司”“公司”的内部组织单元按 `DEPARTMENT` 管理。
- 旧岗位 `BRANCH` 范围迁移为员工当前部门 `ORG_UNIT` 范围。
- 员工自助报销只写入 `organizationUnitId`；内部员工、任职历史和组织单元不再保留 `branchId`。

---

### Task 1: 写回归测试与结构验证
- [x] 更新岗位授权、员工调动、报销归属测试。
- [x] 新增独立结构验证脚本并确认当前代码失败。

### Task 2: 修正岗位自动授权
- [x] 岗位配置移除 `BRANCH` 范围。
- [x] `ORG_UNIT` 绑定当前部门，`CENTER` 自动解析所属中心。
- [x] 岗位授权不再修改用户 `branchId`。

### Task 3: 修正内部员工 API 与数据范围
- [x] 新增、调动、账号绑定不再接收或保存 `branchId`。
- [x] 内部员工查询和组织选项只按组织单元范围。
- [x] 合同主体改为独立全量有效选项。

### Task 4: 修正内部报销归属
- [x] 员工自助报销只带出部门。
- [x] PC 与小程序移除内部报销“分公司”筛选、选择和展示。

### Task 5: 数据迁移与文档
- [x] 将内部组织 `BRANCH` 类型迁为 `DEPARTMENT`。
- [x] 清理内部员工、任职和纯内部报销的 `branch_id`。
- [x] 将岗位来源的 `BRANCH` 授权迁为当前部门 `ORG_UNIT`。
- [x] 更新权限矩阵、说明和验证报告。

### Task 6: 验证与重新打包
- [x] 运行独立领域断言、语法检查、结构检查和 Git 检查。
- [x] 尝试原生测试/构建并如实记录环境结果。
- [x] 输出新的完整源码包和说明文件。
