import { sendEmail } from "./email.service";
import { buildOtpEmail, type OtpEmailTheme } from "./otpEmail.template";

type OrgType = "SCHOOL" | "COMPANY" | "HOSPITAL" | "NGO";

// Mirrors the org colours in email.service.ts / lib/orgTheme.js in the admin app.
const ORG_THEMES: Record<OrgType, OtpEmailTheme & { label: string }> = {
  SCHOOL:   { color: "#0CAF87", tint: "#E8F8F3", icon: "🏫", label: "school" },
  COMPANY:  { color: "#6C5CE7", tint: "#EEE9FD", icon: "🏢", label: "company" },
  HOSPITAL: { color: "#0D3B7A", tint: "#E8EEF8", icon: "🏥", label: "hospital" },
  NGO:      { color: "#F9A825", tint: "#FEF3CD", icon: "🤝", label: "NGO" },
};

const themeFor = (orgType?: string | null) =>
  ORG_THEMES[(orgType as OrgType) ?? "SCHOOL"] ?? ORG_THEMES.SCHOOL;

export const sendAdminLoginOtpEmail = async ({
  to,
  name,
  code,
  orgType,
  orgName,
}: {
  to: string;
  name: string;
  code: string;
  orgType?: string | null | undefined;
  orgName?: string | null | undefined;
}) => {
  const theme = themeFor(orgType);
  const { html, text } = buildOtpEmail({
    theme,
    code,
    expiresInMinutes: 10,
    heading: "Your admin sign-in code",
    greetingName: name,
    intro: `Use this code to finish signing in to the ${orgName || theme.label} admin portal on LimaHealth.`,
    preheader: "Use this one-time code to finish signing in. It expires in 10 minutes.",
    securityNote: "LimaHealth staff will never ask you for it.",
    footerNote:
      "Didn't try to sign in? Someone entered your password correctly, so we recommend changing it right away.",
  });

  return sendEmail({ to, subject: "Your LimaHealth admin login code", html, text });
};

export const sendSuperAdminOtpEmail = async ({
  to,
  name,
  code,
}: {
  to: string;
  name: string;
  code: string;
}) => {
  const { html, text } = buildOtpEmail({
    theme: { color: "#123B39", tint: "#E4EDEC", icon: "🛡️" },
    code,
    expiresInMinutes: 5,
    heading: "Super Admin access code",
    greetingName: name,
    intro: "Use this code to complete your Super Admin sign-in. It grants platform-wide access.",
    preheader: "Your Super Admin access code is inside. It expires in 5 minutes.",
    securityNote: "Never share it with anyone, including colleagues or support.",
    footerNote:
      "Didn't try to sign in? Change your password immediately and alert your security lead. Your password was entered correctly.",
    badge: "Super Admin",
  });

  return sendEmail({ to, subject: "Super Admin Access Code", html, text });
};
