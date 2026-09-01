import { useMemo } from "react";
import { TypeIcon } from "./TypeIcon";
import type { ReadCardModel } from "./readCard";

/* =============================================================================
   THE READ CARD, DRAWN. ONE CARD LANGUAGE FOR BOTH ROOMS.

   A question answered from the package, from the desk, in the facility room or
   in the relationship room, arrives at THIS component. The rooms deliberately
   duplicate each other's chrome, but a read card that drifted between them
   would be two different answers to the same question, so this one is shared.

   It ANSWERS; it never acts. Nothing on it is waiting for a decision, and its
   last line is a SENTENCE: the banker's reply to it goes through the same
   dispatch every other line does, so this card can do nothing they could not
   have said themselves.
   ============================================================================= */

/** The word stagger of the agent's speech (rule 65). Both rooms hold the same
 *  constant; this is the copy the shared card speaks at. */
const WORD_STAGGER_MS = 26;

function Words({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/(\s+)/).filter((p) => p !== ""), [text]);
  let n = -1;
  return (
    <>
      {parts.map((part, i) => {
        if (/^\s+$/.test(part)) return part;
        n += 1;
        return (
          <span className="wk-w" style={{ animationDelay: `${n * WORD_STAGGER_MS}ms` }} key={i}>
            {part}
          </span>
        );
      })}
    </>
  );
}

export function ReadCard({ card }: { card: ReadCardModel }) {
  return (
    <div className="wk-read" data-topic={card.topic}>
      <div className="wk-read-lede">
        <Words text={card.lede} />
      </div>
      {/* Keyed on the INDEX as well as the heading: a package legitimately
          carries two facilities with the same product word, and the heading
          alone is not unique across the groups. */}
      {card.groups.map((group, gi) => (
        <div className="wk-read-g" key={`${group.heading}-${gi}`}>
          <div className="wk-read-h">{group.heading}</div>
          {group.rows.map((row, i) => (
            <div className={`wk-read-r ${row.tone ? `wk-${row.tone}` : ""}`} key={`${row.label}-${i}`}>
              <TypeIcon kind={row.icon} />
              <span className="wk-read-l">
                <b>{row.label}</b>
                {row.detail && <span className="wk-read-d">{row.detail}</span>}
              </span>
              {row.value && <span className="wk-read-v tnum">{row.value}</span>}
            </div>
          ))}
        </div>
      ))}
      <div className="wk-read-next">{card.followUp}</div>
    </div>
  );
}
