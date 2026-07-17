import { Router, type IRouter } from "express";
import healthRouter from "./health";
import boardsRouter from "./boards";
import cutListsRouter from "./cut-lists";
import iframerBoardsRouter from "./iframer-boards";
import iframerCuttingListRouter from "./iframer-cutting-list";

const router: IRouter = Router();

router.use(healthRouter);
router.use(boardsRouter);
router.use(cutListsRouter);
router.use(iframerBoardsRouter);
router.use(iframerCuttingListRouter);

export default router;
