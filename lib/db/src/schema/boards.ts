import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const boardsTable = pgTable("boards", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description"),
  stock_length: integer("stock_length"),
  stock_width: integer("stock_width"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertBoardSchema = createInsertSchema(boardsTable).omit({ id: true, created_at: true });
export type InsertBoard = z.infer<typeof insertBoardSchema>;
export type Board = typeof boardsTable.$inferSelect;
