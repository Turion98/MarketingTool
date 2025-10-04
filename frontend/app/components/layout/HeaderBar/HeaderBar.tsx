"use client";
import React from "react";
import clsx from "clsx";
import type { HeaderBarProps } from "./types";
import styles from "./HeaderBar.module.scss";


export default function HeaderBar({
left,
center,
right,
variant = "transparent",
dense = false,
elevated = true,
className,
}: HeaderBarProps) {
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
<div className={styles.left}>{left}</div>
<div className={styles.center}>{center}</div>
<div className={styles.right}>{right}</div>
</div>
);
}

