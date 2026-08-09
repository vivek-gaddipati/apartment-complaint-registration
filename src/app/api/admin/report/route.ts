import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAllComplaints } from "@/lib/sheets";
import { generateInsightsReport } from "@/lib/claude";

// Avoid Next.js's default fetch caching so Sheets reads stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const { from, to } = await req.json().catch(() => ({ from: null, to: null }));

    let complaints = await getAllComplaints();

    if (from) {
      complaints = complaints.filter((c) => c.timestamp >= from);
    }
    if (to) {
      complaints = complaints.filter((c) => c.timestamp <= to);
    }

    if (complaints.length === 0) {
      return NextResponse.json(
        { error: "No complaints in this date range." },
        { status: 400 }
      );
    }

    const report = await generateInsightsReport(complaints);
    return NextResponse.json({ report });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to generate report. Please try again." },
      { status: 500 }
    );
  }
}
