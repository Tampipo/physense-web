// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

// Single source of truth for the statistical physics module slugs — drives the
// index grid (app/[locale]/statphys/page.tsx) and the sidebar nav
// (components/ui/Sidebar.tsx). Each slug must have a matching
// content/{locale}/statphys/{slug}.mdx and a
// statphys.modules.{slug}.{title,summary,tags} entry in messages/{locale}.json.
//
// Suggested reading order, and it is an order about *method* rather than about
// topic. ensembles comes first because it is the one page where the partition
// function is summed exactly: a spectrum goes in, every thermodynamic quantity
// comes out, and nothing is approximated — so it is the reference the rest are
// measured against. coexistence then does the one thing exact summation is for,
// which is putting two different systems side by side: an Einstein crystal and
// an ideal gas, equal chemical potentials, and out falls a sublimation curve
// for argon that can be checked against a table. Then the method breaks. ising
// is the smallest interacting model with no closed form in two dimensions, so
// the sum is abandoned for sampling — and the payoff is that the exact critical
// temperature is still known, giving the sampler something to be right about.
// monte-carlo closes the loop: the same Metropolis machinery, now on a quantum
// gas, recovering Fermi-Dirac and Bose-Einstein statistics from nothing but a
// move and an acceptance rule, with the chemical potential fitted out of the
// sampled occupations and held against Sommerfeld.
export const STATPHYS_MODULES = [
  "ensembles",
  "coexistence",
  "ising",
  "monte-carlo",
] as const;
