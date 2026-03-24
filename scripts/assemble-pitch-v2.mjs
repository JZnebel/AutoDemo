#!/usr/bin/env node

/**
 * Assemble Pitch V2
 * Maps specific images to scenes, generates TTS, Whisper, props, and renders.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
dotenv.config({ path: join(ROOT, ".env") });

const FPS = 30;
const imagesDir = join(ROOT, "pitch-output", "images");
const audioDir = join(ROOT, "pitch-output", "audio");
const publicDir = join(ROOT, "demo-render", "public");
const publicScreenshots = join(publicDir, "screenshots");
const outputDir = join(ROOT, "pitch-output");

mkdirSync(publicScreenshots, { recursive: true });
mkdirSync(audioDir, { recursive: true });
mkdirSync(join(ROOT, "final-output"), { recursive: true });

// ═══════════════════════════════════════════════════════════════════════
// Scene definitions — image + narration + timing
// ═══════════════════════════════════════════════════════════════════════
const scenes = [
  {
    id: 1,
    title: "The Hook",
    image: "real-gasgang-no-flavours.png",
    narration: "Go to any store website right now that carries Gas Gang or Drizzle. Try to buy a specific flavour. Good luck.",
    durationSec: 10,
    lowerThird: null,
  },
  {
    id: 2,
    title: "Show the Receipts",
    image: "real-drizzle-no-flavours.png",
    afterImage: "scene-2-mcdonalds.png",
    narration: "This store sells Gas Gang 2G pens. Forty five bucks. No flavour selection. You get what you get. And this one sells Drizzle 3G pens. Your choices? Hybrid, Sativa, or Indica. That's it. Not Blueberry Kush. Not Mango Ice. Not Watermelon. Just... Hybrid. That's like going to McDonald's and the menu just says food.",
    durationSec: 25,
    lowerThird: "Actual store listings. Right now.",
  },
  {
    id: 3,
    title: "Scale of the Problem",
    image: "scene-3-stat.png",
    narration: "And it's not just these two stores. Less than 10% of stores carrying your products are actually listing all the flavours online. Not because they're lazy. Because nobody gave them the data. No SKU list. No flavour catalog. No product images. Stores are literally guessing what's in the box.",
    durationSec: 15,
    lowerThird: "Less than 10% list all flavours online",
  },
  {
    id: 4,
    title: "The Coke Comparison",
    image: "scene-4-brands.png",
    afterImage: "scene-4-coke-shelf.png",
    narration: "Gas Gang and Drizzle are the two biggest brands in the Indigenous cannabis market. Dozens of products. Dozens of stores. Serious volume every week. In this market, you're basically Coca-Cola and Pepsi. But here's the thing. Coca-Cola doesn't let stores guess what flavour is in the bottle. Every store, every shelf, every website, same product, same name, same picture. That's not because they're control freaks. That's because inconsistency costs money.",
    durationSec: 20,
    lowerThird: "Inconsistency costs money.",
  },
  {
    id: 5,
    title: "The Fix",
    image: "scout-top-products-chart.png",
    afterImage: "scout-product-performance.png",
    narration: "Here's what it looks like when the distributor controls the data. You define the product once. Name. Every flavour. Images. Description. Price. Every store on the system gets that product automatically. Every online store shows it the same way. Every flavour listed. Every image correct. No more Random Flavour. No more Hybrid. Every customer sees exactly what you sell.",
    durationSec: 20,
    lowerThird: "Define once. Every store. Every flavour.",
  },
  {
    id: 6,
    title: "Free Marketing",
    image: "scout-platform-dashboard.png",
    afterImage: "scout-platform-store-comparison.png",
    narration: "And here's the part nobody thinks about. Every store on the system gets a free online store. Your products listed correctly on every single one. That's not just data management. That's free advertising across every store that carries your brand. Right now your products are invisible online. With this, they're everywhere. Correctly.",
    durationSec: 15,
    lowerThird: "Free advertising. Every store.",
  },
  {
    id: 7,
    title: "The Data Play",
    image: "scout-platform-sales.png",
    afterImage: "scout-inventory-turnover-v2.png",
    narration: "Once you have stores on the same system, you see everything. What flavours sell fastest. What products sit on shelves. Which stores need restock. Which stores are growing. You stop guessing and start knowing. That's how Coca-Cola runs. And you can run the same way.",
    durationSec: 15,
    lowerThird: "Stop guessing. Start knowing.",
  },
  {
    id: 8,
    title: "Your Land Your Data",
    image: "scene-8.png",
    narration: "Now here's the part that matters most. You already use Signal because you don't trust anyone else with your business. This system runs on the same encryption. And you can run it on your own server. On the reserve. Your data never leaves your land. No cloud company in the middle. No outside server. Full control.",
    durationSec: 15,
    lowerThird: "Your land. Your data.",
  },
  {
    id: 9,
    title: "The Close",
    image: "scene-10.png",
    afterImage: "real-gasgang-no-flavours.png",
    narration: "Gas Gang and Drizzle already run the market. The next step isn't selling more product. It's making sure every store shows your product right, every customer finds what they want, and you see everything that's happening across the market. The brands that set up the infrastructure first don't just lead the market. They become the market. So the question is... are you just going to keep shipping boxes and hoping stores figure it out?",
    durationSec: 15,
    lowerThird: null,
  },
];

const fullNarration = scenes.map(s => s.narration).join("\n\n");
const narrationPath = join(audioDir, "full-narration-v2.mp3");
const wordTimingsPath = join(audioDir, "word-timings-v2.json");

// ═══════════════════════════════════════════════════════════════════════
// Step 1: Generate TTS (ElevenLabs sped up 1.2x)
// ═══════════════════════════════════════════════════════════════════════
const skipTts = process.argv.includes("--skip-tts");
const renderOnly = process.argv.includes("--render-only");

if (!skipTts && !renderOnly) {
  console.log("\n══ STEP 1: TTS ══\n");

  const narrationTextPath = join(audioDir, "narration-v2.txt");
  writeFileSync(narrationTextPath, fullNarration);
  console.log(`  Text: ${fullNarration.length} chars`);

  // Try ElevenLabs first, then speed up
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const rawPath = join(audioDir, "full-narration-v2-raw.mp3");

  if (elevenLabsKey) {
    console.log("  Provider: ElevenLabs → ffmpeg 1.2x speedup");
    try {
      const { generateSpeech } = await import(join(ROOT, "lib", "tts", "index.js"));
      const result = await generateSpeech(fullNarration, {
        provider: "elevenlabs",
        outputPath: rawPath,
      });
      console.log(`  Raw audio: ${result.duration.toFixed(1)}s`);

      // Speed up 1.2x
      execSync(`ffmpeg -y -i "${rawPath}" -filter:a "atempo=1.2" "${narrationPath}"`, { stdio: "pipe" });
      const duration = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${narrationPath}"`, { encoding: "utf8" }).trim());
      console.log(`  Sped up: ${duration.toFixed(1)}s`);
    } catch (err) {
      console.error(`  ElevenLabs failed: ${err.message}`);
      console.log("  Falling back to Edge TTS...");
      const textFile = join(audioDir, "narration-v2-input.txt");
      writeFileSync(textFile, fullNarration);
      execSync(`edge-tts --voice "en-US-GuyNeural" --rate="+20%" --file "${textFile}" --write-media "${narrationPath}"`, { timeout: 120000, stdio: "pipe" });
    }
  } else {
    console.log("  Provider: Edge TTS (+20% speed)");
    const textFile = join(audioDir, "narration-v2-input.txt");
    writeFileSync(textFile, fullNarration);
    execSync(`edge-tts --voice "en-US-GuyNeural" --rate="+20%" --file "${textFile}" --write-media "${narrationPath}"`, { timeout: 120000, stdio: "pipe" });
  }
  console.log("  ✓ TTS done");
}

// ═══════════════════════════════════════════════════════════════════════
// Step 2: Whisper word timing
// ═══════════════════════════════════════════════════════════════════════
if (!renderOnly) {
  console.log("\n══ STEP 2: Whisper ══\n");

  if (!existsSync(narrationPath)) {
    console.error(`  Audio not found: ${narrationPath}`);
    process.exit(1);
  }

  try {
    const { transcribeAudio } = await import(join(ROOT, "lib", "whisper.mjs"));
    const result = await transcribeAudio(narrationPath, { model: "medium.en" });
    writeFileSync(wordTimingsPath, JSON.stringify(result.wordTimings, null, 2));
    console.log(`  ✓ ${result.wordTimings.length} words transcribed`);
  } catch (err) {
    console.error(`  Whisper failed: ${err.message}`);
    console.log("  Using estimated timings...");
    const duration = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${narrationPath}"`, { encoding: "utf8" }).trim()) || 150;
    const words = fullNarration.split(/\s+/).filter(Boolean);
    const msPerWord = (duration * 1000) / words.length;
    const timings = words.map((w, i) => ({ text: w, startMs: Math.round(i * msPerWord), endMs: Math.round((i + 1) * msPerWord) }));
    writeFileSync(wordTimingsPath, JSON.stringify(timings, null, 2));
    console.log(`  ✓ ${timings.length} words (estimated)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Step 3: Copy images + audio to Remotion public
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══ STEP 3: Stage assets ══\n");

for (const scene of scenes) {
  const src = join(imagesDir, scene.image);
  const dest = join(publicScreenshots, `scene-${scene.id}.png`);
  if (existsSync(src)) {
    copyFileSync(src, dest);
  } else {
    console.error(`  MISSING: ${scene.image}`);
  }

  if (scene.afterImage) {
    const afterSrc = join(imagesDir, scene.afterImage);
    const afterDest = join(publicScreenshots, `scene-${scene.id}-after.png`);
    if (existsSync(afterSrc)) {
      copyFileSync(afterSrc, afterDest);
    }
  }
}

const publicAudioPath = join(publicDir, "pitch-narration-v2.mp3");
if (existsSync(narrationPath)) copyFileSync(narrationPath, publicAudioPath);
console.log(`  ✓ ${scenes.length} scenes staged`);

// ═══════════════════════════════════════════════════════════════════════
// Step 4: Build Remotion props
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══ STEP 4: Build props ══\n");

const wordTimings = existsSync(wordTimingsPath) ? JSON.parse(readFileSync(wordTimingsPath, "utf8")) : [];
const audioDurationSec = parseFloat(execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${narrationPath}"`, { encoding: "utf8" }).trim()) || 150;

const totalNarrationChars = scenes.reduce((sum, s) => sum + s.narration.length, 0);
let currentOffsetMs = 0;

const remotionScenes = scenes.map((scene, i) => {
  const charRatio = scene.narration.length / totalNarrationChars;
  const sceneDurationSec = audioDurationSec * charRatio;
  const sceneDurationFrames = Math.round(sceneDurationSec * FPS);

  const sceneProps = {
    screenshotBefore: `screenshots/scene-${scene.id}.png`,
    screenshotAfter: scene.afterImage ? `screenshots/scene-${scene.id}-after.png` : `screenshots/scene-${scene.id}.png`,
    actions: [],
    durationFrames: Math.max(sceneDurationFrames, FPS * 3),
    lowerThird: scene.lowerThird || null,
    autoZoom: false,
    audioOffsetMs: Math.round(currentOffsetMs),
  };

  currentOffsetMs += sceneDurationSec * 1000;
  return sceneProps;
});

const props = {
  scenes: remotionScenes,
  wordTimings,
  captionStyle: "pop",
  showAvatar: false,
  audioVolume: 1.3,
  introDurationFrames: FPS * 3,
  outroDurationFrames: FPS * 4,
  audioSrc: "pitch-narration-v2.mp3",
};

const propsPath = join(outputDir, "pitch-props-v2.json");
writeFileSync(propsPath, JSON.stringify(props, null, 2));
writeFileSync(join(publicDir, "pitch-props-v2.json"), JSON.stringify(props, null, 2));

const totalSceneFrames = remotionScenes.reduce((sum, s) => sum + s.durationFrames, 0);
const totalFrames = props.introDurationFrames + totalSceneFrames + props.outroDurationFrames - (scenes.length + 1) * 15;
console.log(`  ✓ Props built — ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`);

// ═══════════════════════════════════════════════════════════════════════
// Step 5: Render
// ═══════════════════════════════════════════════════════════════════════
console.log("\n══ STEP 5: Render ══\n");

const finalOutput = join(ROOT, "final-output", "gas-gang-drizzle-pitch-v2.mp4");

try {
  execSync([
    "cd", join(ROOT, "demo-render"), "&&",
    "npx", "remotion", "render",
    "src/index.ts", "ScoutReplay",
    `--props='${JSON.stringify(props)}'`,
    `--output="${finalOutput}"`,
    "--codec=h264",
    "--image-format=jpeg",
    "--jpeg-quality=90",
  ].join(" "), { stdio: "inherit", timeout: 600000 });

  console.log(`\n✓ Video: ${finalOutput}`);
} catch (err) {
  console.error(`Render failed: ${err.message}`);
  process.exit(1);
}
