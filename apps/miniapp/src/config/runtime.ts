const apiBaseUrl = (process.env.TARO_APP_API_BASE_URL ?? "http://127.0.0.1:3310/api").replace(/\/$/, "");

export const runtimeConfig = {
  apiBaseUrl,
  wechatConfigured: process.env.TARO_APP_WECHAT_CONFIGURED === "true",
  notificationConfigured: process.env.TARO_APP_NOTIFICATION_CONFIGURED === "true"
} as const;

export const configurationGaps = [
  !runtimeConfig.wechatConfigured
    ? "微信小程序 AppID/AppSecret、合法请求域名尚未配置，当前仅支持开发账号登录。"
    : null,
  !runtimeConfig.notificationConfigured
    ? "公众号模板 ID 与身份绑定尚未配置，状态通知不会伪报发送成功。"
    : null
].filter((value): value is string => Boolean(value));
