const { lookupGeo } = require('./lib/geo');

const realFetch = global.fetch;

/**
 * Temporarily replaces global.fetch with a fake version for the duration
 * of one test, then restores the real one. This is what makes the proof
 * deterministic — it never depends on a live provider's rate limit.
 */
function withMockedFetch(mockFn, testFn) {
  global.fetch = mockFn;
  return testFn().finally(() => {
    global.fetch = realFetch;
  });
}

function fakeSuccessResponse(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  });
}

function fakeFailureResponse(status) {
  return Promise.resolve({ ok: false, status });
}

async function main() {
  console.log('=== Geo fallback chain proof (mocked, deterministic) ===\n');

  console.log('1. Provider A answers successfully:');
  await withMockedFetch(
    (url) => {
      if (url.includes('ip-api.com')) {
        return fakeSuccessResponse({ status: 'success', country: 'United States', city: 'Ashburn' });
      }
      throw new Error('provider B should not be called in this scenario');
    },
    async () => {
      const result = await lookupGeo('8.8.8.8');
      console.log('   Result:', result);
    }
  );

  console.log('\n2. Provider A fails → provider B answers successfully:');
  await withMockedFetch(
    (url) => {
      if (url.includes('ip-api.com')) return fakeFailureResponse(500);
      if (url.includes('ipapi.co')) {
        return fakeSuccessResponse({ country_name: 'Germany', city: 'Berlin' });
      }
      throw new Error('unexpected URL: ' + url);
    },
    async () => {
      const result = await lookupGeo('8.8.8.8');
      console.log('   Result:', result);
      if (result.country !== 'Germany') {
        throw new Error('FALLBACK DID NOT WORK — expected Germany from provider B');
      }
      console.log('   ✅ Confirmed: provider B successfully answered after A failed');
    }
  );

  console.log('\n3. Both providers fail → degrades gracefully, never throws:');
  await withMockedFetch(
    () => fakeFailureResponse(500),
    async () => {
      const result = await lookupGeo('8.8.8.8');
      console.log('   Result:', result);
      if (result.country !== null || result.city !== null) {
        throw new Error('expected nulls when both providers are down');
      }
      console.log('   ✅ Confirmed: degrades to nulls, does not throw or crash');
    }
  );

  console.log('\n=== Proof complete — all 3 scenarios behaved correctly ===');
}

main().catch((err) => {
  console.error('\n❌ PROOF FAILED:', err.message);
  process.exit(1);
});