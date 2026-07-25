import type { C360Data } from "./contract";

const PLACEHOLDER = "__C360_DATA__";

function fromWindow(): C360Data | null {
  const injected = (window as unknown as { C360_DATA?: C360Data }).C360_DATA;
  return injected && typeof injected === "object" ? injected : null;
}

/** Parse the inert application/json slot into window.C360_DATA (the production
 *  bootstrap). No fetch, no eval — just JSON.parse of the assembler-injected text. */
function fromSlot(): C360Data | null {
  const el = document.getElementById("c360-data");
  const raw = el?.textContent?.trim() ?? "";
  if (!raw || raw.includes(PLACEHOLDER)) return null; // un-injected placeholder
  try {
    const data = JSON.parse(raw) as C360Data;
    (window as unknown as { C360_DATA?: C360Data }).C360_DATA = data;
    return data;
  } catch (e) {
    console.error("C360_DATA slot parse error", e);
    return null;
  }
}

/** Resolve the cockpit data. Production reads the injected slot; dev fetches the
 *  repo sample. The dev branch is behind import.meta.env.DEV so both the fetch
 *  and the sample filename are dead-code-eliminated from the built bundle. */
export async function loadC360(): Promise<C360Data | null> {
  const injected = fromWindow() ?? fromSlot();
  if (injected) return injected;

  if (import.meta.env.DEV) {
    try {
      const res = await fetch("/sample-data.json");
      const json = (await res.json()) as C360Data;
      (window as unknown as { C360_DATA?: C360Data }).C360_DATA = json;
      return json;
    } catch (e) {
      console.error("dev sample load failed", e);
      return null;
    }
  }

  return null;
}
