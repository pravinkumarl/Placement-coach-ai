import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import env from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ---------- Security ---------- */
app.use(
  helmet({
    contentSecurityPolicy: false, // inline scripts + CDN assets in the static frontend
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const corsOptions = {
  origin(origin, callback) {
    // Allow same origin and configured client origins (no wildcard with credentials).
    if (!origin || origin === env.clientUrl || origin.replace(/\/$/, '') === env.clientUrl.replace(/\/$/, '')) {
      return callback(null, true);
    }
    if (!env.isProduction) {
      return callback(null, true); // dev: allow any local origin (file://, other ports)
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};
app.use(cors(corsOptions));

/* ---------- Parsers & logging ---------- */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (!env.isTest) {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

/* ---------- Rate limiting (API only) ---------- */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith('/api'),
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use(apiLimiter);

/* ---------- API ---------- */
app.use('/api', apiRoutes);

/* ---------- Static frontend ---------- */
const staticRoot = env.repoRoot;

// Never expose server source, dependency or env files through the web root.
app.use(['/backend', '/node_modules'], (req, res) => res.status(404).send('Not found'));

const staticOptions = {
  index: 'index.html',
  dotfiles: 'ignore',
  extensions: ['html'],
};

app.use(express.static(staticRoot, staticOptions));

// Clean URLs: /dashboard → dashboard.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }

  const relative = req.path.replace(/^\/+/, '');
  const candidate = path.resolve(staticRoot, `${relative}.html`);
  const insideRoot = candidate.startsWith(staticRoot + path.sep) || candidate === staticRoot;

  if (insideRoot && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return res.sendFile(candidate);
  }
  return next();
});

/* ---------- Errors ---------- */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
