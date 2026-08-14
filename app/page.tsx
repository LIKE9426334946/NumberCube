"use client";

import { Brand, CubeStage, SceneBadge, useCubeState } from "./cube";

export default function Home() {
  const [state, setState] = useCubeState();

  return (
    <main className="page-shell display-page">
      <section className="display-workspace">
        <div className="display-floating-header">
          <Brand />
          <div className="topbar-actions">
            <a className="page-link" href="/control">控制页</a>
            <SceneBadge state={state} />
          </div>
        </div>
        <CubeStage state={state} setState={setState} />
      </section>
    </main>
  );
}
