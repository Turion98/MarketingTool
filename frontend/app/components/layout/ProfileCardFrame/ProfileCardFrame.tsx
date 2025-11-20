// app/components/layout/ProfileCardFrame/ProfileCardFrame.tsx
"use client";

import React, { CSSProperties } from "react";
import s from "./ProfileCardFrame.module.scss";
import { useGameState } from "../../../lib/GameStateContext";

type ProfileCardFrameProps = {
  children?: React.ReactNode;
  logoSrc?: string;
  pageId?: string;
  pageIsFadingOut?: boolean;
};

const CARD_WIDTH = 400;
const CARD_HEIGHT = 500;

const ProfileCardFrame: React.FC<ProfileCardFrameProps> = ({
  children,
  logoSrc,
  pageId,
  pageIsFadingOut = false,
}) => {
  const { registerRewardFrame, currentPageData } = useGameState() as any;

  const profile = (currentPageData as any)?.profile || {};
  const name: string | undefined = profile.name ?? profile.title;
  const subtitle: string | undefined =
    profile.subtitle ?? profile.tagline ?? profile.role;
  const extra: string | undefined = profile.extra ?? profile.meta;

  // animációs flag – ha szükséged van rá SCSS-ben
  const frameStyle: CSSProperties = {
    ["--mf-open" as any]: pageIsFadingOut ? 0 : 1,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };

  return (
    <div
      ref={registerRewardFrame}
      className={s.profileFrame}
      data-page={pageId}
      style={frameStyle}
    >
      <div className={s.cardInner}>
        {/* TOP – kép 16:9 aránnyal, 5px margó felül, vízszintesen középen */}
        <div className={s.imageSlot}>
          <div className={s.imageInner}>{children}</div>
        </div>

        {/* BOTTOM – bal oldalon profil adatok */}
        <div className={s.bottomRow}>
          <div className={s.infoSlot}>
            {name && <div className={s.profileName}>{name}</div>}
            {subtitle && (
              <div className={s.profileSubtitle}>{subtitle}</div>
            )}
            {extra && <div className={s.profileMeta}>{extra}</div>}
          </div>

          {/* JOBB ALSÓ SAROK – logó */}
          {logoSrc && (
            <div className={s.logoSlot}>
              <img
                src={logoSrc}
                alt="Brand logo"
                className={s.logoImage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileCardFrame;
