import env from './config/env.js';
import { connectDatabase } from './config/database.js';
import app from './app.js';

async function start() {
  try {
    await connectDatabase();
    console.log('[db] connected');

    const server = app.listen(env.port, () => {
      console.log(`[server] Placement Coach API listening on http://localhost:${env.port}`);
      console.log(`[server] health check: http://localhost:${env.port}/api/health`);
    });

    const shutdown = (signal) => {
      console.log(`\n[server] ${signal} received, shutting down...`);
      server.close(() => {
        import('mongoose').then(({ default: mongoose }) =>
          mongoose.connection.close(false).then(() => process.exit(0))
        );
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('[server] failed to start:', error.message);
    process.exit(1);
  }
}

start();
