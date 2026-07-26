# 祥能人事招聘微信小程序

单一 Taro + React + TypeScript 小程序，根据登录角色进入内部运营、供应商、求职者或内部员工工作台。所有业务数据调用统一 \`/api\`，页面不包含演示人员、岗位或项目数据。

## 本地验证

\`\`\`bash
pnpm --filter @xiangneng/miniapp typecheck
pnpm --filter @xiangneng/miniapp test
pnpm --filter @xiangneng/miniapp build:weapp
\`\`\`

构建产物位于 \`apps/miniapp/dist\`，可用微信开发者工具打开 \`apps/miniapp/project.config.json\`。

## 环境变量

- \`TARO_APP_API_BASE_URL\`：统一 API 基址，开发默认 \`http://127.0.0.1:3310/api\`。
- \`TARO_APP_WECHAT_CONFIGURED\`：只有真实小程序 AppID/AppSecret、合法域名均完成后才设为 \`true\`。
- \`TARO_APP_NOTIFICATION_CONFIGURED\`：公众号身份绑定和模板 ID 完成后才设为 \`true\`。

当前 \`project.config.json\` 使用 \`touristappid\`，仅用于构建和开发者工具预览。小程序只把 \`Taro.login\` 获取的临时 code 交给 \`/wechat/auth/login\`，绝不保存或发送 AppSecret。没有真实微信配置时，界面明确显示配置缺口，接口的未配置错误不会被当成登录成功，公众号通知也不会伪报发送。订阅消息只能在用户点击触发后申请授权，本开发基线未在缺少模板 ID 时发起订阅。

## 权限边界

- 内部运营按 \`people:read\` / \`people:write\` 显示查询和状态操作。
- 供应商端只调用服务端按当前 \`supplierId\` 限定的人员、统计与供应商政策接口。
- 求职者只查看本人报名。
- 内部员工只查看本人推荐、奖励与已发布工资条；推荐人员身份证、附件、保险和供应商政策不展示。
