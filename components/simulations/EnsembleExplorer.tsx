"use client";

// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";

import { Slider } from "@/components/ui/Slider";
import { Tex } from "@/components/ui/Tex";
import { useThermodynamics } from "@/lib/use-statphys";
import type { SystemType, ThermodynamicsRequest } from "@/lib/api/schemas";
import { COLORS, PLOT_CONFIG, axis, baseLayout } from "./plot-theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

// Everything on this figure comes out of one sum. The API is handed a spectrum
// and a temperature grid; it returns log Z differentiated into U, C, S and F.
// Nothing below recomputes any of it — the only arithmetic here is dividing by
// the number of copies, which is the point of the `copies` control.
//
// k_B = 1 throughout, so temperature is an energy and entropy is a pure
// number. That is the library's convention, not a choice made here.
const POINTS = 140;

type Kind = Extract<SystemType, "two_level" | "harmonic" | "spin" | "rotor">;

interface Preset {
  /** The one parameter that sets this system's energy scale. */
  key: "splitting" | "omega" | "spin" | "rotational_constant";
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  /** Sensible top of the temperature axis, in units of that parameter. */
  reach: number;
  formula: string;
}

const PRESETS: Record<Kind, Preset> = {
  two_level: {
    key: "splitting",
    label: "\\Delta",
    hint: "\\text{level splitting}",
    min: 0.2,
    max: 4,
    step: 0.05,
    initial: 1,
    reach: 4,
    formula: "E \\in \\{0, \\Delta\\}",
  },
  harmonic: {
    key: "omega",
    label: "\\omega",
    hint: "\\text{mode frequency}",
    min: 0.2,
    max: 4,
    step: 0.05,
    initial: 1,
    reach: 5,
    formula: "E_n = \\omega\\left(n + \\tfrac{1}{2}\\right)",
  },
  spin: {
    key: "spin",
    label: "j",
    hint: "\\text{spin quantum number}",
    min: 0.5,
    max: 4,
    step: 0.5,
    initial: 0.5,
    reach: 4,
    formula: "m \\in \\{-j, \\dots, +j\\}",
  },
  rotor: {
    key: "rotational_constant",
    label: "b",
    hint: "\\text{rotational constant}",
    min: 0.2,
    max: 4,
    step: 0.05,
    initial: 1,
    reach: 8,
    formula: "E_\\ell = b\\,\\ell(\\ell+1),\\ g_\\ell = 2\\ell + 1",
  },
};

const KIND_LABELS: Record<Kind, string> = {
  two_level: "Two-level",
  harmonic: "Harmonic mode",
  spin: "Spin j",
  rotor: "Rigid rotor",
};

export interface EnsembleExplorerProps {
  system?: Kind;
  copies?: number;
  height?: number;
  caption?: ReactNode;
}

export function EnsembleExplorer({
  system: initialKind = "two_level",
  copies: initialCopies = 1,
  height = 250,
  caption,
}: EnsembleExplorerProps) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [scale, setScale] = useState(PRESETS[initialKind].initial);
  const [copies, setCopies] = useState(initialCopies);
  const [field, setField] = useState(0.5);
  const [magnetic, setMagnetic] = useState(false);

  const preset = PRESETS[kind];
  // Only Spin carries a magnetisation per microstate, so it is the only system
  // the magnetic ensemble can be applied to at all. The API refuses the rest
  // with a 422 naming the missing variable; the control is disabled instead,
  // so the refusal is something a reader learns rather than trips over.
  const canMagnetise = kind === "spin";
  const inMagneticField = magnetic && canMagnetise;

  const request = useMemo<ThermodynamicsRequest>(
    () => ({
      system: { type: kind, [preset.key]: scale, copies },
      ensemble: inMagneticField
        ? { type: "magnetic", magnetic_field: field }
        : { type: "canonical" },
      temperatures: {
        // From well below the gap to well above it: the whole story of a
        // spectrum is what happens as T crosses its own energy scale, and a
        // grid that starts at zero would ask for 1/T at T = 0.
        minimum: 0.02 * scale,
        maximum: preset.reach * scale,
        points: POINTS,
      },
    }),
    [kind, preset.key, preset.reach, scale, copies, inMagneticField, field],
  );

  const { data, error, loading, stale } = useThermodynamics(request);

  // Per copy, so the curves say what one subsystem does. Change `copies` and
  // nothing moves: that *is* extensivity, and it reads better as a figure that
  // refuses to change than as a sentence claiming it would not.
  const curves = useMemo(() => {
    if (!data) return null;
    const n = copies;
    return {
      t: data.temperatures,
      energy: data.energy.map((v) => v / n),
      heat: data.heat_capacity.map((v) => v / n),
      entropy: data.entropy.map((v) => v / n),
      potential: data.potential.map((v) => v / n),
      magnetisation: data.magnetisation?.map((v) => v / n) ?? null,
      susceptibility: data.susceptibility?.map((v) => v / n) ?? null,
    };
  }, [data, copies]);

  const peak = useMemo(() => {
    if (!curves) return null;
    let best = 0;
    for (let i = 1; i < curves.heat.length; i++) {
      if (curves.heat[i] > curves.heat[best]) best = i;
    }
    return { t: curves.t[best], c: curves.heat[best] };
  }, [curves]);

  return (
    <figure className="not-prose my-10 overflow-hidden rounded-xl border border-border bg-surface/40 shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-[11px] text-muted">
        <Tex className="normal-case">{preset.formula}</Tex>
        <span className="text-border">·</span>
        <Tex className="normal-case">{`Z = \\sum_i g_i e^{-E_i/T}`}</Tex>
        <span className="text-border">·</span>
        <span className="text-faint">
          <Tex className="normal-case">{`k_B = 1`}</Tex>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_268px]">
        <div className="relative min-h-[200px] p-1">
          {curves && (
            <div className={"grid grid-cols-1 sm:grid-cols-2" + (stale ? " opacity-60" : "")}>
              <Panel
                uirevision="ensembles-u"
                height={height}
                title="energy and free energy, per copy"
                x={curves.t}
                yTitle="U/N,  F/N"
                traces={[
                  { y: curves.energy, name: "U/N", color: COLORS.series[0] },
                  { y: curves.potential, name: "F/N", color: COLORS.series[1] },
                ]}
              />
              <Panel
                uirevision="ensembles-c"
                height={height}
                title="heat capacity, per copy"
                x={curves.t}
                yTitle="C/N"
                traces={[
                  { y: curves.heat, name: "C/N", color: COLORS.series[2] },
                ]}
              />
              <Panel
                uirevision="ensembles-s"
                height={height}
                title="entropy, per copy"
                x={curves.t}
                yTitle="S/N"
                traces={[
                  { y: curves.entropy, name: "S/N", color: COLORS.series[3] },
                ]}
              />
              {curves.magnetisation && curves.susceptibility ? (
                <Panel
                  uirevision="ensembles-m"
                  height={height}
                  title="magnetisation and susceptibility, per copy"
                  x={curves.t}
                  yTitle="M/N,  χ/N"
                  traces={[
                    {
                      y: curves.magnetisation,
                      name: "M/N",
                      color: COLORS.series[4],
                    },
                    {
                      y: curves.susceptibility,
                      name: "χ/N",
                      color: COLORS.reference,
                      dash: "dot",
                    },
                  ]}
                />
              ) : (
                <div className="flex items-center justify-center px-6 py-8 text-center text-xs leading-relaxed text-faint">
                  {canMagnetise
                    ? "Turn on the magnetic field to free the magnetisation."
                    : "Only the spin system reports a magnetisation per microstate, so only it can be put in a magnetic field."}
                </div>
              )}
            </div>
          )}

          {!curves && !error && (
            <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted">
              <span className="inline-flex items-center gap-2">
                <Spinner /> Summing…
              </span>
            </div>
          )}
          {error && (
            <div className="flex h-full min-h-[200px] items-center justify-center px-6 text-center text-sm text-red-400">
              {error.message}
            </div>
          )}
        </div>

        <div className="border-t border-border p-4 lg:border-l lg:border-t-0">
          <div className="space-y-3.5">
            <div>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                Spectrum
              </p>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(PRESETS) as Kind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setKind(k);
                      setScale(PRESETS[k].initial);
                      if (k !== "spin") setMagnetic(false);
                    }}
                    aria-pressed={k === kind}
                    className={
                      "rounded px-2 py-1 text-[11px] transition-colors " +
                      (k === kind
                        ? "bg-surface text-foreground"
                        : "text-muted hover:text-foreground")
                    }
                  >
                    {KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

            <Slider
              label={<Tex>{preset.label}</Tex>}
              hint={<Tex>{preset.hint}</Tex>}
              value={scale}
              onChange={setScale}
              min={preset.min}
              max={preset.max}
              step={preset.step}
            />

            <Slider
              label={<Tex>{`N`}</Tex>}
              hint={<Tex>{`\\text{distinguishable copies}`}</Tex>}
              value={copies}
              onChange={(v) => setCopies(Math.round(v))}
              min={1}
              max={200}
              step={1}
              format={(v) => v.toFixed(0)}
            />

            <div className="space-y-1.5 border-t border-border pt-3">
              <label
                className={
                  "flex items-center gap-2 text-[11px] " +
                  (canMagnetise ? "text-foreground" : "text-faint")
                }
              >
                <input
                  type="checkbox"
                  checked={inMagneticField}
                  disabled={!canMagnetise}
                  onChange={(e) => setMagnetic(e.target.checked)}
                  className="accent-[rgb(124,160,255)]"
                />
                magnetic ensemble
              </label>
              <Slider
                label={<Tex>{`h`}</Tex>}
                hint={<Tex>{`\\text{field}`}</Tex>}
                value={field}
                onChange={setField}
                min={0}
                max={3}
                step={0.05}
                disabled={!inMagneticField}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface/40 px-4 py-2 text-xs text-muted">
        <span>
          {data ? POTENTIAL_LABELS[data.potential_name] ?? data.potential_name : "—"}
          {data?.states != null && (
            <>
              <span className="mx-2 text-border">·</span>
              {data.states.toLocaleString()} microstates
            </>
          )}
        </span>
        <span className="flex items-center gap-2 font-mono tabular-nums">
          {peak && (
            <>
              peak <span className="text-foreground">C/N = {peak.c.toFixed(3)}</span>
              <span className="text-border">at</span>
              <span className="text-foreground">T = {peak.t.toFixed(3)}</span>
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

// The API names which potential -T log Z is, because the name changes with the
// ensemble and both are floats. Reporting a grand potential as a free energy is
// exactly the error nothing downstream would catch, so the label is taken from
// the response rather than assumed here.
const POTENTIAL_LABELS: Record<string, string> = {
  free_energy: "F — Helmholtz free energy",
  grand_potential: "Ω — grand potential",
  gibbs_energy: "G — Gibbs energy",
  entropy: "S — entropy",
};

function Panel({
  uirevision,
  height,
  title,
  x,
  yTitle,
  traces,
}: {
  uirevision: string;
  height: number;
  title: string;
  x: number[];
  yTitle: string;
  traces: { y: number[]; name: string; color: string; dash?: "dot" }[];
}) {
  return (
    <div className="p-2">
      <Plot
        data={traces.map((trace) => ({
          x,
          y: trace.y,
          type: "scatter" as const,
          mode: "lines" as const,
          name: trace.name,
          line: { color: trace.color, width: 1.8, dash: trace.dash },
          hovertemplate: `T=%{x:.3g}, ${trace.name}=%{y:.4g}<extra></extra>`,
        }))}
        layout={baseLayout(uirevision, height, {
          title: {
            text: title,
            font: { size: 10, color: COLORS.faint },
            x: 0,
            xanchor: "left",
          },
          margin: { t: 34, r: 14, b: 40, l: 54 },
          showlegend: traces.length > 1,
          xaxis: axis("T"),
          yaxis: axis(yTitle),
        })}
        config={PLOT_CONFIG}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
      />
    </div>
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
