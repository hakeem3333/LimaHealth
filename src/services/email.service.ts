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

const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

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
// Verification Email
// ==============================
export const sendVerificationEmail = async (to: string, token: string) => {
  const verificationUrl = `${APP_BASE_URL}/api/v1/auth/verify-email?token=${token}`;

  return await sendEmail({
    to,
    subject: "Verify Your Email",
    html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`,
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
