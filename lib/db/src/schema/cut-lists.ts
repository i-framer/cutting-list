import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cutListsTable = pgTable("cut_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("sheet"),
  units: text("units").notNull().default("metric"),
  pieces: jsonb("pieces").notNull().default([]),
  stock: jsonb("stock").notNull().default([]),
  options: jsonb("options").notNull().default({}),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const cutModeSchema = z.enum(["sheet", "linear"]);
export const cutUnitsSchema = z.enum(["metric", "imperial"]);

export const cutPieceSchema = z.object({
  id: z.string(),
  length: z.string(),
  width: z.string(),
  qty: z.string(),
  label: z.string(),
  material: z.string(),
  grain: z.boolean(),
});

export const stockItemSchema = z.object({
  id: z.string(),
  length: z.string(),
  width: z.string(),
  qty: z.string(),
  material: z.string(),
});

export const cutOptionsSchema = z.object({
  kerf: z.string().optional(),
  labelsOnPanels: z.boolean().optional(),
  useOneSheet: z.boolean().optional(),
  considerMaterial: z.boolean().optional(),
  edgeBanding: z.boolean().optional(),
  considerGrain: z.boolean().optional(),
});

export const insertCutListSchema = createInsertSchema(cutListsTable).omit({
  id: true,
  created_at: true,
  updated_at: true,
});

export const cutListPayloadSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  mode: cutModeSchema.default("sheet"),
  units: cutUnitsSchema.default("metric"),
  pieces: z.array(cutPieceSchema).default([]),
  stock: z.array(stockItemSchema).default([]),
  options: cutOptionsSchema.default({}),
});

export const cutListUpdateSchema = z.object({
  name: z.string().trim().min(1, "name must be a non-empty string").optional(),
  mode: cutModeSchema.optional(),
  units: cutUnitsSchema.optional(),
  pieces: z.array(cutPieceSchema).optional(),
  stock: z.array(stockItemSchema).optional(),
  options: cutOptionsSchema.optional(),
});

export type InsertCutList = z.infer<typeof insertCutListSchema>;
export type CutList = typeof cutListsTable.$inferSelect;
