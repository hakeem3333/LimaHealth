import { Router } from "express";
import {
  createParentStudentRelationship,
  getAllParentStudentRelationships,
  getParentStudentRelationshipById,
  updateParentStudentRelationship,
  deleteParentStudentRelationship,
  getChildHealthData,
} from "../controllers/parentStudentRelationship.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import prisma from "../services/prisma.service.js";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../types/models.js";

const router = Router();

/**
 * Guard: only SCHOOL-type organisations support parent relationships.
 * Returns 403 for any other org type.
 */
const requireSchoolOrg = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const orgId = req.user?.orgId;
  if (!orgId) return res.status(401).json({ message: "Unauthorised" });

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org || org.orgType !== "SCHOOL") {
    return res.status(403).json({
      message: "Parent–member relationships are only available for school organisations.",
    });
  }
  next();
};

router.use(authenticate, requireSchoolOrg);

router.post(  "/",                                createParentStudentRelationship);
router.get(   "/",                                getAllParentStudentRelationships);
router.get(   "/:id",                             getParentStudentRelationshipById);
router.put(   "/:id",                             updateParentStudentRelationship);
router.delete("/:id",                             deleteParentStudentRelationship);
router.get(   "/:parentId/:studentId/health",     getChildHealthData);

export default router;
