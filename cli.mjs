#!/usr/bin/env node

/**
 * The older pipelines (screencast, marketing, stitch, avatar, lambda). For walkthrough clips
 * — record, check, finish, ship — use core/cli.mjs.
 *
 * Usage:
 *   node cli.mjs screencast <recording> [timeline] Screencast → edit → narrate → render
 *   node cli.mjs render <recording-dir>          Run Remotion post-production pipeline
 *   node cli.mjs marketing <recording-dir>       MarketingDemo pipeline
 *   node cli.mjs stitch --parts <files> --output <out>
 *   node cli.mjs providers                       List available TTS/service providers
 *   node cli.mjs preview                         Start Remotion Studio for live preview
 *
 * Flags:
 *   --preset <draft|production|offline>  Service quality preset
 *   --tts <elevenlabs|edge|kokoro>       TTS provider override
 *   --format <landscape|vertical|square|all>  Output format(s)
 *   --render-only                        Skip recording, just re-render with existing props
 *   --props <props.json>                 Use existing props file
 *   --no-verify                          Skip 35-point render verification
 *   --no-mux                             Skip Mux upload
 *   --whisper-model <model>              Whisper model (default: medium.en)
 *   --output <dir>                       Output directory
 *   --verbose                            Verbose logging
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join, dirname, resolve, basename } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FPS = 30;

// Load .env so API keys (ANTHROPIC, ELEVENLABS, etc.) are available
dotenv.config({ path: join(__dirname, ".env") });

// ═══════════════════════════════════════════════════════════════════════
// Parse CLI args
// ═══════════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const command = args[0];
const positional = args.filter((a) => !a.startsWith("--"));
const flags = parseFlags(args);

const PRESETS = {
  draft: { tts: "edge", whisperModel: "base.en", mux: false, verify: false, avatar: "none" },
  production: { tts: "elevenlabs", whisperModel: "medium.en", mux: true, verify: true, avatar: "sadtalker", renderer: "local" },
  offline: { tts: "kokoro", whisperModel: "base.en", mux: false, verify: false, avatar: "none" },
};

const preset = PRESETS[flags.preset] || {};
const config = {
  tts: flags.tts || preset.tts || process.env.TTS_PROVIDER || "edge",
  whisperModel: flags["whisper-model"] || preset.whisperModel || process.env.WHISPER_MODEL || "medium.en",
  avatar: flags.avatar || preset.avatar || process.env.AVATAR_PROVIDER || "none",
  avatarImage: flags["avatar-image"] || process.env.AVATAR_IMAGE || null,
  mux: flags.mux !== "false" && preset.mux !== false,
  verify: flags.verify !== "false" && preset.verify !== false,
  format: flags.format || "landscape",
  output: flags.output || join(__dirname, "final-output"),
  verbose: flags.verbose === "true" || flags.verbose === "",
  renderOnly: flags["render-only"] === "true" || flags["render-only"] === "",
  props: flags.props || null,
  noMux: flags["no-mux"] === "true" || flags["no-mux"] === "",
  noVerify: flags["no-verify"] === "true" || flags["no-verify"] === "",
  renderer: flags.renderer || preset.renderer || process.env.RENDERER || "local",
};

if (config.noMux) config.mux = false;
if (config.noVerify) config.verify = false;

// Set env vars for downstream modules
process.env.TTS_PROVIDER = config.tts;
process.env.WHISPER_MODEL = config.whisperModel;
process.env.AVATAR_PROVIDER = config.avatar;
if (config.avatarImage) process.env.AVATAR_IMAGE = config.avatarImage;
if (config.verbose) process.env.VERBOSE = "true";

// ═══════════════════════════════════════════════════════════════════════
// Commands
// ═══════════════════════════════════════════════════════════════════════

switch (command) {
  case "render":
    await cmdRender(positional[1]);
    break;

  case "avatar":
    await cmdAvatar(positional[1], positional[2]);
    break;

  case "lambda":
    await cmdLambda(positional[1]);
    break;

  case "providers":
    cmdProviders();
    break;

  case "marketing":
    await cmdMarketing(positional[1]);
    break;

  case "stitch":
    await cmdStitch();
    break;

  case "screencast":
    await cmdScreencast(positional[1], positional[2]);
    break;

  case "preview":
    cmdPreview();
    break;

  case "help":
  case "--help":
  case "-h":
  case undefined:
    printHelp();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════
// Command implementations
// ═══════════════════════════════════════════════════════════════════════

async function cmdRender(recordingDir) {
  if (!recordingDir) {
    console.error("Usage: node cli.mjs render <recording-dir>");
    process.exit(1);
  }

  const absDir = resolve(recordingDir);
  console.log(`\n=== RENDER: ${absDir} ===\n`);

  const demoRenderDir = join(__dirname, "demo-render");

  // Determine which pipeline to use based on content
  const isAdmin = existsSync(join(absDir, "admin-output.mp4")) ||
                  absDir.includes("admin");
  const pipelineScript = isAdmin ? "pipeline-admin.mjs" : "pipeline.mjs";

  console.log(`Using pipeline: ${pipelineScript}`);

  // If custom props provided, copy them
  if (config.props) {
    const propsPath = join(demoRenderDir, "props.json");
    copyFileSync(resolve(config.props), propsPath);
    console.log(`Using custom props: ${config.props}`);
  }

  // Run the local pipeline (steps 1-6: copy, probe, whisper, segments, props)
  // This always runs locally to generate props.json
  const result = spawnSync("node", [join(demoRenderDir, pipelineScript), absDir], {
    stdio: "inherit",
    cwd: demoRenderDir,
    timeout: 600000,
    env: {
      ...process.env,
      WHISPER_MODEL: config.whisperModel,
      // When using Lambda renderer, tell pipeline to stop before local Remotion render
      SKIP_LOCAL_RENDER: config.renderer === "lambda" ? "true" : "",
    },
  });

  if (result.status !== 0 && config.renderer !== "lambda") {
    console.error("Render failed");
    process.exit(1);
  }

  // If Lambda renderer requested, do the Remotion render on Lambda
  if (config.renderer === "lambda") {
    const propsFilePath = join(demoRenderDir, "props.json");
    if (!existsSync(propsFilePath)) {
      console.error("No props.json found — pipeline must generate it first");
      process.exit(1);
    }

    console.log("\n=== LAMBDA RENDER ===\n");
    const { render: lambdaRender } = await import("./lib/lambda.mjs");
    const inputProps = JSON.parse(readFileSync(propsFilePath, "utf8"));

    const lambdaResult = await lambdaRender({
      composition: "Demo",
      props: inputProps,
      verbose: config.verbose,
    });

    // Download the result
    const outPath = join(demoRenderDir, "out", "demo-marketing.mp4");
    mkdirSync(join(demoRenderDir, "out"), { recursive: true });
    console.log(`  Downloading Lambda output to ${outPath}...`);
    execSync(`curl -sL "${lambdaResult.outputUrl}" -o "${outPath}"`);
    console.log(`  Downloaded: ${outPath}`);
  }

  // Multi-format export if requested
  if (config.format === "all" || config.format === "vertical" || config.format === "square") {
    await multiFormatExport(demoRenderDir, config.format);
  }

  console.log(`\n=== RENDER DONE ===`);
}

async function cmdLambda(subcommand) {
  const { deploy, render, printPolicies, listFunctions, loadState } = await import("./lib/lambda.mjs");

  switch (subcommand) {
    case "deploy": {
      console.log("\n=== LAMBDA DEPLOY ===\n");
      const result = await deploy({
        region: flags.region,
        memory: flags.memory ? parseInt(flags.memory) : undefined,
        timeout: flags.timeout ? parseInt(flags.timeout) : undefined,
        disk: flags.disk ? parseInt(flags.disk) : undefined,
        verbose: config.verbose,
      });
      console.log(`\n=== DEPLOY COMPLETE ===`);
      console.log(`  Region: ${result.region}`);
      console.log(`  Bucket: ${result.bucketName}`);
      console.log(`  Function: ${result.functionName}`);
      console.log(`  Serve URL: ${result.serveUrl}`);
      console.log(`\n  Render with: node cli.mjs render <dir> --renderer lambda`);
      break;
    }

    case "render": {
      const propsPath = positional[2] || flags.props;
      let inputProps = {};
      if (propsPath) {
        inputProps = JSON.parse(readFileSync(resolve(propsPath), "utf8"));
      }

      console.log("\n=== LAMBDA RENDER ===\n");
      const result = await render({
        composition: flags.composition || "Demo",
        props: inputProps,
        codec: flags.codec || "h264",
        framesPerLambda: flags["frames-per-lambda"] ? parseInt(flags["frames-per-lambda"]) : 20,
        verbose: config.verbose,
        outName: flags["out-name"],
      });
      console.log(`\n=== RENDER COMPLETE ===`);
      console.log(`  Output URL: ${result.outputUrl}`);
      console.log(`  Render time: ${result.duration.toFixed(1)}s`);

      // Download to local output if requested
      if (!flags["no-download"]) {
        const outPath = join(config.output, "demo-marketing-lambda.mp4");
        mkdirSync(config.output, { recursive: true });
        console.log(`  Downloading to ${outPath}...`);
        execSync(`curl -sL "${result.outputUrl}" -o "${outPath}"`);
        console.log(`  Downloaded: ${outPath}`);
      }
      break;
    }

    case "status": {
      const state = loadState();
      if (!state) {
        console.log("No Lambda deployment found. Run: node cli.mjs lambda deploy");
      } else {
        console.log("\n=== LAMBDA STATUS ===\n");
        console.log(`  Region: ${state.region}`);
        console.log(`  Bucket: ${state.bucketName}`);
        console.log(`  Function: ${state.functionName}`);
        console.log(`  Serve URL: ${state.serveUrl}`);
        console.log(`  Deployed at: ${state.deployedAt}`);
      }
      break;
    }

    case "functions": {
      const fns = await listFunctions({ region: flags.region });
      console.log("\n=== DEPLOYED FUNCTIONS ===\n");
      for (const fn of fns) {
        console.log(`  ${fn.functionName} (${fn.memorySizeInMb}MB, ${fn.timeoutInSeconds}s)`);
      }
      if (fns.length === 0) console.log("  (none found)");
      break;
    }

    case "policies": {
      await printPolicies();
      break;
    }

    default:
      console.log(`
Lambda subcommands:
  lambda deploy       Deploy site to S3 + Lambda function
  lambda render       Render a composition on Lambda
  lambda status       Show current deployment info
  lambda functions    List deployed Lambda functions
  lambda policies     Print required IAM policies

Flags for deploy:
  --region <region>   AWS region (default: us-east-1)
  --memory <mb>       Lambda memory (default: 2048)
  --timeout <sec>     Lambda timeout (default: 120)
  --disk <mb>         Disk size (default: 2048)
  --verbose           Show progress

Flags for render:
  --composition <id>  Composition name (default: Demo)
  --props <file>      Props JSON file
  --codec <codec>     Video codec (default: h264)
  --frames-per-lambda <n>  Frames per chunk (default: 20)
  --no-download       Don't download result locally
`);
  }
}

async function cmdAvatar(imagePath, audioPath) {
  if (!imagePath || !audioPath) {
    console.error("Usage: node cli.mjs avatar <image.png> <narration.mp3>");
    console.error("       node cli.mjs avatar <image.png> <narration.mp3> --avatar sadtalker");
    process.exit(1);
  }

  const { generateAvatar, copyToPublic } = await import("./lib/avatar/index.js");

  console.log(`\n=== AVATAR GENERATION (provider: ${config.avatar}) ===\n`);

  const result = await generateAvatar({
    image: resolve(imagePath),
    audio: resolve(audioPath),
    provider: config.avatar === "none" ? "sadtalker" : config.avatar,
    verbose: config.verbose,
  });

  if (result.videoPath) {
    const publicPath = copyToPublic(result.videoPath);
    console.log(`\n=== AVATAR DONE ===`);
    console.log(`  Video: ${result.videoPath}`);
    console.log(`  Duration: ${result.duration.toFixed(1)}s`);
    console.log(`  Copied to: ${publicPath}`);
    console.log(`  AvatarPip.tsx will now use this file via staticFile("avatar.mp4")`);
  } else {
    console.log("  No avatar generated.");
  }

  return result;
}

async function cmdMarketing(recordingDir) {
  if (!recordingDir) {
    console.error("Usage: node cli.mjs marketing <recording-dir>");
    console.error("       node cli.mjs marketing <recording-dir> --markers <markers.json> --name <name>");
    process.exit(1);
  }

  const scriptArgs = [join(__dirname, "scripts/marketing-pipeline.mjs"), recordingDir];

  // Forward relevant flags
  if (flags.markers) scriptArgs.push("--markers", flags.markers);
  if (flags.name) scriptArgs.push("--name", flags.name);
  if (flags.preset) scriptArgs.push("--preset", flags.preset);
  if (flags["skip-h265"]) scriptArgs.push("--skip-h265");
  if (config.noVerify) scriptArgs.push("--no-verify");
  if (flags["no-presenter"]) scriptArgs.push("--no-presenter");
  scriptArgs.push("--whisper-model", config.whisperModel);

  const result = spawnSync("node", scriptArgs, {
    stdio: "inherit",
    cwd: __dirname,
    timeout: 900000,
    env: { ...process.env, WHISPER_MODEL: config.whisperModel },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function cmdStitch() {
  // Forward all args to stitch.mjs (it handles its own parsing)
  const scriptArgs = [join(__dirname, "scripts/stitch.mjs"), ...args.slice(1)];

  const result = spawnSync("node", scriptArgs, {
    stdio: "inherit",
    cwd: __dirname,
    timeout: 900000,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

async function cmdScreencast(recording, timeline) {
  // Forward all args to screencast-pipeline.mjs
  const scriptArgs = [join(__dirname, "scripts/screencast-pipeline.mjs")];
  if (recording) scriptArgs.push(recording);
  if (timeline) scriptArgs.push(timeline);

  // Forward flags
  for (const [key, val] of Object.entries(flags)) {
    if (val === true) scriptArgs.push(`--${key}`);
    else if (val !== false && val !== undefined) scriptArgs.push(`--${key}`, String(val));
  }

  const result = spawnSync("node", scriptArgs, {
    stdio: "inherit",
    cwd: __dirname,
    timeout: 900000,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function cmdProviders() {
  console.log("\n=== Available Providers ===\n");

  console.log("TTS (Text-to-Speech):");
  console.log("  elevenlabs   Premium quality, character-level timestamps, voice cloning");
  console.log("               Requires: ELEVENLABS_API_KEY");
  console.log("  edge         Free, 100+ Microsoft voices, good quality");
  console.log("               Requires: nothing (uses edge-tts CLI)");
  console.log("  kokoro       Free, local open-weight model, zero network");
  console.log("               Requires: pip install kokoro-onnx");

  console.log("\nAvatar (Talking Head):");
  console.log("  sadtalker    Local GPU, single image → talking head video");
  console.log("               Requires: SadTalker/ with venv + checkpoints + CUDA GPU");
  console.log("  liveportrait Local GPU, newer architecture (coming soon)");
  console.log("  echomimic    Local GPU, multi-modal (coming soon)");
  console.log("  none         Skip avatar generation (default)");

  console.log("\nTranscription:");
  console.log("  whisper.cpp  Local, via @remotion/install-whisper-cpp");
  console.log("               Models: tiny.en, base.en, small.en, medium.en, large-v3");
  console.log("               Default: medium.en (best accuracy/speed tradeoff)");

  console.log("\nVideo Hosting:");
  console.log("  mux          Adaptive streaming, analytics, shareable URLs");
  console.log("               Requires: MUX_TOKEN_ID, MUX_TOKEN_SECRET");
  console.log("  local        Just output to final-output/ directory");

  console.log("\nRendering:");
  console.log("  local        Default — renders on this machine with npx remotion render");
  console.log("  lambda       AWS Lambda — distributed rendering (3-200 concurrent functions)");
  console.log("               Requires: REMOTION_AWS_ACCESS_KEY_ID, REMOTION_AWS_SECRET_ACCESS_KEY");
  console.log("               Deploy first: node cli.mjs lambda deploy");

  console.log("\nPresets:");
  console.log("  --preset draft       edge-tts, no avatar, base.en whisper, no mux, local render");
  console.log("  --preset production  elevenlabs, sadtalker avatar, medium.en whisper, mux, local render");
  console.log("  --preset offline     kokoro (local), no avatar, base.en whisper, no network");
  console.log("");
}

function cmdPreview() {
  console.log("Starting Remotion Studio...\n");
  const demoRenderDir = join(__dirname, "demo-render");
  spawnSync("npx", ["remotion", "studio"], {
    stdio: "inherit",
    cwd: demoRenderDir,
  });
}

async function multiFormatExport(demoRenderDir, format) {
  const formats = format === "all"
    ? ["vertical", "square"]
    : [format];

  const baseOutput = join(demoRenderDir, "out", "demo-marketing.mp4");
  if (!existsSync(baseOutput)) {
    console.log("  Skipping multi-format (no base render found)");
    return;
  }

  for (const fmt of formats) {
    const { w, h, crop } = getFormatDimensions(fmt);
    const outPath = baseOutput.replace(".mp4", `-${fmt}.mp4`);

    console.log(`  Exporting ${fmt} (${w}x${h})...`);
    execSync(
      `ffmpeg -y -i "${baseOutput}" -vf "crop=${crop},scale=${w}:${h}" -c:v libx264 -preset fast -crf 22 -c:a copy "${outPath}" 2>/dev/null`
    );

    // Copy to final output
    const finalPath = join(config.output, `demo-marketing-${fmt}.mp4`);
    mkdirSync(config.output, { recursive: true });
    copyFileSync(outPath, finalPath);
    console.log(`    → ${finalPath}`);
  }
}

function getFormatDimensions(format) {
  switch (format) {
    case "vertical": // 9:16 (TikTok, Reels, Shorts)
      return { w: 1080, h: 1920, crop: "ih*9/16:ih" };
    case "square": // 1:1 (Instagram, LinkedIn)
      return { w: 1080, h: 1080, crop: "ih:ih" };
    default: // landscape 16:9
      return { w: 1920, h: 1080, crop: "iw:ih" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Audio-sync engine
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].replace(/^--/, "");
      if (key.includes("=")) {
        const [k, v] = key.split("=", 2);
        flags[k] = v;
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

function printHelp() {
  console.log(`
Legacy pipelines: screencast, marketing, pitch, stitch.
For walkthrough clips (record → check → finish → ship) use core/cli.mjs.

Commands:
  render <recording-dir>                Run Remotion post-production pipeline
  marketing <recording-dir>             MarketingDemo pipeline (presenter + lip sync + h265)
  screencast <recording> [timeline]     Screencast → edit → narrate → render
  stitch --parts <files> --output <out> Combine videos with transition cards
  avatar <image.png> <audio.mp3>        Generate talking head video
  lambda <deploy|render|status|...>     AWS Lambda deployment and rendering
  providers                             List available TTS/service providers
  preview                               Start Remotion Studio for live preview

Flags:
  --preset <draft|production|offline>       Service quality preset
  --tts <elevenlabs|edge|kokoro>            TTS provider
  --avatar <sadtalker|liveportrait|none>    Avatar provider (default: none)
  --avatar-image <path>                     Reference face image for avatar
  --renderer <local|lambda>                 Render engine (default: local)
  --format <landscape|vertical|square|all>  Output format(s)
  --whisper-model <model>                   Whisper model (default: medium.en)
  --props <props.json>                      Use existing Remotion props
  --output <dir>                            Output directory
  --no-verify                               Skip render verification
  --no-mux                                  Skip Mux upload
  --verbose                                 Verbose logging

Marketing flags:
  --markers <markers.json>                 Segment markers (phrase + labels + zoom)
  --name <string>                          Output filename stem
  --skip-h265                              Skip h265 optimization
  --no-presenter                           Disable presenter character

Stitch flags:
  --parts <file1> <file2> [...]            Input videos (2+)
  --output <path>                          Output path
  --transition-heading <text>              Transition card heading
  --transition-subtitle <text>             Transition card subtitle
  --transition-duration <sec>              Transition duration (default: 5)
  --crossfade-duration <sec>               Crossfade duration (default: 1.5)
  --outro-trim <sec>                       Trim from end of part 1 (default: 5)
  --intro-skip <sec>                       Skip from start of part 2 (default: 8)

Examples:
  # Just re-render with existing recording
  node cli.mjs render ~/Movies/agent-recordings/pos-demo-123

  # Export all formats
  node cli.mjs render ~/Movies/agent-recordings/pos-demo-123 --format all

  # Marketing pipeline (recording → finished video with presenter + lip sync)
  node cli.mjs marketing ~/Movies/agent-recordings/pos-demo-xxx \\
    --markers examples/pos-demo/register-markers.json --name brother-pos-register

  # Marketing pipeline (draft — skips h265 + verify)
  node cli.mjs marketing ~/Movies/agent-recordings/pos-demo-xxx --preset draft

  # Stitch two videos with a transition card
  node cli.mjs stitch \\
    --parts final-output/register.mp4 final-output/admin.mp4 \\
    --output final-output/full.mp4 \\
    --transition-heading "Admin Dashboard"

  # Preview in Remotion Studio
  node cli.mjs preview
`);
}
