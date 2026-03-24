#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('ERROR: OPENAI_API_KEY not found in .env');
  process.exit(1);
}

const OUTPUT_DIR = path.join(__dirname, '..', 'pitch-output', 'images');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const images = [
  {
    file: 'scene-2-mcdonalds.png',
    prompt: "A fast food restaurant menu board, brightly lit, but instead of listing specific menu items, every item just says 'Food' with a price. For example: 'Food - $5', 'Food - $8', 'Food - $12'. The menu board looks like a real McDonald's or Burger King style LED menu but with absurdly vague listings. Comedic, satirical. Photorealistic restaurant interior. Warm lighting. 16:9 cinematic composition."
  },
  {
    file: 'scene-3-stat.png',
    prompt: "A dark, moody infographic showing 10 store icons arranged in a grid. Only 1 store icon is brightly lit in amber/gold, the other 9 are greyed out and dim. Above the grid, bold white text reads 'Less than 10%'. Below reads 'of stores list all flavours online'. Minimal design, dark background with subtle gradient. Modern data visualization style. Clean typography. 16:9 cinematic composition."
  },
  {
    file: 'scene-4-brands.png',
    prompt: "A dramatic product photography hero shot showing premium cannabis vape cartridge packaging arranged like a magazine spread. Two distinct brand aesthetics side by side - one with bold street art style packaging in bright colors (representing Gas Gang energy), the other with clean sleek purple and holographic packaging (representing Drizzle Factory style). Dark moody background with dramatic lighting. Gold and amber highlights. Premium product photography. 16:9 cinematic composition."
  },
  {
    file: 'scene-4-coke-shelf.png',
    prompt: "A perfectly organized convenience store cooler shelf filled with Coca-Cola products. Every bottle facing forward, every label aligned, every row consistent. Pristine, controlled, systematic brand presentation. The contrast between perfect organization and chaos. Photorealistic. Bright commercial lighting. Shot straight on. Clean, satisfying visual. 16:9 cinematic composition."
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateImage(item, index) {
  const filePath = path.join(OUTPUT_DIR, item.file);

  // Skip if already exists
  if (fs.existsSync(filePath)) {
    console.log(`[${index + 1}/4] SKIP: ${item.file} already exists`);
    return;
  }

  console.log(`[${index + 1}/4] Generating: ${item.file}...`);

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-1.5',
      prompt: item.prompt,
      size: '1536x1024',
      quality: 'medium',
      n: 1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${index + 1}/4] ERROR (${response.status}): ${errorText}`);
    return;
  }

  const data = await response.json();
  const b64 = data.data[0].b64_json;

  if (!b64) {
    console.error(`[${index + 1}/4] ERROR: No b64_json in response`);
    console.error(JSON.stringify(data, null, 2));
    return;
  }

  const buffer = Buffer.from(b64, 'base64');
  fs.writeFileSync(filePath, buffer);
  console.log(`[${index + 1}/4] SAVED: ${item.file} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Generating ${images.length} images...\n`);

  for (let i = 0; i < images.length; i++) {
    await generateImage(images[i], i);

    // Wait 15 seconds between requests (rate limit: 5/min)
    if (i < images.length - 1) {
      console.log('Waiting 15 seconds (rate limit)...\n');
      await sleep(15000);
    }
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
