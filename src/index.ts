#!/usr/bin/env node

import { loadConfig } from "./core/config.js";
import { startServer } from "./mcp/server.js";

async function main(): Promise<void> {
  try {
    const config = loadConfig();
    await startServer(config);
  } catch (error) {
    process.stderr.write(`Fatal: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

main();
