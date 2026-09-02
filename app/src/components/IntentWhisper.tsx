import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/appState";
import { BrandGlyph } from "./brand";
import { whisperLine } from "../intent/contract";
import { deferIntent, offerFor, useIntents } from "../intent/store";
import { openIntent } from "../intent/open";

/* =============================================================================
   THE INTENT WHISPER.

   THE SAME GESTURE AS RULE 59'S WHISPER, for a different fact. That one notices
   something in the book; this one carries something the banker already said
   somewhere else. So it wears the same glass, sits in the same corner, and
   offers the same shape of choice — except this one has TWO chips, because
   "Later" has to be a real answer and a ✕ is not one.

   IT SPEAKS ON THE LANDING AND ON THE RELATIONSHIP IT NAMES, and nowhere else
   (the rule lives in `offerFor`). It yields to the assist panel exactly as the
   original does. An intent is an invitation to start work, never an
   interruption of work in progress.

   WITH NO STORE THERE IS NO OFFER AND THIS RENDERS NULL, which is the whole of
   the no-db contract on this surface.
   ============================================================================= */

export function IntentWhisper() {
  const { data, state, dispatch } = useApp();
  const intents = useIntents();
  const [shown, setShown] = useState(false);

  const offer = useMemo(
    // `intents` is the store's own snapshot: a new pending set, a deferral or a
    // taking all change it, which is exactly when the offer may change.
    () => offerFor(state.view, state.accountId),
    [intents, state.view, state.accountId],
  );

  const panelOpen = state.panel !== "none";

  /* A BEAT BEFORE IT SPEAKS. The cockpit's own entry animations run for about a
     second; a chip that arrives inside them reads as chrome rather than as
     something noticed. */
  useEffect(() => {
    if (!offer || panelOpen) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 900);
    return () => window.clearTimeout(t);
  }, [offer, panelOpen]);

  if (!offer) return null;

  return (
    <div className={`whisper intent-whisper${shown ? " show" : ""}`} id="intentWhisper" role="status">
      <div className="wbody" data-intent={offer.id}>
        <BrandGlyph />
        <span>{whisperLine(offer)}</span>
      </div>
      <div className="iw-chips">
        <button
          type="button"
          className="iw-chip iw-open"
          data-intent-open={offer.id}
          onClick={() => {
            setShown(false);
            openIntent({
              intent: offer,
              navigate: (accountId) => dispatch({ type: "OPEN_ACCOUNT", accountId }),
              openedBy: data.meta?.user,
            });
          }}
        >
          Open
        </button>
        <button
          type="button"
          className="iw-chip"
          data-intent-later={offer.id}
          onClick={() => {
            setShown(false);
            deferIntent(offer);
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}
