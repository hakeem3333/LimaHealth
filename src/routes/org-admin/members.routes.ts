import { Router } from "express";
import { authenticate, authorizeRole } from "../../middleware/auth.middleware";
import { getOrgMembers, createOrgMember } from "../../controllers/org-admin/members.controller";
import { getMemberProfile } from "../../controllers/org-admin/member-profile.controller";

const router = Router();

router.get(
  "/members",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getOrgMembers
);

router.post(
  "/members",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  createOrgMember
);

router.get(
  "/members/:studentId",
  authenticate,
  authorizeRole("ORG_ADMIN"),
  getMemberProfile
);

export default router;
