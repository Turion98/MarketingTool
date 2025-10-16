// components/ui/Icon.tsx
"use client";

import React from "react";
import { ICON_REGISTRY, IconKey, IconSVGProps } from "../../lib/IconRegistry";

/**
 * Központi ikon komponens:
 *  - Registry kulccsal renderel (SVG) — szín: currentColor (CSS).
 *  - Fallback: ha 'type' URL/útvonal, <img>-ként renderel.
 *  - A11y: ha van title / aria-label → role="img", különben aria-hidden.
 */
type BaseProps = {
  type: IconKey | string;
  size?: number; // px (alap: 24)
  variant?: IconSVGProps["variant"];
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  role?: string;
  "aria-label"?: string;
  children?: never;
};

// SVG/IMG extra propok opcionálisan megengedettek, de ágonként kerülnek terítésre.
type Props = BaseProps &
  Partial<React.SVGProps<SVGSVGElement>> &
  Partial<React.ImgHTMLAttributes<HTMLImageElement>>;

function looksLikeUrl(s: string) {
  const lower = s.trim().toLowerCase();
  return (
    lower.startsWith("/") ||
    lower.startsWith("./") ||
    lower.startsWith("../") ||
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    /\.(png|svg|webp|jpg|jpeg|gif|avif)$/i.test(lower)
  );
}

const Icon: React.FC<Props> = ({
  type,
  size = 24,
  variant = "active",
  className,
  title,
  style,
  role,
  ...rest
}) => {
  // A registry-ben tárolt komponenseket SVG-komponensként kezeljük.
  const Comp =
    (ICON_REGISTRY as any)[type as IconKey] as
      | React.FC<IconSVGProps & React.SVGProps<SVGSVGElement>>
      | undefined;

  const ariaLabel = (rest as any)["aria-label"] as string | undefined;
  const isAriaVisible = Boolean(ariaLabel || title);

  if (Comp) {
    // SVG ágon: rest → SVGProps<SVGSVGElement>
    const svgProps = rest as React.SVGProps<SVGSVGElement>;
    return (
      <Comp
        className={className}
        variant={variant}
        style={{ width: size, height: size, ...style }}
        role={role || (isAriaVisible ? "img" : undefined)}
        aria-hidden={isAriaVisible ? undefined : true}
        {...svgProps}
      >
        {title ? <title>{title}</title> : null}
      </Comp>
    );
  }

  if (typeof type === "string" && looksLikeUrl(type)) {
    // IMG ágon: rest → ImgHTMLAttributes<HTMLImageElement>
    const imgProps = rest as React.ImgHTMLAttributes<HTMLImageElement>;
    const altText = ariaLabel || title || "";
    const imgAriaVisible = altText.length > 0;

    return (
      <img
        src={type}
        alt={altText}
        className={className}
        width={size}
        height={size}
        style={style}
        role={role || (imgAriaVisible ? "img" : undefined)}
        aria-hidden={imgAriaVisible ? undefined : true}
        draggable={false}
        {...imgProps}
      />
    );
  }

  // Végső fallback: üres helyfoglaló (mérettel)
  return (
    <span
      className={className}
      title={title}
      style={{ width: size, height: size, display: "inline-block", ...style }}
      role={role || (isAriaVisible ? "img" : undefined)}
      aria-hidden={isAriaVisible ? undefined : true}
    />
  );
};

export default Icon;
