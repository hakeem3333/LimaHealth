import nodemailer from "nodemailer";

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
// Welcome Email
// ==============================
export const sendWelcomeEmail = async ({
  to,
  name,
  role,
  password,
}: {
  to: string;
  name: string;
  role: string;
  password: string;
}) => {
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
      <h2>Hi ${name},</h2>
      <p>Welcome to <strong>BioAware</strong>! You’ve been added as a <strong>${role}</strong>.</p>
      <p><strong>Your temporary access credentials:</strong></p>
      <ul>
        <li><strong>Email:</strong> ${to}</li>
        <li><strong>Temporary Password:</strong> ${password}</li>
      </ul>
      <p>Please log in and change your password immediately.</p>
      <p>— The BioAware Team</p>
    </div>
  `;

  return await sendEmail({
    to,
    subject: "Welcome to BioAware 🎉",
    html,
  });
};
