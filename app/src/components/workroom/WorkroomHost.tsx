import { closeWorkroom, useWorkroom } from "../../workroom/openWorkroom";
import { Workroom } from "./Workroom";

/** The one mount. Anything, anywhere, calls `openWorkroom(context)` and the
 *  room appears over the cockpit; nothing else in the tree holds it open. */
export function WorkroomHost() {
  const context = useWorkroom();
  if (!context) return null;
  // Keyed on the context so switching modes or packages rebuilds the room and
  // its engine rather than carrying one storyline's state into another.
  return <Workroom key={`${context.mode}-${context.door}-${context.accountId}`} context={context} onClose={closeWorkroom} />;
}
