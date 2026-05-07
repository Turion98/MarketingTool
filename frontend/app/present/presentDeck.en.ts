import type { PresentDeck } from "./presentDeck.types";

/** Questell present / EN — aligned with brief.txt; industry stats footnoted. */
export const presentDeckEn: PresentDeck = {
  definition: {
    visualHint: "embedFrame",
    variants: {
      short: {
        title: "What is Questell?",
        body:
          "An embeddable interactive widget that acts as a conversion layer on your existing site. Not a linear click-through quiz: it runs a dynamic decision journey and returns measurable signals.",
        bullets: [
          "Conversion layer on the same traffic",
          "Branching, stateful decision path",
          "Not a single linear questionnaire",
        ],
      },
      medium: {
        title: "What is Questell?",
        body:
          "Questell runs in an iframe: answers change state, the system advances along a decision graph — so the outcome is a contextual next step (recommendation, product, plan, CTA), not just a final score.",
        bullets: [
          "Same traffic — a decision layer on shop or landing",
          "Logic lives in editable JSON, not a rigid quiz template",
          "Alongside the output you get path and hesitation data",
        ],
      },
      full: {
        title: "What is Questell?",
        body:
          "An embeddable interactive experience that works as a conversion layer. It guides users through non-linear, dynamic decisions — not a simple quiz. Goal: more decisive progress and more conversions from the same traffic.",
        bullets: [
          "Embed via iframe, fast rollout",
          "Decision flow: AI + structured JSON",
          "Output + analytics: paths, drop-offs, timing",
        ],
      },
    },
  },
  outcome: {
    visualHint: "twoColumn",
    variants: {
      short: {
        title: "Same layer — examples now tune to you",
        body:
          "The intro set the idea: a decision-led experience on your existing site, not a linear quiz. We won't repeat it — one quick filter so the next screens match your context.",
        bullets: [
          "One choice: who is closest to what you build or sell?",
          "Then: where intent stalls, and what you'd deploy first with Questell.",
          "At the end: a tailored snapshot and concrete CTAs — not a generic brochure.",
        ],
      },
      medium: {
        title: "What changes?",
        body:
          "Traffic alone does not decide for the user. Questell narrows choices, sequences them, and surfaces where intent stalls — so marketing drives the next step, not only clicks.",
        bullets: [
          "Less random navigation",
          "More guided decisions",
          "Clearer line from traffic to revenue",
        ],
      },
      full: {
        title: "Outcome: decisions and revenue",
        body:
          "Without Questell: browse, doubt, bounce. With Questell: guided decisions and higher conversion from the same traffic. Main outcome: more revenue from the same traffic — not “prettier UX” alone.",
        bullets: [
          "Same ads / landing — different decision layer",
          "The funnel becomes observable, not only visited",
          "For agencies: one deploy pattern, many client use cases",
        ],
      },
    },
  },
  problem_metrics: {
    visualHint: "statGrid",
    variants: {
      short: {
        title: "A monetisation problem",
        body:
          "Too many options, too little guidance → uncertainty and exit. That is direct conversion and revenue leakage.",
        stats: [
          { label: "No purchase (too many options)", value: "64%" },
          { label: "Drop-off (decision complexity)", value: "20–40%" },
        ],
        footnote:
          "Industry / commonly cited ranges — not a guarantee for your site.",
      },
      medium: {
        title: "The problem is measurable",
        body:
          "Users face overloaded choice with weak guidance — that is revenue friction, not a minor UX tweak.",
        stats: [
          { label: "No purchase due to overchoice", value: "64%" },
          { label: "Drop-off from decision complexity", value: "20–40%" },
          { label: "Purchase: 24 vs 6 options", value: "3% vs 30%" },
        ],
        footnote:
          "Comparisons from industry sources; validate with your own A/B data.",
      },
      full: {
        title: "Too much choice, too little leadership",
        body:
          "Businesses lose conversions and often lack structured visibility into where intent dies. This is monetisation: not only visual polish.",
        stats: [
          { label: "Users overwhelmed (no buy)", value: "64%" },
          { label: "Drop-off (complexity)", value: "20–40%" },
          { label: "Purchase rate (24 vs 6 options)", value: "3% vs 30%" },
        ],
        bullets: [
          "The issue is structural and measurable",
          "Fix: guided decision layer + data",
        ],
        footnote:
          "Figures are industry references; always measure on your traffic.",
      },
    },
  },
  icp: {
    visualHint: "icpTags",
    variants: {
      short: {
        title: "Who is it for?",
        body:
          "Primarily agencies and partners who already move traffic and need fast client rollout.",
      },
      medium: {
        title: "Who pays first?",
        body:
          "Primary ICP: agencies — traffic, conversion pressure, repeatable deploys. Secondary: non-Shopify ecommerce, B2B SaaS, services, campaign owners.",
        bullets: [
          "Agency: speed + repeatable delivery",
          "Brand: same traffic, new decision layer",
          "End user wants a fast, confident decision",
        ],
      },
      full: {
        title: "Segments and buyer",
        body:
          "Performance agency owners (multiple shops, ROAS pressure) are the first paying wedge. Secondary: B2B SaaS, services, campaign owners. End users are overloaded and low on attention — they need guidance.",
        bullets: [
          "Agency: one engagement → many deployments",
          "Shop: product finder, seasonal, offers",
          "SaaS: packaging and qualification",
        ],
      },
    },
  },
  use_cases: {
    visualHint: "useCaseTiles",
    variants: {
      short: {
        title: "Use cases",
        body:
          "Primary GTM: ecommerce product finder — purchase impact, high pain, easy demo.",
      },
      medium: {
        title: "Use cases",
        body:
          "Fastest revenue narrative: product finder. Also: discovery, SaaS packaging, service qualification, campaign engagement, onboarding.",
        bullets: [
          "Product finder (primary GTM)",
          "Packaging, qualification",
          "Campaigns, education",
        ],
      },
      full: {
        title: "Where it wins",
        body:
          "Primary: ecommerce product finder — direct purchase impact, high pain, easy demo, fastest path to revenue. Also: discovery, SaaS plan choice, service qualification, campaign engagement, onboarding.",
        bullets: [
          "Finder: visible uplift in short windows",
          "SaaS: complex choice split into guided steps",
          "Campaigns: engagement + next step together",
        ],
      },
    },
  },
  mechanism: {
    visualHint: "stepFlow",
    variants: {
      short: {
        title: "How it works",
        bullets: [
          "Decision flow (AI / JSON)",
          "Embed (iframe)",
          "Answer → routing → output + data",
        ],
      },
      medium: {
        title: "Step by step",
        body:
          "Logic and copy live in a decision flow. You embed on the page; users answer; the system advances by state; you get an outcome and measurable events.",
        bullets: [
          "Author or generate JSON flows",
          "Iframe embed — no mandatory backend to start",
          "Analytics: paths, time, drop-offs",
        ],
      },
      full: {
        title: "The decision engine",
        body:
          "AI + JSON defines branches and states. Embed as iframe. Answers mutate state; the graph routes. Output: recommendation / product / next step + structured data for tuning.",
        bullets: [
          "1) Flow / logic",
          "2) Embed",
          "3) Interaction + state",
          "4) Output + analytics",
        ],
      },
    },
  },
  integration: {
    visualHint: "snippetChecks",
    variants: {
      short: {
        title: "Integration",
        body:
          "Iframe embed on any site. Fast deploy, low risk — no mandatory backend integration.",
        bullets: ["Iframe", "No mandatory backend", "Fast rollout"],
      },
      medium: {
        title: "Fast deploy, low risk",
        body:
          "Iframe-first: ship on existing pages without opening your core stack. Critical for agencies: less engineering dependency, faster client go-live.",
        bullets: [
          "Any page that accepts an iframe",
          "Low risk: no core system rewrite",
          "Quick first live version at clients",
        ],
      },
      full: {
        title: "Embed model",
        body:
          "Iframe embed, no mandatory backend integration, works across sites. Speed and repeatability matter most in agency workflows.",
        bullets: [
          "No mandatory private API project to start",
          "Landing, shop, campaign — same pattern",
          "Client-side engineering stays small",
        ],
      },
    },
  },
  ai_layer: {
    visualHint: "pipelineThree",
    variants: {
      short: {
        title: "AI layer",
        bullets: [
          "Context / page analysis",
          "Decision logic generation",
          "JSON flow",
        ],
      },
      medium: {
        title: "AI as core component",
        body:
          "AI is not decoration: analysis can seed structure, then logic generation and JSON flow — fast iteration on a real decision graph.",
        bullets: [
          "Analysis → logic → structured flow",
          "Branching aligned to the engine",
        ],
      },
      full: {
        title: "AI layer detail",
        body:
          "Page analysis, decision logic generation, JSON flow — the core component in the brief. Goal: ship a runnable graph quickly, then refine.",
        bullets: [
          "Context → rules and questions",
          "JSON: versionable, inspectable",
          "Faster pilots and hypotheses",
        ],
      },
    },
  },
  metrics_proof: {
    visualHint: "proofSplit",
    variants: {
      short: {
        title: "Measurable impact",
        body:
          "Completion, decision time, uplift, path efficiency, drop-offs. North star: conversion → revenue.",
      },
      medium: {
        title: "Metrics and proof",
        body:
          "Beyond “it ran”: completion, decision time, uplift, efficiency, drop-offs. Industry references: +20–35% conversion, +5–15% revenue, ~2× interactive uplift (not a guarantee).",
        footnote:
          "Industry baselines; measure your own. Internal demo: ~40% faster decisions; +25–30% more users reach product choice — pilot-labelled.",
      },
      full: {
        title: "Impact and numbers",
        body:
          "North star: conversion → revenue. Supporting: time to decision, path efficiency, drop-offs. Separate industry claims from internal demos.",
        stats: [
          { label: "Conversion (industry range)", value: "+20–35%" },
          { label: "Revenue (industry range)", value: "+5–15%" },
          { label: "Interactive uplift (range)", value: "~2×" },
        ],
        bullets: [
          "Category tools publish large uplifts (Zoovu, Aiden, Crobox/Octane — public claims)",
          "Internal demo: ~40% faster decision; +25–30% more users to product choice",
        ],
        footnote:
          "Keep industry vs internal labelling clear in copy and legal review.",
      },
    },
  },
  competitive: {
    visualHint: "compareColumns",
    variants: {
      short: {
        title: "Competitive frame",
        body:
          "Enterprise guided selling is expensive and heavy; quiz tools are often linear; generic forms lack a decision engine.",
      },
      medium: {
        title: "Where Questell sits",
        body:
          "Enterprise (Zoovu, Crobox, Neocom, Aiden): strong logic, €400–1000+/mo, complex. Ecommerce quizzes: more linear. Generic: no engine. Questell: embed + decision logic + AI + SMB pricing.",
        bullets: [
          "Enterprise: strong but costly",
          "Quiz tools: linear limits",
          "Questell: decision layer for SMB",
        ],
      },
      full: {
        title: "Market gap",
        body:
          "Enterprise is €400–1000+/mo and complex. Quizzes are linear with limited routing. Generic lacks a decision engine. Public competitor uplifts show the category moves revenue — Questell targets SMB + embed + decision graph.",
        bullets: [
          "Strategy: enterprise too expensive, generic too weak for decisions",
          "Questell: guided conversion system, not a quiz builder",
        ],
        footnote:
          "Competitor figures from public materials — careful with comparative claims.",
      },
    },
  },
  closest_competitor: {
    visualHint: "checkTable",
    variants: {
      short: {
        title: "Why not a “quiz tool”?",
        body:
          "Closest pattern is often linear: no decision graph, weak state, limited routing.",
      },
      medium: {
        title: "Linear quiz vs decision system",
        body:
          "RevenueHunt-style tools: linear flow, no decision graph, limited state and routing. Questell is a decision system: state, graph, routing.",
        checklist: [
          { ok: false, label: "Linear click-through as the core" },
          { ok: true, label: "Stateful branching" },
          { ok: true, label: "Paths and drop-offs interpretable" },
          { ok: true, label: "JSON decision flow" },
        ],
      },
      full: {
        title: "Comparison plane",
        body:
          "Brief anchor: closest category is linear quiz software. Questell: not a quiz builder — a decision system with graph, state, routing.",
        checklist: [
          { ok: false, label: "Single linear path" },
          { ok: false, label: "No decision graph" },
          { ok: false, label: "No real state machine" },
          { ok: true, label: "Questell: graph + state + routing" },
        ],
      },
    },
  },
  positioning_messaging: {
    visualHint: "badgeRow",
    variants: {
      short: {
        title: "Positioning",
        body: "Decision layer. Guided conversion system. Not a quiz — a decision engine.",
        badges: ["Decision layer", "Guided conversion"],
      },
      medium: {
        title: "Core messaging",
        body:
          "Not a quiz. A decision engine. Traffic → decisions → revenue. Buyer language: interactive product finder, guided selection — clarified as decision-led, not entertainment trivia.",
        badges: ["Decision engine", "Guided conversion", "Product finder"],
      },
      full: {
        title: "Positioning and trigger",
        body:
          "Questell is a decision layer and guided conversion system. Adoption trigger: funnel weak, conversion low, pressure — “we need something new”. Buyer phrases: interactive product finder, guided selection, quiz that leads to a product — all reframed as a decision layer.",
        badges: ["Decision layer", "Guided conversion", "Traffic → revenue"],
        bullets: [
          "Message: structured decisions, not more copy",
          "Outcome: conversion and revenue focus",
        ],
      },
    },
  },
  offer_pricing_cta: {
    visualHint: "pricingGrid",
    variants: {
      short: {
        title: "Get started",
        body:
          "€179 one-time build (flow + logic + embed + analytics), then SaaS €59 / 1 flow, €119 / 3 flows, €199+ scale.",
      },
      medium: {
        title: "MVP offer",
        body:
          "Not “subscription only”: a working system to start. €179 build, then run and measure on SaaS.",
        pricing: [
          { name: "Starter", price: "€59/mo", detail: "1 flow" },
          { name: "Growth", price: "€119/mo", detail: "3 flows" },
          { name: "Scale", price: "€199+", detail: "talk to us" },
        ],
        checklistOffer: [
          "Flow build + decision structure",
          "Embed",
          "Analytics",
        ],
        footnote:
          "Outcome claims (+15–25% more decisions, ~20% more checkout) should stay pilot/internal until public case studies exist.",
      },
      full: {
        title: "Pricing and next step",
        body:
          "SaaS: €59/mo — 1 flow; €119/mo — 3 flows; €199+ scale. Entry: €179 one-time — build, logic + structure, embed, analytics. Then it runs and you measure. Key: a working system to start, not “just a tool”.",
        pricing: [
          { name: "Build", price: "€179", detail: "one-time starter" },
          { name: "Starter", price: "€59/mo", detail: "1 flow" },
          { name: "Growth", price: "€119/mo", detail: "3 flows" },
        ],
        checklistOffer: [
          "Flow + decision structure",
          "Embed (iframe)",
          "Analytics / export direction",
          "SaaS run and scale",
        ],
        footnote:
          "Pilot results labelled separately; always validate on your traffic.",
      },
    },
  },
};
