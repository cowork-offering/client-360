import { useMemo } from "react";
import { resolveBundle } from "../../actions/registry";
import { useApp } from "../../state/appState";
import { createCreateEngine } from "../../workroom/createEngine";
import { type WorkroomEngine } from "../../workroom/engine";
import { createModifyEngine } from "../../workroom/modifyEngine";
import { createRenewEngine } from "../../workroom/renewEngine";
import { closeWorkroom, openWorkroom, useWorkroom } from "../../workroom/openWorkroom";
import { Workroom } from "./Workroom";

/** The one mount. Anything, anywhere, calls `openWorkroom(context)` and the
 *  room appears over the cockpit; nothing else in the tree holds it open.
 *
 *  IT ALSO PICKS THE ENGINE, because this is the only place in the room's tree
 *  that sits inside the app provider and can see the read. The Workroom itself
 *  takes an engine and asks nothing about where it came from — which is what
 *  keeps the shell testable against a scripted engine and shipping against a
 *  wired one. */
export function WorkroomHost() {
  const context = useWorkroom();
  const { data, state, dispatch } = useApp();

  /* THE READ THE ROOM STANDS ON. `resolveBundle` returns the BAKED bundle; the
     live patch a sync sweep landed is merged over it exactly as AppShell does,
     so a banker who syncs and then opens the room is not quietly working on the
     figures from before the sync. */
  const accountId = context?.accountId ?? null;
  const bundle = useMemo(() => {
    if (!accountId) return null;
    const baked = resolveBundle(data, accountId);
    const patch = state.livePatches[accountId];
    return baked && patch ? { ...baked, ...patch } : baked;
  }, [data, state.livePatches, accountId]);

  /* ALL THREE MODES ARE WIRED. There is no scripted fallback left here: a room
     that reached a storyline when a mode was unrecognised would be a room that
     could quietly stop being real, and the `scripted` badge is the only thing
     the banker has to tell the two apart. The three engines take the same
     arguments and hand back the same seam. */
  const engine = useMemo<WorkroomEngine | null>(() => {
    if (!context) return null;
    const args = { context, data, bundle };
    switch (context.mode) {
      case "renew":
        return createRenewEngine(args);
      case "create":
        return createCreateEngine(args);
      default:
        return createModifyEngine(args);
    }
  }, [context, data, bundle]);

  if (!context || !engine) return null;
  // Keyed on the context so switching modes or packages rebuilds the room and
  // its engine rather than carrying one storyline's state into another. The
  // PACKAGE is part of that key because one session is one package is one plan:
  // a manifest composed against one package must not survive into another.
  return (
    <Workroom
      key={`${context.mode}-${context.door}-${context.accountId}-${context.productPackageId ?? "none"}`}
      context={context}
      engine={engine}
      /* THE GLASS LIFTS, AND THE WASH SETTLES (rule 62). Every route out of the
         room — the close button, Escape, the scrim — comes through this one
         prop, so arming the wash here catches all three. */
      onClose={() => {
        dispatch({ type: "ARM_WASH", accountId: context.accountId });
        closeWorkroom();
      }}
      onAnchor={(choice) => openWorkroom({ ...context, productPackageId: choice.id, packageName: choice.label })}
      /* WRITE-BACK THROUGH THE GLASS. The room hands over the committed delta
         its own manifest carried; the cockpit's figures roll to it behind the
         blur. This host dispatches rather than the room, because the room has
         no provider above it in its render test — and because a dispatch that
         touched `livePatches` would rebuild the room's engine mid-scene. */
      onExecuted={(committedDeltaMM) =>
        dispatch({ type: "WRITE_BACK", accountId: context.accountId, committedDeltaMM })
      }
    />
  );
}
