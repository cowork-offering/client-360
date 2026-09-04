/* Types for renderMemo.vendor.mjs, the browser copy of the credit-memo plugin's renderer
 * (src/memo/vendor/render/render-memo.mjs, three line ranges removed — see VENDOR.md).
 * The runtime is DERIVED and never hand-edited; this declaration is hand-kept in step with it.
 * The shapes themselves live in ./types.ts, which is where they are documented. */

import type { MemoDossier, MemoRenderResult } from "./types";

export declare function renderMemo(
  input: MemoDossier & { manifest: unknown; shell: string },
): MemoRenderResult;
