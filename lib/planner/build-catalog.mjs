#!/usr/bin/env node
/**
 * build-catalog.mjs
 *
 * Reads the Docusaurus knowledge base (knowledge-base/docs/) and produces
 * a structured feature-catalog.json that the plan generator consumes.
 *
 * Each doc becomes a feature entry with:
 *   - metadata from frontmatter (title, description)
 *   - category derived from file path (pos/sales, admin/reports, etc.)
 *   - sections extracted from markdown headings
 *   - demo-relevant actions inferred from step lists
 *   - marketing points pulled from description + key paragraphs
 *   - impact score based on category weight and content depth
 *   - estimated duration for demo scenes
 *
 * Usage:
 *   node build-catalog.mjs [--docs-dir ../../knowledge-base/docs] [--output feature-catalog.json]
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CATEGORY_WEIGHTS = {
  'pos/sales':       { weight: 10, group: 'POS Core',          audience: ['customers', 'investors', 'staff'] },
  'pos/customers':   { weight: 9,  group: 'Customer',          audience: ['customers', 'investors', 'staff'] },
  'pos/cash-drawer': { weight: 7,  group: 'Cash Management',   audience: ['investors', 'staff'] },
  'pos/orders':      { weight: 6,  group: 'Orders',            audience: ['customers', 'staff'] },
  'pos/hardware':    { weight: 5,  group: 'Hardware',           audience: ['investors', 'staff'] },
  'pos/other':       { weight: 4,  group: 'POS Other',         audience: ['staff'] },
  'admin/products':  { weight: 8,  group: 'Admin',             audience: ['investors', 'staff'] },
  'admin/inventory': { weight: 6,  group: 'Admin',             audience: ['investors', 'staff'] },
  'admin/reports':   { weight: 8,  group: 'Admin',             audience: ['investors', 'staff'] },
  'admin/customers': { weight: 7,  group: 'Customer',          audience: ['investors', 'staff'] },
  'admin/pricing':   { weight: 7,  group: 'Pricing',           audience: ['investors', 'staff'] },
  'admin/cannabis':  { weight: 8,  group: 'Cannabis-Specific',  audience: ['customers', 'investors', 'staff'] },
  'admin/settings':  { weight: 3,  group: 'Admin',             audience: ['staff'] },
  'admin/users':     { weight: 4,  group: 'Admin',             audience: ['staff'] },
  'admin/hardware':  { weight: 3,  group: 'Hardware',           audience: ['staff'] },
  'admin/cash':      { weight: 5,  group: 'Cash Management',   audience: ['investors', 'staff'] },
  'admin/orders':    { weight: 5,  group: 'Orders',            audience: ['staff'] },
  'admin/delivery':  { weight: 5,  group: 'Delivery',          audience: ['investors', 'staff'] },
  'admin/other':     { weight: 3,  group: 'Admin',             audience: ['staff'] },
  'admin/multi-store': { weight: 6, group: 'Multi-Store',      audience: ['investors'] },
  'integrations/woocommerce': { weight: 6, group: 'Integrations', audience: ['investors', 'staff'] },
  'integrations/wholesale':   { weight: 5, group: 'Integrations', audience: ['investors'] },
  'getting-started': { weight: 2, group: 'Getting Started',    audience: ['staff'] },
  'troubleshooting': { weight: 1, group: 'Troubleshooting',    audience: ['staff'] },
};

// Features that are especially visual / demo-worthy get a bonus
const DEMO_BOOST_KEYWORDS = [
  'weight', 'loyalty', 'discount', 'campaign', 'freebie', 'split payment',
  'cash drawer', 'z-report', 'barcode', 'receipt', 'search', 'cart',
  'customer lookup', 'quality tier', 'strain', 'thc', 'cbd', 'terpene',
  'reports', 'analytics', 'chart', 'dashboard',
];

// ---------------------------------------------------------------------------
// Markdown parsing (no external dep needed for frontmatter — simple regex)
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { data: {}, body: content };
  const body = content.slice(match[0].length).trim();
  const data = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w[\w_-]*):\s*(.+)$/);
    if (kv) {
      let val = kv[2].trim();
      // strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      data[kv[1]] = isNaN(Number(val)) ? val : Number(val);
    }
  }
  return { data, body };
}

function extractHeadings(body) {
  const headings = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^(#{2,4})\s+(.+)/);
    if (m) headings.push({ level: m[1].length, text: m[2].trim() });
  }
  return headings;
}

function extractSteps(body) {
  // Find numbered lists that look like how-to steps
  const steps = [];
  for (const line of body.split('\n')) {
    // Pattern 1: "1. **Bold action**" — the bold part is the step
    const boldStart = line.match(/^\d+\.\s+\*\*(.+?)\*\*/);
    if (boldStart) {
      steps.push(boldStart[1].replace(/\*\*/g, ''));
      continue;
    }
    // Pattern 2: "1. Tap the **button name** in the header" — full line is the step
    const numberedWithBold = line.match(/^\d+\.\s+(.+\*\*.+\*\*.+)/);
    if (numberedWithBold) {
      steps.push(numberedWithBold[1].replace(/\*\*/g, '').trim());
      continue;
    }
    // Pattern 3: Plain numbered step "1. Select the item you want"
    const plainStep = line.match(/^\d+\.\s+((?:Tap|Click|Select|Enter|Type|Navigate|Open|Choose|Scan|Swipe|Wait|Log in|Make sure)\b.{10,})/i);
    if (plainStep) {
      steps.push(plainStep[1].trim());
    }
  }
  return steps;
}

function extractRoles(body) {
  const roles = new Set();
  const badges = body.match(/badge--(\w+)/g) || [];
  for (const b of badges) {
    roles.add(b.replace('badge--', ''));
  }
  return [...roles];
}

function extractKeyParagraphs(body, maxChars = 500) {
  // Grab the first substantive paragraph (skip headings, badges, images, callouts)
  const lines = body.split('\n');
  const paragraphs = [];
  let current = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' && current) {
      paragraphs.push(current.trim());
      current = '';
    } else if (
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('|') &&
      !trimmed.startsWith(':::') &&
      !trimmed.startsWith('![') &&
      !trimmed.startsWith('<span') &&
      !trimmed.startsWith('---') &&
      !trimmed.startsWith('```') &&
      trimmed.length > 20
    ) {
      current += ' ' + trimmed;
    }
  }
  if (current) paragraphs.push(current.trim());

  // Return first 2 meaningful paragraphs
  return paragraphs
    .filter(p => p.length > 30)
    .slice(0, 2)
    .map(p => p.length > maxChars ? p.slice(0, maxChars) + '...' : p);
}

function extractScreenshots(body) {
  const shots = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    shots.push({ alt: m[1], path: m[2] });
  }
  return shots;
}

function extractTables(body) {
  // Extract table headers as a hint for what's demonstrated
  const tables = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('|') && lines[i + 1] && lines[i + 1].match(/^\|[-| ]+\|$/)) {
      const headers = lines[i].split('|').map(h => h.trim()).filter(Boolean);
      tables.push(headers);
    }
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Feature entry builder
// ---------------------------------------------------------------------------

function buildFeatureEntry(filePath, docsDir) {
  const content = readFileSync(filePath, 'utf-8');
  const { data, body } = parseFrontmatter(content);

  const relPath = relative(docsDir, filePath);
  const dirParts = dirname(relPath).split('/');
  const categoryKey = dirParts.slice(0, 2).join('/');
  const catConfig = CATEGORY_WEIGHTS[categoryKey] || CATEGORY_WEIGHTS[dirParts[0]] || { weight: 3, group: 'Other', audience: ['staff'] };

  const headings = extractHeadings(body);
  const steps = extractSteps(body);
  const roles = extractRoles(body);
  const keyParagraphs = extractKeyParagraphs(body);
  const screenshots = extractScreenshots(body);
  const tables = extractTables(body);

  // Build a slug from the file path
  const slug = relPath.replace(/\.md$/, '').replace(/\//g, '-').replace(/^docs-/, '');

  // Calculate impact score
  let impact = catConfig.weight;

  // Boost for content with steps (more demo-able)
  if (steps.length >= 3) impact += 1;

  // Boost for screenshots (visual payoff exists)
  if (screenshots.length > 0) impact += 1;

  // Boost for demo-worthy keywords
  const lowerContent = (data.title + ' ' + (data.description || '') + ' ' + body.slice(0, 500)).toLowerCase();
  const keywordHits = DEMO_BOOST_KEYWORDS.filter(kw => lowerContent.includes(kw));
  if (keywordHits.length >= 2) impact += 1;

  // Cap at 10
  impact = Math.min(10, impact);

  // Estimate demo duration based on content depth
  let estimatedDuration = 5; // base
  if (steps.length >= 5) estimatedDuration = 8;
  if (steps.length >= 8) estimatedDuration = 12;
  if (headings.length >= 8) estimatedDuration += 2;

  // Build narration hints from description + key paragraphs
  const narrationHints = [];
  if (data.description) narrationHints.push(data.description);
  narrationHints.push(...keyParagraphs);

  // Build demo actions from extracted steps
  const demoActions = steps.map(step => ({
    type: inferActionType(step),
    description: step,
  }));

  // Determine visual payoff from screenshots and headings
  const visualPayoff = screenshots.length > 0
    ? screenshots.map(s => s.alt).join('; ')
    : headings.slice(0, 3).map(h => h.text).join(', ');

  // Marketing points: pull from description + first paragraph
  const marketingPoints = [];
  if (data.description) marketingPoints.push(data.description);
  if (keyParagraphs[0]) {
    // Extract a concise marketing-friendly version
    const first = keyParagraphs[0];
    if (first.length > 150) {
      marketingPoints.push(first.slice(0, 150).replace(/\s+\S*$/, '') + '...');
    } else {
      marketingPoints.push(first);
    }
  }

  // Determine focus area
  const focusArea = dirParts[0] === 'pos' ? 'pos-register'
    : dirParts[0] === 'admin' ? 'admin-panel'
    : dirParts[0] === 'integrations' ? 'integrations'
    : 'general';

  return {
    id: slug,
    name: data.title || basename(filePath, '.md'),
    description: data.description || '',
    category: categoryKey,
    group: catConfig.group,
    focusArea,
    audiences: catConfig.audience,
    roles,
    impactScore: impact,
    estimatedDuration,
    demoActions,
    narrationHints,
    marketingPoints,
    visualPayoff,
    screenshots: screenshots.map(s => s.path),
    sections: headings.map(h => h.text),
    keywordHits,
    docPath: relPath,
  };
}

function inferActionType(stepText) {
  const lower = stepText.toLowerCase();
  if (lower.includes('tap') || lower.includes('click') || lower.includes('select')) return 'click';
  if (lower.includes('type') || lower.includes('enter') || lower.includes('search')) return 'fill';
  if (lower.includes('scan')) return 'scan';
  if (lower.includes('wait') || lower.includes('load')) return 'wait';
  if (lower.includes('navigate') || lower.includes('go to')) return 'navigate';
  return 'action';
}

// ---------------------------------------------------------------------------
// Directory walker
// ---------------------------------------------------------------------------

function walkDir(dir, ext = '.md') {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full, ext));
    } else if (entry.endsWith(ext) && entry !== 'index.md') {
      // Skip index.md files — they're category overviews, not features
      results.push(full);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  let docsDir = null;
  let outputPath = join(__dirname, 'feature-catalog.json');
  let includeIndex = false;

  // Check for a project config that stores the knowledge base path
  const configPath = join(__dirname, '..', '..', 'demo.config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.knowledgeBase) docsDir = config.knowledgeBase;
    } catch { /* ignore config parse errors */ }
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--docs-dir' && args[i + 1]) docsDir = args[++i];
    if (args[i] === '--output' && args[i + 1]) outputPath = args[++i];
    if (args[i] === '--include-index') includeIndex = true;
  }

  if (!docsDir) {
    console.error('No docs directory specified.');
    console.error('Either pass --docs-dir <path> or set "knowledgeBase" in demo.config.json');
    process.exit(1);
  }

  if (!existsSync(docsDir)) {
    console.error(`Docs directory not found: ${docsDir}`);
    process.exit(1);
  }

  // Also grab index.md files if requested
  const mdFiles = [];
  function walkAll(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walkAll(full);
      } else if (entry.endsWith('.md')) {
        if (entry === 'index.md' && !includeIndex) continue;
        mdFiles.push(full);
      }
    }
  }
  walkAll(docsDir);

  console.log(`Found ${mdFiles.length} documentation files in ${docsDir}`);

  const features = mdFiles
    .map(f => buildFeatureEntry(f, docsDir))
    .sort((a, b) => b.impactScore - a.impactScore || a.name.localeCompare(b.name));

  const catalog = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    sourceDir: docsDir,
    featureCount: features.length,
    groups: [...new Set(features.map(f => f.group))].sort(),
    features,
  };

  writeFileSync(outputPath, JSON.stringify(catalog, null, 2));
  console.log(`Wrote ${features.length} features to ${outputPath}`);

  // Summary
  const byGroup = {};
  for (const f of features) {
    byGroup[f.group] = (byGroup[f.group] || 0) + 1;
  }
  console.log('\nFeatures by group:');
  for (const [group, count] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${group}: ${count}`);
  }

  const byScore = {};
  for (const f of features) {
    const bucket = f.impactScore >= 8 ? 'high (8-10)' : f.impactScore >= 5 ? 'medium (5-7)' : 'low (1-4)';
    byScore[bucket] = (byScore[bucket] || 0) + 1;
  }
  console.log('\nFeatures by impact:');
  for (const [bucket, count] of Object.entries(byScore)) {
    console.log(`  ${bucket}: ${count}`);
  }
}

main();
