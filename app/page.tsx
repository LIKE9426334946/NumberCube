"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent, WheelEvent } from "react";

type Rotation = { x: number; y: number };
type Shape = [number, number, number];
type DataMode = "randn" | "rand" | "zeros" | "ones";
type MatrixState = { shape: Shape; mode: DataMode; seed: number };

const faces = ["front", "back", "right", "left", "top", "bottom"];
const defaultExpression = "a=np.random.randn(3,3,3)";

function parseNumpyExpression(expression: string) {
  const pattern = /^(?:[a-zA-Z_]\w*\s*=\s*)?np\.(?:(random\.)?(randn|rand)|(zeros|ones))\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/;
  const match = expression.trim().match(pattern);

  if (!match) {
    return { error: "请输入三维 NumPy 表达式，例如 a=np.random.randn(3,4,5)" };
  }

  const shape = [Number(match[4]), Number(match[5]), Number(match[6])] as Shape;
  if (shape.some((size) => size < 1 || size > 6)) {
    return { error: "每个维度目前支持 1—6，避免一次生成过多单元。" };
  }
  if (shape[0] * shape[1] * shape[2] > 216) {
    return { error: "单元总数不能超过 216。" };
  }

  return {
    shape,
    mode: (match[2] ?? match[3]) as DataMode,
  };
}

function unitRandom(index: number, seed: number, offset: number) {
  const raw = Math.sin((index + 1) * (12.9898 + offset) + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function createValue(index: number, matrix: MatrixState) {
  if (matrix.mode === "zeros") return 0;
  if (matrix.mode === "ones") return 1;

  const first = Math.max(unitRandom(index, matrix.seed, 0.31), 0.0001);
  if (matrix.mode === "rand") return first;

  const second = unitRandom(index, matrix.seed, 1.79);
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function formatValue(value: number) {
  return (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);
}

export default function Home() {
  const [expression, setExpression] = useState(defaultExpression);
  const [matrix, setMatrix] = useState<MatrixState>({
    shape: [3, 3, 3],
    mode: "randn",
    seed: 11,
  });
  const [error, setError] = useState("");
  const [hiddenLayers, setHiddenLayers] = useState<Set<number>>(new Set());
  const [rotation, setRotation] = useState<Rotation>({ x: -24, y: 38 });
  const [zoom, setZoom] = useState(0.95);
  const [spacing, setSpacing] = useState(64);
  const drag = useRef({ active: false, x: 0, y: 0 });

  const [layers, rows, columns] = matrix.shape;
  const totalCells = layers * rows * columns;
  const visibleCells = totalCells - hiddenLayers.size * rows * columns;
  const shapeLabel = matrix.shape.join(" × ");

  const cells = useMemo(
    () =>
      Array.from({ length: totalCells }, (_, index) => {
        const layer = Math.floor(index / (rows * columns));
        const remainder = index % (rows * columns);
        const row = Math.floor(remainder / columns);
        const column = remainder % columns;

        return {
          key: `${layer}-${row}-${column}`,
          layer,
          value: formatValue(createValue(index, matrix)),
          x: column - (columns - 1) / 2,
          y: row - (rows - 1) / 2,
          // a[0, :, :] starts at the left-rear slice in the default view.
          z: layer - (layers - 1) / 2,
        };
      }),
    [columns, layers, matrix, rows, totalCells],
  );

  const generateMatrix = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseNumpyExpression(expression);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    setMatrix((current) => ({
      shape: parsed.shape,
      mode: parsed.mode,
      seed: current.seed + 1,
    }));
    setHiddenLayers(new Set());
    setError("");
    setZoom(Math.max(...parsed.shape) >= 6 ? 0.78 : 0.95);
  };

  const toggleLayer = (layer: number) => {
    setHiddenLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

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

  const changeZoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) =>
      Math.min(1.3, Math.max(0.58, current - event.deltaY * 0.001)),
    );
  };

  const resetView = () => {
    setRotation({ x: -24, y: 38 });
    setZoom(0.95);
    setSpacing(64);
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>NumberCube</span>
        </div>
        <div className="matrix-badge" aria-label={`${shapeLabel} 三维数组`}>
          <span className="status-dot" />
          {shapeLabel}
        </div>
      </header>

      <section className="workspace">
        <div className="intro">
          <p className="eyebrow">NUMPY 3D VISUALIZER</p>
          <h1>把数组，<br />变成立方体。</h1>
          <p className="description">
            输入 NumPy 风格的三维数组表达式，生成对应形状和随机数据，并按切片隐藏不同的矩阵面。
          </p>

          <form className="numpy-form" onSubmit={generateMatrix}>
            <label htmlFor="numpy-expression">NumPy 表达式</label>
            <div className="expression-row">
              <input
                id="numpy-expression"
                value={expression}
                onChange={(event) => setExpression(event.target.value)}
                spellCheck="false"
                autoComplete="off"
                aria-describedby="expression-status"
              />
              <button type="submit">生成</button>
            </div>
            <p id="expression-status" className={error ? "form-status is-error" : "form-status"} aria-live="polite">
              {error || `shape = (${matrix.shape.join(", ")}) · dtype = float64 · ${totalCells} 个单元`}
            </p>
          </form>

          <div className="slice-panel">
            <div className="panel-heading">
              <span>矩阵面 / 第一个维度（左后 → 右前）</span>
              {hiddenLayers.size > 0 && (
                <button type="button" onClick={() => setHiddenLayers(new Set())}>全部显示</button>
              )}
            </div>
            <div className="slice-buttons">
              {Array.from({ length: layers }, (_, layer) => {
                const hidden = hiddenLayers.has(layer);
                return (
                  <button
                    type="button"
                    className={hidden ? "slice-button is-hidden" : "slice-button"}
                    aria-pressed={hidden}
                    onClick={() => toggleLayer(layer)}
                    key={layer}
                  >
                    <span>第 {layer + 1} 面</span>
                    <code>a[{layer}, :, :]</code>
                    <small>{hidden ? "已隐藏" : "显示中"}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="controls" aria-label="视图控制">
            <label className="spacing-control">
              <span>单元间距</span>
              <input
                type="range"
                min="58"
                max="82"
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
          <div className="stage-label">ARRAY / SHAPE ({matrix.shape.join(", ")})</div>
          <div
            className="cube-stage"
            onPointerDown={startDrag}
            onPointerMove={moveCube}
            onPointerUp={() => { drag.current.active = false; }}
            onPointerCancel={() => { drag.current.active = false; }}
            onWheel={changeZoom}
            role="img"
            aria-label={`可旋转的 ${shapeLabel} NumPy 三维数组，共 ${totalCells} 个数据单元`}
          >
            <div
              className="cube-matrix"
              style={{ transform: `scale(${zoom}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}
            >
              {cells.map((cell) => (
                <div
                  className={hiddenLayers.has(cell.layer) ? "number-cell is-layer-hidden" : "number-cell"}
                  data-layer={cell.layer}
                  data-value={cell.value}
                  key={cell.key}
                  style={{
                    transform: `translate3d(${cell.x * spacing}px, ${cell.y * spacing}px, ${cell.z * spacing}px)`,
                  }}
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
          <div className="cell-count">
            <strong>{visibleCells}</strong>
            <span>VISIBLE / {totalCells} CELLS</span>
          </div>
        </div>
      </section>

      <footer>
        <span>{`a.shape = (${matrix.shape.join(", ")})`}</span>
        <span>隐藏面保留透明轮廓</span>
      </footer>
    </main>
  );
}
