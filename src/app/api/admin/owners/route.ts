import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  getAllOwners,
  getOwnerByFlat,
  resetOwnerPin,
  createOwner,
  updateOwnerDetails,
} from "@/lib/sheets";

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
    const { flat_no, action, owner_name, phone } = await req.json();
    if (typeof flat_no !== "string" || !flat_no.trim()) {
      return NextResponse.json({ error: "Flat number is required." }, { status: 400 });
    }

    if (action === "reset_pin") {
      await resetOwnerPin(flat_no.trim());
      return NextResponse.json({ ok: true, message: `PIN reset for Flat ${flat_no}.` });
    }

    if (action === "create") {
      if (typeof owner_name !== "string" || !owner_name.trim()) {
        return NextResponse.json({ error: "Owner name is required." }, { status: 400 });
      }
      const existing = await getOwnerByFlat(flat_no.trim());
      if (existing) {
        return NextResponse.json(
          { error: `Flat ${flat_no} already exists.` },
          { status: 400 }
        );
      }
      const owner = await createOwner(
        flat_no.trim(),
        owner_name,
        typeof phone === "string" ? phone : ""
      );
      return NextResponse.json({
        ok: true,
        owner: {
          flat_no: owner.flat_no,
          owner_name: owner.owner_name,
          phone: owner.phone,
          hasPin: false,
        },
      });
    }

    if (action === "update") {
      if (typeof owner_name !== "string" || !owner_name.trim()) {
        return NextResponse.json({ error: "Owner name is required." }, { status: 400 });
      }
      const existing = await getOwnerByFlat(flat_no.trim());
      if (!existing) {
        return NextResponse.json({ error: `Flat ${flat_no} not found.` }, { status: 404 });
      }
      const owner = await updateOwnerDetails(flat_no.trim(), {
        owner_name,
        phone: typeof phone === "string" ? phone : "",
      });
      return NextResponse.json({
        ok: true,
        owner: {
          flat_no: owner.flat_no,
          owner_name: owner.owner_name,
          phone: owner.phone,
          hasPin: Boolean(owner.pin && owner.pin.trim() !== ""),
        },
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("Admin owners error:", err);
    return NextResponse.json(
      { error: "Failed to perform owner management action." },
      { status: 500 }
    );
  }
}
