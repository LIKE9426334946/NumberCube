export type SavedSceneRecord = {
  id: string;
  name: string;
  snapshot: string;
  arrayCount: number;
  cellCount: number;
  createdAt: number;
  updatedAt: number;
};

type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
};

type D1DatabaseLike = {
  prepare(query: string): D1StatementLike;
};

let databasePromise: Promise<D1DatabaseLike | null> | null = null;
let fileWriteQueue: Promise<void> = Promise.resolve();

async function getOptionalScenesDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      try {
        // Cloudflare resolves this inside workerd. A normal Ubuntu Node.js
        // process cannot, so it transparently falls back to the JSON file.
        const moduleName = `cloudflare:${"workers"}`;
        const cloudflare = await import(/* @vite-ignore */ moduleName) as {
          env?: { DB?: D1DatabaseLike };
        };
        return cloudflare.env?.DB ?? null;
      } catch {
        return null;
      }
    })();
  }
  return databasePromise;
}

function isSavedSceneRecord(value: unknown): value is SavedSceneRecord {
  if (!value || typeof value !== "object") return false;
  const scene = value as Partial<SavedSceneRecord>;
  return typeof scene.id === "string"
    && typeof scene.name === "string"
    && typeof scene.snapshot === "string"
    && Number.isInteger(scene.arrayCount)
    && Number.isInteger(scene.cellCount)
    && Number.isFinite(scene.createdAt)
    && Number.isFinite(scene.updatedAt);
}

async function getScenesFilePath() {
  const pathModuleName = `node:${"path"}`;
  const path = await import(/* @vite-ignore */ pathModuleName) as typeof import("node:path");
  const dataDirectory = process.env.NUMBERCUBE_DATA_DIR?.trim()
    || path.join(process.cwd(), "data");
  return {
    dataDirectory,
    filePath: path.join(dataDirectory, "saved-scenes.json"),
  };
}

async function readScenesFile() {
  const fsModuleName = `node:${"fs/promises"}`;
  const fs = await import(/* @vite-ignore */ fsModuleName) as typeof import("node:fs/promises");
  const { filePath } = await getScenesFilePath();
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSavedSceneRecord) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeScenesFile(scenes: SavedSceneRecord[]) {
  const fsModuleName = `node:${"fs/promises"}`;
  const fs = await import(/* @vite-ignore */ fsModuleName) as typeof import("node:fs/promises");
  const { dataDirectory, filePath } = await getScenesFilePath();
  const temporaryPath = `${filePath}.tmp`;
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(scenes, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

async function updateScenesFile<T>(updater: (scenes: SavedSceneRecord[]) => { scenes: SavedSceneRecord[]; result: T }) {
  let resolveResult!: (value: T) => void;
  let rejectResult!: (reason?: unknown) => void;
  const resultPromise = new Promise<T>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  fileWriteQueue = fileWriteQueue
    .then(async () => {
      const current = await readScenesFile();
      const update = updater(current);
      await writeScenesFile(update.scenes);
      resolveResult(update.result);
    })
    .catch((error) => {
      rejectResult(error);
    });

  return resultPromise;
}

export async function listSavedScenes() {
  const database = await getOptionalScenesDatabase();
  if (database) {
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

  await fileWriteQueue;
  return (await readScenesFile())
    .sort((first, second) => second.updatedAt - first.updatedAt)
    .slice(0, 50);
}

export async function createSavedScene(record: SavedSceneRecord) {
  const database = await getOptionalScenesDatabase();
  if (database) {
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

  return updateScenesFile((scenes) => ({ scenes: [record, ...scenes], result: record }));
}

export async function renameSavedScene(id: string, name: string, updatedAt: number) {
  const database = await getOptionalScenesDatabase();
  if (database) {
    const result = await database.prepare(`
      UPDATE saved_scenes
      SET name = ?, updated_at = ?
      WHERE id = ?
    `).bind(name, updatedAt, id).run();
    return (result.meta.changes ?? 0) > 0;
  }

  return updateScenesFile((scenes) => {
    const exists = scenes.some((scene) => scene.id === id);
    return {
      scenes: scenes.map((scene) => scene.id === id ? { ...scene, name, updatedAt } : scene),
      result: exists,
    };
  });
}

export async function deleteSavedScene(id: string) {
  const database = await getOptionalScenesDatabase();
  if (database) {
    const result = await database.prepare("DELETE FROM saved_scenes WHERE id = ?").bind(id).run();
    return (result.meta.changes ?? 0) > 0;
  }

  return updateScenesFile((scenes) => {
    const exists = scenes.some((scene) => scene.id === id);
    return { scenes: scenes.filter((scene) => scene.id !== id), result: exists };
  });
}
