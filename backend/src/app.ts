import express, { type Application, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { env, corsOrigins } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';

/**
 * Builds the Express application.
 *
 * This module deliberately does NOT start an HTTP server — it only assembles
 * middleware and routes and returns the app. `server.ts` owns the listener.
 *
 * Keeping them apart means the test suite can import this app and issue
 * requests against it in-process, with no port bound and no chance of two
 * test files colliding on the same port.
 */
export const createApp = (): Application => {
  const app = express();

  // Trust the first proxy hop so req.ip and req.protocol reflect the real
  // client when running behind ngrok, a load balancer or a reverse proxy.
  app.set('trust proxy', 1);

  // Removes the `X-Powered-By: Express` header, which otherwise advertises
  // the framework to anyone probing the API, and sets a baseline of security
  // headers (HSTS, X-Content-Type-Options, frame options, and others).
  app.use(helmet());

  // Allow the Next.js frontend to call this API from another origin.
  // The allow-list comes from configuration; `credentials` permits the
  // browser to send the Authorization header on cross-origin requests.
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  // gzip responses over ~1 KB.
  app.use(compression());

  // Parse JSON request bodies into `req.body`.
  // The size limit caps how much a single request can force the process to
  // buffer in memory.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  /**
   * Liveness probe. Used by Docker health checks and load balancers to decide
   * whether this process is alive and should receive traffic.
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
    });
  });

  // Feature routes live under the configured API prefix (default /api/v1).
  app.use(env.API_PREFIX, apiRouter);

  // Unmatched routes -> 404, then the central error handler. Both MUST come
  // last: the error handler is Express's four-argument sink for everything
  // thrown or forwarded above.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
