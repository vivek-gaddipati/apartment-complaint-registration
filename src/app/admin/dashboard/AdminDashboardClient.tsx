"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Complaint, STATUSES, PRIORITIES, CATEGORIES } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

type SortKey = "date" | "priority";

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

interface OwnerInfo {
  flat_no: string;
  owner_name: string;
  phone: string;
  hasPin: boolean;
}

export default function AdminDashboardClient({
  initialComplaints,
}: {
  initialComplaints: Complaint[];
}) {
  const router = useRouter();
  const [complaints, setComplaints] = useState(initialComplaints);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [flatFilter, setFlatFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Manage PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [ownersList, setOwnersList] = useState<OwnerInfo[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [resettingFlat, setResettingFlat] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  async function refresh() {
    const res = await fetch("/api/admin/complaints");
    if (res.ok) {
      const data = await res.json();
      setComplaints(data.complaints);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/complaints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setComplaints((prev) =>
          prev.map((c) => (c.id === id ? { ...c, ...data.complaint } : c))
        );
        showToast("Complaint updated.");
      }
    } finally {
      setSavingId(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/");
  }

  async function openPinModal() {
    setShowPinModal(true);
    setLoadingOwners(true);
    try {
      const res = await fetch("/api/admin/owners");
      if (res.ok) {
        const data = await res.json();
        setOwnersList(data.owners || []);
      }
    } finally {
      setLoadingOwners(false);
    }
  }

  async function handleResetPin(flatNo: string) {
    setResettingFlat(flatNo);
    try {
      const res = await fetch("/api/admin/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flat_no: flatNo, action: "reset_pin" }),
      });
      if (res.ok) {
        showToast(`PIN reset for Flat ${flatNo}. Owner can choose new PIN on next sign-in.`);
        setOwnersList((prev) =>
          prev.map((o) => (o.flat_no === flatNo ? { ...o, hasPin: false } : o))
        );
      }
    } finally {
      setResettingFlat(null);
    }
  }

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const headers = [
      "ID",
      "Timestamp",
      "Flat",
      "Owner",
      "Category",
      "Description",
      "Status",
      "Priority",
      "Assigned To",
      "Notes",
      "Resolved At",
      "Rating",
    ];
    const rows = filtered.map((c) => [
      c.id,
      c.timestamp,
      c.flat_no,
      c.owner_name,
      c.category,
      `"${(c.description || "").replace(/"/g, '""')}"`,
      c.status,
      c.priority,
      c.assigned_to,
      `"${(c.admin_notes || "").replace(/"/g, '""')}"`,
      c.resolved_at,
      c.owner_rating,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `society_complaints_export_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const metrics = useMemo(() => {
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === "Open" || c.status === "Reopened").length;
    const inProgress = complaints.filter(
      (c) => c.status === "In Progress" || c.status === "Acknowledged"
    ).length;
    const resolved = complaints.filter(
      (c) => c.status === "Resolved" || c.status === "Closed"
    ).length;
    const highPriority = complaints.filter(
      (c) => c.priority === "High" && c.status !== "Resolved" && c.status !== "Closed"
    ).length;

    return { total, open, inProgress, resolved, highPriority };
  }, [complaints]);

  const filtered = useMemo(() => {
    let list = complaints;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.flat_no.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.owner_name.toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    if (categoryFilter) list = list.filter((c) => c.category === categoryFilter);
    if (priorityFilter) list = list.filter((c) => c.priority === priorityFilter);
    if (flatFilter.trim())
      list = list.filter((c) =>
        c.flat_no.toLowerCase().includes(flatFilter.trim().toLowerCase())
      );

    const sorted = [...list];
    if (sortKey === "date") {
      sorted.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    } else {
      sorted.sort(
        (a, b) => (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)
      );
    }
    return sorted;
  }, [complaints, searchQuery, statusFilter, categoryFilter, priorityFilter, flatFilter, sortKey]);

  return (
    <main className="flex flex-1 flex-col py-4">
      {/* Toast alert */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 rounded-xl border border-sky-500/30 bg-slate-900/90 px-4 py-3 text-xs font-semibold text-sky-300 shadow-xl backdrop-blur-md">
          ⚡ {toastMessage}
        </div>
      )}

      {/* Top Bar */}
      <div className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/20 text-xl font-bold text-sky-400 border border-sky-500/30">
            ⚡
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Admin Operations</h1>
            <p className="text-xs text-slate-400 font-medium">Society Complaint Command Center</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openPinModal}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition"
          >
            🔑 Manage PINs
          </button>
          <Link
            href="/admin/assistant"
            className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 transition"
          >
            📚 Knowledge Base
          </Link>
          <Link
            href="/admin/owners"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition"
          >
            🏠 Manage Owners
          </Link>
          <Link
            href="/admin/report"
            className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-sky-600/30 hover:from-sky-500 hover:to-blue-500 transition"
          >
            ✨ AI Insights Report
          </Link>
          <button
            onClick={exportCSV}
            className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700/50 transition"
          >
            📥 Export CSV
          </button>
          <button
            onClick={logout}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Tickets</p>
          <p className="mt-1 text-3xl font-black text-white">{metrics.total}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-400">Open Tickets</p>
          <p className="mt-1 text-3xl font-black text-rose-400">{metrics.open}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-400">In Progress</p>
          <p className="mt-1 text-3xl font-black text-amber-400">{metrics.inProgress}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Resolved</p>
          <p className="mt-1 text-3xl font-black text-emerald-400">{metrics.resolved}</p>
        </div>
        <div className="glass-card col-span-2 sm:col-span-1 rounded-2xl p-4 border-rose-500/30 bg-rose-500/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Urgent Open</p>
          <p className="mt-1 text-3xl font-black text-rose-400">{metrics.highPriority}</p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="glass-panel mb-4 flex flex-col gap-3 rounded-2xl p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 Search flat, category, keyword, or ticket ID..."
              className="input-dark w-full rounded-xl px-4 py-2.5 text-xs text-white"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-dark rounded-xl px-3 py-2 text-xs text-white bg-slate-900"
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input-dark rounded-xl px-3 py-2 text-xs text-white bg-slate-900"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="input-dark rounded-xl px-3 py-2 text-xs text-white bg-slate-900"
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="input-dark rounded-xl px-3 py-2 text-xs text-white bg-slate-900"
            >
              <option value="date">Sort: Newest First</option>
              <option value="priority">Sort: High Priority First</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing <strong>{filtered.length}</strong> of <strong>{complaints.length}</strong> total tickets
          </span>
          <button
            onClick={refresh}
            className="text-sky-400 hover:underline font-medium"
          >
            🔄 Refresh List
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-2xl glass-panel sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 uppercase tracking-wider text-slate-400 font-semibold">
              <tr>
                <th className="px-4 py-3.5">Flat & Resident</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5">Issue Description</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Priority</th>
                <th className="px-4 py-3.5">Assigned Technician</th>
                <th className="px-4 py-3.5">Admin Notes</th>
                <th className="px-4 py-3.5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/30 transition align-top">
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                    <div>{c.flat_no}</div>
                    <div className="text-[11px] font-normal text-slate-400">{c.owner_name}</div>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="rounded-lg bg-indigo-500/10 px-2 py-0.5 font-semibold text-indigo-300 border border-indigo-500/20">
                      {c.category}
                    </span>
                  </td>

                  <td className="max-w-xs px-4 py-3 text-slate-300 leading-relaxed">
                    <p className="line-clamp-3">{c.description}</p>
                    {c.photo_url && (
                      <a
                        href={c.photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-400 hover:underline font-medium"
                      >
                        📷 Photo Link
                      </a>
                    )}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <select
                      value={c.status}
                      disabled={savingId === c.id}
                      onChange={(e) => patch(c.id, { status: e.target.value })}
                      className="input-dark rounded-lg px-2 py-1 text-xs text-white bg-slate-900 focus:ring-1 focus:ring-sky-500"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <select
                      value={c.priority}
                      disabled={savingId === c.id}
                      onChange={(e) => patch(c.id, { priority: e.target.value })}
                      className={`input-dark rounded-lg px-2 py-1 text-xs font-bold bg-slate-900 ${
                        c.priority === "High"
                          ? "text-rose-400 border-rose-500/40"
                          : c.priority === "Medium"
                          ? "text-amber-400"
                          : "text-slate-300"
                      }`}
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    <input
                      defaultValue={c.assigned_to}
                      placeholder="e.g. Ramesh (Plumber)"
                      disabled={savingId === c.id}
                      onBlur={(e) => {
                        if (e.target.value !== c.assigned_to) {
                          patch(c.id, { assigned_to: e.target.value });
                        }
                      }}
                      className="input-dark w-32 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </td>

                  <td className="px-4 py-3">
                    <input
                      defaultValue={c.admin_notes}
                      placeholder="Internal note / status update..."
                      disabled={savingId === c.id}
                      onBlur={(e) => {
                        if (e.target.value !== c.admin_notes) {
                          patch(c.id, { admin_notes: e.target.value });
                        }
                      }}
                      className="input-dark w-40 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                    {new Date(c.timestamp).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <ul className="flex flex-col gap-3 sm:hidden">
        {filtered.map((c) => (
          <li key={c.id} className="glass-card rounded-2xl p-4">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
            >
              <div>
                <p className="text-sm font-bold text-white">
                  Flat {c.flat_no} · <span className="text-indigo-300">{c.category}</span>
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(c.timestamp).toLocaleDateString()} · Priority: {c.priority}
                </p>
              </div>
              <StatusBadge status={c.status} />
            </button>

            {expandedId === c.id && (
              <div className="mt-3 flex flex-col gap-3 border-t border-slate-800 pt-3 text-xs">
                <p className="text-slate-300 leading-relaxed">{c.description}</p>

                <div>
                  <label className="mb-1 block font-semibold text-slate-400">Update Status</label>
                  <select
                    value={c.status}
                    disabled={savingId === c.id}
                    onChange={(e) => patch(c.id, { status: e.target.value })}
                    className="input-dark w-full rounded-xl p-2 text-white bg-slate-900"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-400">Priority</label>
                  <select
                    value={c.priority}
                    disabled={savingId === c.id}
                    onChange={(e) => patch(c.id, { priority: e.target.value })}
                    className="input-dark w-full rounded-xl p-2 text-white bg-slate-900"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-400">Assigned To</label>
                  <input
                    defaultValue={c.assigned_to}
                    disabled={savingId === c.id}
                    onBlur={(e) => {
                      if (e.target.value !== c.assigned_to) {
                        patch(c.id, { assigned_to: e.target.value });
                      }
                    }}
                    className="input-dark w-full rounded-xl p-2 text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block font-semibold text-slate-400">Admin Notes</label>
                  <textarea
                    defaultValue={c.admin_notes}
                    disabled={savingId === c.id}
                    onBlur={(e) => {
                      if (e.target.value !== c.admin_notes) {
                        patch(c.id, { admin_notes: e.target.value });
                      }
                    }}
                    rows={2}
                    className="input-dark w-full rounded-xl p-2 text-white"
                  />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 mt-4">
          🔍 No complaints match your filter parameters.
        </div>
      )}

      {/* Admin Reset PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-slate-700/60">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                🔑 Resident PIN Management
              </h2>
              <button
                onClick={() => setShowPinModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-400">
              Admin forgot-PIN reset tool: Clears the PIN cell for the selected flat, prompting the resident to create a new 4-digit PIN upon next sign-in.
            </p>

            {loadingOwners ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Loading society flat registry...
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-800 pr-1">
                {ownersList.map((o) => (
                  <div
                    key={o.flat_no}
                    className="flex items-center justify-between py-3 text-xs"
                  >
                    <div>
                      <span className="font-bold text-white">{o.flat_no}</span>
                      <span className="ml-2 text-slate-400">({o.owner_name})</span>
                      <div className="mt-0.5">
                        {o.hasPin ? (
                          <span className="text-[10px] text-emerald-400 font-semibold">
                            ● PIN Active
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 font-semibold">
                            ○ PIN Unset / Needs Setup
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      disabled={!o.hasPin || resettingFlat === o.flat_no}
                      onClick={() => handleResetPin(o.flat_no)}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-40"
                    >
                      {resettingFlat === o.flat_no ? "Resetting..." : "Reset PIN"}
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowPinModal(false)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

