import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), ".data");
    const dbFile = path.join(dataDir, "db.json");
    const data = await fs.readFile(dbFile, "utf-8");
    
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="telefetch-db-${Date.now()}.json"`,
      },
    });
  } catch (e) {
    return new NextResponse(JSON.stringify({ error: "Failed to read database" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
