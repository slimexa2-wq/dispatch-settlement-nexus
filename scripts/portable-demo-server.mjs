import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const packageRoot = import.meta.dirname;
const webRoot = resolve(packageRoot, "web");
const host = "127.0.0.1";
const preferredPort = Number(process.env.XIANGNENG_DEMO_PORT || 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function safePath(pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(webRoot, relative);
  return candidate === webRoot || candidate.startsWith(`${webRoot}${sep}`) ? candidate : null;
}

function cacheControl(filePath) {
  if (filePath.includes(`${sep}assets${sep}`)) return "public, max-age=31536000, immutable";
  if (filePath.endsWith("demo-data.json")) return "public, max-age=3600";
  return "no-cache";
}

function sendFile(request, response, filePath) {
  const acceptsGzip = String(request.headers["accept-encoding"] ?? "").includes("gzip");
  const gzipPath = `${filePath}.gz`;
  const servedPath = acceptsGzip && existsSync(gzipPath) ? gzipPath : filePath;
  const fileStat = statSync(servedPath);
  response.writeHead(200, {
    "Cache-Control": cacheControl(filePath),
    "Content-Length": fileStat.size,
    "Content-Type": contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    ...(servedPath === gzipPath ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {})
  });
  createReadStream(servedPath).pipe(response);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}`);
  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: true, app: "祥能人员与招聘信息管理系统" }));
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad Request");
    return;
  }

  const requestedPath = safePath(pathname);
  if (!requestedPath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (existsSync(requestedPath) && statSync(requestedPath).isFile()) {
    sendFile(request, response, requestedPath);
    return;
  }

  if (!extname(pathname)) {
    sendFile(request, response, resolve(webRoot, "index.html"));
    return;
  }

  response.writeHead(404);
  response.end("Not Found");
});

function listen(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < preferredPort + 30) {
      listen(port + 1);
      return;
    }
    console.error("演示系统启动失败：", error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const url = `http://${host}:${port}/login`;
    console.log("\n祥能人员与招聘信息管理系统已启动");
    console.log(`演示地址：${url}`);
    console.log("登录验证码：8888");
    console.log("关闭此窗口即可停止演示系统。\n");
    if (process.env.XIANGNENG_DEMO_NO_OPEN !== "1") {
      const child = spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
    }
  });
}

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
listen(preferredPort);
