import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Compile the actual TSX module in memory, using the project's existing dependencies.
const compiled = ts.transpileModule(readFileSync(new URL("../app/cube.tsx", import.meta.url), "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
  },
});
const module = { exports: {} };
runInNewContext(compiled.outputText, {
  module,
  exports: module.exports,
  require: createRequire(import.meta.url),
});
const { CubeStage, createArrayItem, defaultCubeState, formatIndexLabel, normalizeCubeState, parseSliceExpression } = module.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

function makeState(shape, options = {}) {
  const values = Array.from({ length: shape.reduce((a, b) => a * b, 1) }, (_, i) => i + 100);
  const item = createArrayItem(shape, 11, { id: "test-array", values, sourceName: "test.json" });
  return normalizeCubeState({ ...defaultCubeState, arrays: [item], activeArrayId: item.id, ...options });
}

function render(state) {
  return renderToStaticMarkup(createElement(CubeStage, { state, setState() {} }));
}

for (const [shape, index, expected] of [
  [[3], 0, "x0"],
  [[3], 2, "x2"],
  [[3, 4], 9, "x21"],
  [[3, 3, 3], 0, "x000"],
  [[3, 3, 3], 22, "x211"],
  [[3, 4, 5], 46, "x211"],
  [[2, 3, 4, 5], 106, "x1211"],
  [[2, 1, 3, 2], 11, "x1021"],
]) {
  test(`row-major index ${index} in (${shape}) is ${expected}`, () => {
    assert.equal(formatIndexLabel(index, shape), expected);
  });
}

test("old scenes and invalid modes default to numeric values", () => {
  assert.equal(defaultCubeState.cellLabelMode, "value");
  const legacy = plain(makeState([3, 3, 3]));
  delete legacy.cellLabelMode;
  assert.equal(normalizeCubeState(legacy).cellLabelMode, "value");
  assert.equal(normalizeCubeState({ ...legacy, cellLabelMode: "unknown" }).cellLabelMode, "value");
});

test("switching and serialization preserve values, slices, hidden layers and positions", () => {
  const state = makeState([3, 3, 3]);
  state.arrays[0].position = { x: 123, y: -45 };
  state.arrays[0].hiddenLayers = [1];
  const slice = parseSliceExpression("0:2,0:2,0:2", [3, 3, 3]);
  state.arrays[0].highlightedIndices = slice.indices;
  state.arrays[0].sliceExpression = slice.expression;
  const indexed = normalizeCubeState(plain({ ...state, cellLabelMode: "index" }));
  assert.equal(indexed.cellLabelMode, "index");
  assert.deepEqual(plain(indexed.arrays), plain(state.arrays));
  const restored = normalizeCubeState(plain({ ...indexed, cellLabelMode: "value" }));
  assert.deepEqual(plain(restored), plain(state));
});

test("the rendered cell at (2,1,1) displays x211 without replacing its data", () => {
  const state = makeState([3, 3, 3], { cellLabelMode: "index" });
  const html = render(state);
  assert.match(html, /data-index="22"[^>]*data-value="122"[^>]*data-index-label="x211"/);
  assert.equal((html.match(/<span>x211<\/span>/g) ?? []).length, 6);
  assert.doesNotMatch(html, /<span>122<\/span>/);
  const numeric = render({ ...state, cellLabelMode: "value" });
  assert.equal((numeric.match(/<span>122<\/span>/g) ?? []).length, 6);
});

test("front-only mode and slice highlighting also work with index labels", () => {
  const state = makeState([3, 3, 3], { cellLabelMode: "index", frontNumbersOnly: true });
  state.arrays[0].highlightedIndices = [22];
  state.arrays[0].hiddenLayers = [0];
  const html = render(state);
  assert.equal((html.match(/<span>x\d+<\/span>/g) ?? []).length, 27);
  assert.match(html, /class="number-cell is-slice-selected" data-index="22"/);
  assert.equal((html.match(/class="number-cell is-layer-hidden"/g) ?? []).length, 9);
});

test("4D labels include the cube index, and independent arrays restart their indices", () => {
  const state = makeState([2, 3, 4, 5], { cellLabelMode: "index", frontNumbersOnly: true });
  state.arrays.push(createArrayItem([2, 3], 12, { id: "second-array" }));
  const html = render(state);
  assert.match(html, /<span>x0000<\/span>/);
  assert.match(html, /<span>x1000<\/span>/);
  assert.match(html, /<span>x1234<\/span>/);
  assert.match(html, /<span>x00<\/span>/);
  assert.match(html, /<span>x12<\/span>/);
});

test("switching random data to indices and back does not reroll numbers", () => {
  const state = normalizeCubeState({ ...defaultCubeState, cellLabelMode: "value" });
  const before = render(state);
  const indexed = normalizeCubeState({ ...state, cellLabelMode: "index" });
  const after = render(normalizeCubeState({ ...indexed, cellLabelMode: "value" }));
  assert.equal(after, before);
});
