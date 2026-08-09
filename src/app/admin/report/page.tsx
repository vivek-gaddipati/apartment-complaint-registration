import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import AdminReportClient from "./AdminReportClient";

export default async function AdminReportPage() {
  const session = getAdminSession();
  if (!session) {
    redirect("/admin");
  }

  return <AdminReportClient />;
}
