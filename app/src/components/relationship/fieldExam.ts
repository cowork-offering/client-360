import type { StepOption } from "./reviewFlows";

/* =============================================================================
   THE FIELD EXAM, WHICH THIS ROOM DOES NOT FILE.

   A borrowing base field examination is a person going to the borrower's site
   and testing eligibility: it sets ineligibles and reserves, and it is neither
   a valuation nor a covenant assessment. Nothing on this cockpit's wire files
   one. Asked for it, the room used to fall through every route word and answer
   with the five-way, which reads the annual review, the covenant review, a
   valuation and the rating back at a banker who asked for none of them.

   ONE HONEST SENTENCE AND THE TWO CHIPS THAT APPLY. It says what the room
   cannot do, then offers only what it CAN: stage the ask as a service request
   for whoever schedules exams, or open the covenant review on the borrowing
   base the exam would feed. It BINDS NOTHING on its own, exactly as the client
   request offer does not: guessing here picks a write path.

   THE SUBJECT IS THE BANKER'S OWN LINE, never a sentence this module wrote. A
   case subject nobody chose is a case nobody can defend at audit, so the chip
   carries the typed line through to the service flow's first step and the body
   is OFFERED as one option there rather than written silently.
   ============================================================================= */

/**
 * The phrasings a banker uses for the same piece of work. All of them name the
 * EXAM: none of them names one of the five reviews, which is why the router
 * returns null on every one and the room needed a sentence of its own.
 */
const FIELD_EXAM =
  /\bfield\s+(exam\w*|audit)\b|\bborrowing\s+base\s+(exam\w*|audit)\b|\bcollateral\s+audit\b|\b(a\s*\/?\s*r|accounts\s+receivable|receivables?)\s+audit\b|\binventory\s+(count|audit)\b/i;

/** TRUE where the line asks for a field examination under any of its names.
 *
 *  Consulted only AFTER the route read has declined the line, so a banker who
 *  says "valuation" or "covenant review" is routed on their own word and never
 *  reaches here. */
export function asksForFieldExam(text: string): boolean {
  const line = text.trim();
  return Boolean(line) && FIELD_EXAM.test(line);
}

/** The one sentence. What the room cannot do, then the two things it can. */
export const FIELD_EXAM_OFFER =
  "A field exam is not something this room files. I can stage a service request for the exam, or open a covenant review on the borrowing base.";

/** The chip that carries the ask to the servicing team. */
export const STAGE_A_FIELD_EXAM = "Service request: field exam";

/** The chip that opens the review the exam's findings would feed. */
export const COVENANT_REVIEW = "Covenant review";

/**
 * THE BODY, OFFERED ON THE SERVICE FLOW'S SECOND STEP.
 *
 * It states what a field exam IS and leaves the scope to the examiner, because
 * neither the period to be examined nor the ineligibles the exam will set are
 * facts this cockpit holds. Nothing here is written unless the banker taps it.
 */
export const FIELD_EXAM_BODY =
  "Field examination on the borrowing base: eligibility tested at the borrower's site, scope and period set by the examiner.";

/** The option that pre-fills that body, offered only where the SUBJECT the
 *  banker already answered with reads as a field exam. */
export function fieldExamBodyOption(subject: unknown): StepOption[] | undefined {
  if (typeof subject !== "string" || !asksForFieldExam(subject)) return undefined;
  return [{ label: FIELD_EXAM_BODY, value: FIELD_EXAM_BODY, detail: "the exam ask, as the servicing team reads it" }];
}
