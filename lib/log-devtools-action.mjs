#!/usr/bin/env node

/**
 * Claude Code PostToolUse hook logger.
 *
 * Appends a JSONL entry to walkthrough.jsonl for every Chrome DevTools MCP
 * action. Captures rich context including element bounding boxes (via CDP)
 * for downstream Remotion rendering with cursor animation and zoom effects.
 *
 * Configure in .claude/settings.json:
 *
 *   {
 *     "hooks": {
 *       "PostToolUse": [{
 *         "matcher": "mcp__chrome-devtools__",
 *         "hooks": [{ "type": "command", "command": "WALKTHROUGH_LOG=test-scout/walkthrough.jsonl WALKTHROUGH_SESSION=scout-demo node lib/log-devtools-action.mjs" }]
 *       }]
 *     }
 *   }
 *
 * Custom env vars:
 *   WALKTHROUGH_LOG     - Path to JSONL output (default: ./walkthrough.jsonl)
 *   WALKTHROUGH_SESSION - Session name (for grouping across pages)
 *   CDP_PORT            - Chrome DevTools Protocol port (default: 9333)
 */

import { appendFileSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

const LOG_FILE = process.env.WALKTHROUGH_LOG || join(process.cwd(), "walkthrough.jsonl");
const SESSION = process.env.WALKTHROUGH_SESSION || `scout-${new Date().toISOString().split("T")[0]}`;

// Track sequence number across invocations via a sidecar file
const SEQ_FILE = LOG_FILE + ".seq";
let seq = 0;
try {
  if (existsSync(SEQ_FILE)) {
    seq = parseInt(readFileSync(SEQ_FILE, "utf8").trim(), 10) || 0;
  }
} catch { /* start at 0 */ }
seq++;
writeFileSync(SEQ_FILE, String(seq));

// Claude Code pipes hook data as JSON via stdin:
// { tool_name, tool_input, tool_response, session_id, hook_event_name, ... }
let hookData = {};
try {
  const stdinData = await new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf));
    setTimeout(() => resolve(buf), 500);
  });
  if (stdinData) hookData = JSON.parse(stdinData);
} catch { /* stdin not available or not JSON */ }

const toolName = hookData.tool_name || process.env.CLAUDE_TOOL_NAME || "unknown";
const input = hookData.tool_input || safeParseJson(process.env.CLAUDE_TOOL_INPUT || "{}");
const toolResult = hookData.tool_response
  ? JSON.stringify(hookData.tool_response)
  : (process.env.CLAUDE_TOOL_RESULT || "");
const result = hookData.tool_response || safeParseJson(toolResult);

// Derive simplified action type from tool name
const action = toolName
  .replace("mcp__chrome-devtools__", "")
  .replace(/_/g, "-");

// Extract rich context from input and result
const context = extractContext(action, input, result);

// ── Resolve element bounds via CDP ──────────────────────────────────
// For click/fill/hover actions with a UID, connect to Chrome's CDP
// and get the element's bounding rectangle. This is critical for
// cursor animation and zoom effects in ScoutReplay.
if (context.uid && ["click", "fill", "hover", "fill-form"].includes(action)) {
  try {
    const bounds = await resolveUidBounds(context.uid);
    if (bounds) context.bounds = bounds;
  } catch { /* CDP unavailable — bounds will be null */ }
}

// ── Cache snapshot text for UID→bounds resolution ───────────────────
// When take-snapshot runs, save the full result text so that subsequent
// click/fill actions can look up the UID's role and accessible name.
if (action === "take-snapshot" && typeof toolResult === "string") {
  try {
    writeFileSync(LOG_FILE + ".snapshot", toolResult);
  } catch { /* ignore */ }
}

// ── Screenshot capture ───────────────────────────────────────────────
// When the tool is take_screenshot, record the file path.
// If the tool wrote to a filePath, capture that. Otherwise, note the seq
// so downstream scripts can correlate screenshots.
const SCREENSHOTS_DIR = join(dirname(LOG_FILE), "screenshots");

if (action === "take-screenshot") {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  if (input?.filePath) {
    // Claude specified where to save the screenshot
    context.screenshotPath = input.filePath;
  } else {
    // Screenshot returned inline — save a reference for downstream tools
    // The actual file will be at screenshots/seq-{N}.png when the scout
    // process is instructed to save screenshots to the screenshots/ dir
    const seqPath = `screenshots/seq-${String(seq).padStart(3, "0")}.png`;
    context.screenshotPath = seqPath;
    context.screenshotInline = true; // Indicates no file was saved by the tool
  }
}

// For other actions (click, fill, navigate), note which screenshot seq
// to reference for "before" state. Downstream props builder uses this
// to pair screenshots with actions.
if (action !== "take-screenshot" && action !== "take-snapshot") {
  context.nearestScreenshotSeq = seq;
}

const entry = {
  ts: new Date().toISOString(),
  seq,
  session: SESSION,
  tool: toolName,
  action,
  input: typeof input === "object" ? input : {},
  context,
  resultPreview: typeof toolResult === "string"
    ? toolResult.substring(0, action === "take-snapshot" ? 20000 : 1000)
    : JSON.stringify(toolResult).substring(0, action === "take-snapshot" ? 20000 : 1000),
};

appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resolve a Chrome DevTools MCP UID to pixel bounds via CDP WebSocket.
 *
 * Strategy:
 * 1. Read the cached snapshot text (saved by the most recent take-snapshot)
 * 2. Parse the UID line to get the element's accessible name and role
 * 3. Connect to Chrome via CDP on the debug port
 * 4. Use Accessibility.queryAXTree to find the node by name/role
 * 5. Use DOM.getBoxModel on the backing DOM node to get pixel bounds
 *
 * Falls back to the focused element if accessibility lookup fails.
 */
async function resolveUidBounds(uid) {
  const CDP_PORT = parseInt(process.env.CDP_PORT || "9333");

  // Step 1: Parse the cached snapshot to find role + label for this UID
  const snapshotFile = LOG_FILE + ".snapshot";
  let uidRole = null, uidLabel = null;
  try {
    if (existsSync(snapshotFile)) {
      const snapshot = readFileSync(snapshotFile, "utf8");
      // Snapshot format: uid=1_90 heading "Pink Kush" level="3"
      // or: uid=4_21 button "CASH" focusable focused
      // Handle both raw text and JSON-escaped text (\\\" vs \")
      const uidEsc = uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rawMatch = snapshot.match(new RegExp(`uid=${uidEsc}\\s+(\\w+)\\s+"([^"]*)"`, "m"));
      const escMatch = snapshot.match(new RegExp(`uid=${uidEsc}\\\\?\\s+(\\w+)\\s+\\\\"([^\\\\]*)\\\\"`, "m"));
      const match = rawMatch || escMatch;
      if (match) {
        uidRole = match[1];
        uidLabel = match[2];
      }
    }
  } catch { /* snapshot not available */ }

  // Step 2: Get Chrome debug targets
  const http = await import("http");
  const targets = await new Promise((resolve, reject) => {
    const req = http.default.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error("Bad CDP JSON")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(1000, () => { req.destroy(); reject(new Error("CDP timeout")); });
  });

  const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) return null;

  // Step 3: Connect via WebSocket and resolve bounds
  const { WebSocket } = await import("ws");

  return new Promise((resolve) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    const timeout = setTimeout(() => { try { ws.close(); } catch {} resolve(null); }, 3000);
    let msgId = 1;

    ws.on("open", () => {
      // Safely JSON-encode the label for use in the JS expression
      const safeLabel = uidLabel ? JSON.stringify(uidLabel) : "null";
      const findExpr = `(() => {
        const label = ${safeLabel};
        if (label) {
          // Try aria-label match
          const byAria = document.querySelectorAll('[aria-label]');
          for (const el of byAria) {
            if (el.getAttribute('aria-label') === label) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0)
                return JSON.stringify({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) });
            }
          }
          // Try text content match on interactive elements
          const els = document.querySelectorAll('button, a, input, select, textarea, [role], h1, h2, h3, h4, h5, h6, label, [tabindex]');
          for (const el of els) {
            const text = (el.textContent || '').trim();
            if (text === label || text.startsWith(label)) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0)
                return JSON.stringify({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) });
            }
          }
        }
        // Fallback: focused element
        const f = document.activeElement;
        if (f && f !== document.body && f !== document.documentElement) {
          const rect = f.getBoundingClientRect();
          if (rect.width > 0)
            return JSON.stringify({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) });
        }
        return null;
      })()`;

      ws.send(JSON.stringify({
        id: msgId++,
        method: "Runtime.evaluate",
        params: { expression: findExpr, returnByValue: true },
      }));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id) {
          clearTimeout(timeout);
          ws.close();
          const val = msg.result?.result?.value;
          resolve(val ? JSON.parse(val) : null);
        }
      } catch { /* ignore */ }
    });

    ws.on("error", () => { clearTimeout(timeout); resolve(null); });
  });
}

function extractContext(action, input, result) {
  const ctx = {};

  // Target element UID (used by click, fill, hover, etc.)
  if (input?.uid) {
    ctx.uid = input.uid;
  }

  // Fill value
  if (action === "fill" && input?.value !== undefined) {
    ctx.fillValue = input.value;
  }

  // Navigation URL
  if (action === "navigate-page" && input?.url) {
    ctx.navigateUrl = input.url;
    ctx.navigationType = input.type || "url";
  }

  // Key press
  if (action === "press-key" && input?.key) {
    ctx.key = input.key;
  }

  // Try to extract page info from result
  if (typeof result === "object" && result !== null) {
    if (result.url) ctx.url = result.url;
    if (result.title) ctx.pageTitle = result.title;
  }

  // Try to extract element info from snapshot data in result
  if (typeof toolResult === "string") {
    // Look for bounds/box info in result text
    const boundsMatch = toolResult.match(/"bounds":\s*\{([^}]+)\}/);
    if (boundsMatch) {
      try {
        ctx.bounds = JSON.parse(`{${boundsMatch[1]}}`);
      } catch { /* ignore parse failures */ }
    }

    // Look for accessibility info near the UID in the tool result
    if (ctx.uid) {
      // Snapshot format: uid=1_90 heading "Pink Kush" level="3"
      const uidEscaped = ctx.uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const uidPattern = new RegExp(`uid=${uidEscaped}\\s+(\\w+)\\s+"([^"]*)"`, "m");
      const uidMatch = toolResult.match(uidPattern);
      if (uidMatch) {
        ctx.uidRole = uidMatch[1];
        ctx.uidLabel = uidMatch[2];
      }
    }

    // If no label found in tool result, check the cached snapshot
    if (ctx.uid && !ctx.uidLabel) {
      try {
        const snapshotFile = LOG_FILE + ".snapshot";
        if (existsSync(snapshotFile)) {
          const snapshot = readFileSync(snapshotFile, "utf8");
          const uidEsc = ctx.uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const rawMatch = snapshot.match(new RegExp(`uid=${uidEsc}\\s+(\\w+)\\s+"([^"]*)"`, "m"));
          const escMatch = snapshot.match(new RegExp(`uid=${uidEsc}\\\\?\\s+(\\w+)\\s+\\\\"([^\\\\]*)\\\\"`, "m"));
          const match = rawMatch || escMatch;
          if (match) {
            ctx.uidRole = match[1];
            ctx.uidLabel = match[2];
          }
        }
      } catch { /* ignore */ }
    }

    // Look for page URL in snapshot header
    const urlMatch = toolResult.match(/url:\s*(https?:\/\/[^\s\n]+)/);
    if (urlMatch && !ctx.url) ctx.url = urlMatch[1];

    // Look for viewport dimensions
    const vpMatch = toolResult.match(/viewport:\s*(\d+)\s*x\s*(\d+)/i);
    if (vpMatch) {
      ctx.viewport = { w: parseInt(vpMatch[1]), h: parseInt(vpMatch[2]) };
    }
  }

  return ctx;
}

function safeParseJson(str) {
  if (!str) return {};
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
