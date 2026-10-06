/**
 * BrotherPOS: help-site clips filmed in a seeded cannabis store, in English and French.
 * How the core drives this app — see core/project.mjs for what each key does.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CONFIG, browserArgs } from "./config.mjs";
import { SeedDaemon } from "./seed.mjs";
import { registerLabels } from "./register.mjs";
import { adminLabels } from "./admin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const local = existsSync(join(here, "config.local.json")) ? JSON.parse(readFileSync(join(here, "config.local.json"), "utf8")) : {};
const kb = local.docsRoot || join(CONFIG.bposRoot, "knowledge-base");
const subdomainOf = (worker) => (worker?.k > 1 ? worker.marker : CONFIG.subdomain);
const baseOf = (sub) => CONFIG.localBase.replace(`//${CONFIG.subdomain}.`, `//${sub}.`);

// One Rails process kept open for a whole make run: a reset is ~4.5s instead of ~11.5s.
let seeder = null;

export default {
  name: "brotherpos",
  languages: ["en", "fr"],
  accentColor: "rgba(16,185,129,1)",
  // Captions in a strip under the picture: the register's Cash / Complete Sale buttons live at
  // the bottom edge, exactly where overlaid captions land.
  render: { captions: "band", band: 120, background: "#0f1720" },
  chrome: { port: CONFIG.chromePort, args: browserArgs },

  /** Rebuild the store from scratch (seed-store.rb), with the flow's meta.seed flags. */
  async reset({ flags, lang, worker }) {
    seeder ||= new SeedDaemon();
    return seeder.seed([...flags, `--lang=${lang}`], subdomainOf(worker));
  },
  shutdown() { seeder?.stop(); },

  /** The dev server can be restarted under us (other work shares it): wait for it. */
  async ready(worker) {
    const base = baseOf(subdomainOf(worker));
    for (let i = 0; i < 60; i++) {
      if (await fetch(`${base}/up`).then((r) => r.ok, () => false)) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`${base} isn't answering`);
  },

  /** --jobs: worker k films its own store, "riverstone<k>", on its own address. */
  workers(k) {
    const sub = `${CONFIG.subdomain}${k}`;
    return { marker: sub, env: { BT_SUBDOMAIN: sub, BT_LOCAL_BASE: baseOf(sub), BT_FILM_HOST: `${sub}.brotherpos.ca` } };
  },

  /** The register's and the back office's own strings, from the BrotherPOS checkout. */
  labels: () => [...registerLabels(), ...adminLabels()],

  /** Store data stays as it is in French (product, category, customer and staff names): the
   *  seed writes them to .local/store-data.<subdomain>.json. */
  allowedText(worker) {
    const f = join(here, ".local", `store-data.${subdomainOf(worker)}.json`);
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : [];
  },

  /** "Offline" on camera would teach the wrong thing, so a take where the register's sync
   *  badge shows it is thrown away — unless the clip is about going offline. */
  guards: [{
    name: "the register showed Offline",
    unless: "offlineOnPurpose",
    async check(page) {
      const txt = await page.evaluate(() => document.querySelector('[data-tour="sync-status"]')?.innerText?.trim() || "");
      return /offline|hors ligne|fuera de/i.test(txt) ? txt : null;
    },
  }],

  /** The help site (Docusaurus, in the BrotherPOS repo). Server details stay in the gitignored
   *  config.local.json: deployHost, deployDir, docsUrl. */
  docs: {
    videos: local.docsVideos || join(kb, "static", "videos"),
    root: kb,
    build: "source ~/.nvm/nvm.sh >/dev/null && nvm use 24 >/dev/null && npm run build",
    deploy: { host: local.deployHost, dir: local.deployDir, url: local.docsUrl },
  },
};
