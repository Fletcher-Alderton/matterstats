"use client";

import { useState } from "react";
import type { DashboardData } from "@/lib/types";
import { ShareModal } from "./share-modal";

export function ShareButton({ data }: { data: DashboardData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center border border-[#e0e0e0] bg-white shadow-md transition-colors hover:bg-[#f0f0f0]"
        title="Share Stats"
      >
        <svg
          className="h-5 w-5 text-[#1a1a1a]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>
      {open && <ShareModal data={data} onClose={() => setOpen(false)} />}
    </>
  );
}
