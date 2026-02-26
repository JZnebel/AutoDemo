/**
 * Estimated action costs in milliseconds (from observed timings).
 * These are conservative estimates — real timings may be faster.
 */
export const ACTION_COSTS_MS = {
  cursorClick: 1200, // get box + eval move + transition + click pulse + actual click
  click: 200, // raw ab('click ...')
  type: 200, // per character of keyboard type
  sleep: 0, // variable — provided directly
  injectCursor: 500, // eval injection + settle
  waitForVisible: 0, // variable — excluded from budget
  press: 200, // keyboard shortcut
  eval: 300, // arbitrary eval
};

/**
 * Estimate the total action cost for a list of actions in a segment.
 *
 * Actions format: array of { type: string, ...params }
 *   - { type: "cursorClick" }
 *   - { type: "click" }
 *   - { type: "type", chars: 5 }
 *   - { type: "sleep", ms: 500 }
 *   - { type: "injectCursor" }
 *   - { type: "press" }
 *   - { type: "eval" }
 *
 * @param {Array<{type: string}>} actions
 * @returns {number} Estimated total milliseconds
 */
function estimateActionCost(actions) {
  let totalMs = 0;
  for (const action of actions) {
    if (action.type === "sleep") {
      totalMs += action.ms || 0;
    } else if (action.type === "type") {
      totalMs += (action.chars || 1) * ACTION_COSTS_MS.type;
    } else {
      totalMs += ACTION_COSTS_MS[action.type] || 300;
    }
  }
  return totalMs;
}

/**
 * Run a preflight budget check on a manifest's segments.
 * Compares estimated action time against narration duration for each segment.
 *
 * @param {Array<{action: string, text: string, durationSec?: number, actions?: Array}>} segments
 *   Each segment needs at minimum:
 *   - text: narration text
 *   - durationSec: narration duration (from TTS alignment)
 *   - actions: array of action descriptors for cost estimation
 *
 * @returns {{ ok: boolean, report: string, details: Array<{action: string, budgetSec: number, estimatedSec: number, overBy: number}> }}
 */
export function preflight(segments) {
  const details = [];
  let allOk = true;

  for (const seg of segments) {
    const budgetMs = (seg.durationSec || 0) * 1000;
    const actions = seg.actions || [];
    const estimatedMs = estimateActionCost(actions);
    const overByMs = estimatedMs - budgetMs;

    if (overByMs > 0) allOk = false;

    details.push({
      action: seg.action || seg.text?.substring(0, 40),
      budgetSec: +(budgetMs / 1000).toFixed(2),
      estimatedSec: +(estimatedMs / 1000).toFixed(2),
      overBy: overByMs > 0 ? +(overByMs / 1000).toFixed(2) : 0,
    });
  }

  const lines = details.map((d) => {
    const status = d.overBy > 0 ? `OVER by ${d.overBy}s` : "OK";
    return `  [${status}] ${d.action}: ${d.estimatedSec}s actions / ${d.budgetSec}s budget`;
  });

  const report = [
    `Timeline Budget Check: ${allOk ? "PASS" : "FAIL"}`,
    `${details.length} segments checked`,
    "",
    ...lines,
  ].join("\n");

  return { ok: allOk, report, details };
}
