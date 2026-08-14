"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";

export type Rotation = { x: number; y: number };
export type CubeState = {
  shape: number[];
  seed: number;
  values: number[] | null;
  sourceName: string | null;
  hiddenLayers: number[];
  rotation: Rotation;
  zoom: number;
  spacing: number;
};

export type CubeStateSetter = (
  update: CubeState | ((current: CubeState) => CubeState),
) => void;

type ArrayLayout = {
  cubeCount: number;
  layers: number;
  rows: number;
  columns: number;
};

const faces = ["front", "back", "right", "left", "top", "bottom"];
const storageKey = "numbercube-state-v1";
const channelName = "numbercube-control";

export const defaultRotation: Rotation = { x: -24, y: -38 };
export const defaultCubeState: CubeState = {
  shape: [3, 3, 3],
  seed: 11,
  values: null,
  sourceName: null,
  hiddenLayers: [],
  rotation: { ...defaultRotation },
  zoom: 0.95,
  spacing: 64,
};

export function parseShapeInput(input: string) {
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

type ParsedJsonArray = { shape: number[]; values: number[] };

export function parseJsonArrayData(value: unknown): ParsedJsonArray | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "JSON 顶层必须是一个数组。" };
  }

  const walk = (item: unknown, depth = 0): ParsedJsonArray | { error: string } => {
    if (typeof item === "number") {
      return Number.isFinite(item)
        ? { shape: [], values: [item] }
        : { error: "数组中只能包含有限数字。" };
    }
    if (!Array.isArray(item)) {
      return { error: "数组中只能包含数字或嵌套数组。" };
    }
    if (depth >= 4) {
      return { error: "目前仅支持 1—4 维 JSON 数组。" };
    }
    if (item.length === 0) {
      return { error: "每个维度都必须至少包含 1 个元素。" };
    }
    if (item.length > 6) {
      return { error: "每个维度目前支持 1—6，避免一次生成过多单元。" };
    }

    const children = item.map((child) => walk(child, depth + 1));
    const failed = children.find((child) => "error" in child);
    if (failed && "error" in failed) return failed;

    const parsedChildren = children as ParsedJsonArray[];
    const childShape = parsedChildren[0].shape;
    const hasRaggedRows = parsedChildren.some(
      (child) => child.shape.length !== childShape.length
        || child.shape.some((size, index) => size !== childShape[index]),
    );
    if (hasRaggedRows) {
      return { error: "JSON 必须是规则的矩形数组，各行长度需要一致。" };
    }

    return {
      shape: [item.length, ...childShape],
      values: parsedChildren.flatMap((child) => child.values),
    };
  };

  const parsed = walk(value);
  if ("error" in parsed) return parsed;
  if (parsed.shape.length < 1 || parsed.shape.length > 4) {
    return { error: "目前仅支持 1—4 维 JSON 数组。" };
  }
  if (parsed.shape.some((size) => size > 6)) {
    return { error: "每个维度目前支持 1—6，避免一次生成过多单元。" };
  }
  if (parsed.values.length > 216) {
    return { error: "单元总数不能超过 216。" };
  }

  return parsed;
}

export function getArrayLayout(shape: number[]): ArrayLayout {
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

export function formatShape(shape: number[]) {
  return shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(", ")})`;
}

export function getFitZoom(shape: number[]) {
  const { cubeCount, layers, rows, columns } = getArrayLayout(shape);
  const gridColumns = shape.length === 4 ? Math.min(cubeCount, 3) : 1;
  const gridRows = Math.ceil(cubeCount / gridColumns);
  const width = gridColumns * columns + (gridColumns - 1) * 1.5;
  const height = gridRows * rows + (gridRows - 1) * 1.5;
  const projectedSize = Math.max(width + layers * 0.7, height + layers * 0.25);
  return Math.min(0.95, Math.max(0.58, 7.4 / projectedSize));
}

function normalizeState(value: unknown): CubeState {
  if (!value || typeof value !== "object") return defaultCubeState;

  const stored = value as Partial<CubeState>;
  const shape = Array.isArray(stored.shape)
    && stored.shape.length >= 1
    && stored.shape.length <= 4
    && stored.shape.every((size) => Number.isInteger(size) && size >= 1 && size <= 6)
    && stored.shape.reduce((total, size) => total * size, 1) <= 216
      ? stored.shape
      : defaultCubeState.shape;
  const { layers } = getArrayLayout(shape);
  const hiddenLayers = Array.isArray(stored.hiddenLayers)
    ? Array.from(new Set(stored.hiddenLayers.filter(
      (layer) => Number.isInteger(layer) && layer >= 0 && layer < layers,
    )))
    : [];
  const rotation = stored.rotation
    && Number.isFinite(stored.rotation.x)
    && Number.isFinite(stored.rotation.y)
      ? stored.rotation
      : defaultRotation;
  const totalCells = shape.reduce((total, size) => total * size, 1);
  const values = Array.isArray(stored.values)
    && stored.values.length === totalCells
    && stored.values.every((item) => typeof item === "number" && Number.isFinite(item))
      ? stored.values
      : null;
  const sourceName = values && typeof stored.sourceName === "string"
    ? stored.sourceName.slice(0, 120)
    : null;

  return {
    shape,
    seed: Number.isFinite(stored.seed) ? Number(stored.seed) : defaultCubeState.seed,
    values,
    sourceName,
    hiddenLayers,
    rotation,
    zoom: Number.isFinite(stored.zoom)
      ? Math.min(1.3, Math.max(0.58, Number(stored.zoom)))
      : getFitZoom(shape),
    spacing: Number.isFinite(stored.spacing)
      ? Math.min(82, Math.max(58, Number(stored.spacing)))
      : defaultCubeState.spacing,
  };
}

function readStoredState() {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? normalizeState(JSON.parse(stored)) : defaultCubeState;
  } catch {
    return defaultCubeState;
  }
}

export function useCubeState(): [CubeState, CubeStateSetter] {
  const [state, setState] = useState<CubeState>(defaultCubeState);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    queueMicrotask(() => setState(readStoredState()));

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return;
      try {
        setState(normalizeState(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed storage from older versions.
      }
    };

    window.addEventListener("storage", handleStorage);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel(channelName);
      channel.current.onmessage = (event) => setState(normalizeState(event.data));
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel.current?.close();
      channel.current = null;
    };
  }, []);

  const updateState = useCallback<CubeStateSetter>((update) => {
    setState((current) => {
      const next = normalizeState(typeof update === "function" ? update(current) : update);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
        channel.current?.postMessage(next);
      } catch {
        // The current page still updates when browser storage is unavailable.
      }
      return next;
    });
  }, []);

  return [state, updateState];
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

function formatImportedValue(value: number) {
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(2);
  }
  return String(Number(value.toFixed(3)));
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span>NumberCube</span>
    </div>
  );
}

export function ShapeBadge({ shape }: { shape: number[] }) {
  const shapeLabel = shape.join(" × ");
  return (
    <div className="matrix-badge" aria-label={`${shapeLabel} 数组`}>
      <span className="status-dot" />
      {shapeLabel}
    </div>
  );
}

export function CubeStage({ state, setState }: { state: CubeState; setState: CubeStateSetter }) {
  const drag = useRef({ active: false, x: 0, y: 0 });
  const dimensionCount = state.shape.length;
  const { cubeCount, layers, rows, columns } = getArrayLayout(state.shape);
  const totalCells = state.shape.reduce((total, size) => total * size, 1);
  const visibleCells = totalCells - state.hiddenLayers.length * cubeCount * rows * columns;
  const shapeLabel = state.shape.join(" × ");
  const formattedShape = formatShape(state.shape);
  const cubeGridColumns = dimensionCount === 4 ? Math.min(cubeCount, 3) : 1;
  const cubeGridRows = Math.ceil(cubeCount / cubeGridColumns);
  const hiddenLayers = useMemo(() => new Set(state.hiddenLayers), [state.hiddenLayers]);

  const cells = useMemo(
    () => Array.from({ length: totalCells }, (_, index) => {
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

      const x = column - (columns - 1) / 2;
      let y = row - (rows - 1) / 2;
      let z = (layers - 1) / 2 - layer;

      if (dimensionCount === 1) {
        y = 0;
        z = 0;
      } else if (dimensionCount === 2) {
        z = 0;
      }

      return {
        key: `${cube}-${layer}-${row}-${column}`,
        cube,
        layer,
        value: state.values
          ? formatImportedValue(state.values[index])
          : formatValue(createValue(index, state.seed)),
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
      rows,
      state.seed,
      state.values,
      totalCells,
    ],
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
    setState((current) => ({
      ...current,
      rotation: {
        x: current.rotation.x - deltaY * 0.35,
        y: current.rotation.y + deltaX * 0.35,
      },
    }));
  };

  const changeZoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setState((current) => ({
      ...current,
      zoom: Math.min(1.3, Math.max(0.58, current.zoom - event.deltaY * 0.001)),
    }));
  };

  return (
    <div className="stage-card">
      <div className="stage-label">
        ARRAY / SHAPE {formattedShape}{dimensionCount === 4 ? ` · ${cubeCount} CUBES` : ""}
        {state.values ? " · JSON" : ""}
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
          style={{
            transform: `scale(${state.zoom}) rotateX(${state.rotation.x}deg) rotateY(${state.rotation.y}deg)`,
          }}
        >
          {cells.map((cell) => (
            <div
              className={hiddenLayers.has(cell.layer) ? "number-cell is-layer-hidden" : "number-cell"}
              data-cube={cell.cube}
              data-layer={cell.layer}
              data-value={cell.value}
              key={cell.key}
              style={{
                transform: `translate3d(${cell.x * state.spacing}px, ${cell.y * state.spacing}px, ${cell.z * state.spacing}px)`,
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
  );
}
