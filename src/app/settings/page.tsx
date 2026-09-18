"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/components/store";
import { Card, ConfirmDialog, PageHeader, Toggle } from "@/components/ui";
import { DestinationSelector } from "@/components/destination";
import type { ConnectionState } from "@/lib/telegram/client";
import type { AppSettings } from "@/lib/settings";

function QrCode({ url }: { url: string }) {
  // Render QR via a lightweight inline-SVG generator (no external network calls).
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import("@/lib/qr").then((m) => m.qrSvg(url)).then((v) => alive && setSvg(v)).catch(() => setSvg(null));
    return () => { alive = false; };
  }, [url]);
  if (!svg) return <div className="skeleton h-44 w-44" />;
  return <div className="rounded-xl bg-white p-3" style={{ width: 200, height: 200 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function TelegramSection() {
  const { state, api, toast } = useStore();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const conn = state?.connection;
  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await api<ConnectionState>("/api/auth", body);
      if (r.stage === "authorized") toast({ title: "Connected to Telegram", body: r.user?.name, level: "success" });
      if (r.error) toast({ title: "Sign-in problem", body: r.error, level: "error" });
    } catch (e) {
      toast({ title: "Sign-in failed", body: e instanceof Error ? e.message : String(e), level: "error" });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (conn?.stage === "awaiting_qr") { const t = setInterval(() => fetch("/api/auth"), 2500); return () => clearInterval(t); }
  }, [conn?.stage]);
  if (!conn) return null;

  return (
    <Card title="Telegram account" subtitle="Sign in with your own account. Credentials go directly to Telegram's servers over MTProto." className="scroll-mt-24">
      <div id="telegram" />
      {conn.stage === "unconfigured" && (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "rgba(245,181,68,.4)", background: "rgba(245,181,68,.08)" }}>
          <div className="font-semibold text-warning">API credentials missing</div>
          <p className="mt-1 text-muted">Create an application at <span className="mono text-ink">my.telegram.org → API development tools</span>, then set <span className="mono text-ink">TELEGRAM_API_ID</span> and <span className="mono text-ink">TELEGRAM_API_HASH</span> in your <span className="mono text-ink">.env</span> file and restart the app. See README for details. Credentials are never stored in the database or logs.</p>
        </div>
      )}
      {conn.stage === "authorized" && (
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-full text-lg font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}>{conn.user?.name.slice(0, 1)}</span>
          <div className="flex-1">
            <div className="font-semibold">{conn.user?.name}</div>
            <div className="text-xs text-muted">{conn.user?.username ? `@${conn.user.username} · ` : ""}{conn.user?.phoneMasked ?? ""} · <span className="text-success">connected</span></div>
          </div>
          <button className="btn btn-danger" onClick={() => setLogoutOpen(true)}>Log out & delete session</button>
        </div>
      )}
      {conn.stage === "disconnected" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="label">Phone number</label>
            <div className="flex gap-2">
              <input className="input" placeholder="+1 555 0100" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void run({ action: "send-code", phone })} />
              <button className="btn btn-primary" disabled={busy || !phone.trim()} onClick={() => void run({ action: "send-code", phone })}>Send code</button>
            </div>
            <p className="help">Telegram sends a login code to your app (or SMS). Two-factor passwords are supported.</p>
            {conn.error && <p className="mt-2 text-xs text-danger">{conn.error}</p>}
          </div>
          <div className="rounded-xl border border-line p-4 text-center">
            <div className="text-sm font-medium">Or sign in with QR</div>
            <p className="mt-1 text-xs text-muted">Telegram → Settings → Devices → Link Desktop Device</p>
            <button className="btn btn-secondary mt-3" disabled={busy} onClick={() => void run({ action: "qr" })}>Show QR code</button>
          </div>
        </div>
      )}
      {conn.stage === "awaiting_qr" && (
        <div className="flex flex-col items-center gap-3 py-2">
          {conn.qrUrl ? <QrCode url={conn.qrUrl} /> : <div className="skeleton h-44 w-44" />}
          <p className="text-sm text-muted">Scan with Telegram: Settings → Devices → Link Desktop Device</p>
          <button className="btn btn-ghost btn-sm" onClick={() => void run({ action: "logout" })}>Use phone number instead</button>
        </div>
      )}
      {conn.stage === "awaiting_code" && (
        <div className="max-w-md">
          <label className="label">Verification code</label>
          <div className="flex gap-2">
            <input className="input mono tracking-[0.4em]" placeholder="12345" value={code} onChange={(e) => setCode(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && void run({ action: "code", code })} />
            <button className="btn btn-primary" disabled={busy || code.trim().length < 4} onClick={() => void run({ action: "code", code })}>Verify</button>
          </div>
          <p className="help">Never share this code. TeleFetch does not log it.</p>
          <button className="btn btn-ghost btn-sm mt-2" onClick={() => void run({ action: "logout" })}>Start over</button>
        </div>
      )}
      {conn.stage === "awaiting_password" && (
        <div className="max-w-md">
          <label className="label">Two-factor password{conn.passwordHint ? ` (hint: ${conn.passwordHint})` : ""}</label>
          <div className="flex gap-2">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && void run({ action: "password", password })} />
            <button className="btn btn-primary" disabled={busy || !password} onClick={() => void run({ action: "password", password })}>Sign in</button>
          </div>
        </div>
      )}
      <ConfirmDialog open={logoutOpen} onClose={() => setLogoutOpen(false)} title="Log out of Telegram?" body="The Telegram session is terminated and the local encrypted session file is deleted. Active downloads and monitoring will stop. Your download history is kept." confirmLabel="Log out" danger onConfirm={() => void run({ action: "logout" })} />
    </Card>
  );
}

export default function SettingsPage() {
  const { state, api, toast } = useStore();
  const [fallback, setFallback] = useState<string | null>(null);
  if (!state) return <div className="skeleton h-64" />;
  const s = state.settings;
  const save = (patch: Partial<AppSettings>) => api("/api/settings", patch, "PUT").then(() => toast({ title: "Settings saved", level: "success" })).catch((e) => toast({ title: "Could not save", body: e.message, level: "error" }));
  const askNotif = async () => {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") await Notification.requestPermission();
    void save({ notifications: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Account, destination, organization, transfer behaviour, notifications and diagnostics." />
      <TelegramSection />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Download destination" subtitle="Default is your Downloads folder; it is remembered across restarts.">
          <DestinationSelector />
          <div className="mt-4">
            <label className="label">Fallback folder (used when no keywords are set)</label>
            <div className="flex gap-2">
              <input className="input" value={fallback ?? s.fallbackFolder} onChange={(e) => setFallback(e.target.value)} />
              <button className="btn btn-secondary" disabled={fallback == null || fallback === s.fallbackFolder} onClick={() => void save({ fallbackFolder: fallback! }).then(() => setFallback(null))}>Save</button>
            </div>
          </div>
        </Card>

        <Card title="Folder organization" subtitle="Base / keyword / [channel] / [YYYY-MM] / file">
          <Toggle on={s.channelSubfolders} onChange={(v) => void save({ channelSubfolders: v })} label="Channel subfolders" help="Group files by channel inside each keyword folder" />
          <Toggle on={s.dateSubfolders} onChange={(v) => void save({ dateSubfolders: v })} label="Date subfolders" help="Add a YYYY-MM folder based on the message date" />
          <div className="mt-3 rounded-xl border border-line p-3 mono text-xs text-muted">
            {s.destinationDir}{s.destinationDir.includes("\\") ? "\\" : "/"}<span className="text-accent">Python</span>{s.channelSubfolders ? `${s.destinationDir.includes("\\") ? "\\" : "/"}<channel>` : ""}{s.dateSubfolders ? `${s.destinationDir.includes("\\") ? "\\" : "/"}2025-01` : ""}{s.destinationDir.includes("\\") ? "\\" : "/"}<span className="text-ink">course.pdf</span>
          </div>
        </Card>

        <Card title="Transfers" subtitle="Conservative defaults keep you within Telegram's rate limits.">
          <label className="label">Parallel downloads: {s.concurrency}</label>
          <input type="range" min={1} max={4} value={s.concurrency} onChange={(e) => void save({ concurrency: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          <p className="help">1 is safest for large files; 2 is recommended. Maximum is 4.</p>
          <label className="label mt-4">Max automatic retries: {s.maxRetries}</label>
          <input type="range" min={0} max={8} value={s.maxRetries} onChange={(e) => void save({ maxRetries: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
          <p className="help">Retries use exponential backoff and honour FLOOD_WAIT delays from Telegram.</p>
        </Card>

        <Card title="Duplicate handling" subtitle="Files are never overwritten silently.">
          <div className="flex flex-wrap gap-2">
            {(["rename", "skip", "replace"] as const).map((p) => <button key={p} className={`chip ${s.collisionPolicy === p ? "chip-on" : ""}`} onClick={() => void save({ collisionPolicy: p })}>{p}</button>)}
          </div>
          <p className="help">{s.collisionPolicy === "rename" ? "Existing files are kept; new ones get a “(1)” suffix." : s.collisionPolicy === "skip" ? "If a file with the same name exists, the download is skipped." : "Existing files are replaced after the new file fully downloads."}</p>
          <p className="help">Independently of this, messages already downloaded are detected via the persistent dedup log and skipped.</p>
        </Card>

        <Card title="Notifications">
          <Toggle on={s.notifications} onChange={(v) => (v ? void askNotif() : void save({ notifications: false }))} label="Desktop notifications" help="Completed downloads, new matches, failures and low disk space" />
          {typeof Notification !== "undefined" && Notification.permission === "denied" && <p className="help text-warning">Notifications are blocked by the browser for this site.</p>}
        </Card>

        <Card title="Appearance">
          <div className="flex gap-2">
            {(["dark", "light"] as const).map((t) => <button key={t} className={`chip ${s.theme === t ? "chip-on" : ""}`} onClick={() => void save({ theme: t })}>{t}</button>)}
          </div>
          <p className="help">Light theme is provided as a preview; the dark theme is the primary design.</p>
        </Card>

        <Card title="Logs & diagnostics" className="lg:col-span-2" subtitle="The activity log never contains codes, API secrets, session tokens or message contents.">
          <div className="max-h-56 overflow-auto rounded-xl border border-line p-3 mono text-[11px]">
            {state.activity.length === 0 ? <span className="text-faint">No entries</span> : state.activity.map((a) => <div key={a.id}><span className="text-faint">{new Date(a.createdAt).toISOString()}</span> <span style={{ color: `var(--${a.level === "info" ? "info" : a.level})` }}>[{a.level}]</span> <span className="text-muted">[{a.kind}]</span> {a.message}</div>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted items-center">
            <span>Queue: {state.queuePaused ? "paused" : "running"}</span>·<span>Monitor: {state.monitor.status}</span>·<span>Scan: {state.scan.running ? "running" : "idle"}</span>·<span>Destination: {state.destination.ok ? "ok" : "unavailable"}</span>
            <div className="flex-1" />
            <button className="btn btn-ghost btn-sm" onClick={() => void api("/api/settings", { action: "clear-logs" }, "POST").then(() => fetch("/api/state"))}>Clear Logs</button>
            <a href="/api/export" download className="btn btn-secondary btn-sm">Export Database (JSON)</a>
          </div>
        </Card>

        <Card title="Privacy" className="lg:col-span-2">
          <p className="text-sm text-muted">TeleFetch Studio talks only to Telegram's servers using your own account and the official MTProto API. Your session, settings and history stay on this machine. It only lists channels your account can already access and never bypasses permissions, paywalls or restrictions. There is no telemetry and no background/stealth behaviour — monitoring runs only while the app is open.</p>
        </Card>
      </div>
    </div>
  );
}
