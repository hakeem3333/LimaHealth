import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // smtp4dev is not SSL
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

export const sendVerificationEmail = async (to: string, token: string) => {
  const verificationUrl = `http://localhost:3000/api/v1/auth/verify-email?token=${token}`;

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: "Verify your email",
    html: `<p>Click <a href="${verificationUrl}">here</a> to verify your email.</p>`,
  });

  console.log("Preview URL (smtp4dev):", info.messageId);
  return info;
};
