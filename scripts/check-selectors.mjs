#!/usr/bin/env node

/**
 * CI Selector Coverage Check (#4)
 *
 * Reads a selectors.json config, navigates to each page, and asserts
 * all required data-tour IDs exist in the DOM. Exit code 1 on failure.
 *
 * Usage:
 *   node scripts/check-selectors.mjs [selectors.json]
 *
 * selectors.json format:
 *   {
 *     "baseUrl": "http://localhost:3010",
 *     "pages": [
 *       {
 *         "path": "/pos",
 *         "setup": "optional setup description",
 *         "selectors": [
 *           "[data-tour='product-search']",
 *           "[data-tour='customer-search']",
 *           "[data-tour='tender-buttons']"
 *         ]
 *       }
 *     ]
 *   }
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

function ab(command, options = {}) {
  const fullCommand = `agent-browser ${command}`;
  try {
    return execSync(fullCommand, {
      encoding: "utf-8",
      timeout: options.timeout || 20000,
    }).trim();
  } catch (error) {
    return "";
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Load config
const configPath = process.argv[2] || join(__dirname, "..", "selectors.json");

if (!existsSync(configPath)) {
  console.error(`Selectors config not found: ${configPath}`);
  console.error(
    "Create a selectors.json file or pass a path as the first argument."
  );
  console.error("\nExample selectors.json:");
  console.error(
    JSON.stringify(
      {
        baseUrl: "http://localhost:3010",
        pages: [
          {
            path: "/pos",
            selectors: [
              "[data-tour='product-search']",
              "[data-tour='customer-search']",
            ],
          },
        ],
      },
      null,
      2
    )
  );
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, "utf-8"));
const baseUrl = config.baseUrl || "http://localhost:3010";
let totalChecked = 0;
let totalMissing = 0;
const failures = [];

console.log(`Checking selectors against ${baseUrl}`);
console.log(`Config: ${configPath}\n`);

ab("set viewport 1920 1080");

for (const page of config.pages) {
  const url = `${baseUrl}${page.path}`;
  console.log(`--- ${url} ---`);

  ab(`open "${url}" --headed`, { timeout: 60000 });
  await sleep(page.waitMs || 3000);

  for (const selector of page.selectors) {
    totalChecked++;
    const escaped = selector.replace(/'/g, "\\'");
    const result = ab(
      `eval "!!document.querySelector('${escaped}')"`,
      { timeout: 5000 }
    );

    if (result === "true") {
      console.log(`  OK  ${selector}`);
    } else {
      totalMissing++;
      console.log(`  MISSING  ${selector}`);
      failures.push({ page: page.path, selector });
    }
  }
}

ab("close");

console.log(`\n--- Summary ---`);
console.log(`Checked: ${totalChecked}`);
console.log(`Missing: ${totalMissing}`);

if (failures.length > 0) {
  console.log("\nFailed selectors:");
  for (const f of failures) {
    console.log(`  ${f.page}: ${f.selector}`);
  }
  process.exit(1);
} else {
  console.log("\nAll selectors present.");
}
