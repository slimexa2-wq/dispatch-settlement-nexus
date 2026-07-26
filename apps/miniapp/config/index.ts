import { defineConfig, type UserConfigExport } from "@tarojs/cli";

const config: UserConfigExport = {
  projectName: "xiangneng-hrms-miniapp",
  date: "2026-07-18",
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2
  },
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  plugins: ["@tarojs/plugin-framework-react"],
  defineConstants: {
    "process.env.TARO_APP_API_BASE_URL": JSON.stringify(
      process.env.TARO_APP_API_BASE_URL ?? "http://127.0.0.1:3310/api"
    ),
    "process.env.TARO_APP_WECHAT_CONFIGURED": JSON.stringify(
      process.env.TARO_APP_WECHAT_CONFIGURED ?? "false"
    ),
    "process.env.TARO_APP_NOTIFICATION_CONFIGURED": JSON.stringify(
      process.env.TARO_APP_NOTIFICATION_CONFIGURED ?? "false"
    )
  },
  copy: { patterns: [], options: {} },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      url: { enable: true, config: { limit: 1024 } },
      cssModules: { enable: false, config: { namingPattern: "module", generateScopedName: "[name]__[local]___[hash:base64:5]" } }
    }
  }
};

export default defineConfig(config);
