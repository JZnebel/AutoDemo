/**
 * Where the training videos are shot. Defaults suit a local BrotherPOS dev setup
 * (Rails on :3001 behind *.lvh.me, the register built into /pos). Override any of
 * them in config.local.json (gitignored) or the environment.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const local = existsSync(join(here, "config.local.json"))
  ? JSON.parse(readFileSync(join(here, "config.local.json"), "utf8"))
  : {};

const subdomain = process.env.BT_SUBDOMAIN || local.subdomain || "riverstone";

export const CONFIG = {
  subdomain,
  storeName: process.env.BT_STORE_NAME || local.storeName || "Riverstone Cannabis",
  /** Where the scripts themselves reach the store's Rails (seeding, health checks). */
  localBase: process.env.BT_LOCAL_BASE || local.localBase || `http://${subdomain}.lvh.me:3001`,
  /** The address the filming browser opens. A real store lives at <code>.brotherpos.ca, and
   *  the register brands itself Brother POS from that address before anyone signs in, so
   *  filming under lvh.me showed the TrafficPOS logo on the PIN screen. Chrome is started
   *  with a host-resolver rule mapping this host to the local server (see browserArgs). */
  filmHost: process.env.BT_FILM_HOST || local.filmHost || `${subdomain}.brotherpos.ca`,
  /** Docker container that runs Rails, for seeding. */
  appContainer: process.env.BT_APP_CONTAINER || local.appContainer || "pos_app",
  /** The BrotherPOS checkout, for the register's translation files (labels()). */
  bposRoot: process.env.BT_BPOS_ROOT || local.bposRoot || join(here, "..", "..", "bpos"),
  /** Chrome's remote-debugging port (see README). */
  chromePort: Number(process.env.BT_CHROME_PORT || local.chromePort || 9334),
};

CONFIG.base = `http://${CONFIG.filmHost}`;
export const BASE = CONFIG.base;

/** Chrome flags for the filming browser (make.mjs --jobs starts one per worker, on its own port). */
export function browserArgs(port = CONFIG.chromePort) {
  const local = new URL(CONFIG.localBase);
  return [
    "--headless=new", `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/bt-chrome-${port}`, "--window-size=1600,900", "--hide-scrollbars", "--no-first-run",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    // Every *.brotherpos.ca address goes to the local server (port 80 → its port), not just the
    // film host: a flow run with another store must never reach the real, production site.
    `--host-resolver-rules=MAP *.brotherpos.ca 127.0.0.1:${local.port || 80}, MAP brotherpos.ca 127.0.0.1:${local.port || 80}`,
    "about:blank",
  ];
}

export function creds() {
  const p = join(here, ".local", "creds.json");
  if (!existsSync(p)) throw new Error("no .local/creds.json — run node bpos-training/seed.mjs first");
  return JSON.parse(readFileSync(p, "utf8"));
}
