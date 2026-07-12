import { Router, type IRouter } from "express";
import healthRouter from "./health";
import kospiRouter from "./kospi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(kospiRouter);

export default router;
