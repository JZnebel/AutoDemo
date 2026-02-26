#!/usr/bin/env node
/**
 * generate-plan.mjs
 *
 * Generates a structured demo plan from the feature catalog.
 * Selects scenes based on audience, focus area, and duration budget,
 * then orders them for narrative flow and writes demo-plan.json.
 *
 * Usage:
 *   node generate-plan.mjs --audience customers --duration 90 --focus pos-register --output demo-plan.json
 *   node generate-plan.mjs --audience investors --duration 120
 *   node generate-plan.mjs --preset quick-sale
 *
 * Options:
 *   --audience    Target audience: customers, investors, staff (default: customers)
 *   --duration    Target video duration in seconds (default: 90)
 *   --focus       Focus area: pos-register, admin-panel, full, integrations (default: full)
 *   --catalog     Path to feature-catalog.json (default: ./feature-catalog.json)
 *   --output      Output path (default: demo-plan.json)
 *   --preset      Use a built-in preset: quick-sale, full-tour, admin-overview, cannabis-demo
 *   --max-scenes  Maximum number of scenes (default: derived from duration)
 *   --include     Comma-separated feature IDs to force-include
 *   --exclude     Comma-separated feature IDs to exclude
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Narrative ordering — defines the natural demo flow
// ---------------------------------------------------------------------------

const NARRATIVE_ORDER = [
  // Opening: Login and orientation
  'getting-started',
  'pos/sales/making-a-sale',

  // Browse products
  'pos/sales/product-search-and-scanning',
  'admin/products',

  // Product types (show variety)
  'pos/sales/weight-based-products',
  'pos/sales/modifiers-and-variations',
  'admin/cannabis',

  // Cart management
  'pos/sales/cart-management',
  'pos/sales/applying-discounts',
  'pos/sales/sale-campaigns-and-freebies',

  // Customer
  'pos/customers',
  'pos/sales/loyalty-rewards-at-checkout',
  'admin/customers',

  // Payment
  'pos/sales/split-payments',
  'pos/cash-drawer',

  // Orders
  'pos/orders',

  // Admin & reports
  'admin/reports',
  'admin/inventory',
  'admin/pricing',
  'admin/settings',

  // Integrations
  'integrations',

  // Delivery
  'admin/delivery',
];

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS = {
  'quick-sale': {
    audience: 'customers',
    duration: 60,
    focus: 'pos-register',
    description: 'Quick demo of a typical sale — product browse, add to cart, pay',
    forceInclude: [
      'pos-sales-product-search-and-scanning',
      'pos-sales-making-a-sale',
      'pos-sales-weight-based-products',
      'pos-customers-customer-lookup',
    ],
  },
  'full-tour': {
    audience: 'investors',
    duration: 180,
    focus: 'full',
    description: 'Comprehensive tour of POS + admin for investor demos',
  },
  'admin-overview': {
    audience: 'staff',
    duration: 120,
    focus: 'admin-panel',
    description: 'Admin panel walkthrough — products, reports, inventory',
  },
  'cannabis-demo': {
    audience: 'customers',
    duration: 90,
    focus: 'pos-register',
    description: 'Cannabis dispensary demo — weight products, tiers, compliance',
    forceInclude: [
      'pos-sales-weight-based-products',
      'admin-cannabis-quality-tiers',
      'admin-cannabis-strain-library',
      'admin-cannabis-terpenes-effects-flavors',
    ],
  },
};

// ---------------------------------------------------------------------------
// Scene builder
// ---------------------------------------------------------------------------

function buildScene(feature, order) {
  // Build structured actions from the feature's demoActions
  const actions = [];

  // Start with navigation if it's an admin feature
  if (feature.focusArea === 'admin-panel') {
    actions.push({
      type: 'navigate',
      target: feature.name,
      selectorHint: `Navigate to ${feature.group} > ${feature.name}`,
    });
  }

  // Add demo actions from the feature
  for (const action of feature.demoActions.slice(0, 5)) {
    actions.push({
      type: action.type,
      target: action.description,
      selectorHint: `${action.type}: ${action.description}`,
    });
  }

  // Add screenshot points
  if (actions.length > 0) {
    // Screenshot after first meaningful action
    actions.splice(Math.min(2, actions.length), 0, { type: 'screenshot' });
  }
  // Screenshot at end of scene
  actions.push({ type: 'screenshot' });

  // Build narration hints — marketing-first, deduped, prefer longer versions
  const narrationHints = [];
  const allHints = [...feature.marketingPoints, ...feature.narrationHints];
  for (const hint of allHints) {
    const hintCore = hint.replace(/\.{3}$/, '').trim();
    const dupIdx = narrationHints.findIndex(existing => {
      const existCore = existing.replace(/\.{3}$/, '').trim();
      return existCore.includes(hintCore) || hintCore.includes(existCore);
    });
    if (dupIdx === -1) {
      narrationHints.push(hint);
    } else if (hint.length > narrationHints[dupIdx].length) {
      // Replace truncated version with longer version
      narrationHints[dupIdx] = hint;
    }
  }

  return {
    id: feature.id,
    name: feature.name,
    order,
    estimatedDuration: feature.estimatedDuration,
    group: feature.group,
    focusArea: feature.focusArea,
    featureHighlight: feature.name,
    actions,
    narrationGoal: feature.marketingPoints[0] || feature.description,
    narrationHints: narrationHints.slice(0, 5),
    validation: {
      screenshotExpected: actions.filter(a => a.type === 'screenshot').length,
      successIndicator: feature.visualPayoff || `${feature.name} page visible`,
    },
    _source: {
      docPath: feature.docPath,
      impactScore: feature.impactScore,
      roles: feature.roles,
    },
  };
}

// ---------------------------------------------------------------------------
// Scene selection algorithm
// ---------------------------------------------------------------------------

function selectScenes(features, { audience, duration, focus, maxScenes, forceInclude = [], exclude = [] }) {
  // Step 1: Filter by audience and focus
  let candidates = features.filter(f => {
    if (exclude.includes(f.id)) return false;
    if (focus !== 'full' && f.focusArea !== focus) return false;
    if (!f.audiences.includes(audience)) return false;
    return true;
  });

  // Step 2: Force-include specified features (add them from full list if filtered out)
  const forced = features.filter(f => forceInclude.includes(f.id));
  const forcedIds = new Set(forced.map(f => f.id));
  candidates = candidates.filter(f => !forcedIds.has(f.id));

  // Step 3: Sort candidates by impact score (descending)
  candidates.sort((a, b) => b.impactScore - a.impactScore || a.name.localeCompare(b.name));

  // Step 4: Select scenes that fit the duration budget
  const selected = [...forced]; // forced always included
  let totalDuration = forced.reduce((sum, f) => sum + f.estimatedDuration, 0);
  const effectiveMaxScenes = maxScenes || Math.ceil(duration / 7); // ~7s per scene average

  for (const feature of candidates) {
    if (selected.length >= effectiveMaxScenes) break;
    if (totalDuration + feature.estimatedDuration > duration * 1.2) continue; // 20% buffer
    selected.push(feature);
    totalDuration += feature.estimatedDuration;
  }

  return selected;
}

// ---------------------------------------------------------------------------
// Narrative ordering
// ---------------------------------------------------------------------------

function orderForNarrative(scenes) {
  return scenes.sort((a, b) => {
    const aIdx = getNarrativeIndex(a);
    const bIdx = getNarrativeIndex(b);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return b.impactScore - a.impactScore;
  });
}

function getNarrativeIndex(feature) {
  const cat = feature.category || '';
  for (let i = 0; i < NARRATIVE_ORDER.length; i++) {
    if (cat.startsWith(NARRATIVE_ORDER[i]) || feature.id.startsWith(NARRATIVE_ORDER[i].replace(/\//g, '-'))) {
      return i;
    }
  }
  return NARRATIVE_ORDER.length; // unknown goes at the end
}

// ---------------------------------------------------------------------------
// Story arc builder
// ---------------------------------------------------------------------------

function buildStoryArc(scenes) {
  const groups = {};
  for (const scene of scenes) {
    const g = scene.group;
    if (!groups[g]) groups[g] = [];
    groups[g].push(scene.name);
  }

  const parts = [];
  const groupNames = Object.keys(groups);

  if (groupNames.length <= 2) {
    parts.push(`This demo focuses on ${groupNames.join(' and ')}.`);
  } else {
    parts.push(`This demo covers ${groupNames.slice(0, -1).join(', ')}, and ${groupNames.at(-1)}.`);
  }

  // Build a narrative sentence
  const openers = scenes.slice(0, 2).map(s => s.name);
  const closers = scenes.slice(-1).map(s => s.name);
  parts.push(
    `Starting with ${openers.join(' and ')}, ` +
    `we walk through ${scenes.length} key features, ` +
    `ending with ${closers.join(' and ')}.`
  );

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  let audience = 'customers';
  let duration = 90;
  let focus = 'full';
  let catalogPath = join(__dirname, 'feature-catalog.json');
  let outputPath = join(__dirname, 'demo-plan.json');
  let preset = null;
  let maxScenes = 0;
  let forceInclude = [];
  let exclude = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--audience': audience = args[++i]; break;
      case '--duration': duration = parseInt(args[++i], 10); break;
      case '--focus': focus = args[++i]; break;
      case '--catalog': catalogPath = args[++i]; break;
      case '--output': outputPath = args[++i]; break;
      case '--preset': preset = args[++i]; break;
      case '--max-scenes': maxScenes = parseInt(args[++i], 10); break;
      case '--include': forceInclude = args[++i].split(','); break;
      case '--exclude': exclude = args[++i].split(','); break;
    }
  }

  // Apply preset if specified
  if (preset) {
    const p = PRESETS[preset];
    if (!p) {
      console.error(`Unknown preset: ${preset}. Available: ${Object.keys(PRESETS).join(', ')}`);
      process.exit(1);
    }
    console.log(`Using preset: ${preset} — ${p.description}`);
    audience = p.audience;
    duration = p.duration;
    focus = p.focus;
    if (p.forceInclude) forceInclude = [...forceInclude, ...p.forceInclude];
  }

  // Load catalog
  if (!existsSync(catalogPath)) {
    console.error(`Feature catalog not found: ${catalogPath}`);
    console.error('Run "node build-catalog.mjs" first to generate it from the knowledge base.');
    process.exit(1);
  }

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  console.log(`Loaded catalog with ${catalog.featureCount} features`);

  // Select and order scenes
  const selected = selectScenes(catalog.features, {
    audience, duration, focus, maxScenes, forceInclude, exclude,
  });

  const ordered = orderForNarrative(selected);

  // Build scenes
  const scenes = ordered.map((feature, idx) => buildScene(feature, idx + 1));

  // Build story arc
  const storyArc = buildStoryArc(scenes);

  // Calculate totals
  const totalDuration = scenes.reduce((sum, s) => sum + s.estimatedDuration, 0);
  const totalScreenshots = scenes.reduce((sum, s) => sum + s.validation.screenshotExpected, 0);

  const plan = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    parameters: {
      audience,
      targetDuration: duration,
      actualDuration: totalDuration,
      focus,
      preset: preset || null,
    },
    storyArc,
    summary: {
      sceneCount: scenes.length,
      totalDuration,
      totalScreenshots,
      groups: [...new Set(scenes.map(s => s.group))],
    },
    scenes,
  };

  writeFileSync(outputPath, JSON.stringify(plan, null, 2));
  console.log(`\nGenerated demo plan: ${outputPath}`);
  console.log(`  Scenes: ${scenes.length}`);
  console.log(`  Duration: ~${totalDuration}s (target: ${duration}s)`);
  console.log(`  Screenshots: ${totalScreenshots}`);
  console.log(`  Story: ${storyArc}`);
  console.log(`\nScenes:`);
  for (const scene of scenes) {
    console.log(`  ${scene.order}. [${scene.group}] ${scene.name} (~${scene.estimatedDuration}s, impact: ${scene._source.impactScore})`);
  }
}

main();
