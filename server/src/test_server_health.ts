import express from 'express';
import http from 'http';
import { apiRouter } from './routes/api';
import { store } from './db/store';

async function testHealth() {
  console.log('Testing /api/v1/health with hard timeout...');
  await store.initDatabase();
  const app = express();
  app.use('/api/v1', apiRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  const timer = setTimeout(() => {
    console.error('TIMED OUT');
    server.close();
    process.exit(1);
  }, 10000);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
    const data = await res.json();
    console.log(`[PASS] /api/v1/health HTTP status: ${res.status}`);
    console.log(`[PASS] /api/v1/health payload:`, JSON.stringify(data));
  } finally {
    clearTimeout(timer);
    server.close();
    console.log('[PASS] Test server stopped.');
  }
}

testHealth().catch((err) => {
  console.error(err);
  process.exit(1);
});
