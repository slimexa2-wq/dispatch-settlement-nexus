# 业务模块文档

本目录按 `config/project-modules.json` 的模块 ID 保存人工维护的业务说明。模块文档描述职责和边界，自动文件清单由 `docs/generated/module-index.md` 提供。

修改规则：

1. 新增模块时同时更新注册表和本目录。
2. 模块职责、依赖、关键模型或验证命令变化时更新对应 `MODULE.md`。
3. 文件移动后运行 `pnpm project:index` 和 `pnpm project:check`。
4. 不在模块文档复制大段源码，避免文档和代码出现两套实现。
