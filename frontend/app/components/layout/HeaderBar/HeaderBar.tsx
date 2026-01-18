"use client";
import React from "react";
import clsx from "clsx";
import type { HeaderBarProps } from "./types";
import styles from "./HeaderBar.module.scss";


/** Képeket vagy explicit jelölt elemeket tekintünk logónak */
function isLogoNode(node: React.ReactNode): boolean {
  if (!React.isValidElement(node)) return false;
  const el = node as React.ReactElement<any>;
  const isImg = typeof el.type === "string" && el.type === "img";
  const marked = el.props?.["data-logo"] === true;
  return isImg || marked;
}

/** ⬇️ ÚJ: ha data-runes attribútum van, CSS-modules osztályt adunk rá */
function applyRunesVisibility(node: React.ReactNode): React.ReactNode {
  if (!React.isValidElement(node)) return node;
  const el = node as React.ReactElement<any>;
  const mode = el.props?.["data-runes"] as "mobile" | "desktop" | undefined;

  if (!mode) return node;

  const patchedClassName = clsx(
    el.props.className,
    mode === "mobile" ? styles.runesMobile : styles.runesDesktop
  );

  return React.cloneElement(el, { className: patchedClassName });
}

/** Ha logó, becsomagoljuk .logoBox-ba; ha nem, visszaadjuk érintetlenül */
function wrapIfLogo(node: React.ReactNode): React.ReactNode {
  if (!node) return node;
  return isLogoNode(node)
    ? <span className={clsx(styles.logoBox)}>{node}</span>
    : node;
}

/** ⬇️ MÓDOSÍTÁS: előbb alkalmazzuk a runes osztályokat, aztán a logo wrap-et */
function processNode(node: React.ReactNode): React.ReactNode {
  return wrapIfLogo(applyRunesVisibility(node));
}

/** Tömb / egy elem egységes kezelése */
function prepareSlot(slot?: React.ReactNode | React.ReactNode[]) {
  if (!slot) return slot;
  return Array.isArray(slot) ? slot.map(processNode) : processNode(slot);
}

export default function HeaderBar({
  left,
  center,
  right,
  variant = "transparent",
  dense = false,
  elevated = true,
  className,
}: HeaderBarProps) {
  const leftSlot = prepareSlot(left);
  const rightSlot = prepareSlot(right);

  return (
    <div
      className={clsx(
        styles.headerBar,
        variant === "solid" ? styles.solid : styles.transparent,
        dense && styles.dense,
        elevated && styles.elevated,
        className
      )}
      role="banner"
      aria-label="Header bar"
    >
      <div className={styles.left}>{leftSlot}</div>
      <div className={styles.center}>{center}</div>
      <div className={styles.right}>{rightSlot}</div>
    </div>
  );
}
