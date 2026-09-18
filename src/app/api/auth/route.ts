import { bootstrap, ok, fail, readJson } from "@/lib/api";
import { getState, sendCode, signInWithCode, signInWithPassword, startQrLogin, provideQrPassword, logout, getClient, getCredentials } from "@/lib/telegram/client";

export const dynamic = "force-dynamic";

export async function GET() {
  await bootstrap();
  if (getCredentials()) {
    try { await getClient(); } catch { /* reported in state */ }
  }
  return ok(getState());
}

export async function POST(req: Request) {
  await bootstrap();
  const body = await readJson<{ action: string; phone?: string; code?: string; password?: string }>(req);
  try {
    switch (body.action) {
      case "send-code":
        return ok(await sendCode(body.phone ?? ""));
      case "code":
        return ok(await signInWithCode(body.code ?? ""));
      case "password": {
        if (provideQrPassword(body.password ?? "")) return ok(getState());
        return ok(await signInWithPassword(body.password ?? ""));
      }
      case "qr":
        return ok(await startQrLogin());
      case "logout":
        return ok(await logout());
      default:
        return fail(new Error("Unknown action"));
    }
  } catch (e) {
    return fail(e);
  }
}
