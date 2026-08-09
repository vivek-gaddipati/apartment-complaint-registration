"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Complaint } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default function OwnerDashboardClient({
  flatNo,
  ownerName,
  initialComplaints,
}: {
  flatNo: string;
  ownerName: string;
  initialComplaints: Complaint[];
}) {
  const router = useRouter();
  const [complaints, setComplaints] = useState(initialComplaints);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "resolved">("all");
  const [reopenConfirmId, setReopenConfirmId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  async function refresh() {
    const res = await fetch("/api/owner/complaints");
    if (res.ok) {
      const data = await res.json();
      setComplaints(data.complaints);
    }
  }

  // initialComplaints comes from the server-rendered payload, which Next.js's
  // client-side router can serve from a stale cache when navigating back here
  // (e.g. right after submitting a new complaint). Refetch on every mount so
  // this always reflects the latest data instead of a snapshot from an
  // earlier visit in the same session.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rate(id: string, rating: number) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/owner/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rate", rating }),
      });
      if (res.ok) {
        showToast("Thank you for your rating!");
        await refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function reopen(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/owner/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      if (res.ok) {
        showToast("Complaint reopened.");
        setReopenConfirmId(null);
        await refresh();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    await fetch("/api/owner/logout", { method: "POST" });
    router.push("/");
  }

  const counts = useMemo(() => {
    const total = complaints.length;
    const active = complaints.filter(
      (c) => c.status !== "Resolved" && c.status !== "Closed"
    ).length;
    const resolved = complaints.filter(
      (c) => c.status === "Resolved" || c.status === "Closed"
    ).length;
    return { total, active, resolved };
  }, [complaints]);

  const filteredComplaints = useMemo(() => {
    if (activeTab === "active") {
      return complaints.filter(
        (c) => c.status !== "Resolved" && c.status !== "Closed"
      );
    }
    if (activeTab === "resolved") {
      return complaints.filter(
        (c) => c.status === "Resolved" || c.status === "Closed"
      );
    }
    return complaints;
  }, [complaints, activeTab]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col py-4">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 rounded-xl border border-emerald-500/30 bg-emerald-950/90 px-4 py-3 text-xs font-semibold text-emerald-300 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          ✨ {toastMessage}
        </div>
      )}

      {/* Header Bar */}
      <div className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600/20 text-xl font-bold text-indigo-400 border border-indigo-500/30">
            {flatNo.slice(0, 3)}
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">
              {ownerName || "Resident"}
            </h1>
            <p className="text-xs text-slate-400 font-medium">Flat {flatNo}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700/50 transition"
            title="Refresh Complaints"
          >
            🔄 Refresh
          </button>
          <button
            onClick={logout}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Action Button */}
      <Link
        href="/owner/submit"
        className="mb-6 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-blue-500 active:scale-[0.99]"
      >
        <span className="text-xl">+</span> Submit New Complaint
      </Link>

      {/* Metrics Summary Pills */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="glass-card rounded-2xl p-3.5 text-center">
          <p className="text-2xl font-black text-white">{counts.total}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</p>
        </div>
        <div className="glass-card rounded-2xl p-3.5 text-center">
          <p className="text-2xl font-black text-amber-400">{counts.active}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/80">Active</p>
        </div>
        <div className="glass-card rounded-2xl p-3.5 text-center">
          <p className="text-2xl font-black text-emerald-400">{counts.resolved}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/80">Resolved</p>
        </div>
      </div>

      {/* Tab Filter */}
      <div className="mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "all"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          All ({counts.total})
        </button>
        <button
          onClick={() => setActiveTab("active")}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "active"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          Active ({counts.active})
        </button>
        <button
          onClick={() => setActiveTab("resolved")}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "resolved"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          Resolved ({counts.resolved})
        </button>
      </div>

      {/* Complaint List */}
      {filteredComplaints.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-slate-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="font-semibold text-slate-300">No complaints found</p>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === "all"
              ? "You haven't submitted any complaints yet."
              : `No ${activeTab} complaints at this time.`}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {filteredComplaints.map((c) => (
            <li key={c.id} className="glass-card rounded-2xl p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-xs font-bold text-indigo-300 border border-indigo-500/20">
                    {c.category}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400" title={c.id}>
                    #{c.id.slice(0, 8)}
                  </span>
                </div>
                <StatusBadge status={c.status} />
              </div>

              <p className="my-2.5 text-sm text-slate-200 leading-relaxed font-normal">
                {c.description}
              </p>

              {c.photo_url && (
                <a
                  href={c.photo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/20 transition"
                >
                  📷 View Attached Photo
                </a>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 border-t border-slate-800/80 pt-3 mt-3">
                <div>
                  <span>Submitted: {new Date(c.timestamp).toLocaleDateString()}</span>
                  <span className="mx-2">•</span>
                  <span>Priority: <strong className="text-slate-300">{c.priority}</strong></span>
                </div>
                {c.assigned_to && (
                  <div className="text-xs font-medium text-indigo-300">
                    👤 Assigned: {c.assigned_to}
                  </div>
                )}
              </div>

              {c.admin_notes && (
                <div className="mt-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-slate-300">
                  <span className="font-semibold text-indigo-400">Admin Response:</span>{" "}
                  {c.admin_notes}
                </div>
              )}

              {(c.status === "Resolved" || c.status === "Closed") && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                  <div>
                    {c.owner_rating ? (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400">
                        <span className="text-slate-400">Your Rating:</span>
                        <span className="font-bold">{"★".repeat(Number(c.owner_rating))}</span>
                        <span className="text-slate-600">{"★".repeat(5 - Number(c.owner_rating))}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-400">Rate resolution:</span>
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              disabled={busyId === c.id}
                              onClick={() => rate(c.id, n)}
                              className="text-lg text-amber-400 hover:scale-125 transition disabled:opacity-40"
                              title={`Rate ${n} Stars`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {reopenConfirmId === c.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-rose-400 font-medium">Reopen this complaint?</span>
                      <button
                        disabled={busyId === c.id}
                        onClick={() => reopen(c.id)}
                        className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-500 transition disabled:opacity-40"
                      >
                        Yes, Reopen
                      </button>
                      <button
                        onClick={() => setReopenConfirmId(null)}
                        className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={busyId === c.id}
                      onClick={() => setReopenConfirmId(c.id)}
                      className="text-xs text-indigo-400 hover:underline font-medium disabled:opacity-40"
                    >
                      Reopen Issue
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

