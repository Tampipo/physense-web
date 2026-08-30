// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Layout, Config } from "plotly.js";

// The shared look for the statistical-physics figures. Four components draw
// line plots against the same dark surface, and repeating forty lines of
// Plotly layout in each is four places for the grid colour to drift. The qm
// modules each hold their own copy because they were written one at a time and
// mostly draw different kinds of figure; this is not a reason to keep doing it.

export const COLORS = {
  /** Curve colours, in the order they should be handed out. */
  series: [
    "rgb(124 160 255)",
    "rgb(255 160 120)",
    "rgb(120 220 180)",
    "rgb(232 160 210)",
    "rgb(170 141 255)",
  ],
  /** A known-exact reference the simulation is being held against. */
  reference: "rgb(232 235 242)",
  /** A second reference, for the limit that applies at the other end. */
  limit: "rgb(143 152 169)",
  grid: "rgb(35 41 54)",
  axis: "rgb(52 60 77)",
  muted: "rgb(143 152 169)",
  faint: "rgb(99 108 126)",
  accent: "rgb(239 68 68)",
} as const;

export const MONO = "var(--font-geist-mono), ui-monospace, monospace";
const SANS = "var(--font-geist-sans), system-ui, sans-serif";

export const PLOT_CONFIG: Partial<Config> = {
  displayModeBar: false,
  responsive: true,
  doubleClick: "reset",
};

export function axis(title?: string, extra: Record<string, unknown> = {}) {
  return {
    title: title ? { text: title, font: { size: 11 } } : undefined,
    gridcolor: COLORS.grid,
    zerolinecolor: COLORS.axis,
    linecolor: COLORS.axis,
    tickfont: { size: 10, family: MONO },
    ...extra,
  };
}

/**
 * Layout shared by every figure here.
 *
 * `uirevision` is passed per figure rather than defaulted: it is what tells
 * Plotly to keep a reader's zoom across a re-render, and two figures sharing
 * one revision string would restore each other's viewport.
 */
export function baseLayout(
  uirevision: string,
  height: number,
  extra: Partial<Layout> = {},
): Partial<Layout> {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: COLORS.muted, family: SANS, size: 12 },
    height,
    margin: { t: 26, r: 16, b: 42, l: 56 },
    hovermode: "closest",
    uirevision,
    hoverlabel: {
      bgcolor: "rgb(24 28 39)",
      bordercolor: COLORS.axis,
      font: { family: MONO, color: "rgb(232 235 242)", size: 11 },
    },
    legend: {
      orientation: "h",
      y: 1.14,
      x: 0,
      font: { size: 10 },
      bgcolor: "rgba(0,0,0,0)",
    },
    ...extra,
  };
}
