import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  getAllOwners,
  resetOwnerPin,
  createOwner,
  updateOwnerDetails,
} from "@/lib/sheets";

// The googleapis client makes its requests via the native fetch(), which Next.js
// caches by default. Force this route to always hit the Sheet live so a row
// created or edited on one request is immediately visible on the next.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
      // createOwner does its own duplicate check and throws "Flat already
      // exists: ..." — mapped to a 400 in the catch below. No pre-check here:
      // it would only add a round-trip and could still go stale before the write.
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
      // Each field is optional and only the ones actually present in the body
      // are written, so an admin editing one field can't clobber another
      // admin's concurrent edit to the other field with stale client state.
      const updates: { owner_name?: string; phone?: string } = {};
      if (owner_name !== undefined) {
        if (typeof owner_name !== "string" || !owner_name.trim()) {
          return NextResponse.json({ error: "Owner name is required." }, { status: 400 });
        }
        updates.owner_name = owner_name;
      }
      if (phone !== undefined) {
        if (typeof phone !== "string") {
          return NextResponse.json({ error: "Phone must be text." }, { status: 400 });
        }
        updates.phone = phone;
      }
      if (updates.owner_name === undefined && updates.phone === undefined) {
        return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
      }
      // updateOwnerDetails throws "Unknown flat: ..." if the row is gone —
      // mapped to a 404 in the catch below.
      const owner = await updateOwnerDetails(flat_no.trim(), updates);
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
    // The data layer is the single source of truth for existence checks; map its
    // two expected failures to real status codes instead of a generic 500.
    const message = err instanceof Error ? err.message : "";
    if (message.startsWith("Flat already exists")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.startsWith("Unknown flat")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("Admin owners error:", err);
    return NextResponse.json(
      { error: "Failed to perform owner management action." },
      { status: 500 }
    );
  }
}
