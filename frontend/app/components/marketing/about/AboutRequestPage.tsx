"use client";

import Link from "next/link";
import AboutBriefForm from "./AboutBriefForm";
import s from "./aboutRequestPage.module.scss";

export default function AboutRequestPage() {
  return (
    <article className={s.page}>
      <section className={s.left}>
        <p className={s.eyebrow}>Get started</p>
        <h1 className={s.title}>Tell us where the decision happens. We handle the rest.</h1>
        <p className={s.lead}>
          You share the page, the product, and the goal. We map the decision logic, build the flow,
          and embed it. You get a live flow with real data before committing to anything larger.
        </p>

        <ol className={s.steps}>
          <li>
            <div className={s.stepHead}>
              <h2>You share the context</h2>
            </div>
            <p>The page where the flow will run, what users should decide, and what the right outcome looks like.</p>
          </li>
          <li>
            <div className={s.stepHead}>
              <h2>We build the logic</h2>
            </div>
            <p>We map the decision architecture, write the flow, and configure the embed for your page.</p>
          </li>
          <li>
            <div className={s.stepHead}>
              <h2>It goes live</h2>
            </div>
            <p>The flow runs on your page. You see completion rates, decision paths, and where users drop off.</p>
          </li>
        </ol>

        <p className={s.price}>€179 one-time build fee. Then €59/mo if you continue.</p>

        <section className={s.comingSoon}>
          <p className={s.comingEyebrow}>Coming soon</p>
          <h2>Prefer to build it yourself?</h2>
          <p>
            A self-serve AI-assisted builder is on the way. You will be able to map your own decision
            logic, generate the flow, and embed it without waiting for us. Join the waitlist and we
            will let you know when it is ready.
          </p>
          <Link className={s.waitlistLink} href="mailto:hello@questell.io?subject=Join%20the%20waitlist">
            Join the waitlist
          </Link>
        </section>
      </section>

      <section className={s.right} aria-labelledby="request-title">
        <AboutBriefForm />
      </section>
    </article>
  );
}
