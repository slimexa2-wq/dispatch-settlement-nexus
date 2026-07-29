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
