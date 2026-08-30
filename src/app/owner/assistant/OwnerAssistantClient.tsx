"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: string[];
}

interface ApiHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export default function OwnerAssistantClient({
  flatNo,
  ownerName,
}: {
  flatNo: string;
  ownerName: string;
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ChatTurn[]>([
    {
      id: "intro",
      role: "assistant",
      text: "Ask me about society rules, visitor policy, parking, and other handbook topics.",
    },
  ]);

  async function ask(e: FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) {
      setError("Please enter a question.");
      return;
    }

    const apiHistory: ApiHistoryTurn[] = history
      .filter((turn) => turn.id !== "intro")
      .map((turn) => ({ role: turn.role, text: turn.text }))
      .slice(0, 8)
      .reverse();

    setError("");
    setLoading(true);
    setHistory((prev) => [
      {
        id: `u-${Date.now()}`,
        role: "user",
        text: trimmed,
      },
      ...prev,
    ]);

    try {
      const res = await fetch("/api/owner/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, history: apiHistory }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Assistant request failed.");
        return;
      }

      setHistory((prev) => [
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.answer || "No answer generated.",
          sources: Array.isArray(data.sources) ? data.sources : [],
        },
        ...prev,
      ]);
      setQuestion("");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col py-4">
      <div className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 shadow-xl">
        <div>
          <Link
            href="/owner/dashboard"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-xl font-bold text-white leading-tight">Society Assistant</h1>
          <p className="text-xs text-slate-400 font-medium">
            Flat {flatNo} · {ownerName || "Resident"}
          </p>
        </div>
      </div>

      <div data-testid="assistant-chat" className="glass-panel flex flex-1 flex-col gap-3 rounded-2xl p-4">
        {history.map((turn) => (
          <div
            key={turn.id}
            data-testid="chat-turn"
            className={`rounded-xl p-3 text-sm leading-relaxed ${
              turn.role === "user"
                ? "ml-8 border border-indigo-500/30 bg-indigo-500/10 text-indigo-100"
                : "mr-8 border border-slate-700 bg-slate-900/50 text-slate-200"
            }`}
          >
            <div data-testid="chat-role" className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {turn.role === "user" ? "You" : "Assistant"}
            </div>
            <p data-testid="chat-text" className="whitespace-pre-wrap">{turn.text}</p>
            {turn.sources && turn.sources.length > 0 && (
              <p data-testid="chat-sources" className="mt-2 text-[11px] text-slate-400">
                Source: {turn.sources.join("; ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="glass-panel mt-4 rounded-2xl p-4">
        <form onSubmit={ask} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Ask a policy question
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Example: What are the visitor entry timings?"
              rows={3}
              className="input-dark w-full rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/30 hover:from-indigo-500 hover:to-blue-500 transition disabled:opacity-50"
          >
            {loading ? "Thinking..." : "Ask Assistant"}
          </button>
        </form>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
            {error}
          </div>
        )}
      </div>
    </main>
  );
}