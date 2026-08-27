/* =============================================================================
   WHO THE ROOM IS TALKING TO.

   The greeting is a real read or it is nothing. Every candidate is something the
   cockpit ALREADY carries — the session user the assembler stamps on `meta`, the
   approver the room was opened on, the relationship's own name — so this adds no
   org call for the sake of a first name.

   A candidate that is a record id, a role description or a placeholder resolves
   to NO name rather than to a room that greets a Salesforce id. That is the whole
   discipline here: "Hey Fabian" is worth having only because "Hey 005bb0000..."
   is impossible.
   ============================================================================= */

/**
 * The first name behind whatever the read carries.
 *
 * "Fabian Goetzens" and "fabian.goetzens@accenture.com.bankinggpt" name the same
 * banker, and which one the room is opened on depends on what the assembler
 * stamped. The first candidate that yields a name wins; a candidate whose first
 * token carries a digit is an identity rather than a name and is skipped, which
 * is what keeps a user id out of the greeting.
 */
export function firstNameOf(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    // The fallback `openWorkroom` uses when there is no identity at all. It is a
    // description of a person, not the name of one.
    if (/\bsigned-in\b/i.test(value)) continue;
    const local = value.includes("@") ? value.slice(0, value.indexOf("@")) : value;
    const first = local.split(/[\s._-]+/).filter(Boolean)[0] ?? "";
    if (first.length < 2 || !/^[a-z]+$/i.test(first)) continue;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return null;
}

/** "Hey Fabian." — or nothing at all, where nothing in the read names a viewer. */
export function greetingFor(...candidates: Array<string | null | undefined>): string {
  const name = firstNameOf(...candidates);
  return name ? `Hey ${name}.` : "";
}
