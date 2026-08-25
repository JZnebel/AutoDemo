import { readFileSync } from "fs";
import { BASE } from "./recorder.mjs";
import { OWNER_SECRET_FILE } from "./config.mjs";

/** Sign the temporary owner in through the real form. Setup only — never recorded.
 *  The password is whatever seed-owner minted for this run; run it first. */
export const OWNER = (() => {
  try { return JSON.parse(readFileSync(OWNER_SECRET_FILE, "utf8")); }
  catch {
    throw new Error("rezweed-start: no demo owner credentials — run seed-owner.mjs first.");
  }
})();

async function attempt(ctx) {
  const { page } = ctx;
  // Each recording pass tears the demo user down and builds a new one, so any
  // cookie left in the profile authenticates a user that no longer exists —
  // which leaves /signin neither redirecting nor accepting a login.
  const client = await page.createCDPSession();
  await client.send("Network.clearBrowserCookies");
  await client.detach();
  await ctx.goto(`${BASE}/`);
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.evaluate(() => localStorage.setItem("rezweed_age_verified", "true"));
  await ctx.goto(`${BASE}/signin`);
  await ctx.settle();
  // /signin redirects away when a session already exists, so there is nothing
  // to fill in — treat that as success rather than failing on a missing field.
  if (!page.url().includes("/signin")) return;
  // The form opens on the Create-account tab. Switch to Sign in and WAIT for it:
  // clicking submit before the tab has re-rendered finds no submit button, and a
  // silent no-op here shows up much later as a 25s timeout with no explanation.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "Sign in");
    if (b) b.click();
  });
  await page.waitForFunction(
    () => !!document.querySelector('input[type=password][placeholder*="Enter your"]'),
    { timeout: 15000 },
  );
  await ctx.pause(400);

  // Sign-in kept failing on a cold page and it is this: the form carries a hidden
  // cf-turnstile-response, and submitting before the widget has filled it in gets
  // silently refused — no error on screen, just a page that never navigates. Wait
  // for a token, but do not insist: some environments never render the widget at
  // all, and there the empty value is what the server expects.
  await page.waitForFunction(() => {
    const el = document.querySelector('input[name="cf-turnstile-response"]');
    return !el || (el.value && el.value.length > 10);
  }, { timeout: 12000 }).catch(() => {});

  await page.focus("input[type=email]");
  await page.keyboard.type(OWNER.email, { delay: 12 });
  await page.focus("input[type=password]");
  await page.keyboard.type(OWNER.password, { delay: 12 });

  const submitted = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => /^sign in$/i.test(x.innerText.trim()) && x.type === "submit");
    if (!b) return false;
    b.click();
    return true;
  });
  if (!submitted) throw new Error("sign in: no submit button after switching tabs");

  // Wait on the session cookie, not on the URL. The post-login redirect is done
  // client-side and does not always fire promptly; the cookie is the actual
  // success signal, and whoever called us navigates where they want anyway.
  await page.waitForFunction(
    () => document.cookie.includes("-auth-token"),
    { timeout: 25000, polling: 300 },
  );
  await ctx.pause(900);
}

/**
 * Sign-in is occasionally flaky on a cold page — the Turnstile widget on the form
 * has to be ready before the submit will go through, and on the first load after
 * clearing cookies it sometimes isn't. One retry costs a few seconds and saves a
 * recording run.
 */
export async function signIn(ctx) {
  let last;
  for (let i = 1; i <= 3; i++) {
    try { await attempt(ctx); return; }
    catch (e) {
      last = e;
      ctx.note(`sign in attempt ${i} failed: ${e.message.slice(0, 60)}`);
      await ctx.pause(2500 * i);
    }
  }
  throw last;
}
