const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  Open: {
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    dot: "bg-rose-400 animate-pulse",
    border: "border-rose-500/20",
  },
  Acknowledged: {
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    dot: "bg-sky-400",
    border: "border-sky-500/20",
  },
  "In Progress": {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    dot: "bg-amber-400 animate-pulse",
    border: "border-amber-500/20",
  },
  Resolved: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
    border: "border-emerald-500/20",
  },
  Closed: {
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    dot: "bg-slate-400",
    border: "border-slate-500/20",
  },
  Reopened: {
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    dot: "bg-orange-400 animate-bounce",
    border: "border-orange-500/20",
  },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    bg: "bg-slate-500/10",
    text: "text-slate-300",
    dot: "bg-slate-400",
    border: "border-slate-500/20",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${config.bg} ${config.text} ${config.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {status}
    </span>
  );
}

