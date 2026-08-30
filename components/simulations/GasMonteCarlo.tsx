"use client";

// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { Slider } from "@/components/ui/Slider";
import { Tex } from "@/components/ui/Tex";
import { useDebouncedValue } from "@/lib/use-debounced";
import { useGasRun } from "@/lib/use-statphys-stream";
import { gasSweepV1StatphysGasSweepPost } from "@/lib/api/statistical-physics/statistical-physics";
import type { GasSweepResponse } from "@/lib/api/schemas";
import type { GasStreamRequest } from "@/lib/statphys-ws";
import { COLORS, PLOT_CONFIG, axis, baseLayout } from "./plot-theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// A gas of identical particles in a cubic box, sampled by Metropolis. The only
// quantum input is the move: a fermion may not enter an occupied orbital, and a
// boson is *encouraged* into a crowded one by the (n+1)/n factor in the
// proposal bias. Nothing tells the sampler about Fermi-Dirac or Bose-Einstein
// — those come out, and are drawn here against the closed form the simulation
// never sees.
//
// Two questions, two transports, and they are genuinely different questions:
//
//   live   one chain, streamed  — does the distribution *form*, and do the
//                                 error bars close like 1/sqrt(n)?
//   sweep  many chains, POSTed  — where does mu end up, against Sommerfeld
//                                 below T_F and Maxwell-Boltzmann above it?
//
// A converged POST cannot show the first and a stream cannot afford the
// second, so both exist rather than one pretending to serve both.

type Mode = "live" | "sweep";
type Vary = "temperature" | "particles";

const SWEEP_POINTS = 9;

export interface GasMonteCarloProps {
  height?: number;
  caption?: ReactNode;
}

export function GasMonteCarlo({ height = 330, caption }: GasMonteCarloProps) {
  const [mode, setMode] = useState<Mode>("live");
  const [box, setBox] = useState(5);
  const [particles, setParticles] = useState(30);
  const [spin, setSpin] = useState(0.5);
  const [temperature, setTemperature] = useState(1500);

  // ── live chain ────────────────────────────────────────────────────────────
  const request = useDebouncedValue<GasStreamRequest>(
    useMemo(
      () => ({
        box,
        particles,
        spin,
        temperature,
        samples: 4000,
        burn_in_sweeps: 300,
        frames: 80,
      }),
      [box, particles, spin, temperature],
    ),
    350,
  );

  const { metadata, frame, status, error } = useGasRun(request);

  // ── converged sweep ───────────────────────────────────────────────────────
  const [vary, setVary] = useState<Vary>("temperature");
  const [sweep, setSweep] = useState<GasSweepResponse | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sweepError, setSweepError] = useState<Error | null>(null);

  const runSweep = useCallback(async () => {
    setSweeping(true);
    setSweepError(null);
    // Geometric in T so the decades either side of T_F get equal room, and
    // linear in N because particle number is not a scale, it is a count.
    const values =
      vary === "temperature"
        ? Array.from({ length: SWEEP_POINTS }, (_, i) =>
            Math.round(300 * Math.pow(6000 / 300, i / (SWEEP_POINTS - 1))),
          )
        : Array.from({ length: SWEEP_POINTS }, (_, i) =>
            Math.round(8 + (i * (120 - 8)) / (SWEEP_POINTS - 1)),
          );
    try {
      const res = await gasSweepV1StatphysGasSweepPost({
        box,
        spin,
        vary,
        values,
        particles,
        temperature,
        samples: 600,
        burn_in_sweeps: 150,
      });
      if (res.status === 200) {
        setSweep(res.data as GasSweepResponse);
      } else {
        setSweepError(
          new Error(`API returned ${res.status}: ${JSON.stringify(res.data)}`),
        );
      }
    } catch (e) {
      setSweepError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSweeping(false);
    }
  }, [box, spin, vary, particles, temperature]);

  const sweepAxis = useMemo(() => {
    if (!sweep) return null;
    const x = sweep.points.map((p) =>
      sweep.vary === "temperature" ? p.temperature : p.particles,
    );
    return {
      x,
      fitted: sweep.points.map((p) => p.chemical_potential_fitted),
      errors: sweep.points.map((p) => p.chemical_potential_error),
      exact: sweep.points.map((p) => p.chemical_potential_exact),
      sommerfeld: sweep.points.map((p) => p.sommerfeld ?? null),
      boltzmann: sweep.points.map((p) => p.maxwell_boltzmann ?? null),
      fermi: sweep.points.map((p) => p.fermi_temperature),
    };
  }, [sweep]);

  return (
    <figure className="not-prose my-10 overflow-hidden rounded-xl border border-border bg-surface/40 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-[11px] text-muted">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Tex className="normal-case">{`\\bar n(\\varepsilon) = \\dfrac{1}{e^{(\\varepsilon-\\mu)/T} \\pm 1}`}</Tex>
          <span className="text-border">·</span>
          <span className="text-faint">
            {metadata
              ? `${metadata.statistics === "fermi" ? "fermions" : "bosons"}, ${metadata.orbitals} orbitals`
              : "—"}
          </span>
        </span>
        <span className="flex items-center gap-0.5">
          {(["live", "sweep"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={m === mode}
              className={
                "rounded px-2 py-0.5 text-[11px] transition-colors " +
                (m === mode
                  ? "bg-surface text-foreground"
                  : "text-muted hover:text-foreground")
              }
            >
              {m === "live" ? "one chain, live" : "converged sweep"}
            </button>
          ))}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_268px]">
        <div className="relative min-h-[280px] p-2">
          {mode === "live" ? (
            <>
              {metadata && frame && (
                <Plot
                  data={[
                    {
                      x: metadata.energies,
                      y: metadata.distribution,
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name:
                        metadata.statistics === "fermi"
                          ? "Fermi–Dirac, exact μ"
                          : "Bose–Einstein, exact μ",
                      line: { color: COLORS.reference, width: 1.6 },
                      hovertemplate: "ε=%{x:.0f} K, n=%{y:.4f}<extra></extra>",
                    },
                    {
                      x: metadata.energies,
                      y: frame.occupation,
                      error_y: {
                        type: "data" as const,
                        array: frame.occupation_error,
                        color: COLORS.series[0],
                        thickness: 1,
                        width: 2,
                      },
                      type: "scatter" as const,
                      mode: "markers" as const,
                      name: "sampled",
                      marker: { size: 5, color: COLORS.series[0] },
                      hovertemplate: "ε=%{x:.0f} K, n=%{y:.4f}<extra></extra>",
                    },
                  ]}
                  layout={baseLayout("gas-live", height, {
                    title: {
                      text: `mean occupation per orbital — ${frame.samples} samples`,
                      font: { size: 10, color: COLORS.faint },
                      x: 0,
                      xanchor: "left",
                    },
                    margin: { t: 34, r: 16, b: 46, l: 58 },
                    xaxis: axis("ε  (K)"),
                    yaxis: axis("⟨n⟩", { rangemode: "tozero" }),
                  })}
                  config={PLOT_CONFIG}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              )}
              {!frame && !error && (
                <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted">
                  <span className="inline-flex items-center gap-2">
                    <Spinner /> Burning in…
                  </span>
                </div>
              )}
              {error && (
                <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-sm text-red-400">
                  {error.message}
                </div>
              )}
            </>
          ) : (
            <>
              {sweepAxis && sweep && (
                <Plot
                  data={[
                    {
                      x: sweepAxis.x,
                      y: sweepAxis.fitted,
                      error_y: {
                        type: "data" as const,
                        array: sweepAxis.errors,
                        color: COLORS.series[0],
                        thickness: 1,
                        width: 3,
                      },
                      type: "scatter" as const,
                      mode: "markers" as const,
                      name: "fitted from the chain",
                      marker: { size: 7, color: COLORS.series[0] },
                      hovertemplate: "%{x}, μ=%{y:.0f} K<extra></extra>",
                    },
                    {
                      x: sweepAxis.x,
                      y: sweepAxis.exact,
                      type: "scatter" as const,
                      mode: "lines" as const,
                      name: "exact solve",
                      line: { color: COLORS.reference, width: 1.6 },
                      hovertemplate: "%{x}, μ=%{y:.0f} K<extra></extra>",
                    },
                    ...(sweep.statistics === "fermi"
                      ? [
                          {
                            x: sweepAxis.x,
                            y: sweepAxis.sommerfeld,
                            type: "scatter" as const,
                            mode: "lines" as const,
                            name: "Sommerfeld",
                            line: {
                              color: COLORS.series[2],
                              width: 1.2,
                              dash: "dash" as const,
                            },
                            hoverinfo: "skip" as const,
                          },
                          {
                            x: sweepAxis.x,
                            y: sweepAxis.boltzmann,
                            type: "scatter" as const,
                            mode: "lines" as const,
                            name: "Maxwell–Boltzmann",
                            line: {
                              color: COLORS.series[1],
                              width: 1.2,
                              dash: "dot" as const,
                            },
                            hoverinfo: "skip" as const,
                          },
                        ]
                      : []),
                  ]}
                  layout={baseLayout("gas-sweep", height, {
                    title: {
                      text:
                        sweep.vary === "temperature"
                          ? "chemical potential against temperature"
                          : "chemical potential against particle number",
                      font: { size: 10, color: COLORS.faint },
                      x: 0,
                      xanchor: "left",
                    },
                    margin: { t: 34, r: 16, b: 46, l: 62 },
                    xaxis: axis(
                      sweep.vary === "temperature" ? "T  (K)" : "N",
                      sweep.vary === "temperature" ? { type: "log" } : {},
                    ),
                    yaxis: axis("μ  (K)"),
                  })}
                  config={PLOT_CONFIG}
                  useResizeHandler
                  style={{ width: "100%", height: "100%" }}
                />
              )}
              {!sweep && !sweepError && (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 px-8 text-center">
                  <p className="max-w-sm text-xs leading-relaxed text-faint">
                    {SWEEP_POINTS} independent chains, each run to convergence
                    and each in its own process. Takes a few seconds — the
                    streamed view is the one that responds instantly.
                  </p>
                  <button
                    type="button"
                    onClick={runSweep}
                    disabled={sweeping}
                    className="rounded border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface disabled:opacity-40"
                  >
                    {sweeping ? "Running…" : "Run the sweep"}
                  </button>
                </div>
              )}
              {sweepError && (
                <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-sm text-red-400">
                  {sweepError.message}
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border p-4 lg:border-l lg:border-t-0">
          <div className="space-y-3.5">
            <Slider
              label={<Tex>{`s`}</Tex>}
              hint={<Tex>{`\\text{spin}`}</Tex>}
              value={spin}
              onChange={(v) => setSpin(Math.round(v * 2) / 2)}
              min={0}
              max={2}
              step={0.5}
              format={(v) => (Number.isInteger(v) ? v.toFixed(0) : `${v * 2}/2`)}
            />
            <p className="-mt-2 text-[10px] leading-relaxed text-faint">
              Half-integer gives fermions, integer bosons — the spin–statistics
              theorem doing the dispatch, and{" "}
              <Tex className="normal-case">{`2s+1`}</Tex> states per orbital.
            </p>
            <Slider
              label={<Tex>{`N`}</Tex>}
              hint={<Tex>{`\\text{particles}`}</Tex>}
              value={particles}
              onChange={(v) => setParticles(Math.round(v))}
              min={4}
              max={120}
              step={1}
              format={(v) => v.toFixed(0)}
            />
            <Slider
              label={<Tex>{`T`}</Tex>}
              value={temperature}
              onChange={(v) => setTemperature(Math.round(v / 10) * 10)}
              min={100}
              max={6000}
              step={10}
              unit=" K"
              format={(v) => v.toFixed(0)}
            />
            <Slider
              label={<Tex>{`L`}</Tex>}
              hint={<Tex>{`\\text{box edge}`}</Tex>}
              value={box}
              onChange={setBox}
              min={2}
              max={12}
              step={0.5}
              unit=" nm"
              format={(v) => v.toFixed(1)}
            />

            {mode === "sweep" && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="grid grid-cols-2 gap-1">
                  {(["temperature", "particles"] as Vary[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => {
                        setVary(v);
                        setSweep(null);
                      }}
                      aria-pressed={v === vary}
                      className={
                        "rounded px-2 py-1 text-[11px] transition-colors " +
                        (v === vary
                          ? "bg-surface text-foreground"
                          : "text-muted hover:text-foreground")
                      }
                    >
                      vary {v === "temperature" ? "T" : "N"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={runSweep}
                  disabled={sweeping}
                  className="w-full rounded border border-border px-2 py-1.5 text-[11px] text-foreground transition-colors hover:bg-surface disabled:opacity-40"
                >
                  {sweeping ? "Running…" : "Run the sweep"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface/40 px-4 py-2 text-xs text-muted">
        <span className="font-mono tabular-nums">
          {metadata && (
            <>
              T<sub>F</sub> ={" "}
              <span className="text-foreground">
                {metadata.fermi_temperature.toFixed(0)} K
              </span>
              <span className="mx-2 text-border">·</span>
              T/T<sub>F</sub> ={" "}
              <span className="text-foreground">
                {(temperature / metadata.fermi_temperature).toFixed(2)}
              </span>
              <span className="mx-2 text-border">·</span>
              μ exact{" "}
              <span className="text-foreground">
                {metadata.chemical_potential_exact.toFixed(0)} K
              </span>
            </>
          )}
        </span>
        <span className="flex items-center gap-2 font-mono tabular-nums">
          {mode === "live" && frame && (
            <>
              μ fitted{" "}
              <span className="text-foreground">
                {frame.chemical_potential_fitted === null
                  ? "—"
                  : `${frame.chemical_potential_fitted.toFixed(0)} K`}
              </span>
              {frame.chemical_potential_error !== null && (
                <span className="text-faint">
                  ± {frame.chemical_potential_error.toFixed(0)}
                </span>
              )}
              <span className="text-border">·</span>
              accept{" "}
              <span className="text-foreground">
                {(frame.acceptance * 100).toFixed(0)}%
              </span>
            </>
          )}
          {mode === "live" && status === "streaming" && <Spinner />}
          {mode === "sweep" && sweeping && <Spinner />}
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
