import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";
import OwnerAssistantClient from "./OwnerAssistantClient";

export default function OwnerAssistantPage() {
  const session = getOwnerSession();
  if (!session) {
    redirect("/owner");
  }

  return <OwnerAssistantClient flatNo={session.flat_no} ownerName={session.owner_name} />;
}