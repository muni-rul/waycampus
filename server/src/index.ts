import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { apiRouter } from './routes/api';
import { store } from './db/store';

const app = express();
const PORT = process.env.PORT || 3001;

// Render and reverse proxies: trust first proxy hop for accurate client IP resolution
app.set('trust proxy', 1);

// Security headers (keep other headers active while disabling CSP so WebGL/tiles/fonts are unhindered)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Restricted CORS: only ALLOWED_ORIGINS env var, plus loopback ports in development
const rawAllowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. mobile apps or curl without origin header)
    if (!origin) {
      return callback(null, true);
    }
    if (rawAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== 'production') {
      if (
        origin === 'http://localhost:5173' ||
        origin === 'http://localhost:3000' ||
        origin === 'http://127.0.0.1:5173' ||
        origin === 'http://127.0.0.1:3000'
      ) {
        return callback(null, true);
      }
    }
    // Reject unknown origins without throwing an uncaught exception
    return callback(null, false);
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '25mb' }));

// Dynamic fallback for uploaded panorama images (persisted in store.graphOverrides.uploadedPanoramaAssets)
app.get('/assets/panoramas/uploaded/:filename', (req, res, next) => {
  const filename = path.basename(req.params.filename || '');
  if (!filename) return next();
  const asset = store.getUploadedPanoramaAssetBuffer(filename);
  if (asset) {
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(asset.buffer);
  }
  return next();
});

// API versioning & root routes
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

function findClientDist(): string | null {
  const possiblePaths = [
    path.resolve(__dirname, '../../client/dist'),
    path.resolve(__dirname, '../../../client/dist'),
    path.resolve(__dirname, '../../../../client/dist'),
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), '../client/dist'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findClientPublic(): string | null {
  const possiblePaths = [
    path.resolve(__dirname, '../../client/public'),
    path.resolve(__dirname, '../../../client/public'),
    path.resolve(__dirname, '../../../../client/public'),
    path.resolve(process.cwd(), 'client/public'),
    path.resolve(process.cwd(), '../client/public'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const clientPublicPath = findClientPublic();
if (clientPublicPath) {
  const tilesPath = path.join(clientPublicPath, 'panorama-tiles');
  if (fs.existsSync(tilesPath)) {
    app.use(
      '/panorama-tiles',
      express.static(tilesPath, {
        maxAge: '7d',
        immutable: true,
      })
    );
  }
  const assetsPath = path.join(clientPublicPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    app.use(
      '/assets',
      express.static(assetsPath, {
        maxAge: '7d',
        immutable: true,
      })
    );
  }
}

// Statically serve built client web app in production
const clientDistPath = findClientDist();
if (clientDistPath) {
  app.use(
    express.static(clientDistPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // SPA fallback for all web application routes (Never cache index.html for instant live mobile updates)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // Base root endpoint if client not built yet
  app.get('/', (req, res) => {
    res.json({
      name: 'CampusNav API',
      tagline: 'Campus navigation for Christ College',
      status: 'online',
      docs: '/api/v1/health',
    });
  });
}

// Global Error Handler: Return generic messages to clients without leaking stack traces or internal details
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Uploaded payload exceeds the maximum allowed limit.',
    });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid Request',
      message: 'Malformed JSON payload.',
    });
  }
  console.error('[CampusNav Server Error]:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please try again later.',
  });
});

let server: any;

async function bootstrap() {
  // Ensure database and faculty accounts are restored from data repository before accepting requests
  try {
    await store.initCloudSync();
  } catch (err: any) {
    console.warn('[CampusNav Server] Initial cloud sync warning:', err?.message);
  }

  server = app.listen(PORT, () => {
    console.log(`[CampusNav Server] Server running on http://localhost:${PORT}`);
    console.log(`[CampusNav Server] Health endpoint: http://localhost:${PORT}/api/v1/health`);
  });
}

bootstrap();

export { app, server };
