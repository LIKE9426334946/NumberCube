import { env } from "cloudflare:workers";

export type SavedSceneRecord = {
  id: string;
  name: string;
  snapshot: string;
  arrayCount: number;
  cellCount: number;
  createdAt: number;
  updatedAt: number;
};

function getScenesDatabase() {
  if (!env.DB) throw new Error("Cloudflare D1 binding `DB` is unavailable.");
  return env.DB;
}

export async function listSavedScenes() {
  const database = getScenesDatabase();
  const result = await database.prepare(`
    SELECT
      id,
      name,
      snapshot,
      array_count AS arrayCount,
      cell_count AS cellCount,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM saved_scenes
    ORDER BY updated_at DESC
    LIMIT 50
  `).all<SavedSceneRecord>();
  return result.results;
}

export async function createSavedScene(record: SavedSceneRecord) {
  const database = getScenesDatabase();
  await database.prepare(`
    INSERT INTO saved_scenes (
      id, name, snapshot, array_count, cell_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    record.id,
    record.name,
    record.snapshot,
    record.arrayCount,
    record.cellCount,
    record.createdAt,
    record.updatedAt,
  ).run();
  return record;
}

export async function renameSavedScene(id: string, name: string, updatedAt: number) {
  const database = getScenesDatabase();
  const result = await database.prepare(`
    UPDATE saved_scenes
    SET name = ?, updated_at = ?
    WHERE id = ?
  `).bind(name, updatedAt, id).run();
  return result.meta.changes > 0;
}

export async function deleteSavedScene(id: string) {
  const database = getScenesDatabase();
  const result = await database.prepare("DELETE FROM saved_scenes WHERE id = ?").bind(id).run();
  return result.meta.changes > 0;
}
