import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { AuthProvider } from "./auth/AuthContext";
import { AppRoutes } from "./routes/AppRoutes";
import "./styles.css";

dayjs.locale("zh-cn");

const root = document.getElementById("root");

if (!root) {
  throw new Error("页面根节点不存在");
}

createRoot(root).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#1268f3",
          colorInfo: "#1268f3",
          colorSuccess: "#16876c",
          colorWarning: "#d88a18",
          colorError: "#c84a4a",
          colorText: "#21363a",
          colorTextSecondary: "#61777b",
          colorBgLayout: "#f3f7ff",
          borderRadius: 8,
          controlHeight: 36,
          fontFamily:
            "Inter, 'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif"
        },
        components: {
          Layout: { siderBg: "#063b83", headerBg: "#ffffff" },
          Menu: {
            darkItemBg: "#063b83",
            darkSubMenuItemBg: "#052f68",
            darkItemSelectedBg: "#1268f3"
          },
          Table: { headerBg: "#f4f8ff", headerColor: "#314466" }
        }
      }}
    >
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>
);
