import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getComplaintById, updateComplaintFields } from "@/lib/sheets";
import { STATUSES, PRIORITIES, Complaint } from "@/lib/types";

// Avoid Next.js's default fetch caching so Sheets reads/writes stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const existing = await getComplaintById(params.id);
  if (!existing) {
    return NextResponse.json({ error: "Complaint not found." }, { status: 404 });
  }

  try {
    const body = await req.json();
    const updates: Partial<Complaint> = {};

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      updates.status = body.status;
      if (body.status === "Resolved" || body.status === "Closed") {
        updates.resolved_at = existing.resolved_at || new Date().toISOString();
      } else {
        updates.resolved_at = "";
      }
    }

    if (body.priority !== undefined) {
      if (!PRIORITIES.includes(body.priority)) {
        return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
      }
      updates.priority = body.priority;
    }

    if (body.assigned_to !== undefined) {
      updates.assigned_to = String(body.assigned_to);
    }

    if (body.admin_notes !== undefined) {
      updates.admin_notes = String(body.admin_notes);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const updated = await updateComplaintFields(params.id, updates);
    return NextResponse.json({ ok: true, complaint: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
