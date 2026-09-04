import prisma from "./prisma.service";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

/**
 * Sends an Expo push notification to a single user, looking up their stored
 * push token. Silently no-ops if the user has no token registered (e.g. web
 * users, or a device that never granted permission) — notifications are
 * best-effort and must never block or fail the request that triggers them.
 */
export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });
    if (!user?.pushToken) return;

    await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify({
        to: user.pushToken,
        title,
        body,
        data,
        sound: "default",
      }),
    });
  } catch (error) {
    console.error("Push notification send failed:", error);
  }
}
