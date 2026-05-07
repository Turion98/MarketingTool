"use client";

import Link from "next/link";
import s from "../onboardingFlows/onboardingFlowsPage.module.scss";

function ImagePlaceholder({ type, label }: { type: string; label: string }) {
  return (
    <div className={s.imagePlaceholder} data-type={type} role="img" aria-label={label}>
      <div className={s.mockSkeleton} aria-hidden>
        <div className={s.mockChrome}>
          <span className={s.mockDot} />
          <span className={s.mockDot} />
          <span className={s.mockDot} />
        </div>
        <div className={s.mockBar} />
        <div className={s.mockBarShort} />
        <div className={s.mockPills}>
          <span className={s.mockPill} />
          <span className={s.mockPill} />
          <span className={s.mockPill} />
        </div>
      </div>
      <span className={s.imagePlaceholderLabel}>{label}</span>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <article className={s.page}>
      <section className={`${s.zigzagSection} ${s.heroOe}`} aria-labelledby="int-hero-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="hero-integrations"
                label="Decision flow embedded inside an existing product page"
              />
            </div>
            <div className={s.zigzagText}>
              <p className={s.eyebrow}>Integrations</p>
              <h1 id="int-hero-heading" className={s.heroTitle}>
                The decision layer runs inside your page. Not somewhere else.
              </h1>
              <p className={s.lead}>
                <span style={{ display: "block", whiteSpace: "nowrap" }}>
                  Most interactive tools send users to a separate experience.
                </span>
                <span
                  style={{
                    display: "block",
                    marginTop: "0.35rem",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      width: "100%",
                      justifyContent: "space-between",
                      gap: "0.6rem",
                    }}
                  >
                    {["Product page", "Campaign page", "Onboarding screen"].map((item) => (
                      <span
                        key={item}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flex: "0 0 auto",
                          padding: "0.32rem 0.7rem",
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.07)",
                          border: "1px solid rgba(232,236,244,0.2)",
                          color: "rgba(232,236,244,0.94)",
                          fontSize: "0.82em",
                          fontWeight: 600,
                          lineHeight: 1.2,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </span>
                </span>
                <span style={{ display: "block", marginTop: "0.2rem" }}>
                  Questell embeds directly into the page where the decision is already happening and
                  looks like it belongs there.
                </span>
              </p>
              <div className={s.heroActions}>
                <Link href="/demos" className={s.btnPrimary}>
                  See how it works
                </Link>
                <Link href="/about" className={s.btnSecondary}>
                  Request your first flow
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.zigzagSection} aria-labelledby="int-speed-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.bandTop}>
            <div
              className={s.zigzagText}
              style={{ maxWidth: "64rem", width: "100%", marginInline: "auto", textAlign: "center" }}
            >
              <div className={s.sectionHeader} style={{ marginInline: "auto" }}>
                <h2 id="int-speed-heading" className={s.sectionHeading}>
                  Your dev team needs an afternoon.
                </h2>
              </div>
              <p className={s.prose}>
                There are two ways to add Questell to any existing page. The campaign logic stays
                central in both cases, so when a flow changes, nothing needs to be touched on the host
                page.
              </p>
              <div className={s.oeCardRow} role="list" style={{ marginTop: "1rem" }}>
                <div className={s.oeCard} role="listitem">
                  <h3 className={s.oeCardTitle}>Script loader</h3>
                  <p className={s.oeCardBody}>
                    One script tag. Questell builds the experience automatically from data attributes.
                    No custom frontend code.
                  </p>
                </div>
                <div className={s.oeCard} role="listitem">
                  <h3 className={s.oeCardTitle}>Direct iframe</h3>
                  <p className={s.oeCardBody}>
                    Standard iframe with a campaign URL. Works with any CMS, page builder, or custom
                    stack.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={s.zigzagSection} aria-labelledby="int-ghost-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder type="ghost-mode" label="Same flow - default vs ghost mode comparison" />
            </div>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <h2 id="int-ghost-heading" className={s.sectionHeading}>
                  Ghost mode: no foreign chrome, no broken brand.
                </h2>
              </div>
              <p className={s.prose}>
                By default, Questell runs in ghost mode:
              </p>
              <ul
                className={s.prose}
                style={{ marginTop: "0.55rem", marginBottom: "0.55rem", paddingLeft: "1.15rem" }}
              >
                <li>no widget border</li>
                <li>no third-party frame</li>
                <li>no visual signal that something external is running</li>
              </ul>
              <p className={s.prose}>
                The flow inherits the design context of the host page. Users experience it as part of
                the page, because visually, it is.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={s.zigzagSection} aria-labelledby="int-control-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.oeZigzagRow}>
            <div className={s.zigzagText}>
              <div className={s.sectionHeader}>
                <h2 id="int-control-heading" className={s.sectionHeading}>
                  One embed URL.
                  <br />
                  Control stays with you.
                </h2>
              </div>
              <p className={s.prose}>
                Access can be restricted to specific domains, protected with signed tokens, and
                revoked instantly if needed.
                <br />
                Old embed URLs stop working the moment access is revoked,
                no code change required on the host side.
              </p>
            </div>
            <div className={s.zigzagVisual}>
              <ImagePlaceholder
                type="security-controls"
                label="Access control and origin restriction diagram"
              />
            </div>
          </div>
        </div>
      </section>

      <section className={s.finalSection} aria-labelledby="int-final-heading">
        <div className={s.sectionInner} style={{ opacity: 1, transform: "none" }}>
          <div className={s.ctaPanel}>
            <h2 id="int-final-heading" className={s.finalStatement}>
              If it takes months to add a decision layer, it never gets added.
            </h2>
            <p className={s.finalLead}>
              Questell is designed to go live on a real page fast - so you can see how users move
              through it before committing to anything larger.
            </p>
            <div className={s.ctaPanelActions} style={{ justifyContent: "center" }}>
              <Link href="/about" className={s.btnPrimary}>
                Request your first flow
              </Link>
            </div>
          </div>
        </div>
      </section>
    </article>
  );
}
