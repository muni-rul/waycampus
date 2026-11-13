import { store, hasFirebaseCredentials } from './db/store';
import { InMemoryRepository } from './db/repository/InMemoryRepository';
import { FirestoreRepository } from './db/repository/FirestoreRepository';

async function runDevSafetyTests() {
  console.log('====================================================');
  console.log('       CAMPUSNAV DEV SAFETY VERIFICATION SUITE       ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      if (detail) console.log(`       -> ${detail}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       -> ${detail}`);
    }
  }

  const origEnv = { ...process.env };

  try {
    // -------------------------------------------------------------
    // Test 1: In Development with no credentials -> InMemoryRepository loaded from seed
    // -------------------------------------------------------------
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.NODE_ENV = 'development';

    assert(!hasFirebaseCredentials(), '1a. No Firebase credentials detected');

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
      origLog(...args);
    };

    await store.initDatabase();
    console.log = origLog;

    const loggedDevMode = logs.some((l) => l.includes('DEV IN-MEMORY MODE: data is not saved'));
    assert(loggedDevMode, '1b. Logs "DEV IN-MEMORY MODE: data is not saved" on init');

    const repo = store.getRepository();
    assert(repo instanceof InMemoryRepository, '1c. Running on InMemoryRepository instance');
    assert(repo.getHealth().provider === 'in-memory', '1d. Health provider is in-memory');

    // Confirm loaded from seed
    const teachers = store.getTeachers();
    const panos = store.getPanoramas();
    const buildings = store.getBuildings();
    assert(teachers.length >= 250, '1e. Loaded official faculty from seed', `Found ${teachers.length} teachers`);
    assert(panos.length >= 50, '1f. Loaded connected 360 panoramas from seed', `Found ${panos.length} panoramas`);
    assert(buildings.length >= 8, '1g. Loaded campus buildings from seed', `Found ${buildings.length} buildings`);

    // -------------------------------------------------------------
    // Test 2: In Production with no credentials -> Refuses to start
    // -------------------------------------------------------------
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.NODE_ENV = 'production';

    let productionRefused = false;
    let refusalMessage = '';
    try {
      await store.initDatabase();
    } catch (err: any) {
      productionRefused = true;
      refusalMessage = err?.message || '';
    }

    assert(
      productionRefused && refusalMessage.includes('credentials'),
      '2. Production refuses to start without Firebase credentials',
      `Caught rejection: ${refusalMessage}`
    );

    // -------------------------------------------------------------
    // Test 3: Real Firestore is used only when credentials are set
    // -------------------------------------------------------------
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    assert(!hasFirebaseCredentials(), '3a. Unset credentials reports hasFirebaseCredentials() === false');

    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/etc/secrets/test-creds.json';
    assert(hasFirebaseCredentials(), '3b. File path credentials reports hasFirebaseCredentials() === true');

    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"project_id":"christ-test"}';
    assert(hasFirebaseCredentials(), '3c. JSON credentials reports hasFirebaseCredentials() === true');

  } finally {
    process.env = origEnv;
  }

  console.log(`\nRESULTS: ${passed}/${total} TESTS PASSED\n`);
  if (passed !== total || total === 0) {
    process.exit(1);
  }
}

runDevSafetyTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
