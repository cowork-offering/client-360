// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keepsDeclaration, parseDeclarations, parseStylesheet, toNcinoSafeHtml, toRteSafeHtml } from "./ncinoSafe";

const CSS = `
  .band { background:#2E0A4F; color:#fff; padding:7px 12px }
  h2 { color:#2E0A4F; font-size:15px }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px }
  a:hover { color:red }
  @media print { h2 { color:#000 } }
  td { border:1px solid #D6D3D1 }
`;

const MEMO = `
<html><head><style>${CSS}</style></head>
<body>
  <div class="band">INTERNAL, DRAFT</div>
  <h2>Financial Analysis</h2>
  <div class="grid"><p style="color:#111">Leverage held.</p></div>
  <svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>
  <table><tr><td>EBITDA</td><td>4.2x</td></tr></table>
  <script>window.x = 1</script>
</body></html>`;

describe("the CSS reader", () => {
  it("reads ordinary rules and skips at-rules whole", () => {
    const rules = parseStylesheet(CSS);
    expect(rules.some((r) => r.selectors.includes(".band"))).toBe(true);
    expect(rules.some((r) => r.selectors.some((s) => s.startsWith("@")))).toBe(false);
  });

  it("splits declarations without breaking a value that carries a semicolon", () => {
    const decls = parseDeclarations('background:url(data:image/png;base64,AAA); font-family:"A; B"; color:red');
    expect(decls).toEqual([
      ["background", "url(data:image/png;base64,AAA)"],
      ["font-family", '"A; B"'],
      ["color", "red"],
    ]);
  });

  it("drops !important rather than passing it through", () => {
    expect(parseDeclarations("color: red !important")).toEqual([["color", "red"]]);
  });
});

describe("what nFORMS renders", () => {
  it("keeps typography, boxes and tables", () => {
    expect(keepsDeclaration("color", "#111")).toBe(true);
    expect(keepsDeclaration("border-collapse", "collapse")).toBe(true);
    expect(keepsDeclaration("padding-left", "4px")).toBe(true);
    expect(keepsDeclaration("background", "#2E0A4F")).toBe(true);
  });

  it("drops grid, flex, custom properties and external images", () => {
    expect(keepsDeclaration("display", "grid")).toBe(false);
    expect(keepsDeclaration("display", "flex")).toBe(false);
    expect(keepsDeclaration("grid-template-columns", "1fr 1fr")).toBe(false);
    expect(keepsDeclaration("gap", "12px")).toBe(false);
    expect(keepsDeclaration("color", "var(--ink)")).toBe(false);
    expect(keepsDeclaration("background", "url(https://x/y.png)")).toBe(false);
    expect(keepsDeclaration("background", "url(data:image/png;base64,AAA)")).toBe(true);
  });
});

describe("the memo, converted", () => {
  const out = toNcinoSafeHtml(MEMO);

  it("inlines the stylesheet onto the elements it applied to", () => {
    expect(out).toContain("background:#2E0A4F");
    expect(out).toContain("font-size:15px");
  });

  it("lets an element's own inline style win over the stylesheet", () => {
    const styled = toNcinoSafeHtml(
      `<style>p { color:#000 }</style><p style="color:#111">x</p>`,
    );
    expect(styled).toContain("color:#111");
    expect(styled).not.toContain("color:#000");
  });

  it("carries no style block, no script and no SVG", () => {
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<svg");
    expect(out).not.toContain("window.x");
  });

  it("keeps the table exactly where it was", () => {
    expect(out).toContain("<table");
    expect(out).toContain("<td");
    expect(out).toContain("EBITDA");
  });

  it("drops the class attribute, whose stylesheet is gone", () => {
    expect(out).not.toContain('class="band"');
  });

  it("never inlines a rule that only applies in a state the document has not", () => {
    expect(out).not.toContain("color:red");
  });

  it("drops the grid declarations but keeps the words inside the grid", () => {
    expect(out).not.toContain("display:grid");
    expect(out).toContain("Leverage held.");
  });

  it("frames the document so nFORMS starts from the memo's own typography", () => {
    expect(out.startsWith('<div style="font-family:Arial')).toBe(true);
  });

  it("removes an image nCino would render broken, and keeps a data-URI one", () => {
    expect(toNcinoSafeHtml(`<p><img src="https://x/y.png"></p>`)).not.toContain("<img");
    expect(toNcinoSafeHtml(`<p><img src="data:image/png;base64,AAA"></p>`)).toContain("<img");
  });

  it("strips a javascript: href and keeps the link text", () => {
    const out2 = toNcinoSafeHtml(`<p><a href="javascript:alert(1)">Policy</a></p>`);
    expect(out2).not.toContain("javascript:");
    expect(out2).toContain("Policy");
  });
});

describe("one section, in the Salesforce rich-text subset", () => {
  it("keeps the allowed tags and unwraps the rest, never losing the words", () => {
    const out = toRteSafeHtml(`<section><p>Leverage <strong>3.5x</strong>.</p><ul><li>Held</li></ul></section>`);
    expect(out).toContain("<p>Leverage <strong>3.5x</strong>.</p>");
    expect(out).toContain("<li>Held</li>");
    expect(out).not.toContain("<section");
  });

  it("renames a heading to a bold paragraph rather than flattening it", () => {
    const out = toRteSafeHtml(`<h2>Risk Assessment</h2>`);
    expect(out).toContain("font-weight:bold");
    expect(out).toContain("Risk Assessment");
    expect(out).not.toContain("<h2");
  });

  it("carries no table styling it cannot keep, and no stylesheet", () => {
    const out = toRteSafeHtml(`<style>td{display:flex}</style><table><tr><td>A</td></tr></table>`);
    expect(out).not.toContain("display:flex");
    expect(out).toContain("<td");
  });

  it("returns an empty string for an empty section", () => {
    expect(toRteSafeHtml("")).toBe("");
    expect(toRteSafeHtml("   ")).toBe("");
  });
});
