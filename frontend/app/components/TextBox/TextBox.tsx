import React from "react";
import styles from "./TextBox.module.scss";

type Props = {
  text: string;
};

export default function TextBox({ text }: Props) {
  return (
    <div className={styles.textBoxContainer}>
      <p>{text}</p>
    </div>
  );
}
