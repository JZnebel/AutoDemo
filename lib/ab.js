import { execSync } from "child_process";

/**
 * Execute an agent-browser CLI command (synchronous).
 * Uses execSync intentionally — browser commands must block.
 *
 * @param {string} command - The agent-browser subcommand (e.g. 'click ".btn"')
 * @param {object} [options]
 * @param {number} [options.timeout=20000] - Command timeout in ms
 * @param {boolean} [options.quiet=false] - Suppress stdout logging
 * @returns {string} Trimmed stdout from the command
 */
export function ab(command, options = {}) {
  const fullCommand = `agent-browser ${command}`;
  if (!options.quiet) console.log(`  $ ${fullCommand}`);
  try {
    const result = execSync(fullCommand, {
      encoding: "utf-8",
      timeout: options.timeout || 20000,
    }).trim();
    if (
      result &&
      !options.quiet &&
      !command.startsWith("eval") &&
      !command.startsWith("mouse") &&
      !command.startsWith("get box")
    ) {
      console.log(`  -> ${result.substring(0, 200)}`);
    }
    return result;
  } catch (error) {
    console.error(`  WARN: ${error.message.substring(0, 120)}`);
    return "";
  }
}

/**
 * Promise-based delay.
 * @param {number} ms - Milliseconds to sleep
 */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
