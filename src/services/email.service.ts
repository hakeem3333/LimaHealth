export const sendVerificationEmail = async (email: string, token: string) => {
  const link = `${process.env.APP_URL}/verify-email?token=${token}`;

  // 🔥 DEV MODE: Show link in console + return
  if (process.env.NODE_ENV !== "production") {
    console.log("✅ Verification link (DEV):", link);
    return { preview: link };
  }

  // ✅ PRODUCTION — send real email
  // TODO: integrate mail provider here (SES, SendGrid, Mailgun, etc.)

  // Example placeholder
  console.log(`Sending verification email to ${email}...`);
  return {};
};
