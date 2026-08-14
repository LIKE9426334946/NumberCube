"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import {
  arrangeArrayPositions,
  Brand,
  createArrayItem,
  defaultRotation,
  formatShape,
  getActiveArray,
  getArrayLayout,
  getFitZoom,
  InteractionModeSwitch,
  parseJsonArrayData,
  parseShapeInput,
  parseSliceExpression,
  SceneBadge,
  useCubeState,
} from "../cube";
import type { ArrayItem } from "../cube";

const maxArrays = 8;

export default function ControlPage() {
  const [state, setState] = useCubeState();
  const activeArray = getActiveArray(state);
  const [shapeInput, setShapeInput] = useState(activeArray.shape.join(","));
  const [error, setError] = useState("");
  const [jsonStatus, setJsonStatus] = useState("");
  const [sliceInput, setSliceInput] = useState(activeArray.sliceExpression);
  const [sliceError, setSliceError] = useState("");
  const dimensionCount = activeArray.shape.length;
  const { layers } = getArrayLayout(activeArray.shape);
  const totalCells = activeArray.shape.reduce((total, size) => total * size, 1);
  const hiddenLayers = new Set(activeArray.hiddenLayers);

  useEffect(() => {
    queueMicrotask(() => {
      setShapeInput(activeArray.shape.join(","));
      setError("");
    });
  }, [activeArray.id, activeArray.shape]);

  useEffect(() => {
    queueMicrotask(() => {
      setSliceInput(activeArray.sliceExpression);
      setSliceError("");
    });
  }, [activeArray.id, activeArray.sliceExpression]);

  const updateActiveArray = (updater: (item: ArrayItem) => ArrayItem) => {
    setState((current) => ({
      ...current,
      arrays: current.arrays.map((item) => item.id === current.activeArrayId ? updater(item) : item),
    }));
  };

  const sliceHeading = dimensionCount === 1
    ? "一维数组 / 单行"
    : dimensionCount === 2
      ? "二维数组 / 单个平面"
      : dimensionCount === 3
        ? "矩阵面 / 第一个维度（左 → 右）"
        : "当前数组的矩阵面 / 第二维（左 → 右）";

  const generateMatrix = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseShapeInput(shapeInput);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    updateActiveArray((item) => ({
      ...item,
      shape: parsed.shape,
      seed: item.seed + 1,
      values: null,
      sourceName: null,
      hiddenLayers: [],
      sliceExpression: "",
      highlightedIndices: [],
    }));
    setState((current) => ({ ...current, zoom: getFitZoom(parsed.shape) }));
    setError("");
    setJsonStatus("");
    setSliceError("");
  };

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    try {
      const results = await Promise.all(files.map(async (file) => {
        if (file.size > 1_000_000) return { file, error: "文件超过 1 MB" };
        try {
          const parsed = parseJsonArrayData(JSON.parse(await file.text()));
          return "error" in parsed ? { file, error: parsed.error } : { file, parsed };
        } catch {
          return { file, error: "不是有效的 JSON" };
        }
      }));

      const valid = results.filter((result) => "parsed" in result);
      const invalid = results.filter((result) => "error" in result);
      const currentIsPlaceholder = state.arrays.length === 1
        && state.arrays[0].values === null
        && state.arrays[0].sourceName === null;
      const baseCount = currentIsPlaceholder ? 0 : state.arrays.length;
      const available = Math.max(0, maxArrays - baseCount);
      const accepted = valid.slice(0, available);

      if (accepted.length === 0) {
        const firstError = invalid[0];
        setJsonStatus(firstError && "error" in firstError
          ? `${firstError.file.name}：${firstError.error}`
          : `场景最多支持 ${maxArrays} 个数组。`);
        return;
      }

      const stamp = Date.now().toString(36);
      const additions = accepted.map((result, index) => {
        if (!("parsed" in result)) throw new Error("Unexpected JSON result");
        return createArrayItem(result.parsed.shape, Date.now() + index, {
          id: `json-${stamp}-${index + 1}`,
          values: result.parsed.values,
          sourceName: result.file.name,
        });
      });

      setState((current) => {
        const replacePlaceholder = current.arrays.length === 1
          && current.arrays[0].values === null
          && current.arrays[0].sourceName === null;
        const combined = [...(replacePlaceholder ? [] : current.arrays), ...additions].slice(0, maxArrays);
        const arranged = arrangeArrayPositions(combined);
        return {
          ...current,
          arrays: arranged,
          activeArrayId: additions[additions.length - 1].id,
          zoom: Math.min(...arranged.map((item) => getFitZoom(item.shape))),
        };
      });

      const skippedForLimit = Math.max(0, valid.length - accepted.length);
      const messages = [`已添加 ${accepted.length} 个 JSON 数组`];
      if (invalid.length > 0) messages.push(`${invalid.length} 个文件读取失败`);
      if (skippedForLimit > 0) messages.push(`${skippedForLimit} 个文件因数量上限未添加`);
      setJsonStatus(messages.join(" · "));
      setShapeInput(additions[additions.length - 1].shape.join(","));
      setError("");
      setSliceError("");
    } finally {
      event.target.value = "";
    }
  };

  const removeArray = (id: string) => {
    setState((current) => {
      if (current.arrays.length <= 1) return current;
      const arrays = current.arrays.filter((item) => item.id !== id);
      return {
        ...current,
        arrays,
        activeArrayId: current.activeArrayId === id ? arrays[0].id : current.activeArrayId,
      };
    });
  };

  const applySlice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseSliceExpression(sliceInput, activeArray.shape);
    if ("error" in parsed) {
      setSliceError(parsed.error);
      return;
    }

    updateActiveArray((item) => ({
      ...item,
      sliceExpression: parsed.expression,
      highlightedIndices: parsed.indices,
    }));
    setSliceInput(parsed.expression);
    setSliceError("");
  };

  const clearSlice = () => {
    updateActiveArray((item) => ({ ...item, sliceExpression: "", highlightedIndices: [] }));
    setSliceInput("");
    setSliceError("");
  };

  const toggleLayer = (layer: number) => {
    updateActiveArray((item) => {
      const next = new Set(item.hiddenLayers);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return { ...item, hiddenLayers: Array.from(next).sort((a, b) => a - b) };
    });
  };

  const resetView = () => {
    setState((current) => ({
      ...current,
      rotation: { ...defaultRotation },
      zoom: Math.min(...current.arrays.map((item) => getFitZoom(item.shape))),
      spacing: 64,
    }));
  };

  return (
    <main className="page-shell control-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <Link className="page-link" href="/">展示页</Link>
          <SceneBadge state={state} />
        </div>
      </header>

      <section className="control-workspace">
        <div className="intro control-intro">
          <p className="eyebrow">NUMPY ARRAY VISUALIZER</p>
          <h1>把数组，<br />变成立方体。</h1>
          <p className="description">
            可同时导入多个 JSON 数组，分别调整数据、切片和位置，并在展示页切换旋转或移动模式。
          </p>

          <section className="array-list-panel" aria-labelledby="array-list-title">
            <div className="array-list-heading">
              <div>
                <p id="array-list-title">场景中的数组</p>
                <span>先选择一个数组，再修改它的形状、切片或矩阵面。</span>
              </div>
              <strong>{state.arrays.length} / {maxArrays}</strong>
            </div>
            <div className="array-list">
              {state.arrays.map((item, index) => (
                <div className={`array-list-item${item.id === state.activeArrayId ? " is-active" : ""}`} key={item.id}>
                  <button
                    type="button"
                    className="array-select-button"
                    aria-pressed={item.id === state.activeArrayId}
                    onClick={() => setState((current) => ({ ...current, activeArrayId: item.id }))}
                  >
                    <span>{index + 1}</span>
                    <strong>{item.sourceName ?? `随机数组 ${index + 1}`}</strong>
                    <small>{formatShape(item.shape)} · {item.shape.reduce((total, size) => total * size, 1)} cells</small>
                  </button>
                  {state.arrays.length > 1 && (
                    <button
                      type="button"
                      className="array-remove-button"
                      aria-label={`删除 ${item.sourceName ?? `随机数组 ${index + 1}`}`}
                      onClick={() => removeArray(item.id)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <form className="numpy-form" onSubmit={generateMatrix}>
            <label htmlFor="shape-input">当前数组形状</label>
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
              {error || `shape = ${formatShape(activeArray.shape)} · dtype = float64 · ${totalCells} 个单元`}
            </p>
          </form>

          <section className="json-import-panel" aria-labelledby="json-import-title">
            <div className="json-import-copy">
              <p id="json-import-title">JSON 数据</p>
              <span>可一次选择多个文件，也可以随后继续添加；每个文件会成为独立数组。</span>
            </div>
            <label className="json-file-button">
              <span>添加 JSON</span>
              <input
                type="file"
                accept=".json,application/json"
                multiple
                onChange={importJson}
                aria-label="添加一个或多个 JSON 文件"
              />
            </label>
            {jsonStatus && (
              <p
                className={jsonStatus.startsWith("已添加") ? "json-status" : "json-status is-error"}
                aria-live="polite"
              >
                {jsonStatus}
              </p>
            )}
          </section>

          <section className="selection-panel" aria-labelledby="selection-title">
            <div className="selection-heading">
              <div>
                <p id="selection-title">当前数组切片</p>
                <span>支持整数、start:stop 和 start:stop:step，省略的维度按 : 处理。</span>
              </div>
              {activeArray.highlightedIndices.length > 0 && (
                <button type="button" onClick={clearSlice}>清除高亮</button>
              )}
            </div>
            <form className="selection-form" onSubmit={applySlice}>
              <label htmlFor="slice-input">切片表达式</label>
              <div className="selection-row">
                <input
                  id="slice-input"
                  value={sliceInput}
                  onChange={(event) => setSliceInput(event.target.value)}
                  placeholder={activeArray.shape.map(() => "0:2").join(",")}
                  spellCheck="false"
                  autoComplete="off"
                  aria-describedby="slice-status"
                />
                <button type="submit">高亮</button>
              </div>
              <p
                id="slice-status"
                className={sliceError ? "selection-status is-error" : "selection-status"}
                aria-live="polite"
              >
                {sliceError || (activeArray.highlightedIndices.length > 0
                  ? `${activeArray.sliceExpression} · 已选中 ${activeArray.highlightedIndices.length} / ${totalCells} 个数据单元`
                  : "例如 data[0:2,0:2,0:2]")}
              </p>
            </form>
          </section>

          <div className="slice-panel">
            <div className="panel-heading">
              <span>{sliceHeading}</span>
              {hiddenLayers.size > 0 && (
                <button type="button" onClick={() => updateActiveArray((item) => ({ ...item, hiddenLayers: [] }))}>
                  全部显示
                </button>
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

          <div className="interaction-control-panel">
            <div>
              <p>鼠标操作</p>
              <span>两个模式互斥：旋转模式改变所有数组的视角，移动模式只拖动鼠标所在数组。</span>
            </div>
            <InteractionModeSwitch state={state} setState={setState} />
          </div>

          <div className="controls" aria-label="视图控制">
            <label className="spacing-control">
              <span>单元间距</span>
              <input
                type="range"
                min="58"
                max="82"
                value={state.spacing}
                onChange={(event) => setState((current) => ({ ...current, spacing: Number(event.target.value) }))}
                aria-label="调整单元间距"
              />
            </label>
            <button type="button" className="reset-button" onClick={resetView}>
              <span aria-hidden="true">↻</span>重置视角
            </button>
            {state.arrays.length > 1 && (
              <button
                type="button"
                className="reset-button"
                onClick={() => setState((current) => ({ ...current, arrays: arrangeArrayPositions(current.arrays) }))}
              >
                <span aria-hidden="true">⌗</span>自动排列
              </button>
            )}
            <button
              type="button"
              className={state.frontNumbersOnly ? "reset-button face-number-button is-active" : "reset-button face-number-button"}
              aria-pressed={state.frontNumbersOnly}
              onClick={() => setState((current) => ({ ...current, frontNumbersOnly: !current.frontNumbersOnly }))}
            >
              <span aria-hidden="true">▣</span>
              {state.frontNumbersOnly ? "显示全部面数字" : "只显示左面数字"}
            </button>
          </div>

          <div className="legend" aria-label="页面说明">
            <span><b className="sync-dot" aria-hidden="true" />设置、模式和数组位置会同步到展示页</span>
          </div>
        </div>
      </section>

      <footer>
        <span>CONTROL / {state.arrays.length} ARRAYS</span>
        <span>展示页位于根路径</span>
      </footer>
    </main>
  );
}
