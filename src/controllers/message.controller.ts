import type { Response } from "express";
import type { AuthRequest } from "../middleware/auth.middleware.js";
import prisma from "../services/prisma.service.js";
import { sendPushNotification } from "../services/pushNotification.service.js";
import { z } from "zod";

const partySelect = { id: true, firstName: true, lastName: true } as const;

// Confirms `otherUserId` is someone `userId` is actually allowed to message —
// a counselor and one of their own assigned students, in either direction.
async function resolveConversationPartner(userId: string, role: string, otherUserId: string) {
  if (role === "COUNSELOR") {
    return prisma.user.findFirst({
      where: { id: otherUserId, assignedCounselorId: userId, role: { name: "STUDENT" } },
      select: partySelect,
    });
  }
  if (role === "STUDENT") {
    return prisma.user.findFirst({
      where: { id: otherUserId, assignedStudents: { some: { id: userId } }, role: { name: "COUNSELOR" } },
      select: partySelect,
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /messages — one row per conversation partner, with the last message
// and unread count. For a student this is at most one row (their counselor).
// ---------------------------------------------------------------------------
export const listConversations = async (req: AuthRequest, res: Response) => {
  const { id: userId, role } = req.user!;

  try {
    const partners =
      role === "COUNSELOR"
        ? await prisma.user.findMany({
            where: { assignedCounselorId: userId, role: { name: "STUDENT" } },
            select: partySelect,
          })
        : await prisma.user.findMany({
            where: { assignedStudents: { some: { id: userId } }, role: { name: "COUNSELOR" } },
            select: partySelect,
          });

    const conversations = await Promise.all(
      partners.map(async (partner) => {
        const [lastMessage, unreadCount] = await Promise.all([
          prisma.message.findFirst({
            where: {
              OR: [
                { senderId: userId, recipientId: partner.id },
                { senderId: partner.id, recipientId: userId },
              ],
            },
            orderBy: { createdAt: "desc" },
            select: { content: true, createdAt: true, senderId: true },
          }),
          prisma.message.count({ where: { senderId: partner.id, recipientId: userId, isRead: false } }),
        ]);

        return {
          userId: partner.id,
          name: `${partner.firstName} ${partner.lastName}`,
          lastMessage: lastMessage?.content ?? null,
          lastMessageAt: lastMessage?.createdAt ?? null,
          lastMessageFromMe: lastMessage?.senderId === userId,
          unreadCount,
        };
      }),
    );

    conversations.sort((a, b) => {
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });

    res.json({ success: true, data: conversations });
  } catch (error) {
    console.error("List Conversations Error:", error);
    res.status(500).json({ success: false, error: "Failed to load conversations" });
  }
};

// ---------------------------------------------------------------------------
// GET /messages/:userId — full thread with one conversation partner, oldest
// first. Marks their unread messages to me as read as a side effect of
// opening the thread.
// ---------------------------------------------------------------------------
export const getThread = async (req: AuthRequest, res: Response) => {
  const { id: userId, role } = req.user!;
  const otherUserId = req.params.userId;

  try {
    const partner = await resolveConversationPartner(userId, role, otherUserId);
    if (!partner) {
      return res.status(404).json({ success: false, error: "Conversation not found" });
    }

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, recipientId: otherUserId },
          { senderId: otherUserId, recipientId: userId },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, senderId: true, content: true, createdAt: true, isRead: true },
    });

    await prisma.message.updateMany({
      where: { senderId: otherUserId, recipientId: userId, isRead: false },
      data: { isRead: true },
    });

    res.json({
      success: true,
      data: {
        partner: { id: partner.id, name: `${partner.firstName} ${partner.lastName}` },
        messages,
      },
    });
  } catch (error) {
    console.error("Get Thread Error:", error);
    res.status(500).json({ success: false, error: "Failed to load conversation" });
  }
};

const sendSchema = z.object({
  recipientId: z.string().uuid("Invalid recipient"),
  content: z.string().trim().min(1, "Message cannot be empty").max(2000),
});

// ---------------------------------------------------------------------------
// POST /messages — send one message. Only within an existing
// counselor/assigned-student relationship, in either direction.
// ---------------------------------------------------------------------------
export const sendMessage = async (req: AuthRequest, res: Response) => {
  const { id: userId, role } = req.user!;

  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  }
  const { recipientId, content } = parsed.data;

  try {
    const partner = await resolveConversationPartner(userId, role, recipientId);
    if (!partner) {
      return res.status(403).json({ success: false, error: "You can only message your own counselor or caseload" });
    }

    const message = await prisma.message.create({
      data: { senderId: userId, recipientId, content },
      select: { id: true, senderId: true, content: true, createdAt: true, isRead: true },
    });

    res.status(201).json({ success: true, data: message });

    void sendPushNotification(
      recipientId,
      "New message",
      content.length > 100 ? `${content.slice(0, 100)}…` : content,
      { type: "message", senderId: userId },
    );
  } catch (error) {
    console.error("Send Message Error:", error);
    res.status(500).json({ success: false, error: "Failed to send message" });
  }
};
