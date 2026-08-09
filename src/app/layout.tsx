import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "SocietyComplaints — Apartment Portal",
  description: "Seamless complaint submission and tracking for apartment residents and management.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body className="min-h-screen bg-slate-900 font-sans text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
        <div className="relative flex min-h-screen flex-col overflow-x-hidden">
          {/* Subtle background glow */}
          <div className="pointer-events-none fixed inset-0 -z-10 flex justify-center overflow-hidden">
            <div className="h-[600px] w-[800px] rounded-full bg-gradient-to-tr from-indigo-600/15 via-blue-600/10 to-emerald-500/10 blur-3xl" />
          </div>
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}

