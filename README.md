# 祥能 HRMS：内部人事与报销融合底座

本分支包含从 `xiangneng-hrms-full-2026-07-26` 完整系统代码上实施的第一阶段改造：

- 内部人员档案、组织架构与花名册导入；
- 账号开通、停用、删除保护和部门转移；
- 可叠加的业务角色与数据范围；
- 报销批次、个人提交单、明细、附件、问题、审批与付款模型；
- 固定七态报销状态机；
- 表1、表2、表3和分开的付款/发票打印顺序；
- 内部人事与报销管理后台页面；
- Prisma迁移、领域测试和GitHub Actions验证。

## 源码结构

受当前GitHub连接器的批量上传限制，完整源码以经过SHA-256校验的分片压缩包存放在 `source-archive/`。运行：

```bash
bash scripts/reconstruct-source.sh
cd source
```

脚本会：

1. 合并所有Base64分片；
2. 解码为 `xiangneng-hrms-source.tar.gz`；
3. 校验SHA-256；
4. 解压到 `source/`。

核心改动也会放在 `review/` 目录，便于在GitHub中直接审查。

## 本地验证

```bash
cd source
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions会自动执行同样的安装、Prisma生成、数据库迁移、类型检查、测试和构建。

## 数据安全

真实集团花名册未上传到仓库。源码包排除了：

- 集团花名册Excel；
- 员工身份证、银行卡等真实人员资料；
- 本地数据库与派生数据；
- 生成的Prisma二进制；
- 调试截图和大型演示图片。

## 当前定位

这是内部人事与报销融合的**第一阶段开发分支**，并非可以直接公开上线的最终生产版本。后续仍需完成小程序报销人端、COS私有存储、真实OCR、正式PDF/XLSX打印、备份监控和真机验收。
