"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import {
  arrangeArrayPositions,
  Brand,
  createArrayItem,
  defaultRotation,
  formatIndexLabel,
  formatShape,
  getActiveArray,
  getArrayLayout,
  getFitZoom,
  InteractionModeSwitch,
  normalizeCubeState,
  parseIndexPrefix,
  parseJsonArrayData,
  parseShapeInput,
  parseSliceExpression,
  SceneBadge,
  useCubeState,
} from "../cube";
import type { ArrayItem } from "../cube";

type SavedScene = {
  id: string;
  name: string;
  snapshot: string;
  arrayCount: number;
  cellCount: number;
  createdAt: number;
  updatedAt: number;
};

const maxArrays = 8;

export default function ControlPage() {
  const [state, setState] = useCubeState();
  const activeArray = getActiveArray(state);
  const [shapeInput, setShapeInput] = useState(activeArray.shape.join(","));
  const [error, setError] = useState("");
  const [jsonStatus, setJsonStatus] = useState("");
  const [indexPrefixInput, setIndexPrefixInput] = useState(activeArray.indexPrefix);
  const [indexPrefixError, setIndexPrefixError] = useState("");
  const [sliceInput, setSliceInput] = useState(activeArray.sliceExpression);
  const [sliceError, setSliceError] = useState("");
  const [savedScenes, setSavedScenes] = useState<SavedScene[]>([]);
  const [sceneName, setSceneName] = useState("");
  const [sceneStatus, setSceneStatus] = useState("");
  const [sceneStatusIsError, setSceneStatusIsError] = useState(false);
  const [scenesLoading, setScenesLoading] = useState(true);
  const [sceneBusyId, setSceneBusyId] = useState<string | null>(null);
  const [openedSceneId, setOpenedSceneId] = useState<string | null>(null);
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editingSceneName, setEditingSceneName] = useState("");
  const dimensionCount = activeArray.shape.length;
  const { layers } = getArrayLayout(activeArray.shape);
  const totalCells = activeArray.shape.reduce((total, size) => total * size, 1);
  const hiddenLayers = new Set(activeArray.hiddenLayers);
  const cellLabelName = state.cellLabelMode === "index" ? "编号" : "数字";

  useEffect(() => {
    queueMicrotask(() => {
      setShapeInput(activeArray.shape.join(","));
      setError("");
    });
  }, [activeArray.id, activeArray.shape]);

  useEffect(() => {
    queueMicrotask(() => {
      setIndexPrefixInput(activeArray.indexPrefix);
      setIndexPrefixError("");
    });
  }, [activeArray.id, activeArray.indexPrefix]);

  useEffect(() => {
    queueMicrotask(() => {
      setSliceInput(activeArray.sliceExpression);
      setSliceError("");
    });
  }, [activeArray.id, activeArray.sliceExpression]);

  useEffect(() => {
    let cancelled = false;
    const loadSavedScenes = async () => {
      try {
        const response = await fetch("/api/scenes", { cache: "no-store" });
        const payload = await response.json() as { scenes?: SavedScene[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "读取失败");
        if (!cancelled) setSavedScenes(payload.scenes ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setSceneStatus(loadError instanceof Error ? loadError.message : "暂时无法读取保存的场景。");
          setSceneStatusIsError(true);
        }
      } finally {
        if (!cancelled) setScenesLoading(false);
      }
    };
    void loadSavedScenes();
    return () => { cancelled = true; };
  }, []);

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

  const applyIndexPrefix = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const prefix = parseIndexPrefix(indexPrefixInput);
    if (!prefix) {
      setIndexPrefixError("请输入 1—12 位字母、数字或下划线，以字母或下划线开头，例如 x、w、conv1。");
      return;
    }
    updateActiveArray((item) => ({ ...item, indexPrefix: prefix }));
    setIndexPrefixInput(prefix);
    setIndexPrefixError("");
  };

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

  const saveScene = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = sceneName.trim();
    if (!name) {
      setSceneStatus("请先填写场景名称。");
      setSceneStatusIsError(true);
      return;
    }

    setSceneBusyId("new");
    setSceneStatus("");
    try {
      const response = await fetch("/api/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, snapshot: state }),
      });
      const payload = await response.json() as { scene?: SavedScene; error?: string };
      if (!response.ok || !payload.scene) throw new Error(payload.error || "保存场景失败。");
      setSavedScenes((current) => [payload.scene!, ...current]);
      setOpenedSceneId(payload.scene.id);
      setSceneName("");
      setSceneStatus(`“${payload.scene.name}”已保存，以后可以从目录中恢复。`);
      setSceneStatusIsError(false);
    } catch (saveError) {
      setSceneStatus(saveError instanceof Error ? saveError.message : "保存场景失败，请稍后重试。");
      setSceneStatusIsError(true);
    } finally {
      setSceneBusyId(null);
    }
  };

  const restoreScene = (scene: SavedScene) => {
    try {
      const restored = normalizeCubeState(JSON.parse(scene.snapshot));
      setState(restored);
      setOpenedSceneId(scene.id);
      setSceneStatus(`已恢复“${scene.name}”：${scene.arrayCount} 个数组，${scene.cellCount} 个数据单元。`);
      setSceneStatusIsError(false);
    } catch {
      setSceneStatus("这个场景的数据已损坏，无法恢复。");
      setSceneStatusIsError(true);
    }
  };

  const beginRenameScene = (scene: SavedScene) => {
    setEditingSceneId(scene.id);
    setEditingSceneName(scene.name);
    setSceneStatus("");
  };

  const updateScene = async (scene: SavedScene) => {
    if (openedSceneId !== scene.id) return;
    if (!window.confirm(`确定用当前魔方状态更新“${scene.name}”吗？`)) return;

    setSceneBusyId(scene.id);
    setSceneStatus("");
    try {
      const response = await fetch("/api/scenes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scene.id, snapshot: state }),
      });
      const payload = await response.json() as {
        scene?: Pick<SavedScene, "id" | "snapshot" | "arrayCount" | "cellCount" | "updatedAt">;
        error?: string;
      };
      if (!response.ok || !payload.scene) throw new Error(payload.error || "更新场景失败。");

      setSavedScenes((current) => {
        const updated = current.find((item) => item.id === scene.id);
        if (!updated) return current;
        const merged = { ...updated, ...payload.scene };
        return [merged, ...current.filter((item) => item.id !== scene.id)];
      });
      setSceneStatus(`“${scene.name}”已更新为当前魔方状态。`);
      setSceneStatusIsError(false);
    } catch (updateError) {
      setSceneStatus(updateError instanceof Error ? updateError.message : "更新场景失败，请稍后重试。");
      setSceneStatusIsError(true);
    } finally {
      setSceneBusyId(null);
    }
  };

  const renameScene = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const name = editingSceneName.trim();
    if (!name) {
      setSceneStatus("场景名称不能为空。");
      setSceneStatusIsError(true);
      return;
    }

    setSceneBusyId(id);
    try {
      const response = await fetch("/api/scenes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      const payload = await response.json() as { updatedAt?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "重命名失败。");
      setSavedScenes((current) => current.map((scene) => scene.id === id
        ? { ...scene, name, updatedAt: payload.updatedAt ?? Date.now() }
        : scene));
      setEditingSceneId(null);
      setEditingSceneName("");
      setSceneStatus(`场景已重命名为“${name}”。`);
      setSceneStatusIsError(false);
    } catch (renameError) {
      setSceneStatus(renameError instanceof Error ? renameError.message : "重命名失败，请稍后重试。");
      setSceneStatusIsError(true);
    } finally {
      setSceneBusyId(null);
    }
  };

  const removeSavedScene = async (scene: SavedScene) => {
    if (!window.confirm(`确定删除保存的场景“${scene.name}”吗？`)) return;
    setSceneBusyId(scene.id);
    try {
      const response = await fetch(`/api/scenes?id=${encodeURIComponent(scene.id)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "删除失败。");
      setSavedScenes((current) => current.filter((item) => item.id !== scene.id));
      if (editingSceneId === scene.id) setEditingSceneId(null);
      if (openedSceneId === scene.id) setOpenedSceneId(null);
      setSceneStatus(`已删除“${scene.name}”。`);
      setSceneStatusIsError(false);
    } catch (deleteError) {
      setSceneStatus(deleteError instanceof Error ? deleteError.message : "删除失败，请稍后重试。");
      setSceneStatusIsError(true);
    } finally {
      setSceneBusyId(null);
    }
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

          <section className="saved-scenes-panel" aria-labelledby="saved-scenes-title">
            <div className="saved-scenes-heading">
              <div>
                <p id="saved-scenes-title">保存的场景</p>
                <span>保存当前全部数组、位置、视角、切片、隐藏状态和编号显示设置，点击场景即可恢复。</span>
              </div>
              <strong>{savedScenes.length} 个场景</strong>
            </div>

            <form className="scene-save-form" onSubmit={saveScene}>
              <label htmlFor="scene-name">场景名称</label>
              <div>
                <input
                  id="scene-name"
                  value={sceneName}
                  maxLength={60}
                  onChange={(event) => setSceneName(event.target.value)}
                  placeholder="例如：卷积层输入与权重"
                  autoComplete="off"
                />
                <button type="submit" disabled={sceneBusyId === "new"}>
                  {sceneBusyId === "new" ? "保存中…" : "保存当前场景"}
                </button>
              </div>
            </form>

            <div className="saved-scenes-list" aria-live="polite">
              {scenesLoading && <p className="saved-scenes-empty">正在读取场景目录…</p>}
              {!scenesLoading && savedScenes.length === 0 && (
                <p className="saved-scenes-empty">还没有保存的场景，给当前魔方取个名字吧。</p>
              )}
              {savedScenes.map((scene) => (
                <article
                  className={`saved-scene-item${openedSceneId === scene.id ? " is-open" : ""}`}
                  key={scene.id}
                >
                  {editingSceneId === scene.id ? (
                    <form className="scene-rename-form" onSubmit={(event) => renameScene(event, scene.id)}>
                      <input
                        value={editingSceneName}
                        maxLength={60}
                        onChange={(event) => setEditingSceneName(event.target.value)}
                        aria-label="新的场景名称"
                        autoFocus
                      />
                      <button type="submit" disabled={sceneBusyId === scene.id}>确定</button>
                      <button type="button" onClick={() => setEditingSceneId(null)}>取消</button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="scene-restore-button"
                        aria-pressed={openedSceneId === scene.id}
                        onClick={() => restoreScene(scene)}
                      >
                        <span className="scene-folder-icon" aria-hidden="true">▱</span>
                        <span>
                          <strong>{scene.name}</strong>
                          <small>{scene.arrayCount} 个数组 · {scene.cellCount} 个单元</small>
                        </span>
                        <span className="scene-item-state">
                          {openedSceneId === scene.id && <b>已打开</b>}
                          <time dateTime={new Date(scene.updatedAt).toISOString()}>
                            {new Date(scene.updatedAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
                          </time>
                        </span>
                      </button>
                      <div className="scene-item-actions">
                        <button
                          type="button"
                          className="scene-update-action"
                          disabled={openedSceneId !== scene.id || sceneBusyId === scene.id}
                          title={openedSceneId === scene.id ? "用当前魔方状态覆盖此场景" : "请先打开这个场景"}
                          onClick={() => void updateScene(scene)}
                        >
                          更新
                        </button>
                        <button type="button" onClick={() => beginRenameScene(scene)}>重命名</button>
                        <button
                          type="button"
                          className="is-danger"
                          disabled={sceneBusyId === scene.id}
                          onClick={() => void removeSavedScene(scene)}
                        >
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>

            {sceneStatus && (
              <p className={sceneStatusIsError ? "scene-status is-error" : "scene-status"} role="status">
                {sceneStatus}
              </p>
            )}
          </section>

          <section className="array-list-panel" aria-labelledby="array-list-title">
            <div className="array-list-heading">
              <div>
                <p id="array-list-title">场景中的数组</p>
                <span>先选择一个数组，再修改它的编号前缀、形状、切片或矩阵面。</span>
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
                    <small>{item.indexPrefix} · {formatShape(item.shape)} · {item.shape.reduce((total, size) => total * size, 1)} cells</small>
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
            <form className="numpy-form" onSubmit={applyIndexPrefix}>
              <label htmlFor="index-prefix-input">当前数组编号前缀</label>
              <div className="expression-row">
                <input
                  id="index-prefix-input"
                  value={indexPrefixInput}
                  maxLength={12}
                  onChange={(event) => {
                    setIndexPrefixInput(event.target.value);
                    setIndexPrefixError("");
                  }}
                  placeholder="例如 x、w、y"
                  spellCheck="false"
                  autoComplete="off"
                  aria-describedby="index-prefix-status"
                />
                <button type="submit">应用前缀</button>
              </div>
              <p
                id="index-prefix-status"
                className={indexPrefixError ? "form-status is-error" : "form-status"}
                aria-live="polite"
              >
                {indexPrefixError || `${activeArray.sourceName ?? "当前随机数组"} → ${formatIndexLabel(0, activeArray.shape, activeArray.indexPrefix)} · 只修改当前数组，显示编号时生效。`}
              </p>
            </form>
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

          <section className="interaction-control-panel" aria-labelledby="cell-label-title">
            <div>
              <p id="cell-label-title">单元显示内容</p>
              <span>编号使用每个数组各自的前缀，索引从 0 开始；在上方数组列表中选择数组后可修改前缀，切换不改变原始数据。</span>
            </div>
            <div className="mode-switch" role="group" aria-label="单元显示模式">
              <button
                type="button"
                className={state.cellLabelMode === "value" ? "is-active" : ""}
                aria-pressed={state.cellLabelMode === "value"}
                onClick={() => setState((current) => ({ ...current, cellLabelMode: "value" }))}
              >
                显示数值
              </button>
              <button
                type="button"
                className={state.cellLabelMode === "index" ? "is-active" : ""}
                aria-pressed={state.cellLabelMode === "index"}
                onClick={() => setState((current) => ({ ...current, cellLabelMode: "index" }))}
              >
                显示编号
              </button>
            </div>
          </section>

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
              {state.frontNumbersOnly ? `显示全部面${cellLabelName}` : `只显示左面${cellLabelName}`}
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
