import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { boardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/boards", async (req, res) => {
  const code = req.query.code as string | undefined;

  if (!code) {
    res.status(400).json({ error: "code query parameter is required" });
    return;
  }

  try {
    const results = await db
      .select()
      .from(boardsTable)
      .where(eq(boardsTable.code, code))
      .limit(1);

    if (results.length === 0) {
      res.status(404).json({ error: "Board not found" });
      return;
    }

    res.json(results[0]);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

export default router;
