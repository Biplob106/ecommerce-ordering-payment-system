import 'dotenv/config';
import express, { type Request, type Response } from 'express';

const app = express();

const PORT = Number(process.env.PORT ?? 4000);

// Parse incoming JSON request bodies into `req.body`.
// Laravel does this automatically; in Express it is opt-in middleware.
app.use(express.json());

/**
 * Liveness probe.
 * Docker and load balancers call this to decide whether the process is alive.
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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
