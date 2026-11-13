import assert from 'assert';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

console.log('=== RUNNING PRODUCTION BOOT SMOKE TEST ===');

const serverDir = path.resolve(__dirname, '..');

async function runSmokeTests() {
  // Test 1: NODE_ENV=production without credentials MUST refuse to start
  console.log('\n--- 1. Testing Production Boot Refusal without Credentials ---');
  const prodRefusalPromise = new Promise<boolean>((resolve) => {
    const prodEnv: Record<string, string | undefined> = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3099',
    };
    delete prodEnv.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete prodEnv.GOOGLE_APPLICATION_CREDENTIALS;

    const child = spawn(process.execPath, ['start.js'], {
      cwd: serverDir,
      env: prodEnv as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, 10000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      console.log(`Production process exited with code ${code}`);
      console.log(`Refused output snippet: ${output.slice(0, 300).replace(/\n/g, ' ')}`);
      const refused = code !== 0 && (output.includes('credentials') || output.includes('FATAL'));
      resolve(refused);
    });
  });

  const prodRefused = await prodRefusalPromise;
  assert(prodRefused, 'Production server MUST refuse to start without credentials');
  console.log('✓ PASS: Production refused to start without credentials');

  // Test 2: Dev mode must serve /api/v1/health
  console.log('\n--- 2. Testing Dev Mode Serves /api/v1/health ---');
  const testPort = '3098';
  const devEnv: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: testPort,
  };
  delete devEnv.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete devEnv.GOOGLE_APPLICATION_CREDENTIALS;

  const devChild = spawn(process.execPath, ['start.js'], {
    cwd: serverDir,
    env: devEnv as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let devOutput = '';
  devChild.stdout.on('data', (d) => (devOutput += d.toString()));
  devChild.stderr.on('data', (d) => (devOutput += d.toString()));

  const hardTimeout = setTimeout(() => {
    console.error('Hard 30s timeout reached, killing process');
    devChild.kill('SIGKILL');
    process.exit(1);
  }, 30000);

  // Poll /api/v1/health
  let healthOk = false;
  let healthPayload: any = null;

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${testPort}/api/v1/health`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(500, () => req.destroy());
      });

      if (res.status === 200) {
        healthPayload = JSON.parse(res.body);
        healthOk = healthPayload.status === 'ok';
        console.log(`Received 200 OK from /api/v1/health:`, healthPayload);
        break;
      }
    } catch {
      // Server still booting
    }
  }

  // Kill dev child
  clearTimeout(hardTimeout);
  devChild.kill('SIGINT');
  await new Promise((r) => setTimeout(r, 500));
  try {
    devChild.kill('SIGKILL');
  } catch {}

  assert(healthOk, 'Dev mode server must respond with status ok from /api/v1/health');
  console.log('✓ PASS: Dev mode successfully served /api/v1/health and was shut down');
  console.log('\n✓ ALL BOOT SMOKE TESTS PASSED');
}

runSmokeTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
