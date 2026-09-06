#!/usr/bin/env node
/**
 * DeviceLab Local Companion
 *
 * A local process that provides Playwright-backed browser previews
 * for DeviceLab via WebSocket.
 *
 * Usage:
 *   npx tsx companion/src/index.ts
 *
 * Environment variables:
 *   COMPANION_PORT - Port to listen on (default: 0 = random)
 *   COMPANION_HOST - Host to bind to (default: 127.0.0.1)
 */

import { createCompanionServer } from './server.js';

const PORT = parseInt(process.env.COMPANION_PORT ?? '0', 10);
const HOST = process.env.COMPANION_HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  const server = createCompanionServer({
    host: HOST,
    port: PORT,
    browser: {
      headless: true,
    },
  });

  // Handle graceful shutdown
  const graceful = async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', graceful);
  process.on('SIGTERM', graceful);

  await server.start();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
