# 接入指南

## 推荐架构
```text
现有前端AI抽屉
→ /api/ai/chat
→ 规则路由
→ 模型语义兜底
→ Skill与Schema校验
→ 现有业务服务适配层
→ 权限/事务层
→ 现有数据库
```

## 必须复用
Codex应找到并复用人员搜索、人员详情、权限、入职、离职、人员统计、招聘进度和日志服务。若现有代码只在页面内直接改数据，应先抽取正式服务，再由传统页面和AI助手共同调用。

## 建议接口
- `POST /api/ai/chat`
- `POST /api/ai/actions/confirm`
- `GET /api/ai/actions/{actionId}`
- `GET /api/ai/health`
- `POST /api/ai/demo/reset`

## 用户上下文
后端从登录态读取 userId、role、branchIds、projectIds、supplierId、employeeId、timezone。前端传入的角色不可作为可信依据。

## 模型配置
- `XIANGNENG_LLM_BASE_URL`
- `XIANGNENG_LLM_MODEL`
- `XIANGNENG_LLM_API_KEY`

不得写死厂商。模型不可用时切换规则表单。
