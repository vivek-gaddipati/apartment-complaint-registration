import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { listKnowledgeDocuments } from "@/lib/sheets";
import AdminAssistantClient from "./AdminAssistantClient";

// Avoid Next.js fetch caching so admin sees current knowledge docs immediately.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function AdminAssistantPage() {
  const session = getAdminSession();
  if (!session) {
    redirect("/admin");
  }

  const initialDocuments = await listKnowledgeDocuments();
  return <AdminAssistantClient initialDocuments={initialDocuments} />;
}