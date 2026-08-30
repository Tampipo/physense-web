"use client";

// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";

import { Slider } from "@/components/ui/Slider";
import { Tex } from "@/components/ui/Tex";
import { useCoexistence } from "@/lib/use-statphys";
import type { CoexistenceRequest } from "@/lib/api/schemas";
import { COLORS, PLOT_CONFIG, axis, baseLayout } from "./plot-theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// Two systems, one condition. The solid is an Einstein crystal — every atom in
// its own harmonic well, bound by a cohesion energy — and the gas is ideal.
// Equating their chemical potentials at each temperature gives the pressure at
// which the two coexist, which for argon is a sublimation curve that can be
// looked up in a table.
//
// Everything plotted comes from the API. The only arithmetic here is the least
// squares fit of log P against 1/T, which is done client-side precisely
// because it is the *measurement* being compared to the exact latent heat the
// API reports alongside it.

/** J/mol/K. Turns a latent heat in kelvin into one per mole. */
const GAS_CONSTANT = 8.31446;

/** Argon's measured sublimation enthalpy near the triple point, kJ/mol. */
const ARGON_REFERENCE = 7.73;

export interface PhaseCoexistenceProps {
  height?: number;
  caption?: ReactNode;
}

export function PhaseCoexistence({
  height = 320,
  caption,
}: PhaseCoexistenceProps) {
  const [omega, setOmega] = useState(90);
  const [cohesion, setCohesion] = useState(1066);
  const [mass, setMass] = useState(39.948);

  const request = useMemo<CoexistenceRequest>(
    () => ({
      omega,
      cohesion,
      mass_amu: mass,
      // Argon sublimes below its triple point at 83.8 K, so the window stops
      // short of it: above that the solid melts and this two-phase model is
      // describing something that is not there.
      temperatures: { minimum: 45, maximum: 80, points: 120, logarithmic: false },
    }),
    [omega, cohesion, mass],
  );

  const { data, error, loading, stale } = useCoexistence(request);

  // The slope of log P against 1/T is what an experimentalist reads off a
  // sublimation curve and calls the latent heat. It is not exactly the API's
  // `latent_heat`, and the gap is the point: the prefactor carries powers of T
  // that a straight line cannot, so the measured slope misses by a few percent
  // over any finite window.
  const fit = useMemo(() => {
    if (!data) return null;
    const inverse = data.temperatures.map((t) => 1 / t);
    const logP = data.pressure.map((p) => Math.log(p));
    const n = inverse.length;
    const meanX = inverse.reduce((a, b) => a + b, 0) / n;
    const meanY = logP.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sxy += (inverse[i] - meanX) * (logP[i] - meanY);
      sxx += (inverse[i] - meanX) ** 2;
    }
    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    return {
      inverse,
      logP,
      slope,
      line: inverse.map((x) => slope * x + intercept),
      /** What the slope says the latent heat is, in kelvin. */
      measured: -slope,
    };
  }, [data]);

  const perMole = data ? (data.latent_heat * GAS_CONSTANT) / 1000 : null;

  return (
    <figure className="not-prose my-10 overflow-hidden rounded-xl border border-border bg-surface/40 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-[11px] text-muted">
        <Tex className="normal-case">{`\\mu_{\\text{solid}}(T) = \\mu_{\\text{gas}}(T, P)`}</Tex>
        <span className="text-border">·</span>
        <span className="text-faint">solid: Einstein crystal · gas: ideal</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_268px]">
        <div className="relative min-h-[240px] p-1">
          {data && fit && (
            <div className={"grid grid-cols-1 xl:grid-cols-2" + (stale ? " opacity-60" : "")}>
              <div className="p-2">
                <Plot
                  data={[
                    {
                      x: data.temperatures,
                      y: data.pressure,
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name: "P",
                      line: { color: COLORS.series[0], width: 2 },
                      hovertemplate:
                        "T=%{x:.1f} K, P=%{y:.4g} Pa<extra></extra>",
                    },
                  ]}
                  layout={baseLayout("coexistence-p", height, {
                    title: {
                      text: "sublimation pressure",
                      font: { size: 10, color: COLORS.faint },
                      x: 0,
                      xanchor: "left",
                    },
                    margin: { t: 34, r: 14, b: 44, l: 62 },
                    showlegend: false,
                    xaxis: axis("T  (K)"),
                    // Five orders of magnitude across 35 kelvin: linear would
                    // be a flat line hugging zero and then a wall.
                    yaxis: axis("P  (Pa)", { type: "log" }),
                  })}
                  config={PLOT_CONFIG}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              </div>

              <div className="p-2">
                <Plot
                  data={[
                    {
                      x: fit.inverse,
                      y: fit.logP,
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name: "log P",
                      line: { color: COLORS.series[0], width: 2 },
                      hovertemplate: "1/T=%{x:.4f}, ln P=%{y:.3f}<extra></extra>",
                    },
                    {
                      x: fit.inverse,
                      y: fit.line,
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name: "straight line",
                      line: { color: COLORS.reference, width: 1.2, dash: "dot" },
                      hoverinfo: "skip" as const,
                    },
                  ]}
                  layout={baseLayout("coexistence-log", height, {
                    title: {
                      text: "Clausius–Clapeyron: the slope is the latent heat",
                      font: { size: 10, color: COLORS.faint },
                      x: 0,
                      xanchor: "left",
                    },
                    margin: { t: 34, r: 14, b: 44, l: 62 },
                    xaxis: axis("1/T  (K⁻¹)"),
                    yaxis: axis("ln P"),
                  })}
                  config={PLOT_CONFIG}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>
          )}

          {!data && !error && (
            <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-muted">
              <span className="inline-flex items-center gap-2">
                <Spinner /> Solving…
              </span>
            </div>
          )}
          {error && (
            <div className="flex h-full min-h-[240px] items-center justify-center px-6 text-center text-sm text-red-400">
              {error.message}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 lg:border-l lg:border-t-0">
          <div className="space-y-3.5">
            <Slider
              label={<Tex>{`\\hbar\\omega/k_B`}</Tex>}
              hint={<Tex>{`\\text{Einstein temperature}`}</Tex>}
              value={omega}
              onChange={setOmega}
              min={30}
              max={200}
              step={1}
              unit=" K"
              format={(v) => v.toFixed(0)}
            />
            <Slider
              label={<Tex>{`\\varepsilon_c/k_B`}</Tex>}
              hint={<Tex>{`\\text{cohesion energy}`}</Tex>}
              value={cohesion}
              onChange={setCohesion}
              min={400}
              max={2000}
              step={5}
              unit=" K"
              format={(v) => v.toFixed(0)}
            />
            <Slider
              label={<Tex>{`m`}</Tex>}
              hint={<Tex>{`\\text{atomic mass}`}</Tex>}
              value={mass}
              onChange={setMass}
              min={4}
              max={132}
              step={0.1}
              unit=" u"
              format={(v) => v.toFixed(1)}
            />
            <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-faint">
              Defaults are argon. The mass moves the prefactor only — it enters
              through the thermal wavelength, never through the exponent — so
              the curve shifts up or down without changing its slope.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface/40 px-4 py-2 text-xs text-muted">
        <span className="font-mono tabular-nums">
          exact{" "}
          <span className="text-foreground">
            {data ? `${data.latent_heat.toFixed(1)} K` : "—"}
          </span>
          <span className="mx-2 text-border">·</span>
          fitted slope{" "}
          <span className="text-foreground">
            {fit ? `${fit.measured.toFixed(1)} K` : "—"}
          </span>
        </span>
        <span className="flex items-center gap-2 font-mono tabular-nums">
          {perMole !== null && (
            <>
              <span className="text-foreground">{perMole.toFixed(2)} kJ/mol</span>
              <span className="text-border">vs</span>
              <span>{ARGON_REFERENCE} measured</span>
            </>
          )}
          {loading && <Spinner />}
        </span>
      </div>

      {caption && (
        <figcaption className="border-t border-border px-4 py-2 text-xs text-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-foreground"
    />
  );
}
