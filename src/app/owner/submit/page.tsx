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

const MAX_PHOTO_DATA_URL_LENGTH = 45_000;

async function compressPhoto(file: File): Promise<string> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The selected image could not be read."));
      element.src = sourceUrl;
    });
    const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.7, 0.55, 0.4, 0.25]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_PHOTO_DATA_URL_LENGTH) return dataUrl;
    }
    throw new Error("This photo is too detailed to attach. Try taking it from farther away.");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function SubmitComplaintPage() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [complaintId, setComplaintId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const suggestedPriority = category ? suggestPriority(category) : null;

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }

    setError("");
    try {
      setPhotoUrl(await compressPhoto(file));
      setPhotoName(file.name || "Camera photo");
    } catch (err) {
      setPhotoUrl("");
      setPhotoName("");
      setError(err instanceof Error ? err.message : "The photo could not be attached.");
    }
  }

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
          is_anonymous: isAnonymous,
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

          {/* Optional Photo */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Photo <span className="text-slate-500 font-normal lowercase">(optional)</span>
            </label>
            {photoUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/30 p-3">
                <img src={photoUrl} alt="Selected complaint attachment" className="h-16 w-16 rounded-lg object-cover" />
                <p className="min-w-0 flex-1 truncate text-xs text-slate-300">{photoName || "Attached photo"}</p>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoUrl("");
                    setPhotoName("");
                  }}
                  className="rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-800/30 px-4 py-5 text-sm font-semibold text-slate-300 transition hover:border-indigo-400 hover:text-white">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
                Take or choose a photo
              </label>
            )}
            <p className="mt-1 text-[11px] text-slate-500">Uses your rear camera when available.</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700/60 bg-slate-800/30 p-4 text-sm text-slate-200 transition hover:border-slate-600">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
            />
            <span>
              <span className="block font-semibold">Submit anonymously</span>
              <span className="mt-0.5 block text-xs text-slate-400">
                Management will receive the complaint without your name or flat number.
              </span>
            </span>
          </label>

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

