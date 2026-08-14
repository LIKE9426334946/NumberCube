"use client";

import { Brand, CubeStage, formatShape, ShapeBadge, useCubeState } from "./cube";

export default function Home() {
  const [state, setState] = useCubeState();

  return (
    <main className="page-shell display-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <a className="page-link" href="/control">控制页</a>
          <ShapeBadge shape={state.shape} />
        </div>
      </header>

      <section className="display-workspace">
        <CubeStage state={state} setState={setState} />
      </section>

      <footer>
        <span>{`a.shape = ${formatShape(state.shape)}`}</span>
        <span>拖动旋转 · 滚轮缩放</span>
      </footer>
    </main>
  );
}
