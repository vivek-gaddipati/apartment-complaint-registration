import { NextRequest, NextResponse } from "next/server";
import { getOwnerByFlat } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const { flat_no } = await req.json();
    if (typeof flat_no !== "string" || !flat_no.trim()) {
      return NextResponse.json({ error: "Flat number is required." }, { status: 400 });
    }

    const owner = await getOwnerByFlat(flat_no.trim());
    if (!owner) {
      return NextResponse.json(
        { error: "That flat number is not registered in the society list. Please contact the society administrator." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      flat_no: owner.flat_no,
      owner_name: owner.owner_name,
      isFirstTime: !owner.pin || owner.pin.trim() === "",
    });
  } catch (err) {
    console.error("Check flat error:", err);
    return NextResponse.json({ error: "Unable to verify flat. Please try again." }, { status: 500 });
  }
}
