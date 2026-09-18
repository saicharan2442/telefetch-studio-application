"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Channel, DownloadTask, ActivityEvent } from "@/db";
import type { AppSettings } from "@/lib/settings";
import type { ConnectionState } from "@/lib/telegram/client";
import type { LiveMetric } from "@/lib/telegram/downloader";
import type { MonitorState } from "@/lib/telegram/monitor";
import type { ScanState } from "@/lib/telegram/scanner";
import type { DestinationCheck } from "@/lib/paths";

export interface AppState {
  connection: ConnectionState;
  settings: AppSettings;
  activity: ActivityEvent[];
  channels: Channel[];
  tasks: DownloadTask[];
  metrics: Record<number, LiveMetric>;
  queuePaused: boolean;
  stats: Record<string, number> & { totalBytes: number; totalCompleted: number };
  monitor: MonitorState;
  scan: Omit<ScanState, "results"> & { results: number };
  destination: DestinationCheck;
  now: number;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  level: "info" | "success" | "warning" | "error";
}

interface Store {
  state: AppState | null;
  error: string | null;
  refresh: () => Promise<void>;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
  api: <T = unknown>(url: string, body?: unknown, method?: string) => Promise<T>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastActivityId = useRef<number | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts, { ...t, id }].slice(-5));
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 6000);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`State request failed (${res.status})`);
      const data = (await res.json()) as AppState;
      setState(data);
      setError(null);
      // Desktop notifications for important events
      const newest = data.activity[0]?.id ?? null;
      if (lastActivityId.current != null && newest != null && newest > lastActivityId.current) {
        const fresh = data.activity.filter((a) => a.id > (lastActivityId.current ?? 0));
        for (const a of fresh.reverse()) {
          const important = (a.kind === "download" && (a.level === "success" || a.level === "error")) || (a.kind === "monitor" && a.level === "success");
          if (!important) continue;
          toast({ title: a.kind === "download" ? (a.level === "success" ? "Download complete" : "Download failed") : "New matching file", body: a.message, level: a.level as Toast["level"] });
          if (data.settings.notifications && typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification("TeleFetch Studio", { body: a.message });
            } catch {
              /* ignore */
            }
          }
        }
      }
      lastActivityId.current = newest;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 1500);
    return () => clearInterval(t);
  }, [refresh]);

  const api = useCallback(
    async <T,>(url: string, body?: unknown, method = "POST"): Promise<T> => {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
      void refresh();
      return data as T;
    },
    [refresh],
  );

  const value = useMemo(() => ({ state, error, refresh, toasts, toast, dismiss, api }), [state, error, refresh, toasts, toast, dismiss, api]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}
