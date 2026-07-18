"use client";

import { useState } from "react";
import type { OnboardingCopy } from "./onboardingContent";
import EmbeddedBrief from "./EmbeddedBrief";
import s from "./onboarding.module.scss";

type GateState = "collapsed" | "key" | "ready";

/**
 * §4 (a) — a lenyitható brief-kapu.
 *
 * collapsed → a látogató megnyitja → `key`: bekéri az Anthropic API-kulcsot
 * (memóriában marad, nem tároljuk) + költség-figyelmeztetés → `ready`: a
 * kiemelt brief-mag + coach ide kerül (a következő lépésben).
 *
 * A kulcs itt csak a component state-ben él; a form-mag beépítésekor adjuk át
 * a generáló/coach hívásoknak.
 */
export default function OnboardingFormGate({
  copy,
}: {
  copy: OnboardingCopy["formGate"];
}) {
  const [state, setState] = useState<GateState>("collapsed");
  const [apiKey, setApiKey] = useState("");

  if (state === "collapsed") {
    return (
      <div className={s.gate}>
        <div className={s.gateCollapsed}>
          <div>
            <p className={s.gateTitle}>{copy.collapsedTitle}</p>
            <p className={s.gateNote}>{copy.collapsedNote}</p>
          </div>
          <button
            type="button"
            className={s.gatePrimary}
            onClick={() => setState("key")}
          >
            {copy.openButton}
            <span aria-hidden="true"> ↓</span>
          </button>
        </div>
      </div>
    );
  }

  if (state === "key") {
    return (
      <div className={s.gate}>
        <div className={s.gateKey}>
          <p className={s.gateTitle}>{copy.keyTitle}</p>
          <p className={s.gateNote}>{copy.keyNote}</p>
          <div className={s.gateKeyRow}>
            <input
              type="password"
              className={s.gateInput}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={copy.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-label={copy.keyTitle}
            />
            <button
              type="button"
              className={s.gatePrimary}
              disabled={!apiKey.trim()}
              onClick={() => setState("ready")}
            >
              {copy.keyContinue}
              <span aria-hidden="true"> →</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.gate}>
      <div className={s.gateReady}>
        <div className={s.gateReadyHead}>
          <span className={s.gateKeyBadge} aria-hidden="true">
            ✓
          </span>
          <button
            type="button"
            className={s.gateGhost}
            onClick={() => {
              setApiKey("");
              setState("key");
            }}
          >
            {copy.keyChange}
          </button>
        </div>
        <EmbeddedBrief apiKey={apiKey} />
      </div>
    </div>
  );
}
