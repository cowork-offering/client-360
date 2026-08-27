import { useEffect, useState } from "react";
import type { C360Data } from "./data/contract";
import { loadC360 } from "./data/load";
import { AppProvider } from "./state/appState";
import { AppShell } from "./components/AppShell";
import { BrandGlyph } from "./components/brand";

type LoadState = { status: "loading" } | { status: "ready"; data: C360Data } | { status: "empty" };

export function App() {
  const [ls, setLs] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    loadC360().then((data) => {
      if (!alive) return;
      setLs(data ? { status: "ready", data } : { status: "empty" });
    });
    return () => {
      alive = false;
    };
  }, []);

  if (ls.status === "loading") return <Boot />;
  if (ls.status === "empty") {
    return (
      <CenterNote
        title="No data injected"
        body="This cockpit renders from an injected C360_DATA payload. Open it through the agent, or run the assembler against a data file."
      />
    );
  }
  return (
    <AppProvider data={ls.data}>
      <AppShell />
    </AppProvider>
  );
}

/** THE APP BOOT. The same scene the workroom opens with, at app altitude: the
 *  mark carries the load on the app's one beat, and there is nothing to read.
 *  The line it replaced ("Reading the injected relationship data") described
 *  the machinery to someone who had not asked. */
function Boot() {
  return (
    <div className="c360-boot">
      <div className="c360-boot-inner">
        <BrandGlyph className="c360-boot-glyph c360-beat" />
        <div className="c360-boot-sub">Commercial Credit 360</div>
      </div>
    </div>
  );
}

function CenterNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-screen items-center justify-center bg-surface p-8">
      <div className="max-w-md text-center">
        <div className="text-[15px] font-semibold text-ink">{title}</div>
        <div className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{body}</div>
      </div>
    </div>
  );
}
