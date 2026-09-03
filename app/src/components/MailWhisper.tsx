import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/appState";
import { BrandGlyph } from "./brand";
import { resolveBundle } from "../actions/registry";
import { clearMailArrival, mailWhisperLine, openMailRoom, readMailRow, useMailArrival } from "../actions/mailRow";

/* =============================================================================
   THE MAIL WHISPER.

   A MESSAGE THAT JUST LANDED IS A WHISPER, NEVER A MODAL (founder, 2026-09-03:
   "the pop up still opens up the old loan modification tab, not our workroom").
   It wears the intent whisper's own glass, sits in the same corner, says ONE
   sentence and offers the same two chips, because it is the same kind of fact:
   something someone said, waiting to become work.

   IT SPEAKS ON THE LANDING AND ON THE RELATIONSHIP IT NAMES, and nowhere else.
   It yields to the assist panel. It is spent the moment the banker answers it
   either way, and a sweep is the only thing that can raise another: there is no
   polling here and no second surface counting unread mail.
   ============================================================================= */

export function MailWhisper() {
  const { data, state, dispatch } = useApp();
  const arrival = useMailArrival();
  const [shown, setShown] = useState(false);

  /* THE READ THE ASK IS DERIVED AGAINST. The baked bundle with the sweep's own
     patch merged over it, exactly as the account view and the room merge it: the
     message that just landed came from the same sweep as the patch. */
  const bundle = useMemo(() => {
    if (!arrival) return null;
    const baked = resolveBundle(data, arrival.accountId);
    const patch = state.livePatches[arrival.accountId];
    return baked && patch ? { ...baked, ...patch } : baked;
  }, [data, state.livePatches, arrival]);
  const row = useMemo(() => (arrival ? readMailRow(arrival.entry, bundle) : null), [arrival, bundle]);

  const panelOpen = state.panel !== "none";
  /* The same rule the intent lane runs: the landing, or the relationship this
     message is about. Interrupting a banker mid-file about a different borrower
     is the behaviour this cockpit refuses everywhere else. */
  const here = !!arrival && (state.view === "home" || state.accountId === arrival.accountId);

  /* A BEAT BEFORE IT SPEAKS. The sweep's own console lifts on a 900ms hold; a
     chip that arrived inside that would read as part of the console. */
  useEffect(() => {
    if (!row || !here || panelOpen) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 900);
    return () => window.clearTimeout(t);
  }, [row, here, panelOpen]);

  if (!arrival || !row || !here) return null;

  return (
    <div className={`whisper intent-whisper${shown ? " show" : ""}`} id="mailWhisper" role="status">
      <div className="wbody" data-mail-whisper={arrival.entry.id}>
        <BrandGlyph />
        <span>{mailWhisperLine(row)}</span>
      </div>
      <div className="iw-chips">
        <button
          type="button"
          className="iw-chip iw-open"
          data-mail-whisper-open={arrival.entry.id}
          onClick={() => {
            setShown(false);
            openMailRoom({
              entry: arrival.entry,
              bundle,
              accountId: arrival.accountId,
              accountName: arrival.accountName,
              generatedAt: data.meta?.generatedAt ?? "",
              navigate: (accountId) => dispatch({ type: "OPEN_ACCOUNT", accountId }),
            });
            clearMailArrival();
          }}
        >
          Open
        </button>
        <button
          type="button"
          className="iw-chip"
          data-mail-whisper-later={arrival.entry.id}
          onClick={() => {
            setShown(false);
            clearMailArrival();
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}
