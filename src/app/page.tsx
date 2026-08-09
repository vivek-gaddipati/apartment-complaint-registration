import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-12 text-center">
      {/* Badge Pill */}
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-md">
        <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        Society Maintenance & Complaint Portal
      </div>

      <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
        Seamless Care for <br />
        <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
          Your Society Community
        </span>
      </h1>

      <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300">
        Register maintenance requests, monitor real-time repair progress, rate completed work, and power management insights.
      </p>

      {/* Role Cards */}
      <div className="mt-8 grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/owner"
          className="group glass-panel relative flex flex-col items-center justify-center rounded-2xl p-6 text-left transition hover:border-indigo-500/50 hover:bg-slate-800/80 hover:shadow-xl hover:shadow-indigo-500/10 active:scale-[0.99]"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 text-2xl border border-indigo-500/30 transition group-hover:scale-110">
            🏡
          </div>
          <h2 className="text-lg font-bold text-white group-hover:text-indigo-300 transition">
            Resident Portal
          </h2>
          <p className="mt-1 text-xs text-slate-400 text-center">
            Sign in with Flat No + PIN to register & track your complaints
          </p>
          <span className="mt-4 text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition">
            Enter Portal →
          </span>
        </Link>

        <Link
          href="/admin"
          className="group glass-panel relative flex flex-col items-center justify-center rounded-2xl p-6 text-left transition hover:border-sky-500/50 hover:bg-slate-800/80 hover:shadow-xl hover:shadow-sky-500/10 active:scale-[0.99]"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/20 text-2xl border border-sky-500/30 transition group-hover:scale-110">
            ⚡
          </div>
          <h2 className="text-lg font-bold text-white group-hover:text-sky-300 transition">
            Admin Management
          </h2>
          <p className="mt-1 text-xs text-slate-400 text-center">
            Manage society complaints, update status, & generate AI reports
          </p>
          <span className="mt-4 text-xs font-semibold text-sky-400 group-hover:translate-x-1 transition">
            Admin Login →
          </span>
        </Link>
      </div>

      <footer className="mt-12 text-xs text-slate-500">
        Powered by Google Sheets & AI Insights · Single Society Edition
      </footer>
    </main>
  );
}

