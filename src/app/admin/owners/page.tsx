import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAllOwners } from "@/lib/sheets";
import AdminOwnersClient from "./AdminOwnersClient";

// Avoid Next.js's default fetch caching so Sheets reads stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminOwnersPage() {
  const session = getAdminSession();
  if (!session) {
    redirect("/admin");
  }

  const owners = await getAllOwners();
  const initialOwners = owners.map((o) => ({
    flat_no: o.flat_no,
    owner_name: o.owner_name,
    phone: o.phone,
    hasPin: Boolean(o.pin && o.pin.trim() !== ""),
  }));

  return <AdminOwnersClient initialOwners={initialOwners} />;
}
