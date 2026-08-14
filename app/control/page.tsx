"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Brand,
  defaultRotation,
  formatShape,
  getArrayLayout,
  getFitZoom,
  parseShapeInput,
  ShapeBadge,
  useCubeState,
} from "../cube";

export default function ControlPage() {
  const [state, setState] = useCubeState();
  const [shapeInput, setShapeInput] = useState(state.shape.join(","));
  const [error, setError] = useState("");
  const dimensionCount = state.shape.length;
  const { layers } = getArrayLayout(state.shape);
  const totalCells = state.shape.reduce((total, size) => total * size, 1);
  const hiddenLayers = useMemo(() => new Set(state.hiddenLayers), [state.hiddenLayers]);

  useEffect(() => {
    queueMicrotask(() => setShapeInput(state.shape.join(",")));
  }, [state.shape]);

  const sliceHeading = dimensionCount === 1
    ? "一维数组 / 单行"
    : dimensionCount === 2
      ? "二维数组 / 单个平面"
      : dimensionCount === 3
        ? "矩阵面 / 第一个维度（左 → 右）"
        : "所有魔方的矩阵面 / 第二维（左 → 右）";

  const generateMatrix = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseShapeInput(shapeInput);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }

    setState((current) => ({
      ...current,
      shape: parsed.shape,
      seed: current.seed + 1,
      hiddenLayers: [],
      zoom: getFitZoom(parsed.shape),
    }));
    setError("");
  };

  const toggleLayer = (layer: number) => {
    setState((current) => {
      const next = new Set(current.hiddenLayers);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return { ...current, hiddenLayers: Array.from(next).sort((a, b) => a - b) };
    });
  };

  const resetView = () => {
    setState((current) => ({
      ...current,
      rotation: { ...defaultRotation },
      zoom: getFitZoom(current.shape),
      spacing: 64,
    }));
  };

  return (
    <main className="page-shell control-page">
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          <a className="page-link" href="/">展示页</a>
          <ShapeBadge shape={state.shape} />
        </div>
      </header>

      <section className="control-workspace">
        <div className="intro control-intro">
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
              {error || `shape = ${formatShape(state.shape)} · dtype = float64 · ${totalCells} 个单元`}
            </p>
          </form>

          <div className="slice-panel">
            <div className="panel-heading">
              <span>{sliceHeading}</span>
              {hiddenLayers.size > 0 && (
                <button
                  type="button"
                  onClick={() => setState((current) => ({ ...current, hiddenLayers: [] }))}
                >
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

          <div className="controls" aria-label="视图控制">
            <label className="spacing-control">
              <span>单元间距</span>
              <input
                type="range"
                min="58"
                max="82"
                value={state.spacing}
                onChange={(event) => setState((current) => ({
                  ...current,
                  spacing: Number(event.target.value),
                }))}
                aria-label="调整单元间距"
              />
            </label>
            <button type="button" className="reset-button" onClick={resetView}>
              <span aria-hidden="true">↻</span>
              重置视角
            </button>
          </div>

          <div className="legend" aria-label="页面说明">
            <span><b className="sync-dot" aria-hidden="true" />设置会同步到已打开的展示页</span>
          </div>
        </div>
      </section>

      <footer>
        <span>CONTROL / {formatShape(state.shape)}</span>
        <span>展示页位于根路径</span>
      </footer>
    </main>
  );
}
