/** Drive one flow file: setup (not recorded) then run (recorded). */
import { connect, makeCtx, record, log } from "./recorder.mjs";

const flowPath = process.argv[2];
const outPath = process.argv[3];
const dry = process.argv.includes("--dry");
if (!flowPath || !outPath) { console.error("usage: run-flow.mjs <flow.mjs> <out.mp4> [--dry]"); process.exit(1); }

const flow = await import(flowPath);
// A flow may ask for its own viewport — the customer-side clip is a phone flow
// and shooting it at desktop width would show a layout nobody actually uses.
const { browser, page } = await connect(flow.meta.viewport ?? {});
const ctx = makeCtx(page);

page.on("pageerror", (e) => log("PAGE EXC: " + String(e).slice(0, 160)));
// A native confirm()/alert() blocks the renderer, which stalls every CDP call and
// hangs the run with a protocolTimeout. Dismiss anything that appears and say so —
// these are browser-painted and never show up in the recording anyway.
page.on("dialog", async (d) => {
  log(`dialog (${d.type()}) auto-accepted: ${d.message().slice(0, 60)}`);
  await d.accept().catch(() => {});
});

try {
  log(`=== ${flow.meta.name} : setup ===`);
  await flow.setup(ctx);
  log(`=== ${flow.meta.name} : ${dry ? "run (dry)" : "record"} ===`);
  if (dry) await flow.run(ctx);
  else await record(page, outPath, () => flow.run(ctx));
  log(`=== ${flow.meta.name} : OK ===`);
} catch (e) {
  log(`FAILED: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.disconnect();
}
