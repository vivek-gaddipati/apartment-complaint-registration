"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Stage = "flat" | "pin" | "create_pin";

export default function OwnerLoginPage() {
  const router = useRouter();
  const [flatNo, setFlatNo] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [stage, setStage] = useState<Stage>("flat");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkFlat(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!flatNo.trim()) {
      setError("Please enter your flat number.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/owner/check-flat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flat_no: flatNo.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Flat verification failed.");
        return;
      }

      setOwnerName(data.owner_name || "");
      if (data.isFirstTime) {
        setStage("create_pin");
      } else {
        setStage("pin");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }

    if (stage === "create_pin") {
      if (pin !== confirmPin) {
        setError("PINs do not match. Please re-enter.");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch("/api/owner/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flat_no: flatNo,
          pin,
          confirm_pin: stage === "create_pin" ? confirmPin : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed.");
        return;
      }

      router.push("/owner/dashboard");
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
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-2xl border border-indigo-500/30">
          🏡
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Resident Portal
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Submit & track maintenance complaints for your flat
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 shadow-2xl sm:p-8">
        {stage === "flat" && (
          <form onSubmit={checkFlat} className="flex flex-col gap-5">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Flat Number
              </label>
              <input
                autoFocus
                value={flatNo}
                onChange={(e) => setFlatNo(e.target.value)}
                placeholder="e.g. B-402 or A-101"
                className="input-dark w-full rounded-xl px-4 py-3 text-base text-white focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Enter your flat number as registered in society records
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
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-blue-500 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Verifying Flat...
                </span>
              ) : (
                "Continue →"
              )}
            </button>
          </form>
        )}

        {(stage === "pin" || stage === "create_pin") && (
          <form onSubmit={submitPin} className="flex flex-col gap-5">
            <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3.5 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400">Flat:</span>{" "}
                <span className="font-bold text-indigo-400">{flatNo}</span>
                {ownerName && (
                  <span className="ml-2 text-slate-300">({ownerName})</span>
                )}
              </div>
              <button
                type="button"
                className="text-indigo-400 hover:underline font-medium"
                onClick={() => {
                  setStage("flat");
                  setPin("");
                  setConfirmPin("");
                  setError("");
                }}
              >
                Change
              </button>
            </div>

            {stage === "create_pin" ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                ✨ <strong>First-Time Setup:</strong> Create a secret 4-digit PIN for your flat.
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center">
                Enter your 4-digit security PIN to access your account
              </p>
            )}

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-300 text-center">
                {stage === "create_pin" ? "Create 4-Digit PIN" : "4-Digit Security PIN"}
              </label>
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className="input-dark w-full rounded-xl px-4 py-3.5 text-center text-3xl font-mono tracking-[0.6em] text-indigo-300"
              />
            </div>

            {stage === "create_pin" && (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-300 text-center">
                  Confirm 4-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="input-dark w-full rounded-xl px-4 py-3.5 text-center text-3xl font-mono tracking-[0.6em] text-indigo-300"
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-500 hover:to-blue-500 active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Authenticating...
                </span>
              ) : stage === "create_pin" ? (
                "Set PIN & Enter Portal"
              ) : (
                "Sign In to Dashboard"
              )}
            </button>
          </form>
        )}
      </div>

      <div className="mt-6 text-center text-xs text-slate-500">
        Forgot your PIN? Contact society management to reset it.
      </div>
    </main>
  );
}

