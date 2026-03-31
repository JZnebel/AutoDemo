/**
 * VideoComposition — The render target for all demo videos.
 *
 * By default this re-exports MarketingDemo. The pipeline can swap this file
 * with a custom composition before rendering, then restore it after.
 *
 * Custom compositions should:
 * - Export a React component as default or named `VideoComposition`
 * - Accept MarketingDemoProps (same prop interface)
 * - Export calculateMarketingDemoDuration for dynamic duration calculation
 * - Import building blocks from ./components/ (DeviceMockup, IntroCard, etc.)
 *
 * Template mode: narration.json can specify "template": "path/to/template"
 * and the pipeline will copy that template's composition.tsx here.
 */

export {
  MarketingDemo as VideoComposition,
  calculateMarketingDemoDuration,
} from "./MarketingDemo";
export type { MarketingDemoProps } from "./MarketingDemo";
