#!/usr/bin/env node

/**
 * Manifest-driven multi-scene runner (#7).
 *
 * Reads a manifest.json, runs preflight budget check, generates all audio
 * in parallel, records each scene sequentially (with optional auth state
 * injection and seed reset hooks), stitches scenes, and generates captions.
 *
 * Usage:
 *   node lib/run.mjs <manifest.json>
 *   node lib/run.mjs examples/pos-demo/manifest.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

import { loadEnv } from "./env.js";
import { ab, sleep } from "./ab.js";
import { injectCursor, cursorClick } from "./cursor.js";
import { waitForVisible, waitForGone, waitForText, waitUntil } from "./waits.js";
import { generateAudio, calculateSegmentTimings } from "./tts.js";
import { generateCaptions, toSRT, toVTT, charsToWords, groupCaptions } from "./captions.js";
import { preflight } from "./budget.js";
import { saveAuthState, loadAuthState } from "./auth.js";
import { mergeVideoAudio, stitchScenes, convertToMp4 } from "./render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run a manifest-driven recording session.
 * @param {string} manifestPath - Path to manifest.json
 */
export async function runManifest(manifestPath) {
  loadEnv();

  const manifestDir = dirname(resolve(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  const sessionDir = join(
    process.env.HOME,
    "Movies/agent-recordings",
    `${manifest.name || "session"}-${Date.now()}`
  );
  mkdirSync(sessionDir, { recursive: true });
  console.log(`\nSession: ${sessionDir}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Scenes: ${manifest.scenes.length}\n`);

  const voiceId = manifest.voiceId || process.env.ELEVENLABS_VOICE_ID;
  const viewport = manifest.viewport || { width: 1920, height: 1080 };

  // === PHASE 1: GENERATE ALL AUDIO IN PARALLEL ===
  console.log("=== PHASE 1: AUDIO GENERATION ===");

  const sceneData = [];
  const audioPromises = [];

  for (let i = 0; i < manifest.scenes.length; i++) {
    const scene = manifest.scenes[i];
    const audioPath = join(sessionDir, `scene_${i}_audio.mp3`);

    if (scene.narration) {
      // Scene has inline narration segments
      const fullText = Array.isArray(scene.narration)
        ? scene.narration.map((s) => s.text).join(" ")
        : scene.narration;

      audioPromises.push(
        generateAudio(fullText, { voiceId, outputPath: audioPath }).then(
          (result) => {
            const segments = Array.isArray(scene.narration)
              ? scene.narration
              : [{ text: scene.narration, action: "full" }];
            const timedSegments = calculateSegmentTimings(
              segments,
              result.charStartTimes,
              result.charEndTimes
            );
            sceneData[i] = {
              ...scene,
              audioPath,
              timedSegments,
              alignment: result.alignment,
              durationSec: result.durationSec,
            };
            console.log(
              `  Scene ${i}: ${result.durationSec.toFixed(1)}s audio generated`
            );
          }
        )
      );
    } else {
      // No narration — silent scene
      sceneData[i] = {
        ...scene,
        audioPath: null,
        timedSegments: [],
        alignment: null,
        durationSec: scene.durationSec || 10,
      };
      audioPromises.push(Promise.resolve());
    }
  }

  await Promise.all(audioPromises);
  console.log(`All ${manifest.scenes.length} audio tracks ready.\n`);

  // === PHASE 1.5: PREFLIGHT BUDGET CHECK ===
  if (manifest.scenes.some((s) => s.budgetActions)) {
    console.log("=== PREFLIGHT BUDGET CHECK ===");
    const budgetSegments = sceneData
      .filter((s) => s.budgetActions)
      .map((s) => ({
        action: s.name || s.module,
        text: Array.isArray(s.narration)
          ? s.narration[0]?.text
          : s.narration,
        durationSec: s.durationSec,
        actions: s.budgetActions,
      }));

    const result = preflight(budgetSegments);
    console.log(result.report);

    if (!result.ok && !manifest.ignoreBudget) {
      console.error("\nBudget check FAILED. Use 'ignoreBudget: true' in manifest to override.");
      process.exit(1);
    }
    console.log("");
  }

  // === PHASE 2: RECORD EACH SCENE ===
  console.log("=== PHASE 2: RECORDING ===");

  ab(`set viewport ${viewport.width} ${viewport.height}`);
  const sceneMp4s = [];

  for (let i = 0; i < sceneData.length; i++) {
    const scene = sceneData[i];
    const sceneName = scene.name || `scene_${i}`;
    console.log(`\n--- Recording: ${sceneName} ---`);

    // Run seed reset hook if defined
    if (scene.seedReset) {
      console.log(`  Running seed reset: ${scene.seedReset}`);
      execSync(scene.seedReset, { stdio: "inherit", timeout: 30000 });
    }

    // Open browser
    const startUrl = scene.url || manifest.baseUrl || "http://localhost:3010/pos";
    ab(`open "${startUrl}" --headed`, { timeout: 60000 });
    await sleep(scene.loadWaitMs || 3000);

    // Load auth state if requested
    if (scene.loadAuth !== false && i > 0) {
      const authPath = join(sessionDir, ".auth-state.json");
      if (existsSync(authPath)) {
        loadAuthState({ path: authPath });
        await sleep(500);
        // Reload to apply auth
        ab(`open "${startUrl}"`, { timeout: 60000 });
        await sleep(2000);
      }
    }

    // Start recording
    const videoPath = join(sessionDir, `${sceneName}.webm`);
    ab(`record start "${videoPath}"`);
    const recordStart = Date.now();

    // Load and execute the scene module
    if (scene.module) {
      const modulePath = resolve(manifestDir, scene.module);
      const sceneModule = await import(modulePath);

      // Build context object for the scene
      const ctx = {
        ab,
        sleep,
        cursorClick,
        injectCursor,
        waitForVisible,
        waitForGone,
        waitForText,
        waitUntil: (sec) => waitUntil(recordStart, sec),
        seg: (action) => scene.timedSegments.find((s) => s.action === action),
        timedSegments: scene.timedSegments,
        recordStart,
        sessionDir,
      };

      await sceneModule.default(ctx);
    } else if (scene.durationSec) {
      // No module — just wait for duration
      await sleep(scene.durationSec * 1000);
    }

    // Stop recording
    ab("record stop");
    await sleep(500);

    // Save auth state after scene
    if (scene.saveAuth) {
      saveAuthState({ path: join(sessionDir, ".auth-state.json") });
    }

    ab("close");
    await sleep(500);

    // Post-process scene
    const sceneMp4 = join(sessionDir, `${sceneName}.mp4`);

    if (scene.audioPath) {
      mergeVideoAudio(videoPath, scene.audioPath, sceneMp4);
    } else {
      convertToMp4(videoPath, sceneMp4);
    }

    sceneMp4s.push(sceneMp4);
    console.log(`  Scene ${i} complete: ${sceneMp4}`);
  }

  // === PHASE 3: STITCH + CAPTIONS ===
  console.log("\n=== PHASE 3: POST-PRODUCTION ===");

  const finalPath = join(sessionDir, `${manifest.name || "output"}.mp4`);

  if (sceneMp4s.length > 1) {
    stitchScenes(sceneMp4s, finalPath);
  } else if (sceneMp4s.length === 1) {
    execSync(`cp "${sceneMp4s[0]}" "${finalPath}"`);
  }

  // Generate captions from all scenes
  let allCaptions = [];
  let cumulativeOffset = 0;

  for (const scene of sceneData) {
    if (scene.alignment) {
      const { captions } = generateCaptions(scene.alignment, {
        offset: cumulativeOffset,
      });
      allCaptions.push(...captions);
    }
    cumulativeOffset += scene.durationSec;
  }

  if (allCaptions.length > 0) {
    const srtPath = join(sessionDir, `${manifest.name || "output"}.srt`);
    const vttPath = join(sessionDir, `${manifest.name || "output"}.vtt`);
    const grouped = allCaptions; // already grouped by generateCaptions
    writeFileSync(srtPath, toSRT(grouped));
    writeFileSync(vttPath, toVTT(grouped));
    console.log(`Captions: ${srtPath}`);

    // Optionally burn captions
    if (manifest.burnCaptions) {
      const captionedPath = finalPath.replace(".mp4", "-captioned.mp4");
      const { burnCaptions } = await import("./render.js");
      burnCaptions(finalPath, srtPath, captionedPath);
      console.log(`Captioned: ${captionedPath}`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Output: ${finalPath}`);
  const stats = readFileSync(finalPath);
  console.log(`Size: ${(stats.length / 1024 / 1024).toFixed(1)} MB`);

  return { finalPath, sessionDir, sceneMp4s };
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: node lib/run.mjs <manifest.json>");
    process.exit(1);
  }
  runManifest(manifestPath).catch((err) => {
    console.error("FATAL:", err.message);
    try { ab("close"); } catch {}
    process.exit(1);
  });
}
