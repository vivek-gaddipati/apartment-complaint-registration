import { NextRequest, NextResponse } from "next/server";
import { getOwnerByFlat, setOwnerPin } from "@/lib/sheets";
import { hashPin, verifyPin, setOwnerSession } from "@/lib/auth";

// The googleapis client makes its requests via the native fetch(), which Next.js
// caches by default. Force this route to always hit the Sheet live so a PIN set
// on one request is immediately visible on the next.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const PIN_REGEX = /^\d{4}$/;

export async function POST(req: NextRequest) {
  try {
    const { flat_no, pin, confirm_pin } = await req.json();

    if (typeof flat_no !== "string" || !flat_no.trim()) {
      return NextResponse.json({ error: "Flat number is required." }, { status: 400 });
    }
    if (typeof pin !== "string" || !PIN_REGEX.test(pin)) {
      return NextResponse.json({ error: "PIN must be exactly 4 digits." }, { status: 400 });
    }

    const owner = await getOwnerByFlat(flat_no);
    if (!owner) {
      return NextResponse.json(
        { error: "That flat number isn't registered. Contact your admin." },
        { status: 404 }
      );
    }

    const isFirstTime = !owner.pin;

    if (isFirstTime) {
      if (typeof confirm_pin !== "string" || confirm_pin !== pin) {
        return NextResponse.json(
          { error: "PINs don't match.", firstTime: true },
          { status: 400 }
        );
      }
      const hashed = hashPin(pin, owner.flat_no);
      await setOwnerPin(owner.flat_no, hashed);
      setOwnerSession(owner.flat_no, owner.owner_name);
      return NextResponse.json({
        ok: true,
        firstTime: true,
        owner_name: owner.owner_name,
        flat_no: owner.flat_no,
      });
    }

    const valid = verifyPin(pin, owner.flat_no, owner.pin);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
    }

    setOwnerSession(owner.flat_no, owner.owner_name);
    return NextResponse.json({
      ok: true,
      firstTime: false,
      owner_name: owner.owner_name,
      flat_no: owner.flat_no,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
