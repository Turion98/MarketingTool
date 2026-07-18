"use client";

import { useLang } from "../useLang";
import { getSupportEngineCopy } from "./supportEngineContent";
import {
  SupportHero,
  SupportWhy,
  SupportProof,
  SupportTurnCycle,
  SupportBuildPipeline,
  SupportClosing,
} from "./SupportSections";
import SupportDemo from "./SupportDemo";
import s from "./supportEngine.module.scss";

export default function SupportEnginePage() {
  const lang = useLang("hu");
  const copy = getSupportEngineCopy(lang);

  return (
    <article className={s.page}>
      <div className={s.container}>
        <SupportHero copy={copy.hero} />
        <SupportWhy copy={copy.why} />
        <SupportProof copy={copy.proof} />
        <SupportTurnCycle copy={copy.turnCycle} />
        <SupportDemo copy={copy.demo} />
        <SupportBuildPipeline copy={copy.buildPipeline} />
        <SupportClosing copy={copy.closing} />
      </div>
    </article>
  );
}
