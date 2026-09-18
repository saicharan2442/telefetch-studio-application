import { db } from "@/db";
import { ok, fail, readJson } from "@/lib/api";
import type { FilterConfig } from "@/lib/filters";

export const dynamic = "force-dynamic";

export async function GET() {
  await db.load();
  const profiles = [...db.dataRef.filterProfiles].sort((a, b) => a.name.localeCompare(b.name));
  return ok(profiles);
}

export async function POST(req: Request) {
  const body = await readJson<{ name: string; config: FilterConfig }>(req);
  if (!body.name?.trim()) return fail(new Error("Profile name is required"));
  
  await db.load();
  const d = db.dataRef;
  const id = (d.filterProfiles.length > 0 ? Math.max(...d.filterProfiles.map(p => p.id)) : 0) + 1;
  const row = { id, name: body.name.trim(), config: body.config, createdAt: new Date().toISOString() };
  d.filterProfiles.push(row);
  await db.save();
  return ok(row);
}

export async function DELETE(req: Request) {
  const body = await readJson<{ id: number }>(req);
  await db.load();
  const d = db.dataRef;
  d.filterProfiles = d.filterProfiles.filter(p => p.id !== body.id);
  await db.save();
  return ok({ ok: true });
}
