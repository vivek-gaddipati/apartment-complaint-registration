import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth";
import { getComplaintById, updateComplaintFields } from "@/lib/sheets";

// Avoid Next.js's default fetch caching so Sheets reads/writes stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getOwnerSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const existing = await getComplaintById(params.id);
  if (!existing || existing.flat_no.toLowerCase() !== session.flat_no.toLowerCase()) {
    return NextResponse.json({ error: "Complaint not found." }, { status: 404 });
  }

  try {
    const body = await req.json();

    if (body.action === "rate") {
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: "Rating must be 1-5." }, { status: 400 });
      }
      if (existing.status !== "Resolved" && existing.status !== "Closed") {
        return NextResponse.json(
          { error: "Only resolved complaints can be rated." },
          { status: 400 }
        );
      }
      const updated = await updateComplaintFields(params.id, {
        owner_rating: String(rating),
      });
      return NextResponse.json({ ok: true, complaint: updated });
    }

    if (body.action === "reopen") {
      if (existing.status !== "Resolved" && existing.status !== "Closed") {
        return NextResponse.json(
          { error: "Only resolved or closed complaints can be reopened." },
          { status: 400 }
        );
      }
      const updated = await updateComplaintFields(params.id, {
        status: "Reopened",
        resolved_at: "",
      });
      return NextResponse.json({ ok: true, complaint: updated });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
