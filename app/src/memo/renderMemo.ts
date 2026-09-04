/* =============================================================================
   THE BROWSER ENTRY — the cockpit's one door to the credit memo renderer.

   The memo is rendered by the PLUGIN'S OWN renderer, unmodified. The only thing
   this file does is hand it the two files it would otherwise read off disk:

     references/module-manifest.json  → the conditionality engine's module set
     assets/memo-shell.html           → the page the modules are poured into

   Both arrive as `?raw` strings that vite inlines at build time, so no `node:fs`
   and no fetch reaches the browser bundle. That is the whole port: same renderer,
   same manifest, same shell, different way of loading two files.

   Everything else here is read-only convenience over the render result —
   `renderPlanFor` and `sectionsFrom` — for the room to display. Neither of them
   touches the HTML the renderer produced.
   ============================================================================= */

import { renderMemo as vendorRenderMemo } from "./renderMemo.vendor.mjs";
import manifestRaw from "./vendor/references/module-manifest.json?raw";
import shell from "./vendor/assets/memo-shell.html?raw";
import type { MemoDossier, MemoPlanModule, MemoRenderResult } from "./types";

/** The plugin's module manifest, parsed once. The renderer treats it as read-only. */
const MANIFEST: unknown = JSON.parse(manifestRaw);

/** The plugin's memo shell, verbatim. `{{TOC}}`, `{{MODULES}}` and friends unfilled. */
export const MEMO_SHELL = shell;

/**
 * Render a full credit memo to HTML, in the browser.
 *
 * Byte-for-byte the plugin's output for the same dossier — `parity.test.ts` is
 * what holds that claim up, against the HTML the plugin's own harness writes.
 */
export function renderMemo(dossier: MemoDossier): MemoRenderResult {
  return vendorRenderMemo({ ...dossier, manifest: MANIFEST, shell });
}

/* -----------------------------------------------------------------------------
   THE RENDER PLAN, for the room's own display.

   SUPPRESSED IS NOT A GAP (references/conditionality.md). A module switched off
   by a flag has nothing to complete and must never be counted as missing work; a
   module that rendered with no data behind it shows the plugin's own gap marker
   inside the memo, where a reader can see it. The room shows this list so a
   credit officer can see WHY the memo has the sections it has — the SR 11-7
   render plan, in the requirements' words.
   ----------------------------------------------------------------------------- */

export interface RenderPlanEntry {
  id: string;
  name: string;
  /** True for a module in the plan, false for one the flags switched off. */
  on: boolean;
  /** Why, in the manifest's own predicate. "always" for the unconditional ones. */
  reason: string;
  /** Present on a component-level suppression: the module it belongs to. */
  module?: string;
}

export interface RenderPlan {
  modules: RenderPlanEntry[];
  suppressed: RenderPlanEntry[];
}

interface ManifestModule {
  id: string;
  name?: string;
  renderWhen?: unknown;
  components?: Array<{ id: string; name?: string; renderWhen?: unknown }>;
}

const modules = (): ManifestModule[] => (MANIFEST as { modules?: ManifestModule[] }).modules ?? [];

/** A predicate as the manifest writes it, flattened to one readable line. */
function predicateText(when: unknown): string {
  if (when == null || when === "always") return "always";
  if (typeof when === "string") return when;
  if (Array.isArray(when)) return when.map(predicateText).join(" AND ");
  if (typeof when === "object") {
    const o = when as { any?: unknown[]; all?: unknown[] };
    if (o.any) return o.any.map(predicateText).join(" OR ");
    if (o.all) return o.all.map(predicateText).join(" AND ");
  }
  return "always";
}

/**
 * The ON and OFF modules with the reason for each, resolved by rendering.
 *
 * The reason is the manifest's own predicate rather than a sentence written
 * here: the engine that decided is the engine that gets quoted.
 */
export function renderPlanFor(dossier: MemoDossier): RenderPlan {
  const { plan, suppressed } = renderMemo(dossier);
  const byId = new Map(modules().map((m) => [m.id, m]));

  const on: RenderPlanEntry[] = plan.map((m: MemoPlanModule) => ({
    id: m.id,
    name: m.name,
    on: true,
    reason: predicateText(byId.get(m.id)?.renderWhen),
  }));

  const off: RenderPlanEntry[] = suppressed.map((entry) => {
    const [modId, compId] = entry.split("/");
    const mod = byId.get(modId);
    if (!compId) {
      return { id: modId, name: mod?.name ?? modId, on: false, reason: predicateText(mod?.renderWhen) };
    }
    const comp = mod?.components?.find((c) => c.id === compId);
    return {
      id: entry,
      name: comp?.name ?? compId.replace(/_/g, " "),
      on: false,
      reason: predicateText(comp?.renderWhen),
      module: modId,
    };
  });

  return { modules: on, suppressed: off };
}

/* -----------------------------------------------------------------------------
   SECTIONS, for per-section attestation.

   The renderer wraps every module in `<section class="page" data-mod="<id>"
   data-modname="<name>">` (render-memo.mjs, the assemble loop). Those ids are the
   manifest's module ids, which are the ids memo-sections.md and the attestation
   map are keyed by — so splitting on the anchor is what lets an approval on
   screen and an approval in the dossier mean the same thing.

   String-scanned, not DOM-parsed, on purpose: this must give the same answer in
   node, in jsdom and in the browser, and it must never rewrite a byte of the
   renderer's HTML.
   ----------------------------------------------------------------------------- */

export interface MemoSection {
  /** Manifest module id, e.g. `executive_summary`. */
  id: string;
  /** The module's display name, as the renderer stamped it. */
  title: string;
  /** The complete `<section>…</section>`, verbatim. */
  html: string;
}

const SECTION_OPEN = /<section class="page" data-mod="([^"]+)" data-modname="([^"]*)">/g;

/** Decode the four entities `esc()` writes. Nothing else is touched. */
const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

/**
 * Split a rendered memo into its module sections, in document order.
 *
 * The cover and the table of contents are shell chrome, not modules, and carry
 * no `data-mod` anchor — so they are correctly absent here. A memo whose modules
 * have all been attested is not a memo whose cover has been attested.
 */
export function sectionsFrom(html: string): MemoSection[] {
  const out: MemoSection[] = [];
  const opens: Array<{ id: string; title: string; at: number }> = [];
  SECTION_OPEN.lastIndex = 0;
  for (let m = SECTION_OPEN.exec(html); m; m = SECTION_OPEN.exec(html)) {
    opens.push({ id: m[1], title: unesc(m[2]), at: m.index });
  }
  for (const open of opens) {
    // No module body emits a <section>, so sections never nest and the first
    // closing tag after an opener is that opener's own.
    const close = html.indexOf("</section>", open.at);
    if (close === -1) continue;
    out.push({ id: open.id, title: open.title, html: html.slice(open.at, close + "</section>".length) });
  }
  return out;
}
