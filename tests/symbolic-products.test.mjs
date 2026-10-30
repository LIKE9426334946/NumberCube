import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../app/cube.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
});
const module = { exports: {} };
runInNewContext(compiled.outputText, { module, exports: module.exports, require: createRequire(import.meta.url) });
const { CubeStage, SymbolicProductDetails, createArrayItem, defaultCubeState, getHighlightedProduct,
  getHighlightedSelection, getProductTerms, normalizeCubeState, parseSliceExpression } = module.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

function selected(shape, expression, prefix = "x") {
  const item = createArrayItem(shape, 11, {
    id: `array-${prefix}`, sourceName: `${prefix}.json`, indexPrefix: prefix,
    values: Array.from({ length: shape.reduce((a, b) => a * b, 1) }, (_, i) => i),
  });
  const slice = parseSliceExpression(expression, shape);
  assert.ok(!("error" in slice), slice.error);
  item.sliceExpression = slice.expression;
  item.highlightedIndices = slice.indices;
  return item;
}

function example() {
  const x = selected([1, 3, 4, 4], "x[0, :, 0:2, 0:2]", "x");
  const w = selected([2, 3, 2, 2], "w[0]", "w");
  const product = getHighlightedProduct(x, w);
  assert.ok(!("error" in product), product.error);
  const result = createArrayItem(product.shape, 0, { id: "product", sourceName: "x × w · 符号结果", symbolicProduct: product.symbolicProduct });
  return { x, w, product, result };
}

test("the convolution example pairs 12 cells by local slice coordinates, not source flat indices", () => {
  const { product } = example();
  assert.deepEqual(plain(product.shape), [3, 2, 2]);
  assert.deepEqual(plain(getProductTerms(product.symbolicProduct)), [
    "x0000 × w0000", "x0001 × w0001", "x0010 × w0010", "x0011 × w0011",
    "x0100 × w0100", "x0101 × w0101", "x0110 × w0110", "x0111 × w0111",
    "x0200 × w0200", "x0201 × w0201", "x0210 × w0210", "x0211 × w0211",
  ]);
});

test("the slice result shape follows integer removal and range preservation", () => {
  assert.deepEqual(plain(parseSliceExpression("0,:,0:2,0:2", [1,3,4,4]).shape), [3,2,2]);
  assert.deepEqual(plain(parseSliceExpression("0:1,:,0:2,0:2", [1,3,4,4]).shape), [1,3,2,2]);
  assert.deepEqual(plain(parseSliceExpression("0", [2,3,2,2]).shape), [3,2,2]);
});

test("equal cell counts with different shapes are rejected without broadcasting", () => {
  const a = selected([3,2,2], ":,:,:", "x");
  const b = selected([2,3,2], ":,:,:", "w");
  assert.match(getHighlightedProduct(a, b).error, /形状不相同/);
  const c = selected([1,3,2,2], "0:1,:,:,:", "w");
  assert.match(getHighlightedProduct(a, c).error, /形状不相同/);
});

test("no selection, same array, and stale highlight metadata cannot produce a result", () => {
  const { x, w } = example();
  assert.match(getHighlightedProduct(x, x).error, /两个不同/);
  assert.match(getHighlightedProduct({ ...x, highlightedIndices: [] }, w).error, /切片高亮/);
  assert.match(getHighlightedProduct({ ...x, highlightedIndices: [0,1] }, w).error, /不一致/);
  assert.match(getHighlightedProduct({ ...x, sliceExpression: "broken" }, w).error, /不完整/);
});

test("one-to-four-dimensional selections retain their shape and every coordinate", () => {
  for (const shape of [[3], [2,3], [2,2,3], [2,2,2,3]]) {
    const a = selected(shape, ":", "x");
    const b = selected(shape, ":", "w");
    const product = getHighlightedProduct(a,b);
    assert.deepEqual(plain(product.shape), shape);
    assert.equal(product.symbolicProduct.left.indices.length, shape.reduce((a,b) => a*b,1));
    assert.equal(getProductTerms(product.symbolicProduct)[0], `x${"0".repeat(shape.length)} × w${"0".repeat(shape.length)}`);
  }
});

test("strided and offset slices pair in row-major slice order", () => {
  const a = selected([4,4], "1:4:2,0:4:2", "x");
  const b = selected([3,3], "-2:,-2:", "w");
  // Highlight membership is unordered; pairing must use the slice traversal order.
  a.highlightedIndices = [...a.highlightedIndices].reverse();
  const product = getHighlightedProduct(a,b);
  assert.deepEqual(plain(product.shape), [2,2]);
  assert.deepEqual(plain(getProductTerms(product.symbolicProduct)), ["x10 × w11", "x12 × w12", "x30 × w21", "x32 × w22"]);
});

test("scalar selections generate a single symbolic block", () => {
  const a = selected([3,3,3], "2,1,1", "x");
  const b = selected([4], "3", "w");
  const product = getHighlightedProduct(a,b);
  assert.deepEqual(plain(product.shape), [1]);
  assert.deepEqual(plain(getProductTerms(product.symbolicProduct)), ["x211 × w3"]);
});

test("results are independent snapshots and original values, highlights and positions stay unchanged", () => {
  const { x, w, result } = example();
  const originals = plain([x,w]);
  const state = normalizeCubeState({ ...defaultCubeState, arrays: [x,w,result], activeArrayId: result.id });
  assert.deepEqual(plain(state.arrays.slice(0,2)), originals);
  assert.deepEqual(plain(normalizeCubeState(plain(state))), plain(state));
  x.indexPrefix = "newPrefix";
  x.shape[2] = 6;
  x.highlightedIndices[0] = 10;
  assert.equal(getProductTerms(result.symbolicProduct)[0], "x0000 × w0000");
  const resultOnly = normalizeCubeState({ ...defaultCubeState, arrays: [result] });
  assert.equal(resultOnly.arrays[0].sourceName, "x × w · 符号结果");
  assert.equal(getProductTerms(resultOnly.arrays[0].symbolicProduct).length, 12);
});

test("old scenes stay numeric; invalid symbolic snapshots are discarded, not shown as fake random data", () => {
  const { x, result } = example();
  delete x.symbolicProduct;
  assert.equal(normalizeCubeState({ arrays:[x] }).arrays[0].symbolicProduct, null);
  const broken = plain(result);
  broken.symbolicProduct.right.indices[0] = 12;
  const state = normalizeCubeState({ arrays: [x, broken] });
  assert.equal(state.arrays.length, 1);
  assert.equal(state.arrays[0].id, x.id);
  const mismatched = { ...result, shape: [2,3,2] };
  assert.equal(normalizeCubeState({ arrays:[x,mismatched] }).arrays.length, 1);
});

test("symbolic results stay symbolic in numeric mode, support face visibility and render the full sum", () => {
  const { result } = example();
  const state = normalizeCubeState({ ...defaultCubeState, arrays:[result], cellLabelMode:"value", frontNumbersOnly:true });
  const html = renderToStaticMarkup(createElement(CubeStage, { state, setState() {} }));
  assert.equal((html.match(/class="symbolic-cell-label"/g) ?? []).length, 12);
  assert.equal((html.match(/data-expression="/g) ?? []).length, 12);
  assert.match(html, /data-label-mode="symbolic"/);
  assert.match(html, /data-expression="x0000 × w0000"/);
  assert.doesNotMatch(html, /data-value="/);
  const allFaces = renderToStaticMarkup(createElement(CubeStage, {state:{...state,frontNumbersOnly:false},setState(){}}));
  assert.equal((allFaces.match(/class="symbolic-cell-label"/g) ?? []).length, 72);
  const details = renderToStaticMarkup(createElement(SymbolicProductDetails, {product: result.symbolicProduct}));
  assert.match(details, /x0000 × w0000 \+ x0001 × w0001/);
  assert.match(details, /不含偏置、不翻转卷积核/);
  assert.match(getHighlightedSelection(result).error, /原始数字数组/);
});

test("production scene API saves, updates and restores symbolic products in the Node JSON store", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "numbercube-product-test-"));
  const previousDataDir = process.env.NUMBERCUBE_DATA_DIR;
  process.env.NUMBERCUBE_DATA_DIR = dataDir;
  try {
    const { default: worker } = await import("../dist/server/index.js");
    const env = { ASSETS: { fetch: async () => new Response("Not found", {status:404}) } };
    const context = { waitUntil() {}, passThroughOnException() {} };
    const call = (method, payload) => worker.fetch(new Request("http://localhost/api/scenes", {
      method, headers: {"content-type":"application/json"}, ...(payload ? {body:JSON.stringify(payload)} : {}),
    }), env, context);
    const { x, w, result } = example();
    const snapshot = normalizeCubeState({ ...defaultCubeState, arrays:[x,w,result], activeArrayId:result.id });
    const created = await call("POST", {name:"Symbolic product QA", snapshot});
    assert.equal(created.status, 201);
    const {scene} = await created.json();
    snapshot.arrays[2].position = {x:420,y:160};
    snapshot.arrays[2].hiddenLayers = [1];
    const updated = await call("PUT", {id:scene.id,snapshot});
    assert.equal(updated.status, 200);
    const payload = await (await call("GET")).json();
    const restored = normalizeCubeState(JSON.parse(payload.scenes[0].snapshot));
    assert.deepEqual(plain(restored), plain(snapshot));
    assert.equal(getProductTerms(restored.arrays[2].symbolicProduct)[11], "x0211 × w0211");
    assert.match(await readFile(join(dataDir,"saved-scenes.json"),"utf8"), /symbolicProduct/);
  } finally {
    if (previousDataDir === undefined) delete process.env.NUMBERCUBE_DATA_DIR;
    else process.env.NUMBERCUBE_DATA_DIR = previousDataDir;
  }
});
