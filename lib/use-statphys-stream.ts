"use client";

// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from "react";

import {
  gasWs,
  isingWs,
  type GasFrameMessage,
  type GasMetadataMessage,
  type GasStreamRequest,
  type IsingFrameMessage,
  type IsingMetadataMessage,
  type IsingRequest,
} from "@/lib/statphys-ws";

export type RunStatus = "connecting" | "streaming" | "ready" | "error";

/**
 * Watch a Metropolis chain as it runs.
 *
 * Unlike the qm evolve hook, frames are *not* buffered for replay: a chain has
 * no meaningful "scrub back", and the whole point of streaming one is that the
 * present frame is the state of the system now. Only the latest frame is kept,
 * plus whatever scalar history the caller asks for through `track`.
 *
 * A chain restarts whenever its parameters change, because a Markov chain
 * cannot be re-parameterised mid-run without invalidating everything already
 * sampled. That makes a dragged slider expensive, so the request is debounced
 * before it opens a socket.
 */
function useStream<Req, M, F>(
  open: (
    request: Req,
    handlers: {
      onMetadata?: (m: M) => void;
      onFrame?: (f: F) => void;
      onDone?: () => void;
      onError?: (e: Error) => void;
    },
  ) => { close(): void },
  requestKey: string,
  track: (frame: F) => number[],
) {
  const [metadata, setMetadata] = useState<M | null>(null);
  const [frame, setFrame] = useState<F | null>(null);
  const [status, setStatus] = useState<RunStatus>("connecting");
  const [error, setError] = useState<Error | null>(null);

  // Scalar traces grow one row per frame and are read only when the plot
  // redraws, so they live in a ref with a counter rather than in state: a
  // hundred-frame run would otherwise copy the whole history a hundred times.
  const history = useRef<number[][]>([]);
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    setStatus("connecting");
    setError(null);
    setMetadata(null);
    setFrame(null);
    history.current = [];
    setFrameCount(0);

    const session = open(JSON.parse(requestKey) as Req, {
      onMetadata: (m) => {
        setMetadata(m);
        setStatus("streaming");
      },
      onFrame: (f) => {
        history.current.push(track(f));
        setFrame(f);
        setFrameCount(history.current.length);
      },
      onDone: () => setStatus("ready"),
      onError: (e) => {
        setError(e);
        setStatus("error");
      },
    });

    return () => session.close();
    // `open` and `track` are module-level or stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return { metadata, frame, history: history.current, frameCount, status, error };
}

/** Sweep index, energy per site, magnetisation per site. */
const trackIsing = (f: IsingFrameMessage) => [
  f.sweep,
  f.energy_per_site,
  f.magnetisation_per_site,
];

export function useIsingRun(request: IsingRequest) {
  return useStream<IsingRequest, IsingMetadataMessage, IsingFrameMessage>(
    isingWs,
    JSON.stringify(request),
    trackIsing,
  );
}

/** Samples so far, fitted mu (NaN until the fit takes), its uncertainty. */
const trackGas = (f: GasFrameMessage) => [
  f.samples,
  f.chemical_potential_fitted ?? NaN,
  f.chemical_potential_error ?? NaN,
];

export function useGasRun(request: GasStreamRequest) {
  return useStream<GasStreamRequest, GasMetadataMessage, GasFrameMessage>(
    gasWs,
    JSON.stringify(request),
    trackGas,
  );
}
