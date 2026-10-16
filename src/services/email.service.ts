import nodemailer from "nodemailer";
import { buildOtpEmail } from "./otpEmail.template";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465, // auto TLS
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

// Optional but recommended
transporter.verify().then(() => {
  console.log("📨 Mail server ready");
}).catch(err => {
  console.error("❌ Mail server connection failed", err);
});

const FRONTEND_BASE_URL =
  process.env.FRONTEND_BASE_URL || "http://localhost:3001";

// The parent consent review page is server-rendered directly by this API
// (see parentConsent.controller.ts) — it has no counterpart in the Next.js
// admin app, so its link must point at the API's own origin, not the frontend.
const APP_BASE_URL =
  process.env.APP_BASE_URL || "http://localhost:3000";

// ==============================
// Generic Send Function
// ==============================
interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export const sendEmail = async (options: MailOptions) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      ...options,
    });

    console.log("📩 Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("❌ Email send error:", err);
    throw new Error("Email delivery failed");
  }
};

// ==============================
// Org-type email theming
// (mirrors lib/orgTheme.js in limahealth-admin / utils/orgTheme.js in the mobile app)
// ==============================
type OrgType = "SCHOOL" | "COMPANY" | "HOSPITAL" | "NGO";

const ORG_EMAIL_THEME: Record<OrgType, { color: string; tint: string; icon: string; label: string }> = {
  SCHOOL:   { color: "#0CAF87", tint: "#E8F8F3", icon: "🏫", label: "school" },
  COMPANY:  { color: "#6C5CE7", tint: "#EEE9FD", icon: "🏢", label: "company" },
  HOSPITAL: { color: "#0D3B7A", tint: "#E8EEF8", icon: "🏥", label: "hospital" },
  NGO:      { color: "#F9A825", tint: "#FEF3CD", icon: "🤝", label: "NGO" },
};

const getOrgEmailTheme = (orgType?: string) =>
  ORG_EMAIL_THEME[(orgType as OrgType) ?? "SCHOOL"] ?? ORG_EMAIL_THEME.SCHOOL;

// ==============================
// Verification Email
// ==============================
export const sendVerificationEmail = async (
  to: string,
  token: string,
  orgType?: string,
  orgName?: string,
) => {
  const verificationUrl = `${FRONTEND_BASE_URL}/verify-email?token=${token}`;
  const theme = getOrgEmailTheme(orgType);
  const orgPhrase = orgName ? `<strong>${orgName}</strong>` : `your ${theme.label}`;

  const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verify your email</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F4F7F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F7F6;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(13,59,122,0.08);">

            <!-- Header -->
            <tr>
              <td style="background-color:${theme.color};padding:32px 40px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td style="width:36px;height:36px;background-color:rgba(255,255,255,0.2);border-radius:10px;text-align:center;vertical-align:middle;font-size:17px;">${theme.icon}</td>
                    <td style="padding-left:10px;color:#FFFFFF;font-size:19px;font-weight:800;letter-spacing:0.2px;">LimaHealth</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:44px 40px 32px 40px;text-align:center;">
                <div style="width:60px;height:60px;background-color:${theme.tint};border-radius:16px;margin:0 auto 24px auto;line-height:60px;font-size:26px;">✉️</div>
                <h1 style="margin:0 0 12px 0;color:#1B2A3B;font-size:23px;font-weight:800;">Verify your email</h1>
                <p style="margin:0 0 32px 0;color:#5F6B7A;font-size:15px;line-height:1.6;">
                  You're one step away from setting up ${orgPhrase} on LimaHealth.
                  Confirm this is your email address to continue.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                  <tr>
                    <td style="border-radius:14px;background-color:${theme.color};">
                      <a href="${verificationUrl}"
                         style="display:inline-block;color:#FFFFFF;font-size:14px;font-weight:700;letter-spacing:0.3px;text-decoration:none;padding:16px 40px;">
                        Verify Email Address
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:28px 0 0 0;color:#94A3B8;font-size:12px;line-height:1.6;">
                  This link expires in 3 hours. If the button doesn't work, copy and paste this URL into your browser:
                </p>
                <p style="margin:8px 0 0 0;color:${theme.color};font-size:12px;word-break:break-all;">
                  ${verificationUrl}
                </p>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td style="padding:0 40px;">
                <div style="border-top:1px solid #EDF2F7;"></div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:28px 40px 36px 40px;text-align:center;">
                <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.6;">
                  Didn't request this? You can safely ignore this email.
                </p>
                <p style="margin:16px 0 0 0;color:#B4BEC9;font-size:11px;">
                  🔒 AES-256 encrypted &middot; LimaHealth Technologies
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

  const textOrgPhrase = orgName || `your ${theme.label}`;
  const text = `Verify your LimaHealth email\n\nConfirm this is your email address to finish setting up ${textOrgPhrase} on LimaHealth:\n${verificationUrl}\n\nThis link expires in 3 hours. If you didn't request this, you can safely ignore this email.`;

  return await sendEmail({
    to,
    subject: "Verify your LimaHealth email",
    html,
    text,
  });
};

// ==============================
// Parental Consent Request Email
// ==============================
export const sendParentConsentEmail = async ({
  to,
  parentName,
  studentName,
  token,
  orgType,
  orgName,
}: {
  to: string;
  parentName: string;
  studentName: string;
  token: string;
  orgType?: string;
  orgName?: string;
}) => {
  const reviewUrl = `${APP_BASE_URL}/api/v1/parent-consent/${token}`;
  const theme = getOrgEmailTheme(orgType);
  const orgPhrase = orgName ? `<strong>${escapeHtml(orgName)}</strong>'s` : `their ${theme.label}'s`;

  const html = renderEmailShell({
    theme,
    title: "Parental consent requested",
    preheader: `Please review data-sharing consent for ${studentName}`,
    emoji: "🛡️",
    heading: "Parental consent requested",
    bodyHtml: `
      ${paragraph(`Hi ${escapeHtml(parentName)}, <strong>${escapeHtml(studentName)}</strong> has been enrolled in ${orgPhrase} wellness program on LimaHealth. Because they're under 18, we need your consent before their counselor can view their mood and biometric data.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:12px auto 0 auto;">
        <tr>
          <td style="border-radius:14px;background-color:${theme.color};">
            <a href="${reviewUrl}"
               style="display:inline-block;color:#FFFFFF;font-size:14px;font-weight:700;letter-spacing:0.3px;text-decoration:none;padding:16px 40px;">
              Review Request
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:28px 0 0 0;color:#94A3B8;font-size:12px;line-height:1.6;">
        This link expires in 7 days. If the button doesn't work, copy and paste this URL into your browser:
      </p>
      <p style="margin:8px 0 0 0;color:${theme.color};font-size:12px;word-break:break-all;">${reviewUrl}</p>`,
    footerNote: `You're receiving this because you're listed as ${escapeHtml(studentName)}'s parent/guardian.`,
  });

  const text = `Parental consent requested\n\n${studentName} has been enrolled in ${orgName ? orgName + "'s" : "their " + theme.label + "'s"} wellness program on LimaHealth. Because they're under 18, we need your consent before their counselor can view their mood and biometric data.\n\nReview the request:\n${reviewUrl}\n\nThis link expires in 7 days.`;

  return await sendEmail({
    to,
    subject: `Parental consent needed for ${studentName}`,
    html,
    text,
  });
};


// ==============================
// Shared branded layout (used by the emails below)
// ==============================
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const renderEmailShell = ({
  theme,
  title,
  preheader,
  emoji,
  heading,
  bodyHtml,
  footerNote,
}: {
  theme: { color: string; tint: string; icon: string };
  title: string;
  preheader: string;
  emoji: string;
  heading: string;
  bodyHtml: string;
  footerNote: string;
}) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F4F7F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F7F6;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(13,59,122,0.08);">

            <tr>
              <td style="background-color:${theme.color};padding:32px 40px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td style="width:36px;height:36px;background-color:rgba(255,255,255,0.2);border-radius:10px;text-align:center;vertical-align:middle;font-size:17px;">${theme.icon}</td>
                    <td style="padding-left:10px;color:#FFFFFF;font-size:19px;font-weight:800;letter-spacing:0.2px;">LimaHealth</td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:44px 40px 32px 40px;text-align:center;">
                <div style="width:60px;height:60px;background-color:${theme.tint};border-radius:16px;margin:0 auto 24px auto;line-height:60px;font-size:26px;">${emoji}</div>
                <h1 style="margin:0 0 16px 0;color:#1B2A3B;font-size:23px;font-weight:800;">${heading}</h1>
                ${bodyHtml}
              </td>
            </tr>

            <tr>
              <td style="padding:0 40px;">
                <div style="border-top:1px solid #EDF2F7;"></div>
              </td>
            </tr>

            <tr>
              <td style="padding:28px 40px 36px 40px;text-align:center;">
                <p style="margin:0;color:#94A3B8;font-size:12px;line-height:1.6;">${footerNote}</p>
                <p style="margin:16px 0 0 0;color:#B4BEC9;font-size:11px;">
                  🔒 AES-256 encrypted &middot; LimaHealth Technologies
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const paragraph = (html: string) =>
  `<p style="margin:0 0 20px 0;color:#5F6B7A;font-size:15px;line-height:1.6;">${html}</p>`;

// ==============================
// Parent Login OTP Email
// ==============================
export const sendParentLoginOtpEmail = async ({
  to,
  name,
  code,
}: {
  to: string;
  name: string;
  code: string;
}) => {
  const theme = getOrgEmailTheme("SCHOOL");

  const { html, text } = buildOtpEmail({
    theme,
    code,
    expiresInMinutes: 10,
    heading: "Your sign-in code",
    greetingName: name,
    intro: "Use this code to sign in to LimaHealth.",
    preheader: `${code} is your LimaHealth sign-in code`,
    securityNote: "LimaHealth will never ask you for it by phone or chat.",
    footerNote: "Didn't request this? You can safely ignore this email — no one can sign in without the code.",
  });

  return await sendEmail({
    to,
    subject: `${code} is your LimaHealth sign-in code`,
    html,
    text,
  });
};

// ==============================
// Organisation Approved Email
// (sent to the org admin when a Super Admin activates a newly verified org —
// the login page tells pending admins to expect it)
// ==============================
export const sendOrgApprovedEmail = async ({
  to,
  name,
  orgName,
  orgType,
}: {
  to: string;
  name: string;
  orgName: string;
  orgType?: string;
}) => {
  const theme = getOrgEmailTheme(orgType);
  const loginUrl = `${FRONTEND_BASE_URL}/login`;

  const html = renderEmailShell({
    theme,
    title: "Your organisation is approved",
    preheader: `${orgName} is approved — you can now sign in to LimaHealth`,
    emoji: "✅",
    heading: "You're approved",
    bodyHtml: `
      ${paragraph(`Hi ${escapeHtml(name)}, <strong>${escapeHtml(orgName)}</strong> has been approved. You can now sign in and start setting up your ${theme.label}.`)}
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 8px auto;">
        <tr>
          <td style="background-color:${theme.color};border-radius:12px;">
            <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;">Sign in to LimaHealth</a>
          </td>
        </tr>
      </table>`,
    footerNote: "You received this because you registered this organisation on LimaHealth.",
  });

  return await sendEmail({
    to,
    subject: `${orgName} is approved on LimaHealth`,
    html,
    text: `Hi ${name},\n\n${orgName} has been approved. You can now sign in at ${loginUrl}\n\n— The LimaHealth Team`,
  });
};

// ==============================
// Welcome Email
// ==============================
export const sendWelcomeEmail = async ({
  to,
  name,
  role,
  password,
  orgType,
  orgName,
}: {
  to: string;
  name: string;
  role: string;
  password: string;
  orgType?: string;
  orgName?: string;
}) => {
  const theme = getOrgEmailTheme(orgType);
  const orgPhrase = orgName ? ` at <strong>${escapeHtml(orgName)}</strong>` : "";

  const credentialRow = (label: string, value: string, mono = false) => `
    <tr>
      <td style="padding:14px 20px;text-align:left;border-bottom:1px solid #EDF2F7;">
        <p style="margin:0 0 4px 0;color:#94A3B8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${label}</p>
        <p style="margin:0;color:#1B2A3B;font-size:${mono ? "17px" : "15px"};font-weight:700;${mono ? "font-family:'SF Mono',Menlo,Consolas,monospace;letter-spacing:1px;" : ""}word-break:break-all;">${escapeHtml(value)}</p>
      </td>
    </tr>`;

  const html = renderEmailShell({
    theme,
    title: "Welcome to LimaHealth",
    preheader: "Your LimaHealth account is ready — here are your login details",
    emoji: "🎉",
    heading: `Welcome, ${escapeHtml(name)}`,
    bodyHtml: `
      ${paragraph(`You've been added to LimaHealth${orgPhrase} as <strong style="color:${theme.color};">${escapeHtml(role)}</strong>. Here are your temporary login details:`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px 0;border:1px solid #EDF2F7;border-radius:14px;overflow:hidden;background-color:#FAFCFB;">
        ${credentialRow("Email", to)}
        ${credentialRow("Temporary password", password, true)}
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFF8E6;border-radius:12px;">
        <tr>
          <td style="padding:14px 18px;text-align:left;color:#8A6100;font-size:13px;line-height:1.6;">
            <strong>Security tip:</strong> please change this password as soon as you sign in, and don't share it with anyone.
          </td>
        </tr>
      </table>`,
    footerNote: "If you weren't expecting this invitation, you can safely ignore this email.",
  });

  return await sendEmail({
    to,
    subject: "Welcome to LimaHealth 🎉",
    html,
    text: `Hi ${name},\n\nWelcome to LimaHealth! You've been added as ${role}.\n\nEmail: ${to}\nTemporary password: ${password}\n\nPlease log in and change your password immediately.\n\n— The LimaHealth Team`,
  });
};
