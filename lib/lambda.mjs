/**
 * Remotion Lambda rendering wrapper.
 *
 * Provides deploy (site + function) and render (with progress polling) in a
 * simple API that the CLI and MCP server can call.
 *
 * Required env vars:
 *   REMOTION_AWS_ACCESS_KEY_ID
 *   REMOTION_AWS_SECRET_ACCESS_KEY
 *   AWS_REGION (default: us-east-1)
 *
 * Usage:
 *   import { deploy, render, getStatus } from './lib/lambda.mjs';
 *
 *   const { serveUrl, functionName } = await deploy();
 *   const { outputUrl } = await render({ serveUrl, functionName, props });
 */

import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, writeFileSync, readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO_RENDER_DIR = resolve(__dirname, "../demo-render");
const ENTRY_POINT = join(DEMO_RENDER_DIR, "src/index.ts");
const STATE_FILE = resolve(__dirname, "../.lambda-state.json");

const DEFAULT_REGION = process.env.AWS_REGION || "us-east-1";
const SITE_NAME = "agent-video";
const MEMORY_MB = 2048;
const TIMEOUT_SEC = 120;
const DISK_MB = 2048;

/**
 * Check that AWS credentials are configured.
 */
export function checkCredentials() {
  const keyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
  const secret = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
  if (!keyId || !secret) {
    throw new Error(
      "Missing AWS credentials. Set REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY in .env"
    );
  }
  return { keyId, secret };
}

/**
 * Load saved Lambda state (serveUrl, functionName, etc.) from previous deploy.
 */
export function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Save Lambda state for reuse across commands.
 */
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Deploy the Remotion bundle to S3 and the Lambda function to AWS.
 *
 * @param {Object} options
 * @param {string} [options.region]
 * @param {number} [options.memory]
 * @param {number} [options.timeout]
 * @param {number} [options.disk]
 * @param {boolean} [options.verbose]
 * @returns {Promise<{ serveUrl: string, functionName: string, bucketName: string }>}
 */
export async function deploy(options = {}) {
  checkCredentials();

  const region = options.region || DEFAULT_REGION;
  const verbose = options.verbose || false;

  // Dynamic imports to avoid loading @remotion/lambda when not needed
  const { deploySite, getOrCreateBucket } = await import("@remotion/lambda");
  const { deployFunction } = await import("@remotion/lambda");

  console.log(`\n  [lambda] Deploying to ${region}...`);

  // Step 1: Get or create S3 bucket
  console.log("  [lambda] Getting/creating S3 bucket...");
  const { bucketName } = await getOrCreateBucket({ region });
  console.log(`  [lambda] Bucket: ${bucketName}`);

  // Step 2: Deploy site (bundle + upload)
  console.log("  [lambda] Bundling and uploading site...");
  const { serveUrl } = await deploySite({
    bucketName,
    entryPoint: ENTRY_POINT,
    region,
    siteName: SITE_NAME,
    options: {
      publicDir: join(DEMO_RENDER_DIR, "public"),
      enableCaching: true,
      rootDir: DEMO_RENDER_DIR,
      onBundleProgress: verbose
        ? (p) => process.stdout.write(`\r  [lambda] Bundle: ${p}%`)
        : undefined,
      onUploadProgress: verbose
        ? ({ filesUploaded, totalFiles }) =>
            process.stdout.write(`\r  [lambda] Upload: ${filesUploaded}/${totalFiles}`)
        : undefined,
    },
  });
  if (verbose) console.log(""); // newline after progress
  console.log(`  [lambda] Serve URL: ${serveUrl}`);

  // Step 3: Deploy Lambda function
  console.log("  [lambda] Deploying Lambda function...");
  const { functionName, alreadyExisted } = await deployFunction({
    region,
    timeoutInSeconds: options.timeout || TIMEOUT_SEC,
    memorySizeInMb: options.memory || MEMORY_MB,
    createCloudWatchLogGroup: true,
    diskSizeInMb: options.disk || DISK_MB,
  });
  console.log(
    `  [lambda] Function: ${functionName}${alreadyExisted ? " (reused)" : " (new)"}`
  );

  const state = { serveUrl, functionName, bucketName, region, deployedAt: new Date().toISOString() };
  saveState(state);
  console.log(`  [lambda] State saved to ${STATE_FILE}`);

  return state;
}

/**
 * Render a composition on Lambda with progress polling.
 *
 * @param {Object} options
 * @param {string} [options.serveUrl]       - From deploy() or saved state
 * @param {string} [options.functionName]   - From deploy() or saved state
 * @param {string} [options.composition]    - Composition ID (default: "Demo")
 * @param {Object} [options.props]          - Input props for the composition
 * @param {string} [options.codec]          - Video codec (default: "h264")
 * @param {number} [options.framesPerLambda] - Frames per chunk (default: 20)
 * @param {string} [options.region]
 * @param {boolean} [options.verbose]
 * @param {string} [options.outName]        - Custom output filename
 * @returns {Promise<{ outputUrl: string, duration: number, renderId: string }>}
 */
export async function render(options = {}) {
  checkCredentials();

  // Load saved state if serveUrl/functionName not provided
  const state = loadState();
  const serveUrl = options.serveUrl || state?.serveUrl;
  const functionName = options.functionName || state?.functionName;
  const region = options.region || state?.region || DEFAULT_REGION;

  if (!serveUrl || !functionName) {
    throw new Error(
      "No Lambda deployment found. Run `node cli.mjs lambda deploy` first, " +
      "or provide serveUrl and functionName."
    );
  }

  const composition = options.composition || "Demo";
  const codec = options.codec || "h264";
  const framesPerLambda = options.framesPerLambda || 20;
  const verbose = options.verbose || false;

  const { renderMediaOnLambda, getRenderProgress } = await import("@remotion/lambda/client");

  console.log(`\n  [lambda] Starting render: ${composition}`);
  console.log(`  [lambda] Function: ${functionName}`);
  console.log(`  [lambda] Frames per Lambda: ${framesPerLambda}`);

  const startTime = Date.now();

  // Start the render
  const { renderId, bucketName } = await renderMediaOnLambda({
    region,
    functionName,
    composition,
    serveUrl,
    codec,
    inputProps: options.props || {},
    framesPerLambda,
    imageFormat: "jpeg",
    jpegQuality: 85,
    maxRetries: 2,
    privacy: "public",
    outName: options.outName || undefined,
  });

  console.log(`  [lambda] Render started: ${renderId}`);

  // Poll for progress
  let lastProgress = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));

    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region,
    });

    const pct = Math.round((progress.overallProgress || 0) * 100);
    if (pct > lastProgress || verbose) {
      process.stdout.write(`\r  [lambda] Progress: ${pct}% (${progress.chunks || 0} chunks)`);
      lastProgress = pct;
    }

    if (progress.done) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n  [lambda] Render complete in ${elapsed}s`);
      console.log(`  [lambda] Output: ${progress.outputFile}`);
      console.log(`  [lambda] Time to finish: ${(progress.timeToFinish / 1000).toFixed(1)}s`);

      return {
        outputUrl: progress.outputFile,
        renderId,
        bucketName,
        duration: progress.timeToFinish / 1000,
      };
    }

    if (progress.fatalErrorEncountered) {
      const errMsg = progress.errors?.[0]?.message || "Unknown render error";
      throw new Error(`Lambda render failed: ${errMsg}`);
    }
  }
}

/**
 * Get the status/progress of an in-flight render.
 */
export async function getStatus(options) {
  checkCredentials();

  const state = loadState();
  const region = options.region || state?.region || DEFAULT_REGION;
  const functionName = options.functionName || state?.functionName;

  if (!functionName) {
    throw new Error("No Lambda deployment found.");
  }

  const { getRenderProgress } = await import("@remotion/lambda/client");

  return getRenderProgress({
    renderId: options.renderId,
    bucketName: options.bucketName,
    functionName,
    region,
  });
}

/**
 * Print the IAM policies needed for Lambda deployment.
 */
export async function printPolicies() {
  const { getUserPolicy } = await import("@remotion/lambda");
  console.log("\n=== IAM User Policy (attach to your AWS IAM user) ===\n");
  console.log(getUserPolicy());
  console.log("\nAlso run: npx remotion lambda policies role");
  console.log("to get the Lambda execution role policy.\n");
}

/**
 * List deployed functions.
 */
export async function listFunctions(options = {}) {
  checkCredentials();

  const region = options.region || DEFAULT_REGION;
  const { getFunctions } = await import("@remotion/lambda/client");

  return getFunctions({ region, compatibleOnly: true });
}
