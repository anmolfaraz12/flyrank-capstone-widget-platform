/**
 * Looks up country/city for an IP address, trying two free providers in order.
 * If both fail, returns nulls — enrichment failing must never block a submission.
 */

const FETCH_TIMEOUT_MS = 4000;

function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

// Provider A: ip-api.com — free, no key, 45 req/min, HTTP only on the free tier
async function tryProviderA(ip) {
  const response = await fetchWithTimeout(`http://ip-api.com/json/${ip}`);
  if (!response.ok) throw new Error(`provider A status ${response.status}`);

  const data = await response.json();
  if (data.status !== 'success') throw new Error('provider A returned failure status');

  return { country: data.country || null, city: data.city || null };
}

// Provider B (fallback): ipapi.co — free tier, ~1,000 lookups/day
async function tryProviderB(ip) {
  const response = await fetchWithTimeout(`https://ipapi.co/${ip}/json/`);
  if (!response.ok) throw new Error(`provider B status ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error('provider B returned an error');

  return { country: data.country_name || null, city: data.city || null };
}

/**
 * @param {string} ip
 * @param {{ forceProviderADown?: boolean, forceProviderBDown?: boolean }} [testOverrides]
 *   Lets tests deterministically force a provider to fail, per the assignment's
 *   guidance to mock the fallback proof rather than depend on live network flakiness.
 */
async function lookupGeo(ip, testOverrides = {}) {
  if (!testOverrides.forceProviderADown) {
    try {
      return await tryProviderA(ip);
    } catch (err) {
      console.log(`  geo provider A failed (${err.message}), trying provider B`);
    }
  } else {
    console.log('  geo provider A forced down for testing, trying provider B');
  }

  if (!testOverrides.forceProviderBDown) {
    try {
      return await tryProviderB(ip);
    } catch (err) {
      console.log(`  geo provider B failed (${err.message}) — continuing without geo data`);
    }
  } else {
    console.log('  geo provider B forced down for testing — continuing without geo data');
  }

  return { country: null, city: null };
}

module.exports = { lookupGeo };