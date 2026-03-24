"use client";

export type FragmentData = {
  text?: string;
  [k: string]: unknown;
};

export type FragmentBank = Record<
  string,
  FragmentData & {
    replayImageId?: string;
    [k: string]: unknown;
  }
>;

export type FragmentRef = { id: string; prefix?: string; suffix?: string };
