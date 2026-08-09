"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Authentication failed.");
        return;
      }
      router.push("/admin/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
      <div className="mb-6 text-center">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          ← Back to home
        </Link>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 text-2xl border border-sky-500/30">
          ⚡
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Society Management Login
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Admin portal for complaint triage, tracking, and AI insights
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 shadow-2xl sm:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Shared Admin Password
            </label>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter management password"
              className="input-dark w-full rounded-xl px-4 py-3.5 text-base text-white focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-sky-600/30 transition hover:from-sky-500 hover:to-blue-500 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Authenticating...
              </span>
            ) : (
              "Sign In to Admin Dashboard →"
            )}
          </button>
        </form>
      </div>

      <div className="mt-6 text-center text-xs text-slate-500">
        Password protected area for designated society committee members
      </div>
    </main>
  );
}

