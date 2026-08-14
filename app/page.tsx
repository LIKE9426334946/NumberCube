"use client";

import { Brand, CubeStage, SceneBadge, useCubeState } from "./cube";

export default function Home() {
  const [state, setState] = useCubeState();

  return (
    <main className="page-shell display-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <a className="page-link" href="/control">控制页</a>
          <SceneBadge state={state} />
        </div>
      </header>

      <section className="display-workspace">
        <CubeStage state={state} setState={setState} />
      </section>

      <footer>
        <span>{`${state.arrays.length} ARRAY${state.arrays.length === 1 ? "" : "S"}`}</span>
        <span>{state.interactionMode === "move" ? "拖动目标魔方进行移动 · 滚轮缩放" : "拖动空白或魔方旋转视角 · 滚轮缩放"}</span>
      </footer>
    </main>
  );
}
