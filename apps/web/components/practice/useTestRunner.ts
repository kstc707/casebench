"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunResult } from "../../lib/practice/runner";

/** A run that doesn't finish in this long is stopped (e.g. an infinite loop in the learner's code). */
const RUN_TIMEOUT_MS = 60_000;

export type RunnerState = "loading" | "ready" | "running" | "failed";

/**
 * Starts Python (Pyodide) in a background worker as soon as the page opens,
 * and runs tests on request. A run that hangs is killed and Python restarted.
 */
export function useTestRunner() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { resolve: (r: RunResult) => void; reject: (e: Error) => void }>());
  const nextId = useRef(1);
  const [state, setState] = useState<RunnerState>("loading");
  const [bootError, setBootError] = useState<string | null>(null);

  const start = useCallback(() => {
    worker.current?.terminate();
    setState("loading");
    // A module worker served as-is next to Pyodide (see scripts/practice-worker.mjs).
    const w = new Worker("/pyodide/practice-worker.mjs", { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: number; result?: RunResult; error?: string };
      if (d.type === "ready") return setState("ready");
      if (d.type === "boot-error") {
        setBootError(d.error ?? "Python failed to start");
        return setState("failed");
      }
      const p = d.id !== undefined ? pending.current.get(d.id) : undefined;
      if (!p) return;
      pending.current.delete(d.id!);
      if (d.result) p.resolve(d.result);
      else p.reject(new Error(d.error ?? "The test run failed"));
    };
    worker.current = w;
  }, []);

  useEffect(() => {
    start();
    return () => worker.current?.terminate();
  }, [start]);

  const run = useCallback(
    (files: Record<string, string>, testIds: string[]): Promise<RunResult> => {
      const w = worker.current;
      if (!w) return Promise.reject(new Error("Python isn't running"));
      const id = nextId.current++;
      setState("running");
      return new Promise<RunResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error(`The tests took longer than ${RUN_TIMEOUT_MS / 1000} seconds and were stopped. Is there an infinite loop?`));
          start(); // the worker is stuck: start a fresh Python
        }, RUN_TIMEOUT_MS);
        pending.current.set(id, {
          resolve: (r) => {
            clearTimeout(timer);
            setState("ready");
            resolve(r);
          },
          reject: (e) => {
            clearTimeout(timer);
            setState("ready");
            reject(e);
          },
        });
        w.postMessage({ id, files, testIds });
      });
    },
    [start]
  );

  return { state, bootError, run };
}
