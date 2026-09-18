import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.load();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
