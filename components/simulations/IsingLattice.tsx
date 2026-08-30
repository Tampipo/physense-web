"use client";

// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Slider } from "@/components/ui/Slider";
import { Tex } from "@/components/ui/Tex";
import { useDebouncedValue } from "@/lib/use-debounced";
import { useIsingRun } from "@/lib/use-statphys-stream";
import type { IsingRequest } from "@/lib/statphys-ws";
import { COLORS, PLOT_CONFIG, axis, baseLayout } from "./plot-theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// The two-dimensional Ising model has no closed form for the magnetisation of
// a finite lattice, and no partition function anyone can sum: 48 x 48 spins is
// 2^2304 configurations. So it is sampled instead. What makes it worth
// sampling rather than merely convenient is that Onsager solved the infinite
// lattice exactly, so the temperature at which the sampler should order is
// known to arbitrary precision and is not a fit.
//
// The API sends the whole spin grid each frame. Drawing it on a canvas rather
// than as a Plotly heatmap is deliberate: a heatmap re-lays-out on every frame
// and drops to a few frames a second by 64 x 64, where fillRect does not care.

const UP = "rgb(124 160 255)";
const DOWN = "rgb(255 160 120)";

export interface IsingLatticeProps {
  size?: number;
  temperature?: number;
  height?: number;
  caption?: ReactNode;
}

export function IsingLattice({
  size: initialSize = 48,
  temperature: initialTemperature = 2.269,
  height = 300,
  caption,
}: IsingLatticeProps) {
  const [size, setSize] = useState(initialSize);
  const [temperature, setTemperature] = useState(initialTemperature);
  const [sweepsPerFrame, setSweepsPerFrame] = useState(2);

  // A Markov chain cannot be re-parameterised mid-run, so every change here
  // starts a new one. Debounced, or dragging the temperature slider would open
  // and abandon a socket per pixel.
  const request = useDebouncedValue<IsingRequest>(
    useMemo(
      () => ({
        size,
        temperature,
        coupling: 1,
        sweeps_per_frame: sweepsPerFrame,
        frames: 400,
      }),
      [size, temperature, sweepsPerFrame],
    ),
    300,
  );

  const { metadata, frame, history, frameCount, status, error } =
    useIsingRun(request);

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef(frame);
  latest.current = frame;

  useEffect(() => {
    draw(canvas.current, frame);
  }, [frame]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      sizeCanvas(element);
      draw(element, latest.current);
    });
    observer.observe(element);
    sizeCanvas(element);
    return () => observer.disconnect();
  }, []);

  const traces = useMemo(() => {
    const sweeps: number[] = [];
    const energy: number[] = [];
    const magnetisation: number[] = [];
    for (const row of history) {
      sweeps.push(row[0]);
      energy.push(row[1]);
      magnetisation.push(Math.abs(row[2]));
    }
    return { sweeps, energy, magnetisation };
    // `history` is a ref array mutated in place, so the frame counter is what
    // says it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCount]);

  const critical = metadata?.critical_temperature ?? 2.269185;
  const reduced = temperature / critical;

  return (
    <figure className="not-prose my-10 overflow-hidden rounded-xl border border-border bg-surface/40 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-[11px] text-muted">
        <Tex className="normal-case">{`E = -J\\sum_{\\langle ij\\rangle} s_i s_j`}</Tex>
        <span className="text-border">·</span>
        <Tex className="normal-case">{`T_c = \\dfrac{2J}{\\ln(1+\\sqrt{2})}`}</Tex>
        <span className="text-border">·</span>
        <span className="text-faint">Onsager, exact</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_268px]">
        <div className="grid grid-cols-1 xl:grid-cols-2">
          <div className="relative aspect-square p-3">
            <canvas
              ref={canvas}
              className="block h-full w-full rounded"
              aria-label="The spin lattice, one pixel per site"
            />
            {!frame && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Warming up…
                </span>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-red-400">
                {error.message}
              </div>
            )}
          </div>

          <div className="p-2">
            <Plot
              data={[
                {
                  x: traces.sweeps,
                  y: traces.magnetisation,
                  type: "scatter" as const,
                  mode: "lines" as const,
                  name: "|m|",
                  line: { color: COLORS.series[2], width: 1.6 },
                  hovertemplate: "sweep %{x}, |m|=%{y:.3f}<extra></extra>",
                },
                {
                  x: traces.sweeps,
                  y: traces.energy,
                  type: "scatter" as const,
                  mode: "lines" as const,
                  name: "e",
                  yaxis: "y2",
                  line: { color: COLORS.series[1], width: 1.6 },
                  hovertemplate: "sweep %{x}, e=%{y:.3f}<extra></extra>",
                },
              ]}
              layout={baseLayout("ising-trace", height, {
                title: {
                  text: "magnetisation and energy per site",
                  font: { size: 10, color: COLORS.faint },
                  x: 0,
                  xanchor: "left",
                },
                margin: { t: 34, r: 46, b: 44, l: 50 },
                xaxis: axis("sweeps"),
                // |m| is bounded by construction, so pinning it says whether
                // the lattice ordered rather than merely that it moved.
                yaxis: axis("|m|", { range: [0, 1.02] }),
                yaxis2: axis("e", {
                  overlaying: "y",
                  side: "right",
                  showgrid: false,
                }),
              })}
              config={PLOT_CONFIG}
              useResizeHandler
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>

        <div className="border-t border-border p-4 lg:border-l lg:border-t-0">
          <div className="space-y-3.5">
            <Slider
              label={<Tex>{`T`}</Tex>}
              hint={<Tex>{`\\text{in units of } J/k_B`}</Tex>}
              value={temperature}
              onChange={setTemperature}
              min={0.5}
              max={5}
              step={0.01}
            />
            <Slider
              label={<Tex>{`L`}</Tex>}
              hint={<Tex>{`\\text{lattice edge}`}</Tex>}
              value={size}
              onChange={(v) => setSize(Math.round(v))}
              min={8}
              max={128}
              step={4}
              format={(v) => `${v.toFixed(0)}²`}
            />
            <Slider
              label={<Tex>{`\\text{sweeps/frame}`}</Tex>}
              value={sweepsPerFrame}
              onChange={(v) => setSweepsPerFrame(Math.round(v))}
              min={1}
              max={20}
              step={1}
              format={(v) => v.toFixed(0)}
            />
            <button
              type="button"
              onClick={() => setTemperature(critical)}
              className="w-full rounded border border-border px-2 py-1.5 text-[11px] text-muted transition-colors hover:text-foreground"
            >
              Jump to T<sub>c</sub> = {critical.toFixed(4)}
            </button>
            <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-faint">
              Changing anything starts a fresh chain — a Markov chain carries
              its temperature in every sample it has already taken, so there is
              nothing to reuse.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface/40 px-4 py-2 text-xs text-muted">
        <span className="font-mono tabular-nums">
          T/T<sub>c</sub> ={" "}
          <span className={reduced < 1 ? "text-foreground" : "text-muted"}>
            {reduced.toFixed(3)}
          </span>
          <span className="mx-2 text-border">·</span>
          {reduced < 0.97
            ? "ordered — one domain wins"
            : reduced > 1.03
              ? "disordered — no domain survives"
              : "critical — domains on every scale"}
        </span>
        <span className="flex items-center gap-2 font-mono tabular-nums">
          {frame && (
            <>
              sweep <span className="text-foreground">{frame.sweep}</span>
              <span className="text-border">·</span>
              |m| ={" "}
              <span className="text-foreground">
                {Math.abs(frame.magnetisation_per_site).toFixed(3)}
              </span>
              <span className="text-border">·</span>
              accept{" "}
              <span className="text-foreground">
                {(frame.acceptance * 100).toFixed(0)}%
              </span>
            </>
          )}
          {status === "streaming" && <Spinner />}
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

function sizeCanvas(element: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const rect = element.getBoundingClientRect();
  element.width = Math.max(1, Math.floor(rect.width * dpr));
  element.height = Math.max(1, Math.floor(rect.height * dpr));
}

/**
 * One rectangle per spin, sized to the canvas rather than to the lattice.
 *
 * Drawn in device pixels with no transform, so a 128 x 128 lattice on a 2x
 * display lands on whole pixels and the domain walls stay crisp instead of
 * shimmering as neighbouring cells share a boundary pixel.
 */
function draw(
  element: HTMLCanvasElement | null,
  frame: { spins: number[][] } | null,
) {
  if (!element || !frame) return;
  const ctx = element.getContext("2d");
  if (!ctx) return;

  const rows = frame.spins.length;
  if (rows === 0) return;
  const columns = frame.spins[0].length;
  const w = element.width;
  const h = element.height;
  ctx.clearRect(0, 0, w, h);

  const cellW = w / columns;
  const cellH = h / rows;

  for (let r = 0; r < rows; r++) {
    const row = frame.spins[r];
    const y0 = Math.floor(r * cellH);
    const y1 = Math.floor((r + 1) * cellH);
    for (let c = 0; c < columns; c++) {
      ctx.fillStyle = row[c] > 0 ? UP : DOWN;
      const x0 = Math.floor(c * cellW);
      const x1 = Math.floor((c + 1) * cellW);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted border-t-foreground"
    />
  );
}
