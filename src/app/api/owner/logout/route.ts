import { NextResponse } from "next/server";
import { clearOwnerSession } from "@/lib/auth";

export async function POST() {
  clearOwnerSession();
  return NextResponse.json({ ok: true });
}
