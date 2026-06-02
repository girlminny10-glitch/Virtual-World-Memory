import { Router, type IRouter } from "express";
import healthRouter from "./health";
import worldRouter from "./world";

const router: IRouter = Router();

router.use(healthRouter);
router.use(worldRouter);

export default router;
