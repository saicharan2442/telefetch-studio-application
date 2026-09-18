/**
 * Telegram client/service + authentication/session manager (GramJS / MTProto).
 * The session string is persisted in a 0600 file under the per-user app data dir.
 * Never log codes, passwords, api hash or session strings.
 */
import fs from "node:fs";
import path from "node:path";
import { TelegramClient, Api, sessions, helpers } from "telegram";
const { StringSession } = sessions;
import { db } from "@/db";
import { appDataDir } from "../paths";
import { logActivity } from "../settings";

export interface Credentials {
  apiId: number;
  apiHash: string;
}

export type AuthStage = "unconfigured" | "disconnected" | "awaiting_code" | "awaiting_password" | "awaiting_qr" | "authorized";

export interface ConnectionState {
  stage: AuthStage;
  connected: boolean;
  user?: { id: string; name: string; username?: string | null; phoneMasked?: string | null };
  qrUrl?: string | null;
  passwordHint?: string | null;
  error?: string | null;
}

interface TgGlobal {
  client?: TelegramClient;
  state: ConnectionState;
  pending?: { phone: string; phoneCodeHash: string };
  qrAbort?: () => void;
  passwordResolver?: (pw: string) => void;
  connecting?: Promise<TelegramClient>;
}

const g = globalThis as typeof globalThis & { __telefetchTg?: TgGlobal };
const tg: TgGlobal = g.__telefetchTg ?? (g.__telefetchTg = { state: { stage: "disconnected", connected: false } });

function sessionFile(): string {
  return path.join(appDataDir(), "session.secret");
}

export function getCredentials(): Credentials | null {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) return null;
  return { apiId, apiHash };
}

function readSession(): string {
  try {
    return fs.readFileSync(sessionFile(), "utf8").trim();
  } catch {
    return "";
  }
}

function writeSession(value: string) {
  const dir = appDataDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(sessionFile(), value, { mode: 0o600 });
}

function deleteSession() {
  try {
    fs.rmSync(sessionFile(), { force: true });
  } catch {
    /* ignore */
  }
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `+${digits.slice(0, 2)}${"*".repeat(Math.max(0, digits.length - 5))}${digits.slice(-3)}`;
}

export function getState(): ConnectionState {
  if (!getCredentials()) return { ...tg.state, stage: "unconfigured", connected: false };
  return tg.state;
}

async function buildClient(): Promise<TelegramClient> {
  const creds = getCredentials();
  if (!creds) throw new Error("TELEGRAM_API_ID / TELEGRAM_API_HASH are not configured");
  const client = new TelegramClient(new StringSession(readSession()), creds.apiId, creds.apiHash, {
    connectionRetries: 5,
    retryDelay: 1500,
    autoReconnect: true,
    floodSleepThreshold: 60,
    deviceModel: "TeleFetch Studio",
    appVersion: "1.0.0",
  });
  client.setLogLevel("error" as never);
  return client;
}

/** Get a connected client (may be unauthorized). */
export async function getClient(): Promise<TelegramClient> {
  if (tg.client && tg.client.connected) return tg.client;
  if (tg.connecting) return tg.connecting;
  tg.connecting = (async () => {
    const client = tg.client ?? (await buildClient());
    if (!client.connected) await client.connect();
    tg.client = client;
    await refreshAuthorization(client);
    return client;
  })();
  try {
    return await tg.connecting;
  } finally {
    tg.connecting = undefined;
  }
}

async function refreshAuthorization(client: TelegramClient) {
  try {
    const authorized = await client.isUserAuthorized();
    if (authorized) {
      const me = (await client.getMe()) as Api.User;
      const name = [me.firstName, me.lastName].filter(Boolean).join(" ") || me.username || "Telegram user";
      tg.state = {
        stage: "authorized",
        connected: true,
        user: { id: me.id.toString(), name, username: me.username ?? null, phoneMasked: maskPhone(me.phone) },
      };
      await db.load();
      db.dataRef.accounts = [{
        id: 1,
        telegramUserId: me.id.toString(),
        displayName: name,
        username: me.username ?? null,
        phoneMasked: maskPhone(me.phone),
        connectedAt: new Date().toISOString(),
      }];
      await db.save();
    } else if (tg.state.stage === "authorized" || tg.state.stage === "disconnected") {
      tg.state = { stage: "disconnected", connected: client.connected ?? false };
    }
  } catch (e) {
    tg.state = { stage: "disconnected", connected: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function ensureAuthorizedClient(): Promise<TelegramClient> {
  const client = await getClient();
  if (tg.state.stage !== "authorized") throw new Error("Not signed in to Telegram");
  return client;
}

export async function sendCode(phone: string): Promise<ConnectionState> {
  const creds = getCredentials();
  if (!creds) throw new Error("Telegram API credentials are not configured");
  const client = await getClient();
  const result = await client.sendCode(creds, phone.trim());
  tg.pending = { phone: phone.trim(), phoneCodeHash: result.phoneCodeHash };
  tg.state = { stage: "awaiting_code", connected: true };
  await logActivity("auth", `Verification code sent to ${maskPhone(phone)}`);
  return tg.state;
}

export async function signInWithCode(code: string): Promise<ConnectionState> {
  const client = await getClient();
  if (!tg.pending) throw new Error("Request a verification code first");
  try {
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber: tg.pending.phone, phoneCodeHash: tg.pending.phoneCodeHash, phoneCode: code.trim() }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("SESSION_PASSWORD_NEEDED")) {
      let hint: string | null = null;
      try {
        const pw = await client.invoke(new Api.account.GetPassword());
        hint = pw.hint ?? null;
      } catch {
        /* ignore */
      }
      tg.state = { stage: "awaiting_password", connected: true, passwordHint: hint };
      return tg.state;
    }
    throw new Error(friendlyAuthError(msg));
  }
  return finalizeLogin(client);
}

export async function signInWithPassword(password: string): Promise<ConnectionState> {
  const creds = getCredentials();
  if (!creds) throw new Error("Telegram API credentials are not configured");
  const client = await getClient();
  let authError: string | null = null;
  await client.signInWithPassword(creds, {
    password: async () => password,
    onError: async (err) => {
      authError = friendlyAuthError(err.message);
      return true;
    },
  });
  if (authError) throw new Error(authError);
  return finalizeLogin(client);
}

/** QR login: returns a tg:// URL to render as QR; resolves state when scanned. */
export async function startQrLogin(): Promise<ConnectionState> {
  const creds = getCredentials();
  if (!creds) throw new Error("Telegram API credentials are not configured");
  const client = await getClient();
  if (tg.state.stage === "awaiting_qr" && tg.state.qrUrl) return tg.state;
  tg.state = { stage: "awaiting_qr", connected: true, qrUrl: null };
  void client
    .signInUserWithQrCode(creds, {
      qrCode: async (qr) => {
        tg.state = { ...tg.state, stage: "awaiting_qr", qrUrl: `tg://login?token=${qr.token.toString("base64url")}` };
      },
      password: async (hint) => {
        tg.state = { stage: "awaiting_password", connected: true, passwordHint: hint ?? null, qrUrl: null };
        return new Promise<string>((resolve) => {
          tg.passwordResolver = resolve;
        });
      },
      onError: async (err) => {
        tg.state = { stage: "disconnected", connected: true, error: friendlyAuthError(err.message) };
        return true;
      },
    })
    .then(() => finalizeLogin(client))
    .catch(async (e) => {
      tg.state = { stage: "disconnected", connected: true, error: friendlyAuthError(e instanceof Error ? e.message : String(e)) };
    });
  return tg.state;
}

/** Used when 2FA password is requested during QR login. */
export function provideQrPassword(password: string): boolean {
  if (tg.passwordResolver) {
    tg.passwordResolver(password);
    tg.passwordResolver = undefined;
    return true;
  }
  return false;
}

async function finalizeLogin(client: TelegramClient): Promise<ConnectionState> {
  const saved = client.session.save() as unknown as string;
  writeSession(saved);
  tg.pending = undefined;
  await refreshAuthorization(client);
  await logActivity("auth", `Signed in as ${tg.state.user?.name ?? "Telegram user"}`, "success");
  return tg.state;
}

export async function logout(): Promise<ConnectionState> {
  try {
    if (tg.client) {
      try {
        await tg.client.invoke(new Api.auth.LogOut());
      } catch {
        /* session may already be dead */
      }
      await tg.client.disconnect();
    }
  } finally {
    tg.client = undefined;
    tg.pending = undefined;
    deleteSession();
    await db.load();
    db.dataRef.accounts = [];
    await db.save();
    tg.state = { stage: "disconnected", connected: false };
    await logActivity("auth", "Signed out and local session removed", "info");
  }
  return tg.state;
}

export function friendlyAuthError(msg: string): string {
  if (msg.includes("PHONE_CODE_INVALID")) return "That verification code is not valid.";
  if (msg.includes("PHONE_CODE_EXPIRED")) return "The verification code expired. Request a new one.";
  if (msg.includes("PASSWORD_HASH_INVALID")) return "Incorrect two-factor password.";
  if (msg.includes("PHONE_NUMBER_INVALID")) return "That phone number is not valid. Use international format (+1…).";
  if (msg.includes("FLOOD_WAIT")) return `Telegram asked us to slow down (${msg}). Please wait and retry.`;
  if (msg.includes("AUTH_KEY_UNREGISTERED") || msg.includes("SESSION_REVOKED")) return "Session expired or revoked. Please sign in again.";
  return msg;
}

/* ------------------------------------------------------------------ */
/* Channel discovery                                                  */
/* ------------------------------------------------------------------ */

export interface DiscoveredChannel {
  telegramId: string;
  accessHash: string | null;
  title: string;
  username: string | null;
  kind: "channel" | "supergroup" | "group";
  participants: number | null;
}

function mapEntity(e: Api.TypeChat | Api.TypeUser): DiscoveredChannel | null {
  if (e instanceof Api.Channel) {
    return {
      telegramId: e.id.toString(),
      accessHash: e.accessHash?.toString() ?? null,
      title: e.title,
      username: e.username ?? null,
      kind: e.megagroup ? "supergroup" : "channel",
      participants: e.participantsCount ?? null,
    };
  }
  if (e instanceof Api.Chat) {
    return { telegramId: e.id.toString(), accessHash: null, title: e.title, username: null, kind: "group", participants: e.participantsCount ?? null };
  }
  return null;
}

/** List channels/groups the account is a member of. */
export async function listDialogChannels(query = ""): Promise<DiscoveredChannel[]> {
  const client = await ensureAuthorizedClient();
  const dialogs = await client.getDialogs({ limit: 300 });
  const out: DiscoveredChannel[] = [];
  for (const d of dialogs) {
    if (!d.entity) continue;
    const m = mapEntity(d.entity as Api.TypeChat);
    if (!m) continue;
    if (query) {
      const q = query.toLowerCase();
      if (!m.title.toLowerCase().includes(q) && !(m.username ?? "").toLowerCase().includes(q)) continue;
    }
    out.push(m);
  }
  return out;
}

/** Resolve a public username / t.me link. Only works if the account may view it. */
export async function resolveChannelLink(input: string): Promise<DiscoveredChannel> {
  const client = await ensureAuthorizedClient();
  let ref = input.trim();
  ref = ref.replace(/^https?:\/\/(www\.)?t\.me\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  if (!ref) throw new Error("Enter a username or t.me link");
  const entity = await client.getEntity(ref.startsWith("+") ? input.trim() : ref);
  const m = mapEntity(entity as Api.TypeChat);
  if (!m) throw new Error("That link does not point to a channel or group");
  return m;
}

export async function getInputPeer(telegramId: string, accessHash: string | null): Promise<Api.TypeInputPeer> {
  const client = await ensureAuthorizedClient();
  const { returnBigInt } = helpers;
  if (accessHash) {
    return new Api.InputPeerChannel({ channelId: returnBigInt(telegramId), accessHash: returnBigInt(accessHash) });
  }
  // Group chat or unknown — let GramJS resolve via cache
  return client.getInputEntity(returnBigInt(telegramId));
}

export function disconnectState() {
  return tg;
}
