"use client";

import { useState } from "react";
import { WaveLogo } from "./wave-logo";

export function TopBar({
  onDisconnect,
  onClearCache,
}: {
  onDisconnect: () => void | Promise<void>;
  onClearCache: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="flex items-center justify-between py-6">
      <WaveLogo />
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="px-3 py-1.5 text-xs text-[#999] transition-colors hover:text-[#1a1a1a]"
        >
          Settings
        </button>
        {open && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <div className="absolute right-0 z-20 mt-1 w-40 border border-[#e0e0e0] bg-[#fafafa] py-1">
              <button
                onClick={() => {
                  onClearCache();
                  setOpen(false);
                }}
                className="block w-full border-b border-[#e0e0e0] px-4 py-2 text-left text-sm text-[#999] transition-colors hover:text-[#1a1a1a]"
              >
                Clear cache
              </button>
              <button
                onClick={() => {
                  onDisconnect();
                  setOpen(false);
                }}
                className="block w-full px-4 py-2 text-left text-sm text-[#999] transition-colors hover:text-[#1a1a1a]"
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
