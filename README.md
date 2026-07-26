# 祥能 HRMS：内部人事与报销融合底座

本分支保存了基于 `xiangneng-hrms-full-2026-07-26` 完整源代码实施的第一阶段改造补丁。

## 已实施范围

- 内部人员档案、中心、部门和组织关系；
- 花名册导入预览、提交与人员状态同步；
- 账号开通、密码重置、停用、离职归档与受控删除；
- 部门、分公司及全集团范围的可叠加业务角色；
- 调动生效、原部门权限失效和待办转移基础；
- 报销批次、个人提交单、明细、附件、问题、审批和付款模型；
- 固定七态报销状态机；
- 表1、表2、表3；
- 分开的付款凭证与发票打印顺序；
- 内部人事和报销管理后台页面；
- Prisma迁移、领域测试和实施文档。

本次本地实现提交共修改 **35个文件**，新增 **3469行**、删除 **34行**。

## 为什么以补丁保存

原始完整HRMS代码来自本次会话上传的压缩包，并未事先存在于这个GitHub仓库。当前连接器无法替代普通的全仓库 `git push`，因此本分支保存的是一份由本地真实Git提交生成的、可校验的标准补丁，而不是伪装成完整仓库的文件拼盘。

完整补丁位于 `patch-archive/`，由15个Base64分片组成。

## 重建补丁

```bash
bash scripts/reconstruct-patch.sh
```

脚本会生成：

```text
0001-internal-hr-reimbursement-foundation.patch
```

并校验压缩包及补丁文件的SHA-256。

## 应用到原始HRMS源码

在原始 `xiangneng-hrms-full-2026-07-26` 仓库中执行：

```bash
git checkout -b agent/internal-hr-reimbursement-foundation
git am /绝对路径/0001-internal-hr-reimbursement-foundation.patch
```

也可以仅检查是否可应用：

```bash
git apply --check /绝对路径/0001-internal-hr-reimbursement-foundation.patch
```

## 本地验证证据

在实施工作区已经执行：

- TypeScript/TSX语法转译检查：30/30通过；
- 内部人事与报销领域断言：8/8通过；
- `git diff --check`：通过；
- 工作树：干净；
- 本地实施提交：`28a3683 feat: add internal HR and reimbursement foundation`。

由于当前本地环境无法联网安装项目指定的pnpm依赖，尚未在本环境重新执行完整的 `pnpm typecheck`、`pnpm test` 和 `pnpm build`。GitHub Actions目前验证补丁重建、SHA完整性、关键文件覆盖和敏感花名册未上传；完整全仓构建需要先把原始HRMS基线正式导入GitHub。

## 数据安全

真实集团花名册未上传。补丁不包含：

- 集团花名册Excel；
- 员工身份证、银行卡和真实家庭信息；
- 本地数据库与派生数据；
- `node_modules`、构建产物和生成的Prisma二进制；
- 调试截图和大型演示图片。

## 当前定位

这是内部人事与报销融合的**第一阶段开发成果**，不是可直接公开上线的最终生产版本。后续仍需完成：

- 报销人小程序正式页面；
- COS私有对象存储；
- 真实OCR；
- 正式PDF/XLSX打印；
- 备份与监控；
- 微信真机验收；
- 完整基线仓库导入后的CI类型检查、测试和构建。
