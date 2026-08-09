import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth";
import { appendComplaint, getComplaintsByFlat } from "@/lib/sheets";
import { Complaint, CATEGORIES } from "@/lib/types";
import { suggestPriority } from "@/lib/priority";

// Avoid Next.js's default fetch caching so Sheets reads/writes stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const session = getOwnerSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const complaints = await getComplaintsByFlat(session.flat_no);
  return NextResponse.json({ complaints });
}

export async function POST(req: NextRequest) {
  const session = getOwnerSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const { category, description, photo_url } = await req.json();

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }
    if (typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "Description is required." }, { status: 400 });
    }

    const complaint: Complaint = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      flat_no: session.flat_no,
      owner_name: session.owner_name,
      category,
      description: description.trim(),
      photo_url: typeof photo_url === "string" ? photo_url : "",
      status: "Open",
      priority: suggestPriority(category),
      assigned_to: "",
      admin_notes: "",
      resolved_at: "",
      owner_rating: "",
    };

    await appendComplaint(complaint);
    return NextResponse.json({ ok: true, complaint });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
