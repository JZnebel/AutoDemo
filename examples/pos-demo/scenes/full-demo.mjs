/**
 * Full POS demo scene — register walkthrough from login to payment.
 *
 * Receives a context object from the manifest runner with all shared helpers.
 * This is the pos-demo.mjs recording logic extracted as a reusable scene module.
 *
 * @param {object} ctx
 * @param {Function} ctx.ab - agent-browser command
 * @param {Function} ctx.sleep - async delay
 * @param {Function} ctx.cursorClick - animated cursor click
 * @param {Function} ctx.injectCursor - inject fake cursor into page
 * @param {Function} ctx.waitForVisible - poll until selector appears
 * @param {Function} ctx.waitUntil - wait until elapsed seconds
 * @param {Function} ctx.seg - get timed segment by action name
 */
export default async function run(ctx) {
  const { ab, sleep, cursorClick, injectCursor, waitUntil, seg } = ctx;

  // --- INTRO: Show login screen ---
  console.log("  [intro] Showing login screen");
  await waitUntil(seg("intro").endSec);

  // --- PIN LOGIN ---
  console.log("  [pin-login] Entering PIN");
  await sleep(300);
  ab(`click "button:has-text('1')"`);
  await sleep(350);
  ab(`click "button:has-text('2')"`);
  await sleep(350);
  ab(`click "button:has-text('3')"`);
  await sleep(350);
  ab(`click "button:has-text('4')"`);
  await sleep(3000);

  // Inject cursor after PIN login navigates to drawer screen
  injectCursor();
  await sleep(300);

  // --- OPEN CASH DRAWER ---
  console.log("  [open-drawer] Opening cash drawer");
  await waitUntil(seg("open-drawer").startSec);
  await sleep(500);
  await cursorClick("button:has-text('Open Drawer')", { timeout: 10000 });
  await sleep(2500);

  // Re-inject cursor after register loads
  injectCursor();
  await sleep(300);

  // --- SHOW REGISTER ---
  console.log("  [show-register] Showing register");
  await waitUntil(seg("show-register").startSec);
  await sleep(2000);

  // --- CUSTOMER SEARCH ---
  console.log("  [customer] Customer search");
  await waitUntil(seg("customer").startSec);
  await cursorClick("[data-tour='customer-search'] input");
  await sleep(300);
  ab(`keyboard type "alice"`);
  await sleep(800);
  await cursorClick("[data-tour='customer-search'] button >> nth=1");
  await sleep(800);
  await cursorClick("[data-tour='customer-search'] button[title='View customer details']");
  await sleep(1500);
  await cursorClick("button:has-text('Close')");
  await sleep(800);

  // --- SEARCH & ADD SIMPLE PRODUCT ---
  console.log("  [search-add] Adding product");
  await waitUntil(seg("search-add").startSec);
  await cursorClick("[data-tour='product-search'] input");
  await sleep(300);
  ab(`keyboard type "blue"`);
  await sleep(1000);
  await cursorClick("[data-product-type='simple'][data-in-stock='true']:first-of-type");
  await sleep(1000);
  await cursorClick("[data-tour='product-search'] input");
  await sleep(200);
  ab(`press "Control+a"`);
  ab(`press "Backspace"`);
  await sleep(800);

  // --- WEIGHT PRODUCT ---
  console.log("  [weight-product] Weight product");
  await waitUntil(seg("weight-product").startSec);
  await cursorClick("[data-tour='product-search'] input");
  await sleep(200);
  ab(`keyboard type "pink"`);
  await sleep(1000);
  await cursorClick("[data-product-type='weight'][data-in-stock='true']:has-text('Hybrid')");
  await sleep(1200);
  await cursorClick("[data-tour='weight-modal'] .weight-preset-btn >> nth=0");
  await sleep(1200);
  await cursorClick("[data-tour='product-search'] input");
  await sleep(200);
  ab(`press "Control+a"`);
  ab(`press "Backspace"`);
  await sleep(800);

  // --- VARIATION PRODUCT ---
  console.log("  [variation-product] Variation product");
  await waitUntil(seg("variation-product").startSec);
  await cursorClick("[data-product-type='variations'][data-in-stock='true'] >> nth=0");
  await sleep(1200);
  await cursorClick("[data-tour='variation-modal'] .variation-option-default >> nth=0");
  await sleep(600);
  await cursorClick("[data-tour='variation-modal'] .btn-primary");
  await sleep(1200);

  // --- DISCOUNT ---
  console.log("  [discount] Applying discount");
  await waitUntil(seg("discount").startSec);
  await cursorClick("[data-tour='discount-btn']");
  await sleep(800);
  await cursorClick("[data-tour='discount-modal'] .grid.grid-cols-5 button:nth-child(2)");
  await sleep(600);
  await cursorClick("[data-tour='discount-modal'] button.btn-primary");
  await sleep(1000);

  // --- PAYMENT ---
  console.log("  [payment] Cash payment");
  await waitUntil(seg("payment").startSec);
  await cursorClick("[data-tour='tender-buttons'] button.btn-primary:first-child");
  await sleep(1500);
  await sleep(1000);
  await cursorClick("[data-tour='cash-modal'] button.btn-primary");
  await sleep(2000);

  // --- OUTRO ---
  console.log("  [outro] Wrapping up");
  await waitUntil(seg("outro").endSec + 1.5);
}
