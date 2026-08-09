import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { getAllComplaints } from "@/lib/sheets";
import AdminDashboardClient from "./AdminDashboardClient";

// Avoid Next.js's default fetch caching so Sheets reads stay live.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminDashboardPage() {
  const session = getAdminSession();
  if (!session) {
    redirect("/admin");
  }

  const complaints = await getAllComplaints();

  return <AdminDashboardClient initialComplaints={complaints} />;
}
