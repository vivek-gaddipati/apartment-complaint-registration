import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";
import { getComplaintsByFlat } from "@/lib/sheets";
import OwnerDashboardClient from "./OwnerDashboardClient";

// Avoid Next.js's default fetch caching so Sheets reads stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function OwnerDashboardPage() {
  const session = getOwnerSession();
  if (!session) {
    redirect("/owner");
  }

  const complaints = await getComplaintsByFlat(session.flat_no);

  return (
    <OwnerDashboardClient
      flatNo={session.flat_no}
      ownerName={session.owner_name}
      initialComplaints={complaints}
    />
  );
}
