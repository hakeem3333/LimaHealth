import crypto from "crypto";
import type { Response } from "express";
import type { Request } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import prisma from "../services/prisma.service.js";
import { sendParentConsentEmail } from "../services/email.service.js";
import { isMinor } from "../utils/age.util.js";
import { z } from "zod";

const CONSENT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const hashToken = (raw: string) =>
  crypto.createHash("sha256").update(raw).digest("hex");

const requestSchema = z.object({
  studentId: z.string().uuid("studentId must be a valid UUID"),
  parentId: z.string().uuid("parentId must be a valid UUID").optional(),
});

/**
 * Shared core of "send/resend a consent request": invalidates any earlier
 * outstanding token for the pair, issues a fresh one, and emails it. Used by
 * both the staff-initiated POST /parent-consent/request below and by
 * linkParent (parentStudentRelationship.controller.ts), which fires this
 * automatically the moment a parent is linked — so enrollment doesn't need
 * a separate manual "send request" step.
 */
export async function issueParentConsentRequest({
  studentId,
  parentId,
  parentEmail,
  parentFirstName,
  studentFirstName,
  studentLastName,
  orgType,
  orgName,
}: {
  studentId: string;
  parentId: string;
  parentEmail: string;
  parentFirstName: string;
  studentFirstName: string;
  studentLastName: string;
  orgType?: string | null | undefined;
  orgName?: string | null | undefined;
}) {
  await prisma.parentConsentToken.deleteMany({
    where: { studentId, parentId, usedAt: null },
  });

  const rawToken = crypto.randomBytes(32).toString("hex");
  await prisma.parentConsentToken.create({
    data: {
      studentId,
      parentId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + CONSENT_TOKEN_TTL_MS),
    },
  });

  return sendParentConsentEmail({
    to: parentEmail,
    parentName: parentFirstName,
    studentName: `${studentFirstName} ${studentLastName}`,
    token: rawToken,
    ...(orgType ? { orgType } : {}),
    ...(orgName ? { orgName } : {}),
  });
}

// ---------------------------------------------------------------------------
// POST /parent-consent/request
// Staff-initiated: emails the linked parent a consent review link.
// ---------------------------------------------------------------------------
export const requestParentalConsent = async (req: AuthRequest, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten().fieldErrors });
  }
  const { studentId, parentId } = parsed.data;

  const orgId = req.user?.orgId;
  if (!orgId) {
    return res.status(403).json({ message: "Organisation access required" });
  }

  try {
    const student = await prisma.user.findFirst({
      where: { id: studentId, orgId, role: { name: "STUDENT" } },
      include: { org: true },
    });
    if (!student) return res.status(404).json({ message: "Student not found" });
    if (isMinor(student.dateOfBirth) !== true) {
      return res.status(400).json({ message: "Parental consent only applies to students under 18" });
    }

    const relationship = await prisma.parentStudentRelationship.findFirst({
      where: { studentId, ...(parentId ? { parentId } : {}) },
      include: { parent: true },
    });
    if (!relationship) {
      return res.status(404).json({ message: "No linked parent found for this student" });
    }

    await issueParentConsentRequest({
      studentId,
      parentId: relationship.parentId,
      parentEmail: relationship.parent.email,
      parentFirstName: relationship.parent.firstName,
      studentFirstName: student.firstName,
      studentLastName: student.lastName,
      orgType: student.org?.orgType,
      orgName: student.org?.name,
    });

    return res.status(200).json({ message: "Consent request sent." });
  } catch (err) {
    console.error("Error requesting parental consent:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ---------------------------------------------------------------------------
// GET /parent-consent/:token
// Public: renders the review page for the parent. Viewing never records a
// decision — only the POST below does — so link scanners can't trigger one.
// ---------------------------------------------------------------------------
export const viewParentalConsentRequest = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token) return res.status(400).send(renderStatusPage({ variant: "error", title: "Missing link", body: "This link is incomplete." }));
  const tokenHash = hashToken(token);

  const record = await prisma.parentConsentToken.findUnique({
    where: { tokenHash },
    include: { student: true, parent: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return res.status(410).send(renderStatusPage({
      variant: "error",
      title: "This link is no longer valid",
      body: "It may have already been used, or it has expired. Please contact the school for a new request.",
    }));
  }

  return res.status(200).send(renderReviewPage({
    token,
    parentName: record.parent.firstName,
    studentName: `${record.student.firstName} ${record.student.lastName}`,
  }));
};

// ---------------------------------------------------------------------------
// POST /parent-consent/:token/decision
// Public: records the parent's decision (form submit from the review page).
// ---------------------------------------------------------------------------
const decisionSchema = z.object({
  decision: z.enum(["GRANTED", "DECLINED"]),
});

export const submitParentalConsentDecision = async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token) return res.status(400).send(renderStatusPage({ variant: "error", title: "Missing link", body: "This link is incomplete." }));

  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).send(renderStatusPage({
      variant: "error",
      title: "Something went wrong",
      body: "We couldn't read your response. Please go back and try again.",
    }));
  }

  const tokenHash = hashToken(token);
  const record = await prisma.parentConsentToken.findUnique({
    where: { tokenHash },
    include: { student: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return res.status(410).send(renderStatusPage({
      variant: "error",
      title: "This link is no longer valid",
      body: "It may have already been used, or it has expired. Please contact the school for a new request.",
    }));
  }

  const { decision } = parsed.data;

  await prisma.$transaction([
    prisma.parentConsentToken.update({
      where: { id: record.id },
      data: { usedAt: new Date(), decision },
    }),
    prisma.consent.upsert({
      where: { userId: record.studentId },
      create: { userId: record.studentId, parentalConsentGiven: decision === "GRANTED" },
      update: { parentalConsentGiven: decision === "GRANTED" },
    }),
  ]);

  return res.status(200).send(renderStatusPage({
    variant: decision === "GRANTED" ? "success" : "neutral",
    title: decision === "GRANTED" ? "Consent recorded" : "Response recorded",
    body: decision === "GRANTED"
      ? `Thank you. ${record.student.firstName}'s counselor can now view their wellness data.`
      : `Thank you for letting us know. ${record.student.firstName}'s wellness data will remain hidden from their counselor.`,
  }));
};

// ---------------------------------------------------------------------------
// Server-rendered pages — no build step, no client-side JS required to
// respond (this is a real browser page reached via an emailed link, not an
// email body itself, so it's free to use modern CSS rather than table layout).
// ---------------------------------------------------------------------------

// Lucide-compatible stroke/fill icon paths, kept inline so this page has zero
// external dependencies — matches the iconography used elsewhere in the app.
const ICON_PATHS: Record<"heart" | "shield-check" | "check-circle" | "shield-alert", string> = {
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  "shield-check":
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  "check-circle":
    '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  "shield-alert":
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
};

function icon(name: keyof typeof ICON_PATHS, { size = 26, filled = false }: { size?: number; filled?: boolean } = {}) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

const pageShell = (bodyHtml: string) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LimaHealth Parental Consent</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px 16px;
        background:
          radial-gradient(circle at 12% -8%, rgba(12,175,135,0.14), transparent 55%),
          radial-gradient(circle at 108% 112%, rgba(12,175,135,0.10), transparent 55%),
          #F5F7FA;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      }
      .wrap { width: 100%; max-width: 440px; }
      .brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 22px; }
      .brand-mark {
        width: 36px; height: 36px; border-radius: 12px; background: #0CAF87;
        display: flex; align-items: center; justify-content: center; color: #fff;
      }
      .brand-name { font-size: 18px; font-weight: 800; color: #1B2A3B; letter-spacing: -0.2px; }
      .brand-name em { color: #0CAF87; font-style: normal; }
      .card {
        background: #FFFFFF;
        border-radius: 28px;
        padding: 40px 36px;
        box-shadow: 0 20px 50px rgba(13,59,122,0.08), 0 2px 8px rgba(13,59,122,0.04);
        border: 1px solid #F0F2F5;
        text-align: center;
      }
      .icon-bubble {
        width: 56px; height: 56px; border-radius: 18px; margin: 0 auto 20px auto;
        display: flex; align-items: center; justify-content: center;
      }
      h1 { margin: 0 0 12px 0; color: #1B2A3B; font-size: 23px; font-weight: 800; letter-spacing: -0.3px; }
      .body-text { margin: 0; color: #5F6B7A; font-size: 15px; line-height: 1.65; }
      .actions { display: flex; flex-direction: column; gap: 12px; margin-top: 28px; }
      .btn {
        border-radius: 16px; padding: 16px 24px; font-size: 14px; font-weight: 700;
        cursor: pointer; border: none; width: 100%; font-family: inherit;
        transition: transform .15s ease, box-shadow .15s ease, background-color .15s ease, border-color .15s ease;
      }
      .btn:active { transform: scale(0.98); }
      .btn-primary { background: linear-gradient(135deg, #0CAF87, #0F6E56); color: #fff; box-shadow: 0 10px 24px rgba(12,175,135,0.28); }
      .btn-primary:hover { box-shadow: 0 14px 30px rgba(12,175,135,0.36); }
      .btn-secondary { background: #FFFFFF; color: #5F6B7A; border: 1.5px solid #E2E8F0; }
      .btn-secondary:hover { background: #F8FAFC; border-color: #CBD5E1; }
      .footnote { margin: 24px 0 0 0; text-align: center; color: #94A3B8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
      @media (max-width: 420px) {
        .card { padding: 32px 24px; border-radius: 24px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="brand">
        <div class="brand-mark">${icon("heart", { size: 18, filled: true })}</div>
        <div class="brand-name">Lima<em>Health</em></div>
      </div>
      <div class="card">${bodyHtml}</div>
      <p class="footnote">🔒 AES-256 Encrypted &middot; LimaHealth Technologies</p>
    </div>
  </body>
</html>`;

function renderReviewPage({ token, parentName, studentName }: { token: string; parentName: string; studentName: string }) {
  return pageShell(`
    <div class="icon-bubble" style="background:#EBF9F5;color:#0CAF87;">${icon("shield-check")}</div>
    <h1>Parental consent</h1>
    <p class="body-text">
      Hi ${parentName}, do you consent to <strong>${studentName}</strong>'s counselor viewing their
      mood and biometric wellness data on LimaHealth?
    </p>
    <div class="actions">
      <form method="POST" action="/api/v1/parent-consent/${token}/decision">
        <input type="hidden" name="decision" value="GRANTED" />
        <button type="submit" class="btn btn-primary">I consent</button>
      </form>
      <form method="POST" action="/api/v1/parent-consent/${token}/decision">
        <input type="hidden" name="decision" value="DECLINED" />
        <button type="submit" class="btn btn-secondary">I decline</button>
      </form>
    </div>
  `);
}

const STATUS_VARIANTS = {
  success: { bg: "#EBF9F5", color: "#0CAF87", icon: "check-circle" as const },
  neutral: { bg: "#F3F4F6", color: "#6B7280", icon: "check-circle" as const },
  error:   { bg: "#FEF2F2", color: "#EF4444", icon: "shield-alert" as const },
};

function renderStatusPage({ title, body, variant = "neutral" }: { title: string; body: string; variant?: keyof typeof STATUS_VARIANTS }) {
  const v = STATUS_VARIANTS[variant];
  return pageShell(`
    <div class="icon-bubble" style="background:${v.bg};color:${v.color};">${icon(v.icon)}</div>
    <h1>${title}</h1>
    <p class="body-text">${body}</p>
  `);
}
