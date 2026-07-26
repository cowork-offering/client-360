/* =============================================================================
   MODAL STACK (A31.1)

   Escape belongs to the INNERMOST open layer, and to nobody else.

   Every layer listens on `window` in the capture phase, and capture listeners
   on one target fire in REGISTRATION order — so the outermost panel, having
   mounted first, hears Escape first. `stopPropagation` does not help: it stops
   the event travelling to other targets, not other listeners on the same one.
   The result before this existed was one Escape collapsing two layers at once,
   which the option sheet made impossible to ignore.

   So each layer registers here on mount and asks whether it is on top before
   acting. No globals on the document, no z-index archaeology, no guessing.
   ============================================================================= */

const stack: string[] = [];

/** Register a layer. Returns the unregister function for the effect cleanup. */
export function pushModal(id: string): () => void {
  stack.push(id);
  return () => {
    const i = stack.lastIndexOf(id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** True when this layer is the innermost one open. */
export function isTopmost(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/** Test seam only: the stack is module state and outlives a single render. */
export function resetModalStack(): void {
  stack.length = 0;
}

export function modalDepth(): number {
  return stack.length;
}
