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
    // No Origin header: same-origin navigations, curl, server-to-server.
    if (!origin) {
      return callback(null, true);
    }
    const normalized = origin.replace(/\/$/, '');
    const allowed = String(env.clientUrl || '').replace(/\/$/, '');
    // Same origin as the API itself, or the configured client origin.
    if (normalized === allowed || normalized === `http://localhost:${env.port}`) {
      return callback(null, true);
    }
    // Automatically allow all Vercel deployments (production and preview branches)
    try {
      const parsed = new URL(origin);
      if (parsed.hostname.endsWith('.vercel.app')) {
        return callback(null, true);
      }
    } catch {
      /* ignore */
    }
    // Dev only: allow any local origin (file://, other local ports).
    if (!env.isProduction) {
      return callback(null, true);
    }
    // Production: never reflect arbitrary origins with credentials.
    return callback(null, false);
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

// Never serve repository internals (logs, docs, manifests, VCS or env files).
const BLOCKED_STATIC = [
  /\.(log|md|pid|sqlite|db)$/i,
  /(^|\/)package(-lock)?\.json$/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.env/i,
  /(^|\/)server\.(log|err\.log)$/i,
];
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (BLOCKED_STATIC.some((re) => re.test(req.path))) {
    return res.status(404).send('Not found');
  }
  return next();
});

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
