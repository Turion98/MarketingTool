import Link from "next/link";
import s from "./videoPage.module.scss";

const trustLogos = ["Shopify", "Google", "Meta", "HubSpot", "Stripe", "Mailchimp"];

const valueProps = [
  {
    title: "All-in-one platform",
    text: "Access all your tools, workflows, data streams, and operational layers in a single unified environment built for flexibility and long-term scalability.",
  },
  {
    title: "Flexible workflows",
    text: "Adapt processes, teams, and operational structures with configurable workflows that support changing business needs.",
  },
  {
    title: "Real-time insights",
    text: "Monitor performance, engagement, and operational data through dashboards designed to surface actionable opportunities.",
  },
  {
    title: "Seamless integrations",
    text: "Connect your tools, platforms, and systems in a way that supports continuity across your existing processes.",
  },
  {
    title: "Team collaboration",
    text: "Improve internal visibility and cross-functional alignment with shared access to data, workflows, and reporting.",
  },
  {
    title: "Scalable infrastructure",
    text: "Support long-term growth with a platform architecture designed for performance, flexibility, and operational resilience.",
  },
];

const featureGrid = [
  ["Automation tools", "Reduce repetitive execution across daily operations."],
  ["Advanced analytics", "View trends and performance signals in one place."],
  ["Custom integrations", "Connect key services and systems with less friction."],
  ["User management", "Manage roles, access, and team-level permissions."],
  ["Security & compliance", "Maintain enterprise-ready controls and governance."],
  ["Performance optimization", "Support stable speed as your operations expand."],
  ["Workflow templates", "Launch faster with reusable process building blocks."],
  ["Multi-team access", "Enable shared workflows across distributed teams."],
  ["Reporting dashboards", "Track activity with structured operational reports."],
  ["Data visibility", "Keep critical metrics and updates easier to spot."],
  ["Smart alerts", "Surface changes that may need team attention."],
  ["Campaign controls", "Coordinate campaign execution with fewer handoffs."],
];

const moreCapabilities = [
  ["Smart automation", "Automate recurring actions across team workflows."],
  ["Advanced workflows", "Structure operations with flexible process paths."],
  ["Real-time monitoring", "Observe operational movement as it happens."],
  ["Data orchestration", "Align signals from multiple systems and teams."],
  ["Team coordination", "Keep collaboration aligned across key functions."],
  ["Operational visibility", "Give teams broader context for daily execution."],
];

const repetitiveCapabilities = [
  ["Automation", "Automate recurring execution patterns across your teams."],
  ["Insights", "Review operational signals and evolving performance trends."],
  ["Workflows", "Configure process logic around shifting business priorities."],
  ["Collaboration", "Coordinate teams with shared visibility and unified context."],
  ["Reporting", "Track outcomes through consolidated reporting and summaries."],
];

const modernOrganizationCards = [
  ["Flexibility", "Support changing priorities with adaptable workflows and configurable operating models across teams."],
  ["Scalability", "Extend execution capacity over time through repeatable structures and shared operational standards."],
  ["Visibility", "Improve cross-functional awareness with centralized reporting and consistent access to core signals."],
  ["Efficiency", "Reduce friction in daily execution by aligning workflows, ownership, and delivery expectations."],
];

const onePlatformCards = [
  ["Workflows", "Build structured workflows that align operational execution across teams."],
  ["Automation", "Automate repeatable processes to reduce manual coordination overhead."],
  ["Analytics", "Monitor broad performance trends through shared reporting patterns."],
  ["Insights", "Surface actionable context from operational and customer-facing activity."],
  ["Reporting", "Consolidate updates and outcomes into recurring reporting layers."],
];

const benefits = [
  "Faster decisions",
  "Better insights",
  "More control",
  "Higher efficiency",
  "Improved performance",
  "Reduced complexity",
  "Scalable workflows",
  "Enhanced visibility",
  "Better coordination",
  "Operational clarity",
];

const useCases = [
  ["Marketing teams", "Plan, execute, and optimize campaigns with better insights and coordination."],
  ["Sales teams", "Manage pipelines, track performance, and close deals more efficiently."],
  ["Customer support", "Improve response times and deliver better customer experiences."],
  ["E-commerce businesses", "Optimize product performance and streamline operations."],
  ["SaaS companies", "Manage user journeys, onboarding, and retention strategies."],
  ["Agencies", "Handle multiple clients, campaigns, and workflows in one place."],
  ["Startups", "Build consistent processes while scaling your execution model."],
  ["Enterprise teams", "Coordinate large teams and complex operational structures."],
  ["Freelancers", "Organize workstreams and simplify delivery processes."],
  ["Consultants", "Manage projects, reporting, and collaboration across clients."],
  ["Healthcare", "Coordinate teams and workflows across service delivery environments."],
  ["Finance", "Support controlled operations with greater process consistency."],
  ["Education", "Streamline communication, planning, and execution across stakeholders."],
];

export default function DashboardVideoPage() {
  const trustBarSecondary = ["Google", "Shopify", "Stripe", "HubSpot", "Meta", "Salesforce"];
  const integrationItems = [
    "Shopify",
    "Google",
    "Meta",
    "HubSpot",
    "Stripe",
    "Mailchimp",
    "Slack",
    "Zapier",
    "Salesforce",
    "Notion",
    "Airtable",
    "Klaviyo",
    "WooCommerce",
    "Wix",
    "Webflow",
    "GA4",
    "Segment",
    "Intercom",
    "Asana",
    "Trello",
    "Monday",
    "ClickUp",
    "Pipedrive",
    "Zendesk",
    "Mixpanel",
    "Amplitude",
    "Miro",
    "Figma",
    "Heap",
    "Hotjar",
    "Basecamp",
    "Jira",
  ];

  return (
    <div className={s.page}>
      <section className={`${s.section} ${s.hero}`}>
        <p className={s.kicker}>Feature Video Draft Page</p>
        <h1>Grow your business with a smarter all-in-one platform</h1>
        <p className={s.lead}>
          Manage your workflows, optimize performance, streamline operations, improve
          collaboration, and unlock scalable growth opportunities across your entire business
          ecosystem.
        </p>
        <div className={`${s.ctaRow} ${s.ctaGroupTight}`}>
          <Link href="#final-cta" className={s.btnEqual}>Get started</Link>
          <Link href="#how-it-works" className={s.btnEqual}>Book demo</Link>
          <Link href="#pricing" className={s.btnEqual}>Try for free</Link>
        </div>
        <p className={s.trustLine}>No credit card required · Free trial available · Cancel anytime</p>
        <Link href="#feature-grid" className={s.subtleCta}>Explore features</Link>
      </section>

      <section className={`${s.section} ${s.trustBar}`}>
        {trustLogos.map((logo) => (
          <div key={logo} className={s.logoPill} aria-label={logo}>
            <span className={s.logoText}>{logo}</span>
          </div>
        ))}
      </section>

      <section className={s.section}>
        <h2>Everything you need to scale efficiently</h2>
        <div className={s.grid3}>
          {valueProps.map((item) => (
            <article key={item.title} className={s.card}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="feature-grid" className={`${s.section} ${s.sectionDense}`}>
        <h2>Powerful features for growing businesses</h2>
        <div className={s.featureDense}>
          {featureGrid.map(([title, text]) => (
            <article key={title} className={`${s.card} ${s.miniCard}`}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.sectionDense}`}>
        <h2>More capabilities for modern teams</h2>
        <div className={s.grid3}>
          {moreCapabilities.map(([title, text]) => (
            <article key={title} className={`${s.card} ${s.miniCard}`}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.chaoticHybrid}`}>
        <h2>Everything your business needs — and more</h2>
        <div className={s.chaoticGrid}>
          <article className={s.card}>
            <h3>Workflow continuity</h3>
            <p>Maintain cross-functional process continuity across teams and systems.</p>
          </article>
          <article className={s.card}>
            <h3>Scalable operations</h3>
            <p>Support growth phases with repeatable execution and adaptable planning.</p>
          </article>
          <article className={s.card}>
            <h3>Unified visibility</h3>
            <p>Track evolving business signals through shared dashboards and reports.</p>
          </article>
          <div className={s.chaoticNarrative}>
            <p>
              Teams use the platform to connect workflows, improve execution consistency, align
              operational planning, and surface performance opportunities across departments. This
              creates a centralized layer that supports collaboration, adaptability, and long-term
              growth readiness across changing business conditions.
            </p>
            <div className={s.ctaRow}>
              <Link href="#pricing" className={s.btnEqual}>Explore plans</Link>
              <Link href="#final-cta" className={s.btnEqual}>Get started</Link>
            </div>
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.ctaConflict}`}>
        <h2>Get started your way</h2>
        <div className={s.ctaConflictRow}>
          <Link href="#final-cta" className={s.btnEqual}>Start now</Link>
          <Link href="#how-it-works" className={s.btnEqual}>Book a demo</Link>
          <Link href="#pricing" className={s.btnEqual}>Talk to sales</Link>
          <Link href="#feature-grid" className={s.btnEqual}>Explore features</Link>
        </div>
      </section>

      <section className={`${s.section} ${s.split}`}>
        <div>
          <h2>Built to support every stage of growth</h2>
          <p>
            Our platform is designed to help teams manage complexity, reduce manual work, improve
            visibility, and support more consistent execution across the full customer and
            operational lifecycle.
          </p>
        </div>
        <div className={s.stack}>
          <article className={s.card}><h3>Onboarding</h3><p>Quickly guide new users to value with intuitive onboarding flows.</p></article>
          <article className={s.card}><h3>Automation</h3><p>Automate your processes and eliminate repetitive tasks.</p></article>
          <article className={s.card}><h3>Insights</h3><p>Get actionable insights to drive better decision-making.</p></article>
          <article className={s.card}><h3>Collaboration</h3><p>Keep teams aligned with shared context and access.</p></article>
        </div>
      </section>

      <section className={`${s.section} ${s.metrics}`}>
        <h2>Trusted by businesses worldwide</h2>
        <div className={s.metricRow}>
          <div><strong>100,000+</strong><span>active users</span></div>
          <div><strong>99.9%</strong><span>uptime</span></div>
          <div><strong>50+</strong><span>integrations</span></div>
          <div><strong>24/7</strong><span>customer support</span></div>
        </div>
        <div className={s.badgeRow}>
          <span className={s.badge}>Trusted globally</span>
          <span className={s.badge}>Used by leading teams</span>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionDense}`}>
        <h2>Why teams choose our platform</h2>
        <div className={s.featureDense}>
          {benefits.map((item) => (
            <article key={item} className={`${s.card} ${s.miniCard}`}><h3>{item}</h3></article>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.sectionDense}`}>
        <h2>What you can do with the platform</h2>
        <div className={s.grid3}>
          {repetitiveCapabilities.map(([title, text]) => (
            <article key={title} className={`${s.card} ${s.miniCard}`}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.deadZone}`}>
        <h2>Built for performance and scalability</h2>
        <p>
          The platform is designed to support teams through changing operational demands by
          combining workflow flexibility, performance visibility, and broad system connectivity in
          one unified operating layer. This allows teams to align execution across planning,
          delivery, reporting, and continuous improvement while adapting to evolving business
          priorities.
        </p>
        <p>
          As organizations expand, teams can standardize recurring execution patterns, maintain
          process continuity across departments, and preserve visibility into outcomes through
          shared data structures and centralized operational controls that support sustained growth
          initiatives.
        </p>
      </section>

      <section className={`${s.section} ${s.sectionDense}`}>
        <h2>Built for modern organizations</h2>
        <div className={s.grid4}>
          {modernOrganizationCards.map(([title, text]) => (
            <article key={title} className={`${s.card} ${s.miniCard}`}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.sectionDense}`}>
        <h2>One platform for everything</h2>
        <div className={s.grid5}>
          {onePlatformCards.map(([title, text]) => (
            <article key={title} className={`${s.card} ${s.miniCard}`}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.logoRowSecondary}`}>
        <h2>Trusted by leading brands</h2>
        <div className={s.trustBar}>
          {trustBarSecondary.map((logo) => (
            <div key={logo} className={s.logoPill}>
              <span className={s.logoText}>{logo}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={`${s.section} ${s.sectionTight}`}>
        <h2>Designed for every team</h2>
        <div className={s.grid3}>
          {useCases.map(([title, text]) => (
            <article key={title} className={s.card}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className={s.section}>
        <h2>How it works</h2>
        <ol className={s.steps}>
          <li><h3>Set up your workspace</h3><p>Configure your environment and connect your operational tools.</p></li>
          <li><h3>Customize your workflows</h3><p>Adapt workflows to match your team structure and process needs.</p></li>
          <li><h3>Track and optimize</h3><p>Review activity and make adjustments over time as goals evolve.</p></li>
        </ol>
      </section>

      <section className={`${s.section} ${s.sectionDense}`}>
        <h2>Explore our platform in detail</h2>
        <div className={s.grid4}>
          <article className={s.card}><h3>Dashboard overview</h3><p>Get a complete view of your performance metrics and activity in one place.</p></article>
          <article className={s.card}><h3>Workflow builder</h3><p>Create and manage workflows that fit your business needs.</p></article>
          <article className={s.card}><h3>Automation rules</h3><p>Define rules to automate tasks and reduce manual effort.</p></article>
          <article className={s.card}><h3>Data insights</h3><p>Analyze trends and uncover opportunities for growth.</p></article>
          <article className={s.card}><h3>Reporting tools</h3><p>Generate reports to share insights across your organization.</p></article>
          <article className={s.card}><h3>Team permissions</h3><p>Control team access and operational visibility across workflows.</p></article>
          <article className={s.card}><h3>API access</h3><p>Connect data and process layers across your platform ecosystem.</p></article>
          <article className={s.card}><h3>Custom configurations</h3><p>Adjust platform behavior to fit your evolving business model.</p></article>
        </div>
      </section>

      <section className={`${s.section} ${s.midCta}`}>
        <h2>Start your journey today</h2>
        <p>
          Bring your workflows, teams, and data together in one place designed to support modern
          growth.
        </p>
        <div className={s.ctaRow}>
          <Link href="#final-cta" className={s.btnPrimary}>Get started</Link>
          <Link href="#pricing" className={s.btnGhost}>Explore plans</Link>
        </div>
      </section>

      <section className={s.section}>
        <h2>What our customers say</h2>
        <div className={s.grid3}>
          <blockquote className={s.quote}>“Game changer.”</blockquote>
          <blockquote className={s.quote}>“Helped us grow.”</blockquote>
          <blockquote className={s.quote}>“Highly recommend.”</blockquote>
          <blockquote className={s.quote}>“Great experience.”</blockquote>
          <blockquote className={s.quote}>“Very useful tool.”</blockquote>
          <blockquote className={s.quote}>“Improved our workflow.”</blockquote>
        </div>
      </section>

      <section className={s.section}>
        <h2>Customer success stories</h2>
        <div className={s.grid2}>
          <article className={s.card}><h3>Case study: E-commerce brand</h3><p>Improved efficiency across product discovery and campaign execution.</p></article>
          <article className={s.card}><h3>Case study: SaaS company</h3><p>Streamlined internal workflows and supported more scalable growth.</p></article>
          <article className={s.card}><h3>Case study: Agency</h3><p>Managed multiple clients and campaigns with greater operational consistency.</p></article>
          <article className={s.card}><h3>Case study: Service business</h3><p>Improved visibility, coordination, and overall performance.</p></article>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionDense} ${s.integrationOverload}`}>
        <h2>Works with your favorite tools</h2>
        <div className={s.integrationGrid}>
          {integrationItems.map((tag) => <span key={tag} className={s.tag}>{tag}</span>)}
        </div>
      </section>

      <section className={`${s.section} ${s.deadZone}`}>
        <h2>Complex problems require flexible solutions</h2>
        <p>
          Modern teams operate across fragmented systems, changing priorities, and layered delivery
          expectations. A flexible platform model helps organizations coordinate planning,
          execution, and reporting through shared structures that can evolve over time without
          disrupting operational continuity.
        </p>
        <p>
          As execution environments become more complex, teams often need configurable workflows,
          adaptable collaboration models, and broader visibility into outcomes. This enables
          organizations to align strategy with delivery while preserving the flexibility required for
          sustainable growth.
        </p>
        <ul className={s.deadZoneList}>
          <li>Adapt processes without rebuilding operational foundations</li>
          <li>Align teams around shared execution and reporting patterns</li>
          <li>Maintain visibility across shifting priorities and timelines</li>
        </ul>
      </section>

      <section className={`${s.section} ${s.ctaConflict}`}>
        <h2>Choose the path that fits your team</h2>
        <div className={s.ctaConflictRow}>
          <Link href="#final-cta" className={s.btnEqual}>Start now</Link>
          <Link href="#pricing" className={s.btnEqual}>Explore plans</Link>
          <Link href="#how-it-works" className={s.btnEqual}>Book demo</Link>
          <Link href="#pricing" className={s.btnEqual}>Talk to sales</Link>
        </div>
      </section>

      <section id="pricing" className={s.section}>
        <h2>Simple and flexible pricing</h2>
        <div className={s.pricingGrid}>
          <article className={s.card}><h3>Basic</h3><p>For teams getting started with core workflows.</p><button type="button" className={s.planBtn}>Start now</button></article>
          <article className={s.card}><h3>Starter</h3><p>For small teams building repeatable operating habits.</p><button type="button" className={s.planBtn}>Start now</button></article>
          <article className={s.card}><h3>Pro</h3><p>For growing teams expanding execution capacity.</p><button type="button" className={s.planBtn}>Upgrade</button></article>
          <article className={s.card}><h3>Advanced</h3><p>For larger teams coordinating cross-functional workflows.</p><button type="button" className={s.planBtn}>Contact us</button></article>
          <article className={s.card}><h3>Enterprise</h3><p>For organizations with layered operational requirements.</p><button type="button" className={s.planBtn}>Talk to sales</button></article>
          <article className={s.card}><h3>Custom</h3><p>For teams needing tailored rollout and support options.</p><button type="button" className={s.planBtn}>Contact us</button></article>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionTight}`}>
        <h2>Frequently asked questions</h2>
        <div className={s.faq}>
          <article className={s.card}><h3>How does the platform work?</h3><p>The platform brings workflows, teams, and data into one shared operational layer.</p></article>
          <article className={s.card}><h3>Is it easy to set up?</h3><p>Setup is designed to be straightforward with guided onboarding and flexible configuration.</p></article>
          <article className={s.card}><h3>Can I integrate my existing tools?</h3><p>Yes, the platform supports a broad set of integrations and connector options.</p></article>
          <article className={s.card}><h3>What kind of support do you offer?</h3><p>Support options include standard channels and extended enterprise assistance.</p></article>
          <article className={s.card}><h3>Is there a free trial?</h3><p>Trial availability depends on plan and rollout requirements.</p></article>
          <article className={s.card}><h3>Can multiple teams use it?</h3><p>Yes, multi-team collaboration and shared access are supported across plans.</p></article>
          <article className={s.card}><h3>Do you offer custom plans?</h3><p>Custom plans are available for organizations with specific operational needs.</p></article>
          <article className={s.card}><h3>How long does onboarding take?</h3><p>Onboarding timelines vary based on scope, integrations, and team readiness.</p></article>
          <article className={s.card}><h3>Can we start with one department first?</h3><p>Teams can usually begin with a narrower rollout and extend usage as internal alignment improves.</p></article>
          <article className={s.card}><h3>Does this support international teams?</h3><p>The platform can support distributed teams with shared visibility and centralized operational workflows.</p></article>
          <article className={s.card}><h3>Can we adapt this to existing processes?</h3><p>Most teams configure workflows around current operating structures before introducing broader optimization changes.</p></article>
          <article className={s.card}><h3>How quickly can teams see operational impact?</h3><p>Impact timelines vary by rollout scope, internal adoption readiness, and process complexity across teams.</p></article>
        </div>
      </section>

      <section className={s.section}>
        <h2>Latest insights and resources</h2>
        <div className={s.grid4}>
          <article className={s.card}><h3>How to improve your workflow efficiency</h3><p>Practical guidance to reduce friction in daily execution.</p></article>
          <article className={s.card}><h3>Best practices for scaling your business</h3><p>A realistic checklist for sustainable growth planning.</p></article>
          <article className={s.card}><h3>Data-driven decision making for teams</h3><p>Ways to turn metrics into consistent operational improvement.</p></article>
          <article className={s.card}><h3>Building operational consistency across teams</h3><p>Frameworks to align teams, process flows, and execution habits.</p></article>
        </div>
      </section>

      <section className={s.section}>
        <h2>Stay updated</h2>
        <p>Subscribe to receive the latest updates, insights, and product news directly to your inbox.</p>
        <div className={s.newsletter}>
          <input type="email" placeholder="you@company.com" aria-label="Email address" />
          <button type="button">Subscribe</button>
        </div>
      </section>

      <section id="final-cta" className={`${s.section} ${s.finalCta}`}>
        <h2>Start growing your business today</h2>
        <p>
          Join thousands of teams already using our platform to improve performance, streamline
          execution, and scale with greater confidence.
        </p>
        <div className={s.ctaRow}>
          <Link href="#" className={s.btnPrimary}>Get started</Link>
          <Link href="#" className={s.btnGhost}>Book a demo</Link>
        </div>
      </section>

      <footer className={`${s.section} ${s.footer}`}>
        <div><h3>Product</h3><p>Features</p><p>Pricing</p><p>Integrations</p></div>
        <div><h3>Company</h3><p>About</p><p>Careers</p><p>Contact</p></div>
        <div><h3>Resources</h3><p>Blog</p><p>Guides</p><p>Help center</p></div>
        <div><h3>Legal</h3><p>Privacy</p><p>Terms</p></div>
      </footer>
    </div>
  );
}
