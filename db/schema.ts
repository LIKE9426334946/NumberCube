import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const savedScenes = sqliteTable("saved_scenes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  snapshot: text("snapshot").notNull(),
  arrayCount: integer("array_count").notNull(),
  cellCount: integer("cell_count").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
