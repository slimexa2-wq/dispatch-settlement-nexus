import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function start(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
}

start().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
