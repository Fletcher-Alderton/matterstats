"use client";

import { useState } from "react";

export function Login({ onLogin }: { onLogin: (token: string, remember: boolean) => void }) {
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || isSubmitting) return;
    setIsSubmitting(true);
    onLogin(token.trim(), remember);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="login-title-wrap mb-14">
          <span className="login-title login-title-bg" aria-hidden="true">
            Matter
            <br />
            Stats
          </span>
          <span className="login-title login-title-fg">
            Matter
            <br />
            Stats
          </span>
        </div>

        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={isSubmitting}
          placeholder="Paste your Matter API token"
          className="mb-4 w-full border-b border-[#e0e0e0] bg-transparent px-1 py-3 text-sm text-[#1a1a1a] placeholder-[#ccc] outline-none transition-colors focus:border-[#1a1a1a] disabled:opacity-40"
        />

        <label className="mb-8 flex items-center gap-2.5 text-sm text-[#999]">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            disabled={isSubmitting}
            className="accent-[#1a1a1a]"
          />
          Remember this token
        </label>

        <button
          type="submit"
          disabled={!token.trim() || isSubmitting}
          className="w-full rounded-lg bg-[#1a1a1a] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#333] active:scale-[0.98] disabled:opacity-40"
        >
          Connect
        </button>

        <p className="mt-8 text-center text-xs text-[#bbb]">
          Get your token at{" "}
          <a href="https://web.getmatter.com/settings" target="_blank" rel="noopener" className="text-[#999] underline">
            web.getmatter.com/settings
          </a>
        </p>
      </form>

      {/* Info button — bottom right */}
      <div className="fixed bottom-5 right-5">
        <button
          type="button"
          onClick={() => setInfoOpen(!infoOpen)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#ddd] bg-white text-xs font-medium text-[#999] transition-colors hover:border-[#999] hover:text-[#666]"
        >
          i
        </button>
        {infoOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setInfoOpen(false)} />
            <div className="absolute bottom-9 right-0 z-20 w-64 rounded-lg bg-white p-4 shadow-lg">
              <p className="text-xs leading-relaxed text-[#999]">
                Article titles, excerpts, and author names are sent to{" "}
                <a href="https://openrouter.ai" target="_blank" rel="noopener" className="underline hover:text-[#666]">
                  OpenRouter
                </a>{" "}
                for AI-powered categorization. Your token is never shared.
                <br />
                <br />
                {remember ? "Token stored on this device." : "Token stored for this session only."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
