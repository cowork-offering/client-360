/* =============================================================================
   nCINO-SAFE HTML (phase D, 2026-09-04).

   The memo renders as a styled document: a stylesheet, a grid, an SVG chart or
   two. nFORMS renders none of that. Its form generator keeps inline styles,
   tables and data-URI images and IGNORES `<style>`, SVG, CSS grid and flex, so
   a memo published as-is arrives in nCino as an unstyled column of text, which
   is worse than useless: it looks like the bank's credit memo and it is not.

   So the memo's own CSS is INLINED onto the elements it applies to, the parts
   nCino cannot render are removed, and tables stay exactly as they are.

   WHAT THIS IS NOT. It is not a security sanitiser for untrusted markup, and it
   is not a full CSS engine. It resolves ordinary rule selectors in document
   order, which approximates the cascade well enough for a document whose CSS we
   wrote ourselves; pseudo-selectors, media queries and specificity ties are out
   of reach and are dropped rather than guessed at. What it does guarantee is
   the direction that matters: nothing nCino cannot render survives the
   conversion, and an element's own inline style always wins.
   ============================================================================= */

/* ------------------------------------------------------------- the profiles */

/** Elements whose CONTENT goes with them: they carry nothing a memo reader
 *  needs, and their text (a stylesheet body, a script) is not prose. */
const DROP_WITH_CONTENT = new Set([
  "style", "script", "svg", "link", "meta", "noscript", "iframe", "canvas",
  "video", "audio", "object", "embed", "form", "input", "select", "textarea",
  "button", "template", "head",
]);

/** Tags nFORMS renders. Anything else is UNWRAPPED, never deleted: the tag is
 *  the part nCino cannot use, the words inside it are the memo. */
const NCINO_TAGS = new Set([
  "div", "span", "p", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em",
  "i", "u", "small", "sub", "sup", "ul", "ol", "li", "a", "img", "table",
  "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "br", "hr", "blockquote", "pre", "code", "dl", "dt", "dd",
]);

/** The Salesforce rich-text allowlist, which is narrower: p/strong/em/ul/ol/
 *  li/a/img and basic tables. Headings are RENAMED to a bold paragraph rather
 *  than unwrapped, so a section keeps its shape instead of collapsing into one
 *  run of text. */
const RTE_TAGS = new Set([
  "p", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "img", "table",
  "thead", "tbody", "tr", "th", "td", "br", "span",
]);

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

/** Attributes that survive. `class` never does: its stylesheet is gone. */
const KEEP_ATTRIBUTES = new Set([
  "style", "href", "src", "alt", "title", "colspan", "rowspan", "width",
  "height", "align", "valign", "border", "cellpadding", "cellspacing", "target",
  "rel", "id",
]);

/** Exact property names nFORMS honors. Families are matched by prefix below. */
const KEEP_PROPERTIES = new Set([
  "color", "font", "font-family", "font-size", "font-style", "font-weight",
  "font-variant", "line-height", "letter-spacing", "text-align",
  "text-decoration", "text-indent", "text-transform", "vertical-align",
  "white-space", "direction", "width", "min-width", "max-width", "height",
  "min-height", "max-height", "display", "float", "clear", "table-layout",
  "caption-side", "empty-cells",
]);

const KEEP_PREFIXES = ["margin", "padding", "border", "background", "list-style", "page-break", "break-"];

/** The only `display` values that mean anything in a form-generated document. */
const DISPLAY_VALUES = new Set([
  "block", "inline", "inline-block", "none", "table", "table-row",
  "table-cell", "table-header-group", "table-row-group", "list-item",
]);

/* --------------------------------------------------------------- CSS parsing */

interface CssRule {
  selectors: string[];
  declarations: Array<[string, string]>;
}

/** Strip comments, then read top-level `selector { body }` rules. At-rules are
 *  skipped whole: a media query cannot be inlined, and neither can a keyframe. */
export function parseStylesheet(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  let depth = 0;
  let start = 0;
  let head = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) {
        head = text.slice(start, i).trim();
        start = i + 1;
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const body = text.slice(start, i);
        start = i + 1;
        if (!head.startsWith("@")) {
          const selectors = head.split(",").map((s) => s.trim()).filter(Boolean);
          const declarations = parseDeclarations(body);
          if (selectors.length && declarations.length) rules.push({ selectors, declarations });
        }
        head = "";
      }
    }
  }
  return rules;
}

/** Split a declaration block, respecting parentheses and quotes so a
 *  `font-family: "A; B"` or a `url(data:...;base64,...)` stays in one piece. */
export function parseDeclarations(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  let quote = "";
  let buf = "";
  const flush = () => {
    const decl = buf.trim();
    buf = "";
    if (!decl) return;
    const colon = decl.indexOf(":");
    if (colon < 1) return;
    const property = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim().replace(/\s*!important$/i, "");
    if (property && value) out.push([property, value]);
  };
  for (const ch of body) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();
  return out;
}

/** Is this property/value pair something nFORMS will render? */
export function keepsDeclaration(property: string, value: string): boolean {
  const v = value.toLowerCase();
  // Custom properties cannot resolve without the stylesheet that defined them.
  if (property.startsWith("--") || v.includes("var(")) return false;
  // An external image is a broken image in nCino, and a request we never make.
  if (v.includes("url(") && !v.includes("url(data:")) return false;
  if (property === "display") return DISPLAY_VALUES.has(v);
  if (KEEP_PROPERTIES.has(property)) return true;
  return KEEP_PREFIXES.some((p) => property.startsWith(p));
}

const serialize = (decls: Map<string, string>) =>
  [...decls].map(([p, v]) => `${p}:${v}`).join(";");

/* ------------------------------------------------------------- conversion */

function parseDocument(html: string): Document {
  if (typeof DOMParser === "undefined") {
    throw new Error("nCino-safe conversion needs a DOM: run it in the page, or a jsdom test.");
  }
  return new DOMParser().parseFromString(html, "text/html");
}

/** Selectors we can resolve. A pseudo-class or pseudo-element describes a state
 *  no static document has, so its rule is dropped rather than applied to the
 *  base element, which would paint every link as if it were hovered. */
function resolvable(selector: string): boolean {
  return !selector.includes(":") && !selector.includes("@");
}

function inlineStylesheets(doc: Document): void {
  const sheets = [...doc.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
  const rules = parseStylesheet(sheets);
  if (!rules.length) return;

  // An element's OWN inline style outranks every rule, so it is captured before
  // anything is applied and replayed last.
  const own = new Map<Element, Array<[string, string]>>();
  for (const el of doc.querySelectorAll("[style]")) {
    own.set(el, parseDeclarations(el.getAttribute("style") ?? ""));
  }

  const applied = new Map<Element, Map<string, string>>();
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      if (!resolvable(selector)) continue;
      let matched: Element[];
      try {
        matched = [...doc.querySelectorAll(selector)];
      } catch {
        continue; // a selector this engine cannot parse applies to nothing
      }
      for (const el of matched) {
        let decls = applied.get(el);
        if (!decls) {
          decls = new Map<string, string>();
          applied.set(el, decls);
        }
        // Later rules win over earlier ones: document order stands in for
        // specificity, which is the approximation this converter admits to.
        for (const [property, value] of rule.declarations) {
          if (keepsDeclaration(property, value)) decls.set(property, value);
        }
      }
    }
  }

  for (const [el, decls] of applied) {
    for (const [property, value] of own.get(el) ?? []) decls.set(property, value);
    el.setAttribute("style", serialize(decls));
  }
}

/** Drop what nCino ignores, unwrap what it does not know, keep the words.
 *  Scoped to the BODY: `html` and `body` are the document's own frame, not
 *  markup this converter may unwrap, and only the body's children are emitted. */
function prune(doc: Document, tags: Set<string>, rename: boolean): void {
  for (const el of [...doc.body.querySelectorAll("*")]) {
    const tag = el.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      el.remove();
      continue;
    }
    if (tag === "img") {
      const src = el.getAttribute("src") ?? "";
      // Inline data only. An external src renders as a broken image in nCino
      // and would be a network call from the bank's own record page.
      if (!src.startsWith("data:image/")) {
        el.remove();
        continue;
      }
    }
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      if (!/^(https?:|mailto:|#)/i.test(href)) el.removeAttribute("href");
    }
  }

  // A second pass: renaming and unwrapping change the tree, so they run after
  // every element has been judged on what it was.
  for (const el of [...doc.body.querySelectorAll("*")]) {
    const tag = el.tagName.toLowerCase();
    if (!el.isConnected) continue;
    if (tags.has(tag)) continue;
    if (rename && HEADINGS.has(tag)) {
      const p = el.ownerDocument.createElement("p");
      const decls = parseDeclarations(el.getAttribute("style") ?? "");
      const style = new Map<string, string>(decls);
      if (!style.has("font-weight")) style.set("font-weight", "bold");
      p.setAttribute("style", serialize(style));
      while (el.firstChild) p.appendChild(el.firstChild);
      el.replaceWith(p);
      continue;
    }
    // Unwrap: the tag goes, its children stay where they were.
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  }

  for (const el of [...doc.body.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (!KEEP_ATTRIBUTES.has(name)) el.removeAttribute(attr.name);
    }
    const style = el.getAttribute("style");
    if (style === null) continue;
    const kept = new Map<string, string>();
    for (const [property, value] of parseDeclarations(style)) {
      if (keepsDeclaration(property, value)) kept.set(property, value);
    }
    if (kept.size) el.setAttribute("style", serialize(kept));
    else el.removeAttribute("style");
  }
}

/** The base the whole document sits on, so nFORMS starts from the memo's own
 *  typography rather than the form generator's. */
const DOCUMENT_FRAME =
  "font-family:Arial,Helvetica,sans-serif;color:#1A1A1A;font-size:12px;line-height:1.45;max-width:7.5in;margin:0 auto";

/**
 * The memo, as nCino renders it: stylesheet inlined, `<style>` and SVG gone,
 * tables untouched.
 */
export function toNcinoSafeHtml(html: string): string {
  const doc = parseDocument(html);
  inlineStylesheets(doc);
  // Whatever the memo set on `body` is its base typography, and only the body's
  // CHILDREN are emitted, so it is carried onto the frame instead of lost.
  const frame = new Map<string, string>(parseDeclarations(DOCUMENT_FRAME));
  for (const [property, value] of parseDeclarations(doc.body.getAttribute("style") ?? "")) {
    if (keepsDeclaration(property, value)) frame.set(property, value);
  }
  prune(doc, NCINO_TAGS, false);
  return `<div style="${serialize(frame)}">${doc.body.innerHTML}</div>`;
}

/**
 * One narrative section, in the Salesforce rich-text subset the `cm_*` fields
 * accept. Same machinery, narrower allowlist, no document frame: the field is a
 * fragment inside nCino's own page.
 */
export function toRteSafeHtml(html: string): string {
  const doc = parseDocument(html);
  inlineStylesheets(doc);
  prune(doc, RTE_TAGS, true);
  return doc.body.innerHTML.trim();
}
