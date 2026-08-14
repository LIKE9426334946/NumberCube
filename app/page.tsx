"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent, WheelEvent } from "react";

type Rotation = { x: number; y: number };
type Shape = number[];
type MatrixState = { shape: Shape; seed: number };
type ArrayLayout = {
  cubeCount: number;
  layers: number;
  rows: number;
  columns: number;
};

const faces = ["front", "back", "right", "left", "top", "bottom"];
const defaultShape = "3,3,3";
const defaultRotation: Rotation = { x: -24, y: -38 };

function parseShapeInput(input: string) {
  const parts = input.trim().replaceAll("，", ",").split(",");

  if (parts.length < 1 || parts.length > 4 || parts.some((part) => !/^\d+$/.test(part.trim()))) {
    return { error: "请输入 1—4 个整数，例如 3、3,3、3,3,3 或 3,3,3,3。" };
  }

  const shape = parts.map((part) => Number(part.trim()));
  if (shape.some((size) => size < 1 || size > 6)) {
    return { error: "每个维度目前支持 1—6，避免一次生成过多单元。" };
  }
  if (shape.reduce((total, size) => total * size, 1) > 216) {
    return { error: "单元总数不能超过 216。" };
  }

  return { shape };
}

function getArrayLayout(shape: Shape): ArrayLayout {
  const [first = 1, second = 1, third = 1, fourth = 1] = shape;

  if (shape.length === 1) {
    return { cubeCount: 1, layers: 1, rows: 1, columns: first };
  }
  if (shape.length === 2) {
    return { cubeCount: 1, layers: 1, rows: first, columns: second };
  }
  if (shape.length === 3) {
    return { cubeCount: 1, layers: first, rows: second, columns: third };
  }
  return { cubeCount: first, layers: second, rows: third, columns: fourth };
}

function formatShape(shape: Shape) {
  return shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(", ")})`;
}

function getFitZoom(shape: Shape) {
  const { cubeCount, layers, rows, columns } = getArrayLayout(shape);
  const gridColumns = shape.length === 4 ? Math.min(cubeCount, 3) : 1;
  const gridRows = Math.ceil(cubeCount / gridColumns);
  const width = gridColumns * columns + (gridColumns - 1) * 1.5;
  const height = gridRows * rows + (gridRows - 1) * 1.5;
  const projectedSize = Math.max(width + layers * 0.7, height + layers * 0.25);
  return Math.min(0.95, Math.max(0.58, 7.4 / projectedSize));
}

function unitRandom(index: number, seed: number, offset: number) {
  const raw = Math.sin((index + 1) * (12.9898 + offset) + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function createValue(index: number, seed: number) {
  const first = Math.max(unitRandom(index, seed, 0.31), 0.0001);
  const second = unitRandom(index, seed, 1.79);
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function formatValue(value: number) {
  return (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);
}

export default function Home() {
  const [shapeInput, setShapeInput] = useState(defaultShape);
  const [matrix, setMatrix] = useState<MatrixState>({
    shape: [3, 3, 3],
    seed: 11,
  });
  const [error, setError] = useState("");
  const [hiddenLayers, setHiddenLayers] = useState<Set<number>>(new Set());
  const [rotation, setRotation] = useState<Rotation>({ ...defaultRotation });
  const [zoom, setZoom] = useState(0.95);
  const [spacing, setSpacing] = useState(64);
  const drag = useRef({ active: false, x: 0, y: 0 });

  const dimensionCount = matrix.shape.length;
  const { cubeCount, layers, rows, columns } = getArrayLayout(matrix.shape);
  const totalCells = matrix.shape.reduce((total, size) => total * size, 1);
  const visibleCells = totalCells - hiddenLayers.size * cubeCount * rows * columns;
  const shapeLabel = matrix.shape.join(" × ");
  const formattedShape = formatShape(matrix.shape);
  const cubeGridColumns = dimensionCount === 4 ? Math.min(cubeCount, 3) : 1;
  const cubeGridRows = Math.ceil(cubeCount / cubeGridColumns);

  const sliceHeading = dimensionCount === 1
    ? "一维数组 / 单行"
    : dimensionCount === 2
      ? "二维数组 / 单个平面"
      : dimensionCount === 3
        ? "矩阵面 / 第一个维度（左 → 右）"
        : "所有魔方的矩阵面 / 第二维（左 → 右）";

  const cells = useMemo(
    () =>
      Array.from({ length: totalCells }, (_, index) => {
        const cubeSize = layers * rows * columns;
        const cube = Math.floor(index / cubeSize);
        const cubeRemainder = index % cubeSize;
        const layer = Math.floor(cubeRemainder / (rows * columns));
        const remainder = cubeRemainder % (rows * columns);
        const row = Math.floor(remainder / columns);
        const column = remainder % columns;

        const cubeGridRow = Math.floor(cube / cubeGridColumns);
        const cubeGridColumn = cube % cubeGridColumns;
        const cubesInThisRow = Math.min(
          cubeGridColumns,
          cubeCount - cubeGridRow * cubeGridColumns,
        );
        const cubeOffsetX = dimensionCount === 4
          ? (cubeGridColumn - (cubesInThisRow - 1) / 2) * (columns + 1.5)
          : 0;
        const cubeOffsetY = dimensionCount === 4
          ? (cubeGridRow - (cubeGridRows - 1) / 2) * (rows + 1.5)
          : 0;

        // In the left-facing default view, a[0, :, :] sits at the visible
        // left-front side and later slices recede toward the right-rear.
        let x = column - (columns - 1) / 2;
        let y = row - (rows - 1) / 2;
        let z = (layers - 1) / 2 - layer;

        if (dimensionCount === 1) {
          x = column - (columns - 1) / 2;
          y = 0;
          z = 0;
        } else if (dimensionCount === 2) {
          x = column - (columns - 1) / 2;
          z = 0;
        }

        return {
          key: `${cube}-${layer}-${row}-${column}`,
          cube,
          layer,
          value: formatValue(createValue(index, matrix.seed)),
          x: x + cubeOffsetX,
          y: y + cubeOffsetY,
          z,
        };
      }),
    [
      columns,
      cubeCount,
      cubeGridColumns,
      cubeGridRows,
      dimensionCount,
      layers,
      matrix.seed,
      rows,
      totalCells,
    ],
  );

  const generateMatrix = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseShapeInput(shapeInput);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    setMatrix((current) => ({
      shape: parsed.shape,
      seed: current.seed + 1,
    }));
    setHiddenLayers(new Set());
    setError("");
    setZoom(getFitZoom(parsed.shape));
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
    setRotation({ ...defaultRotation });
    setZoom(getFitZoom(matrix.shape));
    setSpacing(64);
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>NumberCube</span>
        </div>
        <div className="matrix-badge" aria-label={`${shapeLabel} 数组`}>
          <span className="status-dot" />
          {shapeLabel}
        </div>
      </header>

      <section className="workspace">
        <div className="intro">
          <p className="eyebrow">NUMPY ARRAY VISUALIZER</p>
          <h1>把数组，<br />变成立方体。</h1>
          <p className="description">
            输入 1—4 维数组形状，生成一行方块、矩阵面、三维魔方或一组并排的魔方。
          </p>

          <form className="numpy-form" onSubmit={generateMatrix}>
            <label htmlFor="shape-input">数组形状</label>
            <div className="expression-row">
              <input
                id="shape-input"
                value={shapeInput}
                onChange={(event) => setShapeInput(event.target.value)}
                placeholder="3,3,3"
                spellCheck="false"
                autoComplete="off"
                aria-describedby="shape-status"
              />
              <button type="submit">生成</button>
            </div>
            <p id="shape-status" className={error ? "form-status is-error" : "form-status"} aria-live="polite">
              {error || `shape = ${formattedShape} · dtype = float64 · ${totalCells} 个单元`}
            </p>
          </form>

          <div className="slice-panel">
            <div className="panel-heading">
              <span>{sliceHeading}</span>
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
                    <span>{dimensionCount === 1 ? "第 1 行" : `第 ${layer + 1} 面`}</span>
                    <code>
                      {dimensionCount === 1
                        ? "a[:]"
                        : dimensionCount === 2
                          ? "a[:, :]"
                          : dimensionCount === 3
                            ? `a[${layer}, :, :]`
                            : `a[:, ${layer}, :, :]`}
                    </code>
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
          <div className="stage-label">
            ARRAY / SHAPE {formattedShape}{dimensionCount === 4 ? ` · ${cubeCount} CUBES` : ""}
          </div>
          <div
            className="cube-stage"
            onPointerDown={startDrag}
            onPointerMove={moveCube}
            onPointerUp={() => { drag.current.active = false; }}
            onPointerCancel={() => { drag.current.active = false; }}
            onWheel={changeZoom}
            role="img"
            aria-label={`可旋转的 ${shapeLabel} 数字数组，共 ${totalCells} 个数据单元`}
          >
            <div
              className="cube-matrix"
              style={{ transform: `scale(${zoom}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}
            >
              {cells.map((cell) => (
                <div
                  className={hiddenLayers.has(cell.layer) ? "number-cell is-layer-hidden" : "number-cell"}
                  data-cube={cell.cube}
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
        <span>{`a.shape = ${formattedShape}`}</span>
        <span>隐藏面保留透明轮廓</span>
      </footer>
    </main>
  );
}
