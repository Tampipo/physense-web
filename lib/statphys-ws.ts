// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import { getWsBaseUrl } from "./ws";

// ── WS message contracts (not in OpenAPI) ───────────────────────────────────
// Source of truth: eigora-api src/eigora_api/schemas/statphys.py
//
// Both statistical-physics sockets speak the same four-message protocol —
// metadata once, then a frame per batch, then done, with error replacing the
// rest at any point — so the lifecycle is written once below and the two
// endpoints differ only in their payload types. That protocol is a deliberate
// match for /v1/qm/evolve in ws.ts; what is *not* shared is the connection
// helper itself, because that one carries the qm request shape in its
// signature. Only the base URL is worth reusing, and it is imported.

/** Streamed by both endpoints when the request is rejected or a run fails. */
export interface StatphysErrorMessage {
  type: "error";
  detail: string;
}

interface StreamHandlers<M, F> {
  onMetadata?: (msg: M) => void;
  onFrame?: (msg: F) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

export interface StreamSession {
  close(): void;
}

/**
 * Open one socket, send one request, dispatch the reply stream.
 *
 * The three flags are what keep a normal ending from being reported as a
 * failure: a socket closing after `done` is the run finishing, and a socket
 * closing after `close()` is the reader navigating away. Only a close that is
 * neither reaches `onError`.
 */
function stream<M, F>(
  path: string,
  request: unknown,
  handlers: StreamHandlers<M, F>,
): StreamSession {
  const ws = new WebSocket(`${getWsBaseUrl()}${path}`);
  let closedByUs = false;
  let finished = false;

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify(request));
  });

  ws.addEventListener("message", (ev) => {
    let msg: { type: string } & Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data as string);
    } catch (e) {
      handlers.onError?.(
        e instanceof Error ? e : new Error("Failed to parse WS message"),
      );
      return;
    }

    switch (msg.type) {
      case "metadata":
        handlers.onMetadata?.(msg as unknown as M);
        break;
      case "frame":
        handlers.onFrame?.(msg as unknown as F);
        break;
      case "error":
        // The server reports a rejected request in-band and then closes, so
        // this is the only place a validation failure surfaces — a 422 never
        // happens, there being no HTTP response to carry one.
        finished = true;
        handlers.onError?.(new Error(String(msg.detail ?? "Server error")));
        break;
      case "done":
        finished = true;
        handlers.onDone?.();
        closedByUs = true;
        ws.close(1000);
        break;
    }
  });

  ws.addEventListener("error", () => {
    if (closedByUs || finished) return;
    handlers.onError?.(new Error("WebSocket error"));
  });

  ws.addEventListener("close", (ev) => {
    if (closedByUs || finished) return;
    if (!ev.wasClean && ev.code !== 1000) {
      handlers.onError?.(
        new Error(`WebSocket closed unexpectedly (code ${ev.code})`),
      );
    }
  });

  return {
    close: () => {
      closedByUs = true;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close(1000);
      }
    },
  };
}

// ── Ising ───────────────────────────────────────────────────────────────────

export interface IsingRequest {
  /** One edge; the lattice is square, so there are `size * size` spins. */
  size?: number;
  coupling?: number;
  temperature?: number;
  sweeps_per_frame?: number;
  frames?: number;
  seed?: number | null;
}

export interface IsingMetadataMessage {
  type: "metadata";
  size: number;
  /** 2 / log(1 + sqrt(2)), exact for the square lattice — Onsager's value. */
  critical_temperature: number;
  sites: number;
  frames: number;
  sweeps_per_frame: number;
}

export interface IsingFrameMessage {
  type: "frame";
  frame: number;
  sweep: number;
  temperature: number;
  /** `size` rows of `size` entries, each +1 or -1. */
  spins: number[][];
  energy_per_site: number;
  magnetisation_per_site: number;
  acceptance: number;
}

export function isingWs(
  request: IsingRequest,
  handlers: StreamHandlers<IsingMetadataMessage, IsingFrameMessage>,
): StreamSession {
  return stream("/v1/statphys/ising", request, handlers);
}

// ── Quantum gas ─────────────────────────────────────────────────────────────

export interface GasStreamRequest {
  /** Box edge in nanometres; sets the orbital spacing. */
  box?: number;
  particles?: number;
  /** Half-integer for fermions, integer for bosons. */
  spin?: number;
  /** Kelvin. */
  temperature?: number;
  samples?: number;
  burn_in_sweeps?: number;
  /** How many reports the run is split into. */
  frames?: number;
  seed?: number | null;
}

export interface GasMetadataMessage {
  type: "metadata";
  /** Distinct orbital energies in kelvin, ascending. */
  energies: number[];
  /** How many orbitals share each energy, spin multiplicity included. */
  degeneracies: number[];
  statistics: string;
  fermi_temperature: number;
  chemical_potential_exact: number;
  /** Fermi-Dirac or Bose-Einstein at the exact mu — the curve to land on. */
  distribution: number[];
  orbitals: number;
  particles: number;
  temperature: number;
  frames: number;
}

export interface GasFrameMessage {
  type: "frame";
  frame: number;
  /** Samples behind this average — the running total, not the batch size. */
  samples: number;
  occupation: number[];
  occupation_error: number[];
  /** Null early on, when the fit has nothing stable to bite on. */
  chemical_potential_fitted: number | null;
  chemical_potential_error: number | null;
  acceptance: number;
}

export function gasWs(
  request: GasStreamRequest,
  handlers: StreamHandlers<GasMetadataMessage, GasFrameMessage>,
): StreamSession {
  return stream("/v1/statphys/gas", request, handlers);
}
