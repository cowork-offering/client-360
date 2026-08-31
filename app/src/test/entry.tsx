import { useApp } from "../state/appState";

/* =============================================================================
   THE ENTRY POINTS A TEST STANDS IN FOR.

   The Client Actions BUTTON is retired (founder call, 2026-08-31 night): the >
   FAB arc owns client actions, and the sheet it used to open has no UI trigger
   left. Its machinery is untouched, so the tests that exercise that machinery
   still need a way in — and the honest one is the app's OWN reducer, the same
   `SET_PANEL` the retired button dispatched, rather than a control that no
   longer exists or a reach into a component's private state.

   Nothing here is a shortcut past a gate. `SET_PANEL` is the reducer's public
   action; the sheet renders from view state exactly as it did.
   ============================================================================= */

type Dispatch = ReturnType<typeof useApp>["dispatch"];

let appDispatch: Dispatch | null = null;

/** Mount beside `<AppShell />` inside the provider. It renders nothing and
 *  holds the reducer's dispatch, which is stable for the provider's lifetime. */
export function AppEntry() {
  appDispatch = useApp().dispatch;
  return null;
}

/** Open the Client Actions sheet the way the app opens it. */
export function dispatchOpenSheet(): void {
  appDispatch?.({ type: "SET_PANEL", panel: "actions" });
}

/** Close it again. */
export function dispatchClosePanel(): void {
  appDispatch?.({ type: "SET_PANEL", panel: "none" });
}
