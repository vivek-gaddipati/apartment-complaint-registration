import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAllComplaints } from "@/lib/sheets";

// Avoid Next.js's default fetch caching so Sheets reads/writes stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const complaints = await getAllComplaints();
  return NextResponse.json({ complaints });
}
