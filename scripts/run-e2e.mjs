import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import process from "node:process";

const root = new URL("../", import.meta.url);

async function serverReady() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 5175 });
    const finish = (ready) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

async function waitForServer(child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await serverReady()) return;
    if (child.exitCode !== null) throw new Error(`管理端测试服务器提前退出（${child.exitCode}）`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("管理端测试服务器 30 秒内未就绪");
}

let server;
let ownsServer = false;
try {
  if (!(await serverReady())) {
    server = spawn(process.execPath, [
      "apps/admin/node_modules/vite/bin/vite.js",
      "apps/admin",
      "--host", "127.0.0.1",
      "--port", "5175",
      "--strictPort"
    ], { cwd: root, stdio: "inherit" });
    ownsServer = true;
    await waitForServer(server);
  }

  const runner = spawn(process.execPath, [
    "node_modules/@playwright/test/cli.js",
    "test",
    ...process.argv.slice(2)
  ], { cwd: root, stdio: "inherit" });
  const exitCode = await new Promise((resolve) => runner.once("exit", (code) => resolve(code ?? 1)));
  process.exitCode = exitCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (ownsServer && server && server.exitCode === null) server.kill();
}
