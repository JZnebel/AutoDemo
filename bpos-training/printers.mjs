/**
 * Printers for the printing clips: two stand-in network printers (stand-in-printer.py) and
 * the REAL Linux Printer Bridge from the BrotherPOS checkout in front of them, listening on
 * this machine only. So what the register shows — bridge found, test print sent — is the
 * genuine software, and a take can check the job actually came out the other end.
 */
import { spawn } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import { createConnection } from "net";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CONFIG } from "./config.mjs";
import { log, sleep } from "./recorder.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, ".local", "printers");
export const RECEIPT_OUT = join(dir, "receipt.bin");
export const LABEL_OUT = join(dir, "label.bin");

const listening = (port) => new Promise((r) => {
  const s = createConnection({ host: "127.0.0.1", port }, () => { s.end(); r(true); });
  s.on("error", () => r(false));
});

function start(cmd, args, cwd) {
  spawn(cmd, args, { cwd, detached: true, stdio: "ignore" }).unref();
}

export async function ensurePrinters() {
  mkdirSync(dir, { recursive: true });
  if (!(await listening(19100))) start("python3", [join(here, "stand-in-printer.py"), "19100", RECEIPT_OUT]);
  if (!(await listening(19101))) start("python3", [join(here, "stand-in-printer.py"), "19101", LABEL_OUT]);
  if (!(await listening(9100))) {
    start("python3", ["linux_printer_bridge.py", "--host", "127.0.0.1", "--multi",
      "--receipt-network", "127.0.0.1:19100", "--label-network", "127.0.0.1:19101",
      "--printer-type", "escpos", "--no-scale-relay"], join(CONFIG.bposRoot, "printer_bridge"));
  }
  for (let i = 0; i < 20; i++) {
    if ((await listening(9100)) && (await listening(9101)) && (await listening(19100)) && (await listening(19101))) {
      log("printers: bridge + stand-ins ready");
      return;
    }
    await sleep(500);
  }
  throw new Error("printer bridge / stand-in printers didn't start");
}

export const printedBytes = (file) => (existsSync(file) ? statSync(file).size : 0);
