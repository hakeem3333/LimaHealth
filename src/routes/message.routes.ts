import { Router } from "express";
import { listConversations, getThread, sendMessage } from "../controllers/message.controller.js";
import { authenticate, authorizeRole } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.use(authorizeRole("COUNSELOR", "STUDENT"));

router.get("/",           listConversations);
router.get("/:userId",    getThread);
router.post("/",          sendMessage);

export default router;
