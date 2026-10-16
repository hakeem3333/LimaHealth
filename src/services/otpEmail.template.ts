export interface OtpEmailTheme {
  color: string;
  tint: string;
  icon: string;
}

export interface OtpEmailOptions {
  theme: OtpEmailTheme;
  code: string;
  expiresInMinutes: number;
  heading: string;
  greetingName?: string;
  intro: string;
  preheader: string;
  securityNote: string;
  footerNote: string;
  badge?: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Darkens a #RRGGBB colour; used for gradient ends and for text that must stay
// readable on the org tint (e.g. amber on cream).
const darken = (hex: string, amount: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  const channel = (shift: number) =>
    Math.max(0, Math.round(((n >> shift) & 255) * (1 - amount)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
};

const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function buildOtpEmail(opts: OtpEmailOptions): { html: string; text: string } {
  const { theme, code, expiresInMinutes, heading, greetingName, intro, preheader, securityNote, footerNote, badge } = opts;
  const minutes = `${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}`;
  const deep = darken(theme.color, 0.22);
  const labelColor = darken(theme.color, 0.3);

  const greeting = greetingName ? `Hi ${escapeHtml(greetingName)},` : "Hello,";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${escapeHtml(heading)}</title>
    <style>
      @media (max-width: 480px) {
        .px { padding-left: 22px !important; padding-right: 22px !important; }
        .code { font-size: 34px !important; letter-spacing: 7px !important; padding-left: 7px !important; }
        .code-box { padding: 22px 8px !important; }
      }
      @media (prefers-color-scheme: dark) {
        .page { background-color: #0F1715 !important; }
        .card { background-color: #17221F !important; box-shadow: none !important; }
        .h1 { color: #F1F5F4 !important; }
        .body-text { color: #A9B8B6 !important; }
        .code-box { background-color: #0F1715 !important; }
        .code { color: #FFFFFF !important; }
        .note { background-color: #0F1715 !important; border-color: #263532 !important; }
        .note-text { color: #A9B8B6 !important; }
        .divider { border-top-color: #263532 !important; }
        .muted { color: #7C8D8A !important; }
        .accent { color: ${theme.color} !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#F4F7F6;font-family:${SANS};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
    <table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F7F6;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" class="card" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(13,59,122,0.10);">

            <!-- Header -->
            <tr>
              <td style="background-color:${theme.color};background-image:linear-gradient(135deg,${theme.color},${deep});padding:30px 40px;text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
                  <tr>
                    <td style="width:38px;height:38px;background-color:rgba(255,255,255,0.22);border-radius:11px;text-align:center;vertical-align:middle;font-size:18px;">${theme.icon}</td>
                    <td style="padding-left:11px;color:#FFFFFF;font-size:20px;font-weight:800;letter-spacing:0.2px;">LimaHealth</td>
                  </tr>
                </table>${
                  badge
                    ? `
                <div style="margin-top:14px;"><span style="display:inline-block;background-color:rgba(255,255,255,0.2);color:#FFFFFF;border-radius:999px;padding:5px 12px;font-size:10px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">${escapeHtml(badge)}</span></div>`
                    : ""
                }
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td class="px" style="padding:42px 40px 8px 40px;text-align:center;">
                <div style="width:64px;height:64px;background-color:${theme.tint};border-radius:20px;margin:0 auto 22px auto;line-height:64px;font-size:28px;">🔐</div>
                <h1 class="h1" style="margin:0 0 10px 0;color:#1B2A3B;font-size:25px;line-height:1.25;font-weight:800;">${escapeHtml(heading)}</h1>
                <p class="body-text" style="margin:0 0 30px 0;color:#5F6B7A;font-size:15px;line-height:1.65;">
                  <strong class="h1" style="color:#1B2A3B;">${greeting}</strong><br />
                  ${escapeHtml(intro)}
                </p>

                <!-- Code -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
                  <tr>
                    <td class="code-box" align="center" style="background-color:${theme.tint};border:2px dashed ${theme.color};border-radius:20px;padding:26px 12px;">
                      <div class="accent" style="font-size:11px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;color:${labelColor};margin-bottom:12px;">Your one-time code</div>
                      <div class="code" style="font-family:${MONO};font-size:42px;line-height:1;font-weight:800;letter-spacing:11px;padding-left:11px;color:#1B2A3B;">${escapeHtml(code)}</div>
                    </td>
                  </tr>
                </table>

                <!-- Expiry -->
                <span style="display:inline-block;background-color:#FEF3CD;color:#92400E;border-radius:999px;padding:8px 16px;font-size:12px;font-weight:700;letter-spacing:0.2px;">⏱&nbsp; Expires in ${minutes}</span>
              </td>
            </tr>

            <!-- Security note -->
            <tr>
              <td class="px" style="padding:26px 40px 34px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="note" style="background-color:#F8FAF9;border:1px solid #E6EDEB;border-radius:16px;padding:16px 18px;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td valign="top" style="font-size:18px;line-height:1.3;padding-right:12px;">🛡️</td>
                          <td class="note-text" style="color:#5F6B7A;font-size:13px;line-height:1.6;text-align:left;">
                            <strong class="accent" style="color:${labelColor};">Keep this code private.</strong> ${escapeHtml(securityNote)}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Divider -->
            <tr>
              <td class="px" style="padding:0 40px;">
                <div class="divider" style="border-top:1px solid #EDF2F7;"></div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td class="px" style="padding:26px 40px 34px 40px;text-align:center;">
                <p class="muted" style="margin:0;color:#94A3B8;font-size:12px;line-height:1.65;">${escapeHtml(footerNote)}</p>
                <p class="muted" style="margin:16px 0 0 0;color:#B4BEC9;font-size:11px;">🔒 AES-256 encrypted &middot; LimaHealth Technologies</p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    heading,
    "",
    `${greetingName ? `Hi ${greetingName},` : "Hello,"} ${intro}`,
    "",
    `Your one-time code: ${code}`,
    `It expires in ${minutes}.`,
    "",
    `Keep this code private. ${securityNote}`,
    "",
    footerNote,
  ].join("\n");

  return { html, text };
}
