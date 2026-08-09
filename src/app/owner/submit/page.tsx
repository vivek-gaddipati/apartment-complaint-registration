"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORIES } from "@/lib/types";
import { suggestPriority } from "@/lib/priority";

const CATEGORY_ICONS: Record<string, string> = {
  Plumbing: "🚰",
  Electrical: "⚡",
  Security: "🛡️",
  Parking: "🚗",
  Noise: "🔊",
  "Common Area": "🏞️",
  Lift: "🛗",
  Housekeeping: "🧹",
  Other: "📌",
};

export default function SubmitComplaintPage() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [complaintId, setComplaintId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const suggestedPriority = category ? suggestPriority(category) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!category) {
      setError("Please select a category.");
      return;
    }
    if (!description.trim()) {
      setError("Please describe the issue.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/owner/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          description: description.trim(),
          photo_url: photoUrl.trim(),
        }),
      });
      const data = await res.json();

      if (res.status === 401) {
        router.push("/owner");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Failed to submit complaint.");
        return;
      }

      setComplaintId(data.complaint.id);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copyComplaintId() {
    if (complaintId) {
      navigator.clipboard.writeText(complaintId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  if (complaintId) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center py-10 text-center">
        <div className="glass-panel w-full rounded-2xl p-8 shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-3xl border border-emerald-500/30 animate-bounce">
            ✅
          </div>
          <h1 className="text-2xl font-extrabold text-white">Complaint Registered!</h1>
          <p className="mt-2 text-xs text-slate-400">
            Your complaint has been logged to the society system. Management has been notified.
          </p>

          <div className="my-6 rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Reference Ticket ID
            </p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-indigo-300 break-all">
                {complaintId}
              </span>
              <button
                onClick={copyComplaintId}
                className="shrink-0 rounded-lg bg-indigo-600/30 px-2.5 py-1 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/50 transition border border-indigo-500/30"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <button
            onClick={() => router.push("/owner/dashboard")}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-blue-500 active:scale-[0.99]"
          >
            Back to My Complaints →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col py-6">
      <div className="mb-6">
        <Link
          href="/owner/dashboard"
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          ← Back to My Complaints
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Submit Maintenance Complaint
        </h1>
        <p className="text-xs text-slate-400">
          Select a category and describe the maintenance issue
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 shadow-2xl sm:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Category selection */}
          <div>
            <label className="mb-2.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Complaint Category
            </label>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3">
              {CATEGORIES.map((c) => {
                const isSelected = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`flex flex-col items-center justify-center rounded-xl p-3 text-center transition ${
                      isSelected
                        ? "bg-indigo-600/30 border-2 border-indigo-500 text-white shadow-md shadow-indigo-600/20"
                        : "glass-card hover:border-slate-600 text-slate-300"
                    }`}
                  >
                    <span className="text-2xl mb-1">{CATEGORY_ICONS[c] ?? "📌"}</span>
                    <span className="text-xs font-semibold">{c}</span>
                  </button>
                );
              })}
            </div>
            {suggestedPriority && (
              <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 border border-indigo-500/20">
                ⚡ Auto-suggested priority: <strong>{suggestedPriority}</strong>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-300">
              <label>Issue Description</label>
              <span className="text-slate-400 font-normal">
                {description.length}/500 chars
              </span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              rows={5}
              placeholder="Describe the issue in detail (location, exact problem, time noticed)..."
              className="input-dark w-full rounded-xl p-4 text-sm text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Optional Photo URL */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Photo URL <span className="text-slate-500 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://drive.google.com/... or image link"
              className="input-dark w-full rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              You can paste a link to an uploaded photo or Google Drive image
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-4 font-bold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-blue-500 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Submitting Ticket...
              </span>
            ) : (
              "Submit Complaint Ticket →"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

