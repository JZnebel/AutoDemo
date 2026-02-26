#!/usr/bin/env node

/**
 * Unified Agent Video CLI
 *
 * Single entry point for the entire pipeline:
 *   scout → manifest → TTS → record → Remotion post-production → verify
 *
 * Usage:
 *   node cli.mjs convert <walkthrough.jsonl>     Convert JSONL to manifest + Remotion props
 *   node cli.mjs tts <manifest.json>             Generate TTS audio for a manifest
 *   node cli.mjs record <manifest.json>          Record all scenes from a manifest
 *   node cli.mjs render <recording-dir>          Run Remotion post-production pipeline
 *   node cli.mjs full <walkthrough.jsonl>        Full pipeline: convert → tts → record → render
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
  case "convert":
    await cmdConvert(positional[1]);
    break;

  case "tts":
    await cmdTts(positional[1]);
    break;

  case "record":
    await cmdRecord(positional[1]);
    break;

  case "render":
    await cmdRender(positional[1]);
    break;

  case "full":
    await cmdFull(positional[1]);
    break;

  case "scout-to-video":
    await cmdScoutToVideo(positional[1], positional[2]);
    break;

  case "plan":
    await cmdPlan(positional[1]);
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

async function cmdConvert(jsonlPath) {
  if (!jsonlPath) {
    console.error("Usage: node cli.mjs convert <walkthrough.jsonl>");
    process.exit(1);
  }

  const absPath = resolve(jsonlPath);
  console.log(`\n=== CONVERT: ${basename(absPath)} ===\n`);

  // Run both converters
  const manifestPath = absPath.replace(/\.jsonl$/, "-manifest.json");
  const propsPath = absPath.replace(/\.jsonl$/, "-remotion-props.json");

  console.log("Generating recording manifest...");
  spawnSync("node", [join(__dirname, "scripts/jsonl-to-manifest.mjs"), absPath, manifestPath], {
    stdio: "inherit",
    cwd: __dirname,
  });

  console.log("\nGenerating Remotion props...");
  spawnSync("node", [join(__dirname, "scripts/jsonl-to-remotion-props.mjs"), absPath, propsPath], {
    stdio: "inherit",
    cwd: __dirname,
  });

  console.log(`\n=== CONVERT DONE ===`);
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`  Remotion props: ${propsPath}`);

  return { manifestPath, propsPath };
}

async function cmdTts(manifestPath) {
  if (!manifestPath) {
    console.error("Usage: node cli.mjs tts <manifest.json>");
    process.exit(1);
  }

  const absPath = resolve(manifestPath);
  const manifest = JSON.parse(readFileSync(absPath, "utf8"));
  const { generateSpeech } = await import("./lib/tts/index.js");

  console.log(`\n=== TTS GENERATION (provider: ${config.tts}) ===\n`);

  const outputDir = dirname(absPath);

  for (let i = 0; i < manifest.scenes.length; i++) {
    const scene = manifest.scenes[i];
    if (!scene.narration) {
      console.log(`  Scene ${i} (${scene.name}): no narration, skipping`);
      continue;
    }

    const text = Array.isArray(scene.narration)
      ? scene.narration.map((s) => s.text).join(" ")
      : scene.narration;

    // Skip auto-generate placeholders
    if (text.startsWith("[AUTO-GENERATE:")) {
      console.log(`  Scene ${i} (${scene.name}): placeholder narration — run with Claude to generate`);
      continue;
    }

    const audioPath = join(outputDir, `scene_${i}_${scene.name}.mp3`);
    console.log(`  Scene ${i} (${scene.name}): generating audio...`);

    const result = await generateSpeech(text, {
      provider: config.tts,
      outputPath: audioPath,
    });

    console.log(`    ${result.duration.toFixed(1)}s → ${audioPath}`);
  }

  console.log(`\n=== TTS DONE ===`);
}

async function cmdRecord(manifestPath) {
  if (!manifestPath) {
    console.error("Usage: node cli.mjs record <manifest.json>");
    process.exit(1);
  }

  console.log(`\n=== RECORD ===\n`);

  // Use the manifest runner from lib/run.mjs
  const { runManifest } = await import("./lib/run.mjs");
  const result = await runManifest(resolve(manifestPath));

  console.log(`\n=== RECORD DONE ===`);
  console.log(`  Output: ${result.finalPath}`);
  console.log(`  Session: ${result.sessionDir}`);

  return result;
}

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

async function cmdFull(jsonlPath) {
  if (!jsonlPath) {
    console.error("Usage: node cli.mjs full <walkthrough.jsonl>");
    process.exit(1);
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  FULL PIPELINE                           ║`);
  console.log(`║  Preset: ${(flags.preset || "custom").padEnd(30)} ║`);
  console.log(`║  TTS: ${config.tts.padEnd(33)} ║`);
  console.log(`║  Whisper: ${config.whisperModel.padEnd(29)} ║`);
  console.log(`║  Avatar: ${config.avatar.padEnd(30)} ║`);
  console.log(`║  Format: ${config.format.padEnd(30)} ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  // Step 1: Convert
  const { manifestPath, propsPath } = await cmdConvert(jsonlPath);

  // Step 2: TTS
  await cmdTts(manifestPath);

  // Step 3: Record
  const recordResult = await cmdRecord(manifestPath);

  // Step 4: Render
  await cmdRender(recordResult.sessionDir);

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  PIPELINE COMPLETE                       ║`);
  console.log(`╚══════════════════════════════════════════╝`);
}

async function cmdScoutToVideo(jsonlPath, screenshotsDir) {
  if (!jsonlPath) {
    console.error("Usage: node cli.mjs scout-to-video <walkthrough.jsonl> [screenshots-dir]");
    console.error("\nFully automated pipeline: JSONL + screenshots → narration → TTS → Remotion render");
    process.exit(1);
  }

  const absJsonl = resolve(jsonlPath);
  const absScreenshots = screenshotsDir
    ? resolve(screenshotsDir)
    : join(dirname(absJsonl), "screenshots");

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  SCOUT-TO-VIDEO PIPELINE                 ║`);
  console.log(`║  TTS: ${config.tts.padEnd(33)} ║`);
  console.log(`║  Whisper: ${config.whisperModel.padEnd(29)} ║`);
  console.log(`║  Format: ${config.format.padEnd(30)} ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);

  const demoRenderDir = join(__dirname, "demo-render");

  // ── Step 1: Generate ScoutReplay props from JSONL + screenshots ──
  console.log("=== STEP 1: Generate ScoutReplay props ===\n");
  const propsPath = join(demoRenderDir, "scout-replay-props.json");
  const propsResult = spawnSync("node", [
    join(__dirname, "scripts/jsonl-to-scout-props.mjs"),
    absJsonl,
    absScreenshots,
    propsPath,
  ], { stdio: "inherit", cwd: __dirname });

  if (propsResult.status !== 0) {
    console.error("Failed to generate ScoutReplay props");
    process.exit(1);
  }

  // ── Step 2: Generate narration text ──────────────────────────────
  console.log("\n=== STEP 2: Generate narration ===\n");
  const narrationPath = propsPath.replace(/\.json$/, "-narration.json");
  const narrationMode = process.env.ANTHROPIC_API_KEY ? "claude" : "template";
  const narrationResult = spawnSync("node", [
    join(__dirname, "scripts/generate-narration.mjs"),
    propsPath,
    narrationPath,
    `--mode`, narrationMode,
  ], { stdio: "inherit", cwd: __dirname });

  if (narrationResult.status !== 0) {
    console.error("Failed to generate narration");
    process.exit(1);
  }

  // ── Step 3: Generate TTS audio ───────────────────────────────────
  console.log("\n=== STEP 3: Generate TTS audio ===\n");
  const narration = JSON.parse(readFileSync(narrationPath, "utf8"));
  const audioPath = join(demoRenderDir, "public", "scout-narration.mp3");

  const { generateSpeech } = await import("./lib/tts/index.js");
  const ttsResult = await generateSpeech(narration.fullText, {
    provider: config.tts,
    outputPath: audioPath,
  });

  console.log(`  Audio: ${audioPath} (${ttsResult.duration.toFixed(1)}s)`);

  // ── Step 3b: Calculate per-segment timing from TTS alignment ────
  // Filter to scene segments only (skip intro/outro)
  const sceneSegments = (narration.segments || []).filter(
    (s) => s.scene !== "intro" && s.scene !== "outro"
  );

  let segmentTimings = null;
  if (config.tts === "elevenlabs" && ttsResult.raw?.charStartTimes?.length > 0) {
    // ElevenLabs provides character-level alignment — use it for precise segment timing
    const { calculateSegmentTimings } = await import("./lib/tts/elevenlabs.js");
    // Pass ALL segments (including intro/outro) for correct char offset calculation
    const allTimings = calculateSegmentTimings(
      narration.segments,
      ttsResult.raw.charStartTimes,
      ttsResult.raw.charEndTimes,
    );
    // Keep only scene segment timings (filter out intro/outro)
    segmentTimings = allTimings.filter(
      (s) => s.scene !== "intro" && s.scene !== "outro"
    );
    console.log(`  Segment timings (ElevenLabs alignment): ${segmentTimings.length} segments`);
  } else {
    // Fallback: proportional timing based on text length
    const totalChars = sceneSegments.reduce((sum, s) => sum + s.text.length, 0);
    const audioDuration = ttsResult.duration;
    let cursor = 0;
    segmentTimings = sceneSegments.map((seg) => {
      const fraction = seg.text.length / totalChars;
      const durationSec = audioDuration * fraction;
      const startSec = cursor;
      cursor += durationSec;
      return { ...seg, startSec, endSec: cursor, durationSec };
    });
    console.log(`  Segment timings (proportional fallback): ${segmentTimings.length} segments`);
  }

  // ── Step 4: Run Whisper for word-level timings ───────────────────
  console.log("\n=== STEP 4: Word-level transcription (Whisper) ===\n");
  try {
    const { transcribeAudio } = await import("./lib/whisper.mjs");
    const { wordTimings } = await transcribeAudio(audioPath, {
      model: config.whisperModel,
    });

    // Update props with word timings
    const currentProps = JSON.parse(readFileSync(propsPath, "utf8"));
    currentProps.wordTimings = wordTimings;
    currentProps.audioSrc = "scout-narration.mp3";

    // ── Sync scene durations + action timing to narration audio ──
    syncScenesToAudio(currentProps, narration, segmentTimings, wordTimings);

    writeFileSync(propsPath, JSON.stringify(currentProps, null, 2));
    console.log(`  Word timings: ${wordTimings.length} words`);
  } catch (e) {
    console.log(`  Whisper failed (${e.message}) — syncing with segment timings only`);
    const currentProps = JSON.parse(readFileSync(propsPath, "utf8"));
    currentProps.audioSrc = "scout-narration.mp3";

    // Still sync scene durations from segment timings even without Whisper
    syncScenesToAudio(currentProps, narration, segmentTimings, []);

    writeFileSync(propsPath, JSON.stringify(currentProps, null, 2));
  }

  // ── Step 5: Copy screenshots to Remotion public directory ────────
  console.log("\n=== STEP 5: Copy screenshots ===\n");
  const publicScreenshots = join(demoRenderDir, "public", "screenshots");
  mkdirSync(publicScreenshots, { recursive: true });

  if (existsSync(absScreenshots)) {
    const files = readdirSync(absScreenshots).filter((f) =>
      /\.(png|jpg|jpeg|webp)$/i.test(f)
    );
    for (const f of files) {
      copyFileSync(join(absScreenshots, f), join(publicScreenshots, f));
    }
    console.log(`  Copied ${files.length} screenshots to ${publicScreenshots}`);
  } else {
    console.log(`  No screenshots directory found at ${absScreenshots}`);
    console.log("  Render will fail unless screenshots are provided");
  }

  // ── Step 6: Render with Remotion (ScoutReplay composition) ───────
  console.log("\n=== STEP 6: Render video ===\n");

  const finalProps = JSON.parse(readFileSync(propsPath, "utf8"));
  // Strip _meta before passing to Remotion
  const { _meta, ...remotionProps } = finalProps;

  const renderPropsPath = join(demoRenderDir, "props.json");
  writeFileSync(renderPropsPath, JSON.stringify(remotionProps, null, 2));

  if (config.renderer === "lambda") {
    console.log("Rendering on Lambda...");
    const { render: lambdaRender } = await import("./lib/lambda.mjs");
    const lambdaResult = await lambdaRender({
      composition: "ScoutReplay",
      props: remotionProps,
      verbose: config.verbose,
    });

    const outPath = join(demoRenderDir, "out", "scout-replay.mp4");
    mkdirSync(join(demoRenderDir, "out"), { recursive: true });
    execSync(`curl -sL "${lambdaResult.outputUrl}" -o "${outPath}"`);
    console.log(`  Output: ${outPath}`);
  } else {
    const renderResult = spawnSync("npx", [
      "remotion", "render",
      "src/index.ts",
      "ScoutReplay",
      `--props=${renderPropsPath}`,
      "--output", "out/scout-replay.mp4",
    ], {
      stdio: "inherit",
      cwd: demoRenderDir,
      timeout: 600000,
    });

    if (renderResult.status !== 0) {
      console.error("Render failed");
      process.exit(1);
    }
  }

  // ── Step 7: Multi-format export ──────────────────────────────────
  if (config.format === "all" || config.format !== "landscape") {
    console.log("\n=== STEP 7: Multi-format export ===\n");
    await multiFormatExport(demoRenderDir, config.format);
  }

  // ── Step 8: Copy to final output ─────────────────────────────────
  const srcVideo = join(demoRenderDir, "out", "scout-replay.mp4");
  if (existsSync(srcVideo)) {
    mkdirSync(config.output, { recursive: true });
    const finalPath = join(config.output, "scout-replay.mp4");
    copyFileSync(srcVideo, finalPath);
    console.log(`\n  Final video: ${finalPath}`);
  }

  // ── Step 9: Optional Mux upload ──────────────────────────────────
  if (config.mux && !config.noMux) {
    console.log("\n=== Uploading to Mux ===\n");
    try {
      const { uploadToMux } = await import("./lib/mux.mjs");
      const muxResult = await uploadToMux(srcVideo);
      console.log(`  Mux playback: ${muxResult.playbackUrl}`);
    } catch (e) {
      console.log(`  Mux upload failed: ${e.message}`);
    }
  }

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  SCOUT-TO-VIDEO COMPLETE                 ║`);
  console.log(`╚══════════════════════════════════════════╝`);
}

async function cmdPlan(presetOrFlags) {
  console.log(`\n=== PLAN: Generate scout guide from knowledge base ===\n`);

  const configPath = join(__dirname, "demo.config.json");
  let demoConfig = {};
  if (existsSync(configPath)) {
    demoConfig = JSON.parse(readFileSync(configPath, "utf8"));
  }

  const plannerDir = join(__dirname, "lib", "planner");
  const catalogPath = join(plannerDir, "feature-catalog.json");
  const planPath = join(plannerDir, "demo-plan.json");
  const guidePath = join(plannerDir, "demo-plan-scout-guide.md");

  // Step 1: Build catalog from knowledge base (if not cached or --rebuild)
  const knowledgeBase = flags["docs-dir"] || demoConfig.knowledgeBase;
  if (!knowledgeBase) {
    console.error("No knowledge base found. Set knowledgeBase in demo.config.json or pass --docs-dir <path>");
    process.exit(1);
  }

  if (!existsSync(catalogPath) || flags.rebuild === "true" || flags.rebuild === "") {
    console.log("Step 1: Building feature catalog...");
    const buildResult = spawnSync("node", [
      join(plannerDir, "build-catalog.mjs"),
      "--docs-dir", knowledgeBase,
      "--output", catalogPath,
    ], { stdio: "inherit", cwd: __dirname });

    if (buildResult.status !== 0) {
      console.error("Failed to build feature catalog");
      process.exit(1);
    }
  } else {
    console.log("Step 1: Using cached feature catalog");
  }

  // Step 2: Generate plan
  console.log("\nStep 2: Generating demo plan...");
  const planArgs = [
    join(plannerDir, "generate-plan.mjs"),
    "--catalog", catalogPath,
    "--output", planPath,
  ];

  // Apply preset if provided as positional arg
  if (presetOrFlags && !presetOrFlags.startsWith("--")) {
    planArgs.push("--preset", presetOrFlags);
  }

  // Forward relevant flags
  if (flags.audience) planArgs.push("--audience", flags.audience);
  if (flags.duration) planArgs.push("--duration", flags.duration);
  if (flags.focus) planArgs.push("--focus", flags.focus);
  if (flags["max-scenes"]) planArgs.push("--max-scenes", flags["max-scenes"]);
  if (flags.include) planArgs.push("--include", flags.include);
  if (flags.exclude) planArgs.push("--exclude", flags.exclude);
  // If no audience/duration/preset specified, use demo.config.json defaults
  if (!presetOrFlags && !flags.audience && demoConfig.defaults?.audience) {
    planArgs.push("--audience", demoConfig.defaults.audience);
  }
  if (!flags.duration && demoConfig.defaults?.duration) {
    planArgs.push("--duration", String(demoConfig.defaults.duration));
  }

  const planResult = spawnSync("node", planArgs, { stdio: "inherit", cwd: __dirname });
  if (planResult.status !== 0) {
    console.error("Failed to generate demo plan");
    process.exit(1);
  }

  // Step 3: Convert plan to scout guide
  console.log("\nStep 3: Generating scout guide...");
  const guideResult = spawnSync("node", [
    join(plannerDir, "plan-to-scout-guide.mjs"),
    planPath,
    "--output", guidePath,
  ], { stdio: "inherit", cwd: __dirname });

  if (guideResult.status !== 0) {
    console.error("Failed to generate scout guide");
    process.exit(1);
  }

  console.log(`\n=== PLAN DONE ===`);
  console.log(`  Catalog:     ${catalogPath}`);
  console.log(`  Plan:        ${planPath}`);
  console.log(`  Scout guide: ${guidePath}`);
  console.log(`\n  Next: Use /demo to scout with this guide, or run manually:`);
  console.log(`    node cli.mjs scout-to-video walkthrough.jsonl screenshots/`);

  return { catalogPath, planPath, guidePath };
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

/**
 * Sync scene durations and action timing to narration audio.
 *
 * @param {object} props - ScoutReplay props (mutated in place)
 * @param {object} narration - Narration JSON with segments and fullText
 * @param {Array} segmentTimings - Per-segment { startSec, endSec, durationSec, actionKeywords? }
 * @param {Array} wordTimings - Whisper word-level timings [{ word, startMs, endMs }]
 */
function syncScenesToAudio(props, narration, segmentTimings, wordTimings) {
  const scenes = props.scenes;

  if (!segmentTimings || segmentTimings.length === 0) {
    console.log("  No segment timings — keeping default scene durations");
    return;
  }

  // Map each scene to its corresponding segment timing
  // segmentTimings should align 1:1 with scenes (both exclude intro/outro)
  const numToSync = Math.min(scenes.length, segmentTimings.length);

  for (let i = 0; i < numToSync; i++) {
    const seg = segmentTimings[i];
    const scene = scenes[i];

    // ── Set scene duration from narration segment duration ──
    const durationSec = seg.durationSec || (seg.endSec - seg.startSec);
    // Add 0.5s padding for visual breathing room, minimum 2s per scene
    const paddedDuration = Math.max(2, durationSec + 0.5);
    scene.durationFrames = Math.round(paddedDuration * FPS);

    // ── Store audio offset so the scene knows where its audio begins ──
    scene.audioOffsetMs = Math.round(seg.startSec * 1000);

    // ── Sync action delayFrames to keyword mentions in audio ──
    const keywords = seg.actionKeywords || [];
    if (keywords.length > 0 && wordTimings.length > 0 && scene.actions.length > 0) {
      // Find Whisper words that fall within this segment's time range
      const segStartMs = Math.round(seg.startSec * 1000);
      const segEndMs = Math.round(seg.endSec * 1000);
      const segWords = wordTimings.filter(
        (w) => w.startMs >= segStartMs && w.startMs <= segEndMs
      );

      // For each action, try to find a matching keyword in the audio
      let keywordIdx = 0;
      for (const action of scene.actions) {
        if (keywordIdx >= keywords.length) break;

        const keyword = keywords[keywordIdx].toLowerCase();
        // Find the word in Whisper output that best matches this keyword
        const match = segWords.find((w) =>
          w.text.toLowerCase().includes(keyword) ||
          keyword.includes(w.text.toLowerCase())
        );

        if (match) {
          // Convert word start time to frames relative to scene start
          const relativeMs = match.startMs - segStartMs;
          // Start the action slightly before the keyword is spoken (anticipation)
          action.delayFrames = Math.max(0, Math.round((relativeMs / 1000) * FPS) - 5);
          keywordIdx++;
        }
      }

      // For any actions that didn't get a keyword match, space them evenly
      const unmatchedActions = scene.actions.filter(
        (a) => a.delayFrames === undefined || a.delayFrames === 30 // 30 was the old default
      );
      if (unmatchedActions.length > 0) {
        const step = Math.floor(scene.durationFrames / (unmatchedActions.length + 1));
        unmatchedActions.forEach((a, idx) => {
          a.delayFrames = step * (idx + 1);
        });
      }
    } else {
      // No keywords or no word timings — space actions evenly across the scene
      if (scene.actions.length > 0) {
        const step = Math.floor(scene.durationFrames / (scene.actions.length + 1));
        scene.actions.forEach((a, idx) => {
          a.delayFrames = step * (idx + 1);
        });
      }
    }

    // ── Slice word timings for this scene's caption rendering ──
    if (wordTimings.length > 0) {
      const segStartMs = Math.round(seg.startSec * 1000);
      const segEndMs = Math.round(seg.endSec * 1000);
      scene.sceneWordTimings = wordTimings
        .filter((w) => w.startMs >= segStartMs && w.startMs <= segEndMs)
        .map((w) => ({
          ...w,
          // Make timing relative to scene start
          startMs: w.startMs - segStartMs,
          endMs: w.endMs - segStartMs,
        }));
    }

    console.log(
      `  Scene ${i}: ${scene.durationFrames} frames (${durationSec.toFixed(1)}s), ` +
      `${scene.actions.length} actions, ` +
      `delays: [${scene.actions.map((a) => a.delayFrames).join(", ")}]`
    );
  }

  // Handle any remaining scenes beyond segment count — use proportional default
  for (let i = numToSync; i < scenes.length; i++) {
    const avgDuration = Math.round(
      scenes.slice(0, numToSync).reduce((sum, s) => sum + s.durationFrames, 0) / numToSync
    );
    scenes[i].durationFrames = avgDuration;
    if (scenes[i].actions.length > 0) {
      const step = Math.floor(avgDuration / (scenes[i].actions.length + 1));
      scenes[i].actions.forEach((a, idx) => {
        a.delayFrames = step * (idx + 1);
      });
    }
  }
}

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
Agent Video CLI — Narrated demo video pipeline

Commands:
  plan [preset]                         Build catalog → generate plan → scout guide
  convert <walkthrough.jsonl>           Convert scout JSONL to manifest + Remotion props
  tts <manifest.json>                   Generate TTS audio for a manifest
  record <manifest.json>                Record all scenes from a manifest
  render <recording-dir>                Run Remotion post-production pipeline
  marketing <recording-dir>             MarketingDemo pipeline (presenter + lip sync + h265)
  stitch --parts <files> --output <out> Combine videos with transition cards
  scout-to-video <jsonl> [screenshots]  Zero-manual-work: JSONL + screenshots → video
  avatar <image.png> <audio.mp3>        Generate talking head video
  lambda <deploy|render|status|...>     AWS Lambda deployment and rendering
  full <walkthrough.jsonl>              Full pipeline: convert → tts → record → render
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

Plan flags:
  --audience <customers|investors|staff>  Target audience
  --duration <seconds>                    Target video duration
  --focus <pos-register|admin-panel|full> Focus area
  --docs-dir <path>                       Knowledge base docs (overrides demo.config.json)
  --rebuild                               Force rebuild feature catalog

Examples:
  # Generate a scout guide from knowledge base
  node cli.mjs plan quick-sale
  node cli.mjs plan --audience investors --duration 120

  # Scout-to-video (zero manual work — screenshots + cursor animations)
  node cli.mjs scout-to-video walkthrough.jsonl screenshots/ --preset draft

  # Scout-to-video with production TTS + all formats
  node cli.mjs scout-to-video walkthrough.jsonl screenshots/ --preset production --format all

  # Draft render (free, fast)
  node cli.mjs full walkthrough.jsonl --preset draft

  # Production render (ElevenLabs + Mux)
  node cli.mjs full walkthrough.jsonl --preset production

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
