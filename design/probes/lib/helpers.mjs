/* Node-side helpers shared by the runner. Everything else runs in-page (lib/inject.js). */

export const VIEWPORT = { width: 1360, height: 900 };

/** Reset the app to a cold landing state. */
export async function coldStart(page, url) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__P);
  // let boot animations (KPI count-up, headline, weave seeding) settle
  await page.waitForTimeout(1200);
}

/** Run a probe module, capturing failure as data rather than aborting the suite. */
export async function safe(name, fn) {
  try {
    return await fn();
  } catch (err) {
    return { __error: String(err && err.message ? err.message : err) };
  }
}
