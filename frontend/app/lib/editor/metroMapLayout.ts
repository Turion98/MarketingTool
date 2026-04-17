export type MetroSegment = {
  id: string;
  from: string;
  to: string;
  interiorNodeIds: string[];
  branchWidth: number;
};

export type MetroStation = {
  id: string;
  label: string;
  kind: "start" | "split" | "merge" | "hub" | "through" | "terminal";
  x: number;
  y: number;
  layer: number;
};

export function buildMetroMapLayout(_params: {
  edges: { from: string; to: string }[];
  endPageIds: string[];
  labelForPageId: (id: string) => string;
}): {
  stations: MetroStation[];
  segments: MetroSegment[];
  stationById: Map<string, MetroStation>;
  width: number;
  height: number;
} {
  return {
    stations: [],
    segments: [],
    stationById: new Map<string, MetroStation>(),
    width: 400,
    height: 300,
  };
}

export function collectDownstreamNodeIds(
  _edges: { from: string; to: string }[],
  fromId: string
): Set<string> {
  return new Set([fromId]);
}

export function nodeIdsForMetroSegment(
  seg: Pick<MetroSegment, "from" | "to" | "interiorNodeIds">
): Set<string> {
  return new Set([seg.from, ...seg.interiorNodeIds, seg.to]);
}
