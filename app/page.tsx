"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";

type Rotation = { x: number; y: number };

const faces = ["front", "back", "right", "left", "top", "bottom"];

export default function Home() {
  const [rotation, setRotation] = useState<Rotation>({ x: -24, y: 38 });
  const [zoom, setZoom] = useState(1);
  const [spacing, setSpacing] = useState(70);
  const drag = useRef({ active: false, x: 0, y: 0 });

  const cells = useMemo(
    () =>
      Array.from({ length: 27 }, (_, index) => ({
        value: index + 1,
        x: (index % 3) - 1,
        y: Math.floor(index / 9) - 1,
        z: (Math.floor(index / 3) % 3) - 1,
      })),
    [],
  );

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { active: true, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveCube = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;

    const deltaX = event.clientX - drag.current.x;
    const deltaY = event.clientY - drag.current.y;
    drag.current = { active: true, x: event.clientX, y: event.clientY };
    setRotation((current) => ({
      x: current.x - deltaY * 0.35,
      y: current.y + deltaX * 0.35,
    }));
  };

  const stopDrag = () => {
    drag.current.active = false;
  };

  const changeZoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) =>
      Math.min(1.35, Math.max(0.72, current - event.deltaY * 0.001)),
    );
  };

  const resetView = () => {
    setRotation({ x: -24, y: 38 });
    setZoom(1);
    setSpacing(70);
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>NumberCube</span>
        </div>
        <div className="matrix-badge" aria-label="三乘三乘三矩阵">
          <span className="status-dot" />
          3 × 3 × 3
        </div>
      </header>

      <section className="workspace">
        <div className="intro">
          <p className="eyebrow">3D NUMBER MATRIX</p>
          <h1>旋转数据，<br />看见矩阵<br />内部。</h1>
          <p className="description">
            27 个数字单元组成一个三维矩阵。拖动立方体，从任意角度观察数字在空间中的位置。
          </p>

          <div className="controls" aria-label="视图控制">
            <label className="spacing-control">
              <span>单元间距</span>
              <input
                type="range"
                min="62"
                max="92"
                value={spacing}
                onChange={(event) => setSpacing(Number(event.target.value))}
                aria-label="调整单元间距"
              />
            </label>
            <button type="button" className="reset-button" onClick={resetView}>
              <span aria-hidden="true">↻</span>
              重置视角
            </button>
          </div>

          <div className="legend" aria-label="操作说明">
            <span><b className="mouse-icon" aria-hidden="true" />拖动旋转</span>
            <span><b className="wheel-icon" aria-hidden="true" />滚轮缩放</span>
          </div>
        </div>

        <div className="stage-card">
          <div className="stage-label">MATRIX / 27 CELLS</div>
          <div
            className="cube-stage"
            onPointerDown={startDrag}
            onPointerMove={moveCube}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            onWheel={changeZoom}
            role="img"
            aria-label="可旋转的三乘三乘三数字立方体，数字从一到二十七"
          >
            <div
              className="cube-matrix"
              style={{
                transform: `scale(${zoom}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
              }}
            >
              {cells.map((cell) => (
                <div
                  className="number-cell"
                  key={cell.value}
                  style={{
                    transform: `translate3d(${cell.x * spacing}px, ${cell.y * spacing}px, ${cell.z * spacing}px)`,
                    "--depth": cell.z + 1,
                  } as React.CSSProperties}
                >
                  {faces.map((face) => (
                    <div className={`cell-face ${face}`} key={face}>
                      <span>{cell.value}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="axis-guide" aria-hidden="true">
            <span className="axis axis-y">Y</span>
            <span className="axis axis-z">Z</span>
            <span className="axis axis-x">X</span>
          </div>
          <div className="cell-count"><strong>27</strong><span>DATA CELLS</span></div>
        </div>
      </section>

      <footer>
        <span>数字范围 01—27</span>
        <span>鼠标与触摸操作均可使用</span>
      </footer>
    </main>
  );
}
