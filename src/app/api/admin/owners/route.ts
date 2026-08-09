import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAllOwners, resetOwnerPin } from "@/lib/sheets";

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  try {
    const owners = await getAllOwners();
    const formatted = owners.map((o) => ({
      flat_no: o.flat_no,
      owner_name: o.owner_name,
      phone: o.phone,
      hasPin: Boolean(o.pin && o.pin.trim() !== ""),
    }));
    return NextResponse.json({ owners: formatted });
  } catch (err) {
    console.error("Fetch owners error:", err);
    return NextResponse.json({ error: "Failed to fetch owners list." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  try {
    const { flat_no, action } = await req.json();
    if (typeof flat_no !== "string" || !flat_no.trim()) {
      return NextResponse.json({ error: "Flat number is required." }, { status: 400 });
    }

    if (action === "reset_pin") {
      await resetOwnerPin(flat_no.trim());
      return NextResponse.json({ ok: true, message: `PIN reset for Flat ${flat_no}.` });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("Admin owners error:", err);
    return NextResponse.json({ error: "Failed to perform owner management action." }, { status: 500 });
  }
}
