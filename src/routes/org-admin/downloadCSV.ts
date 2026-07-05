import express from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { getFailedCSV } from "../../controllers/admin/bulkUpload.controller.js";


const router = express.Router();



router.get(
  "/failed-csv/:logId",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getFailedCSV,
);

export default router;
