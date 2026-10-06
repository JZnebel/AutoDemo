/**
 * rezweed: owner and customer walkthrough clips for rezweed.com/start, /card and /for-owners.
 * How the core drives this app — see core/project.mjs for what each key does.
 *
 * The app's localhost points at the PRODUCTION Supabase project, so every take writes real
 * rows. What keeps that safe: takes are filmed on honeypot listings (config.local.json's
 * storeId), the mailer no-ops without SENDGRID_API_KEY, and reset() runs cleanup.mjs before
 * every take and afterAll() once more at the end — cleanup removes the claim, the temporary
 * owner, the demo menu and any edits, and restores the store from the snapshot seed-owner took.
 */
import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
// Never silenced: a cleanup that fails to parse once left a menu seeded twice on camera.
const run = (script) => execFileSync("node", [join(here, script)], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

export default {
  name: "rezweed",
  languages: ["en"],
  accentColor: "rgba(45,74,62,1)",
  // Captions over the picture: these play in a 16:9 slot on the page, often on a phone.
  render: { captions: "overlay", background: "#000" },
  chrome: { port: 9333, args: () => ["--window-size=1280,800"] },

  /** A clean slate for every take: undo the last one, then a fresh temporary owner (and the
   *  demo menu, for flows with meta.seed ["--menu"]). The claim API returns 409 on a
   *  duplicate pending claim, so a retake without this silently breaks. */
  async reset({ flags }) {
    let out = run("cleanup.mjs");
    out += run("seed-owner.mjs");
    if (flags.includes("--menu")) out += run("seed-menu.mjs");
    return out;
  },
  async afterAll() { process.stdout.write(run("cleanup.mjs")); },
};
