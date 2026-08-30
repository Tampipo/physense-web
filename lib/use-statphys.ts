// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from "react";

import {
  thermodynamicsV1StatphysThermodynamicsPost,
  coexistenceV1StatphysCoexistencePost,
} from "@/lib/api/statistical-physics/statistical-physics";
import type {
  CoexistenceRequest,
  CoexistenceResponse,
  ThermodynamicsRequest,
  ThermodynamicsResponse,
} from "@/lib/api/schemas";

/** What every orval fetch client returns: the body, tagged with the status. */
interface Envelope<T> {
  status: number;
  data: T | unknown;
}

/**
 * Track a live control without flooding the API.
 *
 * Latest-wins scheduler: at most one request in flight. Values that arrive
 * while one is running are stored as "pending" — only the most recent is kept
 * — and fired the instant the current one resolves. A dragging slider then
 * costs a bounded number of requests rather than one per pixel, with no
 * debounce delay before the first.
 *
 * The previous response stays on screen while the next is in flight, so a plot
 * never blanks mid-drag. `stale` says whether what is shown still answers the
 * question currently being asked.
 *
 * Generalised from lib/use-eigenstates.ts, which does the same thing for one
 * endpoint. The scheduler is the part worth sharing; the request shape is not.
 */
function useLatest<Req, Res>(
  call: (body: Req) => Promise<Envelope<Res>>,
  request: Req,
) {
  const [data, setData] = useState<Res | null>(null);
  const [dataKey, setDataKey] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const requestKey = JSON.stringify(request);

  const inFlight = useRef(false);
  const pending = useRef<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const fire = (key: string) => {
      inFlight.current = true;
      setLoading(true);
      setError(null);

      call(JSON.parse(key) as Req)
        .then((res) => {
          if (!alive.current) return;
          if (res.status === 200) {
            setData(res.data as Res);
            setDataKey(key);
          } else {
            setError(
              new Error(
                `API returned ${res.status}: ${JSON.stringify(res.data)}`,
              ),
            );
          }
        })
        .catch((e: unknown) => {
          if (!alive.current) return;
          setError(e instanceof Error ? e : new Error(String(e)));
        })
        .finally(() => {
          inFlight.current = false;
          if (!alive.current) return;
          const next = pending.current;
          if (next && next !== key) {
            pending.current = null;
            fire(next);
          } else {
            pending.current = null;
            setLoading(false);
          }
        });
    };

    if (inFlight.current) {
      pending.current = requestKey;
    } else {
      fire(requestKey);
    }
    // `call` is a module-level import, stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return { data, error, loading, stale: dataKey !== requestKey };
}

export function useThermodynamics(request: ThermodynamicsRequest) {
  return useLatest<ThermodynamicsRequest, ThermodynamicsResponse>(
    thermodynamicsV1StatphysThermodynamicsPost,
    request,
  );
}

export function useCoexistence(request: CoexistenceRequest) {
  return useLatest<CoexistenceRequest, CoexistenceResponse>(
    coexistenceV1StatphysCoexistencePost,
    request,
  );
}
