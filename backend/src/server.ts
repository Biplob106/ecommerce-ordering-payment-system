import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp();

const server: Server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

/**
 * Graceful shutdown.
 *
 * Node is a single long-lived process, unlike PHP where each request runs in
 * its own short-lived worker. When a container is stopped or redeployed, the
 * platform sends SIGTERM and then kills the process a few seconds later.
 *
 * Without this handler the process dies instantly, cutting off any request
 * still in flight. For a payments API that could mean dropping the response
 * to a charge that already succeeded at the provider — the customer is
 * billed but never learns the order was placed.
 *
 * So: stop accepting new connections, let in-flight requests finish, then
 * exit. If they do not finish within the timeout, exit anyway rather than
 * hanging forever.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000;

const shutdown = (signal: string): void => {
  console.log(`${signal} received — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Do not keep the process alive purely because this timer is pending.
  forceExit.unref();

  server.close((err) => {
    if (err) {
      console.error('Error during shutdown', err);
      process.exit(1);
    }

    console.log('Shutdown complete');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Last-resort safety nets.
 *
 * An unhandled rejection or uncaught exception means the process is in an
 * unknown state — a connection may be half-open, a transaction half-applied.
 * Continuing to serve traffic from there risks corrupt data, so the process
 * logs the cause and exits; the container platform restarts it clean.
 */
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection', reason);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', error);
  shutdown('uncaughtException');
});

export { server };
