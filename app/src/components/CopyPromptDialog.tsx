import { useEffect, useState } from "react";
import { Portal } from "./Portal";
import { useApp } from "../state/appState";
import { newRequestId } from "../channel/adapter";

/** Unstaged-account fallback (SPEC §12 A17): never an empty workspace. Offer a
 *  copyable prompt to open the account via the agent, plus a direct send when a
 *  channel is live — mirroring the legacy template's no-agent affordance. */
export function CopyPromptDialog({
  accountName,
  accountId,
  prompt: promptOverride,
  onClose,
}: {
  accountName: string;
  accountId: string;
  /** Custom ask (e.g. a verdict-bar action). Defaults to "open this account". */
  prompt?: string;
  onClose: () => void;
}) {
  const { channel } = useApp();
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const prompt = promptOverride ?? `Open the Customer 360 cockpit for ${accountName} (${accountId}).`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function sendToAgent() {
    try {
      await channel.request(prompt, { requestId: newRequestId(), accountId, accountName });
      setSent(true);
    } catch {
      setSent(false);
    }
  }

  return (
    <Portal>
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: "calc(var(--z-modal) + 1)", background: "var(--scrim)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="c360-row-in w-full max-w-md rounded-lg border border-border bg-raised p-5 shadow-[var(--shadow-raised)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Open ${accountName}`}
      >
        <div className="text-[14px] font-semibold text-ink">{accountName}</div>
        <div className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          This relationship is on the book but not staged in this cockpit snapshot. Ask the agent to open it —
          it will reload the cockpit anchored on this account.
        </div>

        <div className="mt-3 rounded-md border border-border bg-surface px-3 py-2 font-mono text-[11.5px] text-ink">
          {prompt}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="c360-press rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-ink-muted hover:text-ink"
          >
            Close
          </button>
          <button
            type="button"
            onClick={copy}
            className="c360-press rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-ink hover:border-border-strong"
          >
            {copied ? "Copied" : "Copy prompt"}
          </button>
          {channel.available() && (
            <button
              type="button"
              onClick={sendToAgent}
              disabled={sent}
              className="c360-btn rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
            >
              {sent ? "Sent" : "Send to agent"}
            </button>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
