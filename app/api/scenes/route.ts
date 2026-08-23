import { NextResponse } from "next/server";
import {
  createSavedScene,
  deleteSavedScene,
  listSavedScenes,
  renameSavedScene,
} from "../../../db/scenes";

const maxSnapshotBytes = 300_000;

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 60) : "";
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
}

function getSnapshotSummary(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as { arrays?: Array<{ shape?: unknown }> };
  if (!Array.isArray(snapshot.arrays) || snapshot.arrays.length < 1 || snapshot.arrays.length > 8) return null;

  let cellCount = 0;
  for (const item of snapshot.arrays) {
    if (!Array.isArray(item.shape)
      || item.shape.length < 1
      || item.shape.length > 4
      || item.shape.some((size) => !Number.isInteger(size) || Number(size) < 1 || Number(size) > 6)) {
      return null;
    }
    const itemCells = item.shape.reduce((total, size) => total * Number(size), 1);
    if (itemCells > 216) return null;
    cellCount += itemCells;
  }

  return { arrayCount: snapshot.arrays.length, cellCount };
}

export async function GET() {
  try {
    const scenes = await listSavedScenes();
    return NextResponse.json({ scenes });
  } catch {
    return NextResponse.json({ error: "暂时无法读取保存的场景。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: unknown; snapshot?: unknown };
    const name = normalizeName(body.name);
    const summary = getSnapshotSummary(body.snapshot);
    if (!name) return NextResponse.json({ error: "请先填写场景名称。" }, { status: 400 });
    if (!summary) return NextResponse.json({ error: "当前场景数据不完整，无法保存。" }, { status: 400 });

    const snapshot = JSON.stringify(body.snapshot);
    if (new TextEncoder().encode(snapshot).byteLength > maxSnapshotBytes) {
      return NextResponse.json({ error: "当前场景数据过大，无法保存。" }, { status: 413 });
    }

    const now = Date.now();
    const scene = await createSavedScene({
      id: crypto.randomUUID(),
      name,
      snapshot,
      ...summary,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ scene }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "保存场景失败，请稍后重试。" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as { id?: unknown; name?: unknown };
    const name = normalizeName(body.name);
    if (!validId(body.id) || !name) {
      return NextResponse.json({ error: "场景名称或编号无效。" }, { status: 400 });
    }
    const updatedAt = Date.now();
    const renamed = await renameSavedScene(body.id, name, updatedAt);
    if (!renamed) return NextResponse.json({ error: "没有找到这个场景。" }, { status: 404 });
    return NextResponse.json({ id: body.id, name, updatedAt });
  } catch {
    return NextResponse.json({ error: "重命名失败，请稍后重试。" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!validId(id)) return NextResponse.json({ error: "场景编号无效。" }, { status: 400 });
    const deleted = await deleteSavedScene(id);
    if (!deleted) return NextResponse.json({ error: "没有找到这个场景。" }, { status: 404 });
    return NextResponse.json({ id });
  } catch {
    return NextResponse.json({ error: "删除失败，请稍后重试。" }, { status: 500 });
  }
}
