import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrainEnvelope } from "./brainLane";
import { LiquidMark } from "../components/workroom/Liquid";
import {
  composeNarratePrompt,
  parseNarration,
  shouldNarrate,
  type NarrateSubject,
  type NarrationBlock,
} from "./narrate";
import {
  askSession,
  primeConsent,
  sampleAvailable,
  takeDeclineNotice,
  type AskSessionOptions,
} from "./sampleDoor";

/* =============================================================================
   THE REMARK, ON THE GLASS — the thin hook and the one component.

   The room calls `useNarration` ONCE and renders `<Narration>` under a thread
   item. That is the whole integration surface: the deterministic layer is not
   touched, the card is not touched, and a room with the feature off renders
   exactly what it renders today.

   THE THINKING PULSE IS THE ROOM'S OWN. `LiquidMark` under `.wk-compose` is
   what the room already shows while it composes, so a remark arriving reads as
   the same room thinking, not as a second system loading.
   ============================================================================= */

export interface NarrationView {
  blocks: NarrationBlock[];
  /** TRUE from the call leaving the page until the first streamed token. */
  pending: boolean;
}

export interface NarrationDeps {
  /**
   * FALSE turns the whole feature off and the room renders today's sentences.
   * Channel-none parity is a contract, not a fallback.
   */
  enabled: boolean;
  /** Builds the envelope a remark is grounded in. Called lazily, per remark, so
   *  the book it sees is the book as it stands when the card lands. */
  envelopeFor: (line: string) => BrainEnvelope;
  /** The door. Injected so the suite never touches a global. */
  ask?: (prompt: string, options: AskSessionOptions) => Promise<string>;
  /** The consent moment. Injected for the same reason. */
  prime?: (prompt: string, options: AskSessionOptions) => Promise<string | null>;
}

export interface NarrationHook {
  /**
   * THE OPENING, AND THE ONE CONSENT MOMENT.
   *
   * Called once when the room opens, on the greeting the banker just asked for
   * by opening it. The platform's consent dialog appears framed by that
   * greeting, never mid-plan and never between a card and its sentence.
   */
  open(id: string, subject: NarrateSubject): void;
  /** Narrate what the room just did, under the item that carries it. */
  narrate(id: string, subject: NarrateSubject, line?: string): void;
  viewFor(id: string): NarrationView | undefined;
}

export function useNarration(deps: NarrationDeps): NarrationHook {
  const [views, setViews] = useState<Record<string, NarrationView>>({});
  const running = useRef(new Map<string, AbortController>());
  /** ONE REMARK PER ITEM, EVER. The hook's returned object changes identity as
   *  the remark streams, so a caller's effect will re-fire on its own updates:
   *  without this latch that is an infinite loop rather than a second remark. */
  const asked = useRef(new Set<string>());
  const { enabled, envelopeFor } = deps;
  const ask = deps.ask ?? askSession;
  const prime = deps.prime ?? primeConsent;

  useEffect(() => {
    const inflight = running.current;
    return () => {
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
    };
  }, []);

  /** WHERE A REMARK CANNOT BE HAD, THE DETERMINISTIC SENTENCE STANDS ALONE.
   *  The one exception is a decline: the room says the one sentence, once, in
   *  the place the remark would have been, and never mentions it again. */
  const settle = useCallback((id: string) => {
    const notice = takeDeclineNotice();
    setViews((prev) => {
      const next = { ...prev };
      if (notice) next[id] = { blocks: [{ kind: "line", spans: [{ text: notice }] }], pending: false };
      else delete next[id];
      return next;
    });
  }, []);

  const run = useCallback(
    (id: string, subject: NarrateSubject, line: string, greeting: boolean) => {
      if (!enabled || !sampleAvailable()) return;
      if (!greeting && !shouldNarrate(subject)) return;
      if (asked.current.has(id)) return;
      asked.current.add(id);

      const controller = new AbortController();
      running.current.set(id, controller);
      setViews((prev) => ({ ...prev, [id]: { blocks: [], pending: true } }));

      const prompt = composeNarratePrompt(envelopeFor(line), subject);
      const options: AskSessionOptions = {
        kind: greeting ? "greeting" : "narrate",
        tier: "quick",
        rung: 2,
        signal: controller.signal,
        onText: ({ text }) => setViews((prev) => ({ ...prev, [id]: { blocks: parseNarration(text), pending: false } })),
      };

      const call = greeting ? prime(prompt, options) : ask(prompt, options);
      void Promise.resolve(call)
        .then((text) => {
          const blocks = parseNarration(typeof text === "string" ? text : "");
          if (blocks.length) setViews((prev) => ({ ...prev, [id]: { blocks, pending: false } }));
          else settle(id);
        })
        .catch(() => settle(id))
        .finally(() => running.current.delete(id));
    },
    [ask, enabled, envelopeFor, prime, settle],
  );

  return useMemo(
    () => ({
      open: (id, subject) => run(id, subject, "", true),
      narrate: (id, subject, line = "") => run(id, subject, line, false),
      viewFor: (id) => views[id],
    }),
    [run, views],
  );
}

/**
 * THE REMARK, DRAWN IN THE ROOM'S OWN TYPOGRAPHY.
 *
 * It is an agent bubble, because that is what it is: the room speaking. It
 * carries light structure only — a short bullet list and a bold figure — parsed
 * out of the model's text into these elements, so no markdown character ever
 * reaches the glass.
 */
export function Narration({ view }: { view?: NarrationView }): React.JSX.Element | null {
  if (!view) return null;
  if (view.pending) {
    return (
      <div className="wk-msg wk-agent wk-narr" data-who="Agent">
        <div className="wk-bub wk-narr-wait" role="status" aria-label="Thinking">
          <LiquidMark />
        </div>
      </div>
    );
  }
  if (!view.blocks.length) return null;
  return (
    <div className="wk-msg wk-agent wk-narr" data-who="Agent">
      <div className="wk-bub">
        {view.blocks.map((block, i) =>
          block.kind === "line" ? (
            <p className="wk-narr-line" key={i}>
              {block.spans.map((span, j) => (span.bold ? <b key={j}>{span.text}</b> : <span key={j}>{span.text}</span>))}
            </p>
          ) : (
            <ul className="wk-narr-list" key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  {item.map((span, k) => (span.bold ? <b key={k}>{span.text}</b> : <span key={k}>{span.text}</span>))}
                </li>
              ))}
            </ul>
          ),
        )}
      </div>
    </div>
  );
}
