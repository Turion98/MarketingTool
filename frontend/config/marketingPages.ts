import type { Metadata } from "next";

export type MarketingPageCategory = "product" | "industry" | "use-case" | "resource";

export type MarketingPageTemplate = "marketing" | "industry" | "use-case" | "resource";

export interface MarketingPageConfig {
  slug: string;
  title: string;
  description: string;
  category: MarketingPageCategory;
  template: MarketingPageTemplate;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
}

const placeholderProblem =
  "Short placeholder: the visitor’s context and friction before they adopt a decision flow on their site.";

const placeholderExplains =
  "This page will explain the topic in depth after final copy is ready. For now it outlines structure only.";

const placeholderExamples = [
  "Placeholder example scenario A — e.g. routing a visitor to the right offer.",
  "Placeholder example scenario B — e.g. qualifying leads before a form.",
  "Placeholder example scenario C — e.g. self-serve onboarding paths.",
];

export const MARKETING_PAGE_EXAMPLE_PLACEHOLDERS = placeholderExamples;

export const MARKETING_PAGES: Record<string, MarketingPageConfig> = {
  features: {
    slug: "features",
    title: "Features",
    description:
      "A decision flow is not a form with a result at the end. It is a system that reads what answers imply together and narrows the space accordingly.",
    category: "product",
    template: "marketing",
    heroEyebrow: "Product",
    heroTitle: "Features",
    heroSubtitle:
      "Quiz logic vs decision architecture—combine answers, narrow paths, embed where hesitation happens.",
    bullets: ["Define system", "Embed in place", "Read combinations"],
    ctaLabel: "View demo flows",
    ctaHref: "/demos",
  },
  solutions: {
    slug: "solutions",
    title: "Solutions",
    description:
      "Choose a use case to explore how Questell works in real scenarios.",
    category: "product",
    template: "marketing",
    heroEyebrow: "Product",
    heroTitle: "Solutions",
    heroSubtitle: "Routing hub for use-case pages.",
    bullets: ["Product finder", "Campaign flows", "Onboarding flows"],
    ctaLabel: "See demos",
    ctaHref: "/demos",
  },
  integrations: {
    slug: "integrations",
    title: "Integrations",
    description:
      "Questell runs inside your existing page. One script or iframe, no rebuild, no separate microsite.",
    category: "product",
    template: "marketing",
    heroEyebrow: "Integrations",
    heroTitle: "The decision layer runs inside your page. Not somewhere else.",
    heroSubtitle:
      "Most interactive tools send users to a separate experience. Questell embeds where the decision already happens.",
    bullets: [
      "Script loader or direct iframe integration",
      "Ghost mode for seamless brand experience",
      "Unified analytics and signed access controls",
    ],
    ctaLabel: "Request your first flow",
    ctaHref: "/about",
  },
  pricing: {
    slug: "pricing",
    title: "Pricing",
    description: "Questell pricing — plans and packaging placeholder.",
    category: "product",
    template: "marketing",
    heroEyebrow: "Pricing",
    heroTitle: "Pricing",
    heroSubtitle: "Placeholder: tiers and what’s included — final numbers TBD.",
    bullets: [
      "Placeholder — starter for small sites",
      "Placeholder — team for growth",
      "Placeholder — enterprise options",
    ],
    ctaLabel: "Book a demo",
    ctaHref: "/demos",
  },
  demos: {
    slug: "demos",
    title: "Demos",
    description: "See Questell decision flows in action.",
    category: "product",
    template: "marketing",
    heroEyebrow: "Demos",
    heroTitle: "Demos",
    heroSubtitle: "Placeholder: guided demos and live examples.",
    bullets: [
      "Placeholder — interactive tour",
      "Placeholder — industry-specific flows",
      "Placeholder — sandbox environment",
    ],
    ctaLabel: "View examples",
    ctaHref: "/examples",
  },
  examples: {
    slug: "examples",
    title: "Examples",
    description: "Example Questell flows and patterns.",
    category: "resource",
    template: "marketing",
    heroEyebrow: "Resources",
    heroTitle: "Examples",
    heroSubtitle: "Placeholder: gallery of example flows and starting points.",
    bullets: [
      "Placeholder — by industry",
      "Placeholder — by use case",
      "Placeholder — clone and customize",
    ],
    ctaLabel: "Use cases",
    ctaHref: "/product-finder",
  },
  about: {
    slug: "about",
    title: "About",
    description: "About Questell — mission, team, and contact placeholder.",
    category: "resource",
    template: "marketing",
    heroEyebrow: "Company",
    heroTitle: "About Questell",
    heroSubtitle: "Placeholder: story, values, and how to reach us.",
    bullets: [
      "Placeholder — mission",
      "Placeholder — team",
      "Placeholder — careers link later",
    ],
    ctaLabel: "Pricing",
    ctaHref: "/pricing",
  },
  resources: {
    slug: "resources",
    title: "Resources",
    description: "Resources hub — guides, updates, and reference placeholder.",
    category: "resource",
    template: "resource",
    heroEyebrow: "Resources",
    heroTitle: "Resource hub",
    heroSubtitle: "Placeholder: central entry for docs, blog, and downloads when available.",
    bullets: [
      "Placeholder — getting started",
      "Placeholder — best practices",
      "Placeholder — changelog",
    ],
    ctaLabel: "Examples",
    ctaHref: "/examples",
  },
  agencies: {
    slug: "agencies",
    title: "Agencies",
    description:
      "Most interactive campaigns end at the click. Questell gives agencies a format that goes further: decision flows that respond to each user, reveal intent, and hold up as a case study.",
    category: "industry",
    template: "industry",
    heroEyebrow: "Industries",
    heroTitle: "Agencies",
    heroSubtitle:
      "A Questell flow is a decision experience that responds to each user, embeds into any page, and generates meaningful data—not a quiz, chatbot, or microsite.",
    bullets: ["Structured capability", "Deploy without rebuild", "Decision-level insight"],
    ctaLabel: "Request your first flow",
    ctaHref: "/about",
  },
  ecommerce: {
    slug: "ecommerce",
    title: "E-commerce",
    description:
      "A shopper alone with your catalog is not a browsing problem. It is a selling problem. Questell puts decision logic where your best salesperson would stand.",
    category: "industry",
    template: "industry",
    heroEyebrow: "Industries",
    heroTitle: "E-commerce",
    heroSubtitle:
      "Questell is the closing layer between what shoppers need and what the catalog shows—before they leave.",
    bullets: ["Catalog responds", "Expertise on-page", "Intent to structure"],
    ctaLabel: "Product finder",
    ctaHref: "/product-finder",
  },
  saas: {
    slug: "saas",
    title: "SaaS",
    description:
      "Most SaaS churn does not start at cancellation. It starts at the first wrong turn inside the product. Questell builds the decision layer that keeps users on the right path from the beginning.",
    category: "industry",
    template: "industry",
    heroEyebrow: "Industries",
    heroTitle: "SaaS",
    heroSubtitle:
      "Decision guidance inside the product—so the right path is clear before the wrong one becomes a habit.",
    bullets: ["Context before default", "Plan fit early", "Churn signals in paths"],
    ctaLabel: "Request your first flow",
    ctaHref: "/about",
  },
  "product-finder": {
    slug: "product-finder",
    title: "Product finder",
    description:
      "Decision logic behind your catalog: Questell interprets how answers combine, narrows the decision space step by step, and embeds on product, campaign, or collection pages—not a generic quiz in front of your SKUs.",
    category: "use-case",
    template: "use-case",
    heroEyebrow: "Use cases",
    heroTitle: "Product finder",
    heroSubtitle: "Guide users to the right product with a structured flow instead of full-catalog browsing.",
    bullets: [
      "Interpret combinations of answers, not isolated fields",
      "Narrow the decision space with every step",
      "Embed on product, campaign, or collection pages",
    ],
    ctaLabel: "E-commerce",
    ctaHref: "/ecommerce",
  },
  "campaign-flows": {
    slug: "campaign-flows",
    title: "Campaign flows",
    description:
      "A decision flow is not a quiz you attach to a campaign. It is the campaign — the moment a brand stops broadcasting and starts responding.",
    category: "use-case",
    template: "use-case",
    heroEyebrow: "Use cases",
    heroTitle: "Campaign flows",
    heroSubtitle:
      "Stateful campaign experiences: read signals in combination, narrow paths in the moment, and deliver outcomes that feel like the brand was paying attention.",
    bullets: [
      "Decision-level personalisation — the path changes, not just the message",
      "Agency-ready — embeddable, measurable, brand-safe, reusable logic",
      "Same architecture as product finders and onboarding — applied to campaigns",
    ],
    ctaLabel: "Build a campaign flow",
    ctaHref: "/about",
  },
  "onboarding-flows": {
    slug: "onboarding-flows",
    title: "Onboarding flows",
    description:
      "Interpret combined answers, not isolated clicks: stateful flows where paths narrow as context accumulates — questionnaire scale with decision-system outcomes.",
    category: "use-case",
    template: "use-case",
    heroEyebrow: "Use cases",
    heroTitle: "Onboarding flows",
    heroSubtitle:
      "Questell is stateful: each step changes what the next question means; the outcome reflects the full pattern, not the last response.",
    bullets: [
      "Combination logic — not quiz branching on single answers",
      "One content set, many paths; insight from decision patterns",
      "Business case: relevance, scalable architecture, trust through attention",
    ],
    ctaLabel: "About Questell",
    ctaHref: "/about",
  },
};

export function getMarketingPageConfig(slug: string): MarketingPageConfig {
  const config = MARKETING_PAGES[slug];
  if (!config) {
    throw new Error(`Unknown marketing page slug: ${slug}`);
  }
  return config;
}

export function marketingPageMetadata(slug: string): Metadata {
  const c = getMarketingPageConfig(slug);
  return {
    /* Parent (marketing) layout uses title.template "%s | Questell" — keep segment only. */
    title: c.title,
    description: c.description,
    openGraph: {
      title: `${c.title} | Questell`,
      description: c.description,
    },
  };
}

export const MARKETING_PLACEHOLDER_PROBLEM = placeholderProblem;
export const MARKETING_PLACEHOLDER_EXPLAINS = placeholderExplains;

/** Nav links — hrefs must match existing routes. */
export const MARKETING_NAV_PRODUCT = [
  { label: "Features", href: "/features" },
  { label: "Solutions", href: "/solutions" },
  { label: "Integrations", href: "/integrations" },
] as const;

export const MARKETING_NAV_INDUSTRIES = [
  { label: "Agencies", href: "/agencies" },
  { label: "E-commerce", href: "/ecommerce" },
  { label: "SaaS", href: "/saas" },
] as const;

/** Same four use cases as `/solutions` hub cards — order must match. */
export const MARKETING_NAV_USE_CASES = [
  { label: "Product finder", href: "/product-finder" },
  { label: "Campaign flows", href: "/campaign-flows" },
  { label: "Onboarding flows", href: "/onboarding-flows" },
] as const;
