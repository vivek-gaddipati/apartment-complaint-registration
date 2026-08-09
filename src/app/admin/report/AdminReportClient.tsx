"use client";

import { useState } from "react";
import Link from "next/link";
import { InsightsReport } from "@/lib/claude";

function firstOfMonthISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function AdminReportClient() {
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<InsightsReport | null>(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/admin/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: from ? `${from}T00:00:00.000Z` : null,
          to: to ? `${to}T23:59:59.999Z` : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate report.");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copySummary() {
    if (report?.summary) {
      navigator.clipboard.writeText(report.summary);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    }
  }

  function setPreset(days: number) {
    const toDate = new Date();
    const fromDate = new Date(Date.now() - days * 86400000);
    setFrom(fromDate.toISOString().slice(0, 10));
    setTo(toDate.toISOString().slice(0, 10));
  }

  return (
    <main className="flex flex-1 flex-col py-4">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/dashboard"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            ← Back to Admin Dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            ✨ AI Insights & Committee Report
          </h1>
          <p className="text-xs text-slate-400">
            LLM-powered complaint synthesis and operational analytics for society meetings
          </p>
        </div>
      </div>

      {/* Date Filter Panel */}
      <div className="glass-panel mb-6 rounded-2xl p-5 shadow-xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Report Date Range Filter
          </label>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPreset(7)}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700 transition"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setPreset(30)}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700 transition"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700 transition"
            >
              All Time
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-slate-400">From Date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="input-dark rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-slate-400">To Date (Optional)</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="input-dark rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <button
            onClick={generate}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-600/30 transition hover:from-sky-500 hover:to-blue-500 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Analyzing Data...
              </span>
            ) : (
              "Generate AI Insights →"
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-400">
          {error}
        </div>
      )}

      {report && (
        <div className="flex flex-col gap-6 animate-in fade-in">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total Tickets Analyzed" value={report.total_complaints} icon="📋" />
            <StatCard
              label="Avg. Resolution (Days)"
              value={report.avg_resolution_days}
              icon="⏱️"
            />
            <StatCard label="Flagged Urgent Items" value={report.flagged_urgent.length} icon="🚨" />
            <StatCard label="Repeat Issue Flats" value={report.repeat_issues.length} icon="🔁" />
          </div>

          {/* Executive Summary */}
          <section className="glass-panel rounded-2xl p-6 shadow-xl border-sky-500/30">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-2">
                📝 Executive Committee Summary
              </h2>
              <button
                onClick={copySummary}
                className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition"
              >
                {copiedSummary ? "Copied!" : "📋 Copy for Minutes"}
              </button>
            </div>
            <p className="text-sm leading-relaxed text-slate-200">
              {report.summary}
            </p>
          </section>

          {/* Category Breakdown */}
          <section className="glass-panel rounded-2xl p-6 shadow-xl">
            <h2 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-300">
              Complaints Distribution By Category
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(report.by_category).map(([cat, count]) => {
                const percentage = Math.round((count / report.total_complaints) * 100);
                return (
                  <div key={cat} className="glass-card rounded-xl p-3">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="font-semibold text-white">{cat}</span>
                      <span className="text-slate-400 font-mono">
                        {count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Urgent Flags */}
          {report.flagged_urgent.length > 0 && (
            <section className="glass-panel rounded-2xl p-6 shadow-xl border-rose-500/30">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                🚨 Flagged Urgent & Long-Standing Open Issues
              </h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {report.flagged_urgent.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3.5 text-xs"
                  >
                    <div className="mb-1 flex items-center justify-between font-bold text-white">
                      <span>Flat {f.flat_no}</span>
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-300 border border-rose-500/30">
                        {f.days_open} day(s) open
                      </span>
                    </div>
                    <p className="text-slate-300">{f.issue}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Repeat Issues */}
          {report.repeat_issues.length > 0 && (
            <section className="glass-panel rounded-2xl p-6 shadow-xl border-amber-500/30">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                🔁 Repeat Complaint Flags (2+ Issues Same Category)
              </h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {report.repeat_issues.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-white">Flat {r.flat_no}</span>
                      <p className="text-slate-300 mt-0.5">Category: {r.category}</p>
                    </div>
                    <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">
                      {r.count} Occurrences
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="mb-1 text-2xl">{icon}</div>
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
    </div>
  );
}

