import React from "react";
import { Composition } from "remotion";
import { Demo } from "./Demo";
import { MarketingDemo, calculateMarketingDemoDuration } from "./MarketingDemo";
import { VideoComposition, calculateMarketingDemoDuration as calcVideoDuration } from "./VideoComposition";
import { ScoutReplay, calculateScoutReplayDuration } from "./ScoutReplay";
import { AnimatedKPICards } from "./components/scenes/AnimatedKPICards";
import { ProductShowcase } from "./components/scenes/ProductShowcase";
import { FeatureHighlight } from "./components/scenes/FeatureHighlight";
import { AnimatedBarChart } from "./components/scenes/AnimatedBarChart";
import { TransitionCard } from "./components/TransitionCard";
import { ChapterCard } from "./components/ChapterCard";
import { CustomIntro } from "./components/CustomIntro";
import { CustomOutro } from "./components/CustomOutro";

const FPS = 30;

// ── Sample data for scene previews ──────────────────────────────────────

const sampleKPIs = [
  { label: "Today's Sales", value: 4285, prefix: "$", change: 12.5, icon: "💰" },
  { label: "Transactions", value: 47, change: 8.3, icon: "🧾" },
  { label: "Avg Order", value: 91, prefix: "$", change: -2.1, icon: "📊" },
  { label: "Customers", value: 38, change: 15.0, icon: "👥" },
];

const sampleProducts = [
  { name: "Blue Dream", category: "Flower", price: 32.99, thc: "22%", strain: "Hybrid" as const, weight: "3.5g" },
  { name: "OG Kush", category: "Flower", price: 38.99, thc: "26%", strain: "Indica" as const, weight: "3.5g" },
  { name: "Sour Diesel", category: "Flower", price: 34.99, thc: "24%", strain: "Sativa" as const, weight: "3.5g" },
  { name: "Girl Scout Cookies", category: "Flower", price: 41.99, thc: "28%", strain: "Hybrid" as const, weight: "3.5g" },
  { name: "Northern Lights", category: "Flower", price: 29.99, thc: "20%", strain: "Indica" as const, weight: "3.5g" },
  { name: "Jack Herer", category: "Flower", price: 35.99, thc: "23%", strain: "Sativa" as const, weight: "3.5g" },
];

const sampleFeatures = [
  { icon: "⚡", title: "Quick PIN Login", description: "Clerks sign in with a 4-digit PIN — no passwords, no delays" },
  { icon: "💳", title: "Flexible Payments", description: "Cash, debit, credit, and split payments with automatic change calculation" },
  { icon: "📦", title: "Real-Time Inventory", description: "Stock updates instantly across all connected registers and online store" },
  { icon: "🏷️", title: "Smart Discounts", description: "Percentage, dollar amount, campaigns, loyalty tiers, and freebie promotions" },
  { icon: "📊", title: "Sales Reports", description: "End-of-day, weekly, monthly reports with margin analysis and tax breakdown" },
  { icon: "🖨️", title: "Label & Receipt Printing", description: "Network ESC/POS receipts and ZPL barcode labels with custom templates" },
];

const sampleBars = [
  { label: "Flower", value: 12450 },
  { label: "Pre-Rolls", value: 8320 },
  { label: "Edibles", value: 6180 },
  { label: "Vapes", value: 5490 },
  { label: "Concentrates", value: 3870 },
  { label: "Accessories", value: 2150 },
  { label: "Topicals", value: 980 },
];

// ── Compositions ────────────────────────────────────────────────────────

export const RemotionRoot: React.FC = () => (
  <>
    {/* Main demo composition */}
    <Composition
      id="Demo"
      component={Demo}
      calculateMetadata={({ props }) => {
        const total =
          (props.introDurationFrames || 240) +
          (props.transitionDurationFrames || 0) +
          (props.videoDurationFrames || 2100) +
          (props.outroDurationFrames || 150);
        return { durationInFrames: total };
      }}
      durationInFrames={2600}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        wordTimings: [],
        lowerThirds: [],
        zoomRegions: [],
        showAvatar: true,
        audioVolume: 1.3,
        introDurationFrames: 240,
        transitionDurationFrames: 90,
        videoDurationFrames: 2100,
        outroDurationFrames: 150,
        captionStyle: "pop" as const,
      }}
    />

    {/* Marketing demo — device mockup + callouts + transitions */}
    <Composition
      id="MarketingDemo"
      component={MarketingDemo}
      calculateMetadata={({ props }) => ({
        durationInFrames: calculateMarketingDemoDuration(props),
      })}
      durationInFrames={2600}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        wordTimings: [],
        lowerThirds: [],
        zoomRegions: [],
        callouts: [],
        showAvatar: false,
        showPresenter: true,
        mouthCues: [],
        audioVolume: 1.3,
        introDurationFrames: 240,
        transitionDurationFrames: 0,
        videoDurationFrames: 2100,
        outroDurationFrames: 180,
        captionStyle: "pop" as const,
      }}
    />

    {/* VideoComposition — swappable per-demo render target */}
    <Composition
      id="VideoComposition"
      component={VideoComposition}
      calculateMetadata={({ props }) => ({
        durationInFrames: calcVideoDuration(props),
      })}
      durationInFrames={2600}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        wordTimings: [],
        lowerThirds: [],
        zoomRegions: [],
        callouts: [],
        showAvatar: false,
        showPresenter: false,
        mouthCues: [],
        audioVolume: 1.3,
        introDurationFrames: 150,
        transitionDurationFrames: 0,
        videoDurationFrames: 2100,
        outroDurationFrames: 180,
        captionStyle: "pop" as const,
      }}
    />

    {/* Scout-based replay composition (screenshot + cursor animations) */}
    <Composition
      id="ScoutReplay"
      component={ScoutReplay}
      calculateMetadata={({ props }) => ({
        durationInFrames: calculateScoutReplayDuration(props),
      })}
      durationInFrames={600}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        scenes: [
          {
            screenshotBefore: "screenshots/seq-1.png",
            actions: [
              {
                type: "click" as const,
                bounds: { x: 800, y: 400, w: 120, h: 40 },
                label: "Login",
                delayFrames: 30,
              },
            ],
            durationFrames: 150,
            lowerThird: "Login Screen",
          },
        ],
        wordTimings: [],
        captionStyle: "pop" as const,
        showAvatar: false,
        audioVolume: 1.3,
        introDurationFrames: 150,
        outroDurationFrames: 150,
      }}
    />

    {/* Transition card — section break between register and admin */}
    <Composition
      id="TransitionCard"
      component={TransitionCard}
      durationInFrames={150}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        heading: "Admin Dashboard",
        subtitle: "Managing Everything Behind the Scenes",
      }}
    />

    {/* RezWeed custom intro */}
    <Composition
      id="RezWeed-Intro"
      component={CustomIntro}
      durationInFrames={150}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        tagline: "Find Native Dispensaries Near You",
        subtitle: "RezWeed — Indigenous Cannabis Directory",
        accentColor: "rgba(45, 74, 62, 1)",
      }}
    />

    {/* RezWeed custom outro */}
    <Composition
      id="RezWeed-Outro"
      component={CustomOutro}
      durationInFrames={120}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        heading: "Find yours at rezweed.com",
        url: "rezweed.com",
        ctaText: "Browse Now",
        accentColor: "rgba(45, 74, 62, 1)",
      }}
    />

    {/* Chapter card — cinematic segment divider between scenes */}
    <Composition
      id="ChapterCard"
      component={ChapterCard}
      durationInFrames={75}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        chapterNumber: 1,
        title: "Quick PIN Login",
        subtitle: "Streamlined staff authentication",
        accentColor: "rgba(34, 197, 94, 1)",
      }}
    />

    <Composition
      id="ChapterCard-Blue"
      component={ChapterCard}
      durationInFrames={75}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        chapterNumber: 3,
        title: "AI Website Builder",
        subtitle: "Generate a full site in seconds",
        accentColor: "rgba(59, 130, 246, 1)",
      }}
    />

    {/* ── Native scene templates (preview in Remotion Studio) ── */}

    <Composition
      id="Scene-KPICards"
      component={AnimatedKPICards}
      durationInFrames={150}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        cards: sampleKPIs,
        title: "Today's Dashboard",
      }}
    />

    <Composition
      id="Scene-Products"
      component={ProductShowcase}
      durationInFrames={180}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        products: sampleProducts,
        title: "Product Catalog",
        spotlightIndex: 0,
      }}
    />

    <Composition
      id="Scene-Features"
      component={FeatureHighlight}
      durationInFrames={210}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        features: sampleFeatures,
        heading: "BrotherPOS Features",
        subheading: "Everything you need to run your dispensary",
      }}
    />

    <Composition
      id="Scene-BarChart"
      component={AnimatedBarChart}
      durationInFrames={180}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{
        bars: sampleBars,
        title: "Sales by Category",
        subtitle: "Last 30 days",
        valuePrefix: "$",
      }}
    />
  </>
);
