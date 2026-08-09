"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

interface OwnerRow {
  flat_no: string;
  owner_name: string;
  phone: string;
  hasPin: boolean;
}

export default function AdminOwnersClient({
  initialOwners,
}: {
  initialOwners: OwnerRow[];
}) {
  const [owners, setOwners] = useState(initialOwners);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [savingFlat, setSavingFlat] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, { ownerName?: string; phone?: string }>>({});

  const [newFlatNo, setNewFlatNo] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }

  async function addOwner(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");

    if (!newFlatNo.trim()) {
      setAddError("Flat number is required.");
      return;
    }
    if (!newOwnerName.trim()) {
      setAddError("Owner name is required.");
      return;
    }

    setAddLoading(true);
    try {
      const res = await fetch("/api/admin/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          flat_no: newFlatNo.trim(),
          owner_name: newOwnerName.trim(),
          phone: newPhone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Failed to add owner.");
        return;
      }
      setOwners((prev) => [data.owner, ...prev]);
      setNewFlatNo("");
      setNewOwnerName("");
      setNewPhone("");
      showToast(`Added Flat ${data.owner.flat_no}.`);
    } catch {
      setAddError("Network error. Please try again.");
    } finally {
      setAddLoading(false);
    }
  }

  async function saveDetails(flatNo: string, ownerName: string, phone: string) {
    setSavingFlat(flatNo);
    try {
      const res = await fetch("/api/admin/owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          flat_no: flatNo,
          owner_name: ownerName,
          phone,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setOwners((prev) =>
          prev.map((o) => (o.flat_no === flatNo ? data.owner : o))
        );
        showToast(`Updated Flat ${flatNo}.`);
        return true;
      } else {
        showToast(`Failed to save Flat ${flatNo}.`);
        return false;
      }
    } catch {
      showToast(`Failed to save Flat ${flatNo}.`);
      return false;
    } finally {
      setSavingFlat(null);
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return owners;
    return owners.filter(
      (o) =>
        o.flat_no.toLowerCase().includes(q) || o.owner_name.toLowerCase().includes(q)
    );
  }, [owners, searchQuery]);

  return (
    <main className="flex flex-1 flex-col py-4">
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 rounded-xl border border-sky-500/30 bg-slate-900/90 px-4 py-3 text-xs font-semibold text-sky-300 shadow-xl backdrop-blur-md">
          ⚡ {toastMessage}
        </div>
      )}

      <div className="glass-panel mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 shadow-xl">
        <div>
          <Link
            href="/admin/dashboard"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white transition"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-xl font-bold text-white leading-tight">Manage Owners</h1>
          <p className="text-xs text-slate-400 font-medium">
            {owners.length} flats registered
          </p>
        </div>
      </div>

      <div className="glass-panel mb-4 rounded-2xl p-4">
        <form onSubmit={addOwner} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Flat Number
            </label>
            <input
              value={newFlatNo}
              onChange={(e) => setNewFlatNo(e.target.value)}
              placeholder="e.g. H-101"
              className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Owner Name
            </label>
            <input
              value={newOwnerName}
              onChange={(e) => setNewOwnerName(e.target.value)}
              placeholder="Owner full name"
              className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Phone (optional)
            </label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Phone"
              className="input-dark w-full rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>
          <button
            type="submit"
            disabled={addLoading}
            className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-sky-600/30 hover:from-sky-500 hover:to-blue-500 transition disabled:opacity-50"
          >
            {addLoading ? "Adding..." : "+ Add Owner"}
          </button>
        </form>
        {addError && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
            {addError}
          </div>
        )}
      </div>

      <div className="glass-panel mb-4 rounded-2xl p-4">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search flat or owner name..."
          className="input-dark w-full rounded-xl px-4 py-2.5 text-xs text-white"
        />
      </div>

      <div className="overflow-hidden rounded-2xl glass-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-900/80 uppercase tracking-wider text-slate-400 font-semibold">
              <tr>
                <th className="px-4 py-3.5">Flat No</th>
                <th className="px-4 py-3.5">Owner Name</th>
                <th className="px-4 py-3.5">Phone</th>
                <th className="px-4 py-3.5">PIN Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filtered.map((o) => (
                <tr key={o.flat_no} className="hover:bg-slate-800/30 transition align-top">
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                    {o.flat_no}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={editedValues[o.flat_no]?.ownerName ?? o.owner_name}
                      disabled={savingFlat === o.flat_no}
                      onChange={(e) => {
                        setEditedValues((prev) => ({
                          ...prev,
                          [o.flat_no]: { ...(prev[o.flat_no] || {}), ownerName: e.target.value }
                        }));
                      }}
                      onBlur={async (e) => {
                        const newValue = e.target.value;
                        if (newValue !== o.owner_name && newValue.trim()) {
                          const phone = editedValues[o.flat_no]?.phone ?? o.phone;
                          const success = await saveDetails(o.flat_no, newValue, phone);
                          if (!success) {
                            // Reset to original value on failure by clearing edited value
                            setEditedValues((prev) => {
                              const newObj = { ...prev };
                              if (newObj[o.flat_no]) {
                                delete newObj[o.flat_no].ownerName;
                                if (Object.keys(newObj[o.flat_no]).length === 0) {
                                  delete newObj[o.flat_no];
                                }
                              }
                              return newObj;
                            });
                          } else {
                            // Clear edited value on success
                            setEditedValues((prev) => {
                              const newObj = { ...prev };
                              if (newObj[o.flat_no]) {
                                delete newObj[o.flat_no].ownerName;
                                if (Object.keys(newObj[o.flat_no]).length === 0) {
                                  delete newObj[o.flat_no];
                                }
                              }
                              return newObj;
                            });
                          }
                        }
                      }}
                      className="input-dark w-48 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={editedValues[o.flat_no]?.phone ?? o.phone}
                      disabled={savingFlat === o.flat_no}
                      onChange={(e) => {
                        setEditedValues((prev) => ({
                          ...prev,
                          [o.flat_no]: { ...(prev[o.flat_no] || {}), phone: e.target.value }
                        }));
                      }}
                      onBlur={async (e) => {
                        const newValue = e.target.value;
                        if (newValue !== o.phone) {
                          const ownerName = editedValues[o.flat_no]?.ownerName ?? o.owner_name;
                          const success = await saveDetails(o.flat_no, ownerName, newValue);
                          if (!success) {
                            // Reset to original value on failure by clearing edited value
                            setEditedValues((prev) => {
                              const newObj = { ...prev };
                              if (newObj[o.flat_no]) {
                                delete newObj[o.flat_no].phone;
                                if (Object.keys(newObj[o.flat_no]).length === 0) {
                                  delete newObj[o.flat_no];
                                }
                              }
                              return newObj;
                            });
                          } else {
                            // Clear edited value on success
                            setEditedValues((prev) => {
                              const newObj = { ...prev };
                              if (newObj[o.flat_no]) {
                                delete newObj[o.flat_no].phone;
                                if (Object.keys(newObj[o.flat_no]).length === 0) {
                                  delete newObj[o.flat_no];
                                }
                              }
                              return newObj;
                            });
                          }
                        }
                      }}
                      className="input-dark w-36 rounded-lg px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {o.hasPin ? (
                      <span className="text-[10px] text-emerald-400 font-semibold">
                        ● PIN Active
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-400 font-semibold">
                        ○ PIN Unset
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-slate-400">
            🔍 No owners match your search.
          </div>
        )}
      </div>
    </main>
  );
}
