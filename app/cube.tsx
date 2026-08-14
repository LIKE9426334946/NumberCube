"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, WheelEvent } from "react";

export type Rotation = { x: number; y: number };
export type Position = { x: number; y: number };
export type InteractionMode = "rotate" | "move";

export type ArrayItem = {
  id: string;
  shape: number[];
  seed: number;
  values: number[] | null;
  sourceName: string | null;
  hiddenLayers: number[];
  sliceExpression: string;
  highlightedIndices: number[];
  position: Position;
};

export type CubeState = {
  arrays: ArrayItem[];
  activeArrayId: string;
  interactionMode: InteractionMode;
  frontNumbersOnly: boolean;
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
const defaultArrayId = "array-1";

export const defaultRotation: Rotation = { x: -24, y: -38 };

export function createArrayItem(
  shape: number[],
  seed: number,
  options: {
    id?: string;
    values?: number[] | null;
    sourceName?: string | null;
    position?: Position;
  } = {},
): ArrayItem {
  return {
    id: options.id ?? `array-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    shape: [...shape],
    seed,
    values: options.values ?? null,
    sourceName: options.sourceName ?? null,
    hiddenLayers: [],
    sliceExpression: "",
    highlightedIndices: [],
    position: options.position ?? { x: 0, y: 0 },
  };
}

const defaultArray = createArrayItem([3, 3, 3], 11, { id: defaultArrayId });

export const defaultCubeState: CubeState = {
  arrays: [defaultArray],
  activeArrayId: defaultArrayId,
  interactionMode: "rotate",
  frontNumbersOnly: false,
  rotation: { ...defaultRotation },
  zoom: 0.95,
  spacing: 64,
};

export function getActiveArray(state: CubeState) {
  return state.arrays.find((item) => item.id === state.activeArrayId) ?? state.arrays[0];
}

export function arrangeArrayPositions(items: ArrayItem[]) {
  const columns = Math.min(3, items.length);
  const rows = Math.ceil(items.length / columns);

  return items.map((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, items.length - row * columns);
    return {
      ...item,
      position: {
        x: (column - (itemsInRow - 1) / 2) * 300,
        y: (row - (rows - 1) / 2) * 250,
      },
    };
  });
}

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

type ParsedSlice = { expression: string; indices: number[] };

export function parseSliceExpression(input: string, shape: number[]): ParsedSlice | { error: string } {
  const original = input.trim().replaceAll("，", ",");
  if (!original) return { error: "请输入切片，例如 0:2,0:2,0:2。" };

  let arrayName = "a";
  let body = original;
  const bracketStart = original.indexOf("[");
  if (bracketStart >= 0) {
    const prefix = original.slice(0, bracketStart).trim();
    if (!/^[A-Za-z_]\w*$/.test(prefix) || !original.endsWith("]")) {
      return { error: "切片格式不正确，请输入 data[0:2,0:2] 或 0:2,0:2。" };
    }
    arrayName = prefix;
    body = original.slice(bracketStart + 1, -1).trim();
  }
  if (!body || body.includes("[") || body.includes("]")) {
    return { error: "切片格式不正确，请输入 data[0:2,0:2] 或 0:2,0:2。" };
  }

  const tokens = body.split(",").map((token) => token.trim());
  if (tokens.some((token) => !token)) {
    return { error: "每个维度都需要填写切片，未限制的维度请使用 :。" };
  }
  if (tokens.length > shape.length) {
    return { error: `当前是 ${shape.length} 维数组，切片不能超过 ${shape.length} 个维度。` };
  }
  while (tokens.length < shape.length) tokens.push(":");

  const selections: number[][] = [];
  for (let dimension = 0; dimension < shape.length; dimension += 1) {
    const token = tokens[dimension];
    const size = shape[dimension];

    if (!token.includes(":")) {
      if (!/^-?\d+$/.test(token)) return { error: `第 ${dimension + 1} 维格式不正确。` };
      const rawIndex = Number(token);
      const index = rawIndex < 0 ? size + rawIndex : rawIndex;
      if (index < 0 || index >= size) return { error: `第 ${dimension + 1} 维索引超出范围。` };
      selections.push([index]);
      continue;
    }

    const parts = token.split(":");
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => part && !/^-?\d+$/.test(part))) {
      return { error: `第 ${dimension + 1} 维切片格式不正确。` };
    }
    const step = parts[2] ? Number(parts[2]) : 1;
    if (step <= 0) return { error: "目前切片步长需要是正整数。" };

    const normalizeBound = (part: string, fallback: number) => {
      if (!part) return fallback;
      const value = Number(part);
      return Math.min(size, Math.max(0, value < 0 ? size + value : value));
    };
    const start = normalizeBound(parts[0], 0);
    const stop = normalizeBound(parts[1], size);
    const indices: number[] = [];
    for (let index = start; index < stop; index += step) indices.push(index);
    selections.push(indices);
  }

  let indices = [0];
  selections.forEach((selection, dimension) => {
    indices = indices.flatMap((base) => selection.map((index) => base * shape[dimension] + index));
  });
  if (indices.length === 0) return { error: "这个切片没有选中任何数据单元。" };

  return { expression: `${arrayName}[${tokens.join(", ")}]`, indices };
}

export type ParsedJsonArray = { shape: number[]; values: number[] };

export function parseJsonArrayData(value: unknown): ParsedJsonArray | { error: string } {
  if (!Array.isArray(value)) return { error: "JSON 顶层必须是一个数组。" };

  const walk = (item: unknown, depth = 0): ParsedJsonArray | { error: string } => {
    if (typeof item === "number") {
      return Number.isFinite(item) ? { shape: [], values: [item] } : { error: "数组中只能包含有限数字。" };
    }
    if (!Array.isArray(item)) return { error: "数组中只能包含数字或嵌套数组。" };
    if (depth >= 4) return { error: "目前仅支持 1—4 维 JSON 数组。" };
    if (item.length === 0) return { error: "每个维度都必须至少包含 1 个元素。" };
    if (item.length > 6) return { error: "每个维度目前支持 1—6，避免一次生成过多单元。" };

    const children = item.map((child) => walk(child, depth + 1));
    const failed = children.find((child) => "error" in child);
    if (failed && "error" in failed) return failed;

    const parsedChildren = children as ParsedJsonArray[];
    const childShape = parsedChildren[0].shape;
    if (parsedChildren.some((child) => child.shape.length !== childShape.length
      || child.shape.some((size, index) => size !== childShape[index]))) {
      return { error: "JSON 必须是规则的矩形数组，各行长度需要一致。" };
    }

    return {
      shape: [item.length, ...childShape],
      values: parsedChildren.flatMap((child) => child.values),
    };
  };

  const parsed = walk(value);
  if ("error" in parsed) return parsed;
  if (parsed.shape.length < 1 || parsed.shape.length > 4) return { error: "目前仅支持 1—4 维 JSON 数组。" };
  if (parsed.shape.some((size) => size > 6)) return { error: "每个维度目前支持 1—6，避免一次生成过多单元。" };
  if (parsed.values.length > 216) return { error: "单元总数不能超过 216。" };
  return parsed;
}

export function getArrayLayout(shape: number[]): ArrayLayout {
  const [first = 1, second = 1, third = 1, fourth = 1] = shape;
  if (shape.length === 1) return { cubeCount: 1, layers: 1, rows: 1, columns: first };
  if (shape.length === 2) return { cubeCount: 1, layers: 1, rows: first, columns: second };
  if (shape.length === 3) return { cubeCount: 1, layers: first, rows: second, columns: third };
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
  return Math.min(0.95, Math.max(0.48, 7.4 / projectedSize));
}

function validShape(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= 4
    && value.every((size) => Number.isInteger(size) && size >= 1 && size <= 6)
    && value.reduce((total, size) => total * size, 1) <= 216;
}

function normalizeArrayItem(value: unknown, index: number, usedIds: Set<string>): ArrayItem | null {
  if (!value || typeof value !== "object") return null;
  const stored = value as Partial<ArrayItem>;
  if (!validShape(stored.shape)) return null;

  const shape = stored.shape;
  const { layers } = getArrayLayout(shape);
  const totalCells = shape.reduce((total, size) => total * size, 1);
  const values = Array.isArray(stored.values)
    && stored.values.length === totalCells
    && stored.values.every((item) => typeof item === "number" && Number.isFinite(item))
      ? stored.values
      : null;
  const hiddenLayers = Array.isArray(stored.hiddenLayers)
    ? Array.from(new Set(stored.hiddenLayers.filter(
      (layer) => Number.isInteger(layer) && layer >= 0 && layer < layers,
    )))
    : [];
  const highlightedIndices = Array.isArray(stored.highlightedIndices)
    ? Array.from(new Set(stored.highlightedIndices.filter(
      (cellIndex) => Number.isInteger(cellIndex) && cellIndex >= 0 && cellIndex < totalCells,
    )))
    : [];
  let id = typeof stored.id === "string" && /^[\w-]{1,80}$/.test(stored.id)
    ? stored.id
    : `array-${index + 1}`;
  if (usedIds.has(id)) id = `${id}-${index + 1}`;
  usedIds.add(id);

  return {
    id,
    shape,
    seed: Number.isFinite(stored.seed) ? Number(stored.seed) : 11 + index,
    values,
    sourceName: values && typeof stored.sourceName === "string" ? stored.sourceName.slice(0, 120) : null,
    hiddenLayers,
    sliceExpression: highlightedIndices.length > 0 && typeof stored.sliceExpression === "string"
      ? stored.sliceExpression.slice(0, 160)
      : "",
    highlightedIndices,
    position: stored.position
      && Number.isFinite(stored.position.x)
      && Number.isFinite(stored.position.y)
        ? {
            x: Math.min(1200, Math.max(-1200, Number(stored.position.x))),
            y: Math.min(800, Math.max(-800, Number(stored.position.y))),
          }
        : { x: 0, y: 0 },
  };
}

function normalizeState(value: unknown): CubeState {
  if (!value || typeof value !== "object") return defaultCubeState;
  const stored = value as Partial<CubeState> & Partial<ArrayItem>;
  const usedIds = new Set<string>();
  let arrays = Array.isArray(stored.arrays)
    ? stored.arrays
        .slice(0, 8)
        .map((item, index) => normalizeArrayItem(item, index, usedIds))
        .filter((item): item is ArrayItem => item !== null)
    : [];

  if (arrays.length === 0 && validShape(stored.shape)) {
    const migrated = normalizeArrayItem({
      id: defaultArrayId,
      shape: stored.shape,
      seed: stored.seed,
      values: stored.values,
      sourceName: stored.sourceName,
      hiddenLayers: stored.hiddenLayers,
      sliceExpression: stored.sliceExpression,
      highlightedIndices: stored.highlightedIndices,
      position: { x: 0, y: 0 },
    }, 0, usedIds);
    if (migrated) arrays = [migrated];
  }
  if (arrays.length === 0) arrays = [createArrayItem([3, 3, 3], 11, { id: defaultArrayId })];

  const activeArrayId = typeof stored.activeArrayId === "string"
    && arrays.some((item) => item.id === stored.activeArrayId)
      ? stored.activeArrayId
      : arrays[0].id;
  const rotation = stored.rotation
    && Number.isFinite(stored.rotation.x)
    && Number.isFinite(stored.rotation.y)
      ? stored.rotation
      : defaultRotation;

  return {
    arrays,
    activeArrayId,
    interactionMode: stored.interactionMode === "move" ? "move" : "rotate",
    frontNumbersOnly: stored.frontNumbersOnly === true,
    rotation,
    zoom: Number.isFinite(stored.zoom)
      ? Math.min(1.3, Math.max(0.48, Number(stored.zoom)))
      : getFitZoom(arrays[0].shape),
    spacing: Number.isFinite(stored.spacing)
      ? Math.min(82, Math.max(58, Number(stored.spacing)))
      : 64,
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
      try { setState(normalizeState(JSON.parse(event.newValue))); } catch { /* Ignore malformed data. */ }
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
      } catch { /* The current page still updates without storage. */ }
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
  if (Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) return value.toExponential(2);
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

export function SceneBadge({ state }: { state: CubeState }) {
  const active = getActiveArray(state);
  return (
    <div className="matrix-badge" aria-label={`${state.arrays.length} 个数组，当前形状 ${active.shape.join(" × ")}`}>
      <span className="status-dot" />
      {state.arrays.length > 1 ? `${state.arrays.length} ARRAYS` : active.shape.join(" × ")}
    </div>
  );
}

export function InteractionModeSwitch({ state, setState }: { state: CubeState; setState: CubeStateSetter }) {
  return (
    <div className="mode-switch" aria-label="鼠标操作模式">
      <button
        type="button"
        className={state.interactionMode === "rotate" ? "is-active" : ""}
        aria-pressed={state.interactionMode === "rotate"}
        onClick={() => setState((current) => ({ ...current, interactionMode: "rotate" }))}
      >
        <span aria-hidden="true">↻</span>旋转视角
      </button>
      <button
        type="button"
        className={state.interactionMode === "move" ? "is-active" : ""}
        aria-pressed={state.interactionMode === "move"}
        onClick={() => setState((current) => ({ ...current, interactionMode: "move" }))}
      >
        <span aria-hidden="true">✥</span>移动魔方
      </button>
    </div>
  );
}

function ArrayObject({ item, state }: { item: ArrayItem; state: CubeState }) {
  const dimensionCount = item.shape.length;
  const { cubeCount, layers, rows, columns } = getArrayLayout(item.shape);
  const totalCells = item.shape.reduce((total, size) => total * size, 1);
  const cubeGridColumns = dimensionCount === 4 ? Math.min(cubeCount, 3) : 1;
  const cubeGridRows = Math.ceil(cubeCount / cubeGridColumns);
  const hiddenLayers = useMemo(() => new Set(item.hiddenLayers), [item.hiddenLayers]);
  const highlightedIndices = useMemo(() => new Set(item.highlightedIndices), [item.highlightedIndices]);

  const cells = useMemo(() => Array.from({ length: totalCells }, (_, index) => {
    const cubeSize = layers * rows * columns;
    const cube = Math.floor(index / cubeSize);
    const cubeRemainder = index % cubeSize;
    const layer = Math.floor(cubeRemainder / (rows * columns));
    const remainder = cubeRemainder % (rows * columns);
    const row = Math.floor(remainder / columns);
    const column = remainder % columns;
    const cubeGridRow = Math.floor(cube / cubeGridColumns);
    const cubeGridColumn = cube % cubeGridColumns;
    const cubesInThisRow = Math.min(cubeGridColumns, cubeCount - cubeGridRow * cubeGridColumns);
    const cubeOffsetX = dimensionCount === 4
      ? (cubeGridColumn - (cubesInThisRow - 1) / 2) * (columns + 1.5)
      : 0;
    const cubeOffsetY = dimensionCount === 4
      ? (cubeGridRow - (cubeGridRows - 1) / 2) * (rows + 1.5)
      : 0;
    const x = column - (columns - 1) / 2;
    let y = row - (rows - 1) / 2;
    let z = (layers - 1) / 2 - layer;
    if (dimensionCount === 1) { y = 0; z = 0; }
    else if (dimensionCount === 2) z = 0;

    return {
      key: `${cube}-${layer}-${row}-${column}`,
      index,
      cube,
      layer,
      value: item.values ? formatImportedValue(item.values[index]) : formatValue(createValue(index, item.seed)),
      x: x + cubeOffsetX,
      y: y + cubeOffsetY,
      z,
    };
  }), [columns, cubeCount, cubeGridColumns, cubeGridRows, dimensionCount, item.seed, item.values, layers, rows, totalCells]);

  const labelOffset = (Math.max(rows, layers) * state.spacing * state.zoom) / 2 + 52;
  const wrapperStyle = {
    transform: `translate3d(${item.position.x - 28}px, ${item.position.y - 28}px, 0)`,
    "--array-label-offset": `${labelOffset}px`,
  } as CSSProperties;

  return (
    <div
      className={`array-object${state.activeArrayId === item.id ? " is-active" : ""}`}
      data-array-id={item.id}
      data-source-name={item.sourceName ?? "随机数组"}
      style={wrapperStyle}
    >
      <div className="array-caption">
        <span>{item.sourceName ?? "随机数组"}</span>
        <small>{formatShape(item.shape)}</small>
      </div>
      <div
        className="cube-matrix"
        style={{ transform: `scale(${state.zoom}) rotateX(${state.rotation.x}deg) rotateY(${state.rotation.y}deg)` }}
      >
        {cells.map((cell) => (
          <div
            className={[
              "number-cell",
              hiddenLayers.has(cell.layer) ? "is-layer-hidden" : "",
              highlightedIndices.has(cell.index) ? "is-slice-selected" : "",
            ].filter(Boolean).join(" ")}
            data-index={cell.index}
            data-cube={cell.cube}
            data-layer={cell.layer}
            data-selected={highlightedIndices.has(cell.index) ? "true" : "false"}
            data-value={cell.value}
            key={cell.key}
            style={{ transform: `translate3d(${cell.x * state.spacing}px, ${cell.y * state.spacing}px, ${cell.z * state.spacing}px)` }}
          >
            {faces.map((face) => (
              <div className={`cell-face ${face}`} data-face={face} key={face}>
                {(!state.frontNumbersOnly || face === "front") && <span>{cell.value}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CubeStage({ state, setState }: { state: CubeState; setState: CubeStateSetter }) {
  const drag = useRef<{ active: boolean; x: number; y: number; arrayId: string | null }>({
    active: false,
    x: 0,
    y: 0,
    arrayId: null,
  });
  const totalCells = state.arrays.reduce(
    (total, item) => total + item.shape.reduce((count, size) => count * size, 1),
    0,
  );
  const visibleCells = state.arrays.reduce((total, item) => {
    const { cubeCount, rows, columns } = getArrayLayout(item.shape);
    const itemCells = item.shape.reduce((count, size) => count * size, 1);
    return total + itemCells - item.hiddenLayers.length * cubeCount * rows * columns;
  }, 0);
  const selectedCells = state.arrays.reduce((total, item) => total + item.highlightedIndices.length, 0);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const arrayElement = target.closest<HTMLElement>("[data-array-id]");
    if (state.interactionMode === "move" && !arrayElement) return;
    const arrayId = state.interactionMode === "move" ? arrayElement?.dataset.arrayId ?? null : null;
    drag.current = { active: true, x: event.clientX, y: event.clientY, arrayId };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (arrayId && arrayId !== state.activeArrayId) {
      setState((current) => ({ ...current, activeArrayId: arrayId }));
    }
  };

  const moveScene = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const deltaX = event.clientX - drag.current.x;
    const deltaY = event.clientY - drag.current.y;
    const arrayId = drag.current.arrayId;
    drag.current = { active: true, x: event.clientX, y: event.clientY, arrayId };

    if (state.interactionMode === "move" && arrayId) {
      const bounds = event.currentTarget.getBoundingClientRect();
      const limitX = Math.max(120, bounds.width / 2 - 45);
      const limitY = Math.max(100, bounds.height / 2 - 45);
      setState((current) => ({
        ...current,
        arrays: current.arrays.map((item) => item.id === arrayId
          ? {
              ...item,
              position: {
                x: Math.min(limitX, Math.max(-limitX, item.position.x + deltaX)),
                y: Math.min(limitY, Math.max(-limitY, item.position.y + deltaY)),
              },
            }
          : item),
      }));
      return;
    }

    if (state.interactionMode === "rotate") {
      setState((current) => ({
        ...current,
        rotation: {
          x: current.rotation.x - deltaY * 0.35,
          y: current.rotation.y + deltaX * 0.35,
        },
      }));
    }
  };

  const stopDrag = () => { drag.current.active = false; drag.current.arrayId = null; };
  const changeZoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setState((current) => ({
      ...current,
      zoom: Math.min(1.3, Math.max(0.48, current.zoom - event.deltaY * 0.001)),
    }));
  };
  const autoArrange = () => setState((current) => ({
    ...current,
    arrays: arrangeArrayPositions(current.arrays),
  }));

  return (
    <div className="stage-card">
      <div className="stage-label">
        {state.arrays.length} {state.arrays.length === 1 ? "ARRAY" : "ARRAYS"} · {totalCells} CELLS
        {selectedCells > 0 ? ` · ${selectedCells} SELECTED` : ""}
      </div>
      <div className="stage-tools">
        <InteractionModeSwitch state={state} setState={setState} />
        {state.arrays.length > 1 && <button type="button" className="arrange-button" onClick={autoArrange}>自动排列</button>}
      </div>
      <div
        className={`cube-stage mode-${state.interactionMode}`}
        onPointerDown={startDrag}
        onPointerMove={moveScene}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onWheel={changeZoom}
        role="img"
        aria-label={`${state.arrays.length} 个可交互数字数组，共 ${totalCells} 个数据单元，当前为${state.interactionMode === "move" ? "移动魔方" : "旋转视角"}模式`}
      >
        <div className="scene-root">
          {state.arrays.map((item) => <ArrayObject item={item} state={state} key={item.id} />)}
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
