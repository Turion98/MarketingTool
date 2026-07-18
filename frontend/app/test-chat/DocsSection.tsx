"use client";

import { useEffect, useState } from "react";

import {
  DOCS_LEAD,
  DOCS_SECTIONS,
  DOCS_TITLE,
  type DocBlock,
  type DocSection,
} from "./docsContent";

import s from "./DocsSection.module.scss";

/** A page.tsx tetejéről (#test-chat-docs anchor) ide ugrik az Open docs gomb. */
export const DOCS_SECTION_ID = "test-chat-docs";

function CalloutBlock({
  block,
}: {
  block: Extract<DocBlock, { kind: "callout" }>;
}) {
  const toneClass =
    block.tone === "info"
      ? s.calloutInfo
      : block.tone === "warn"
        ? s.calloutWarn
        : s.calloutTip;
  return (
    <aside className={`${s.callout} ${toneClass}`}>
      {block.title ? <p className={s.calloutTitle}>{block.title}</p> : null}
      <p className={s.calloutText}>{block.text}</p>
    </aside>
  );
}

function CodeBlock({
  block,
}: {
  block: Extract<DocBlock, { kind: "code" }>;
}) {
  return (
    <figure className={s.codeWrap}>
      {block.caption ? <figcaption className={s.codeCaption}>{block.caption}</figcaption> : null}
      <pre className={s.codeBlock}>
        <code>{block.code}</code>
      </pre>
    </figure>
  );
}

function BlockRenderer({ block }: { block: DocBlock }) {
  if (block.kind === "paragraph") {
    return <p className={s.paragraph}>{block.text}</p>;
  }
  if (block.kind === "bullets") {
    return (
      <ul className={s.bullets}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.kind === "code") return <CodeBlock block={block} />;
  return <CalloutBlock block={block} />;
}

function SectionRenderer({ section }: { section: DocSection }) {
  return (
    <section id={section.anchor} className={s.section} aria-labelledby={`${section.anchor}-title`}>
      <h3 id={`${section.anchor}-title`} className={s.sectionTitle}>
        {section.title}
      </h3>
      {section.lead ? <p className={s.sectionLead}>{section.lead}</p> : null}
      {section.blocks.map((b, i) => (
        <BlockRenderer key={`${section.anchor}-b${i}`} block={b} />
      ))}
    </section>
  );
}

/**
 * Sticky ToC az aktív szekció kiemelésével (IntersectionObserver).
 * A `?dev=1` flag-nek nincs hatása — a docs minden látogatónak megjelenik.
 */
export function DocsSection() {
  const [activeAnchor, setActiveAnchor] = useState<string>(
    DOCS_SECTIONS[0]?.anchor ?? "",
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Top-most visible entry → active
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first && first.target.id) {
          setActiveAnchor(first.target.id);
        }
      },
      {
        // Visszafogott: a felső 30%-tól lefelé 60%-ig számít aktívnak.
        // Így a sticky nav alatti szekció lesz a "kiemelt".
        rootMargin: "-30% 0px -60% 0px",
        threshold: 0,
      },
    );
    for (const section of DOCS_SECTIONS) {
      const el = document.getElementById(section.anchor);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id={DOCS_SECTION_ID}
      className={s.docs}
      aria-labelledby="docs-title"
    >
      <div className={s.docsInner}>
        <header className={s.head}>
          <p className={s.eyebrow}>Dokumentáció</p>
          <h2 id="docs-title" className={s.title}>
            {DOCS_TITLE}
          </h2>
          <p className={s.lead}>{DOCS_LEAD}</p>
        </header>

        <nav className={s.toc} aria-label="Doksi szekciók">
          <p className={s.tocLabel}>Szekciók</p>
          <ul className={s.tocList}>
            {DOCS_SECTIONS.map((section) => (
              <li key={section.anchor} className={s.tocItem}>
                <a
                  href={`#${section.anchor}`}
                  className={`${s.tocLink} ${
                    activeAnchor === section.anchor ? s.tocLinkActive : ""
                  }`}
                >
                  {section.navLabel}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={s.content}>
          {DOCS_SECTIONS.map((section) => (
            <SectionRenderer key={section.anchor} section={section} />
          ))}
        </div>
      </div>
    </section>
  );
}
