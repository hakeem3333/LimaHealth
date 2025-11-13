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


// export const sendEmail = async (to: string, subject: string, html: string) => {
//   const info = await transporter.sendMail({
//     from: process.env.EMAIL_FROM,
//     to,
//     subject,
//     html,
//   });

//   console.log("Email sent:", info.messageId);
//   return info;
// };

interface MailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const sendEmail = async ({ to, subject, text, html }: MailOptions) => {
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });

  console.log("Email sent:", info.messageId);
  return info;
};

// 🔹 Welcome email for new users
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
  const subject = `Welcome to BioAware! 🎉`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
      <h2>Hi ${name},</h2>
      <p>Welcome to <strong>BioAware</strong>! You’ve been added as a <strong>${role}</strong> in your school’s BioAware account.</p>
      <p><strong>Your login details:</strong></p>
      <ul>
        <li><strong>Email:</strong> ${to}</li>
        <li><strong>Password:</strong> ${password}</li>
      </ul>
      <p>👉 Please log in and update your password immediately for security.</p>
      <p>— The BioAware Team</p>
    </div>
  `;

  return sendEmail({ to, subject, html });
};