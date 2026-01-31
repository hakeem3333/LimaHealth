import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import {
  stripe,
  createStripeCheckoutSession,
} from "../services/stripe.service";

export const createSubscriptionSession = async (
  req: Request,
  res: Response,
) => {
  try {
    const { schoolId, planTier, adminEmail } = req.body;

    if (!schoolId || !planTier || !adminEmail) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const priceId =
      planTier === "monthly"
        ? process.env.STRIPE_BASIC_PRICE
        : planTier === "yearly"
          ? process.env.STRIPE_STANDARD_PRICE
          : null;

    if (!priceId) {
      return res.status(400).json({ error: "Invalid plan tier." });
    }

    const session = await createStripeCheckoutSession({
      email: adminEmail,
      priceId,
      schoolId,
    });

    return res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("Stripe init error:", err);
    return res
      .status(500)
      .json({ error: "Failed to initialize subscription." });
  }
};

// ---------------- WEBHOOK -----------------------

export const stripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"]!;
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("⚠️ Webhook signature verification failed:", err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  try {
    const sub = event.data.object;
    const schoolId = sub.metadata?.schoolId;

    if (!schoolId) {
      console.warn(
        "⚠️ Webhook received without schoolId in metadata:",
        event.type,
      );
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        // 1. Upsert the Subscription record
        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: sub.id },
          update: {
            status: sub.status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
          create: {
            schoolId: schoolId,
            stripeSubscriptionId: sub.id,
            planTier: sub.items.data[0].price.nickname || "Standard",
            status: sub.status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });

        // 2. 🔑 CRITICAL: Update the School Status to ACTIVE if payment is good
        if (sub.status === "active" && schoolId) {
          await prisma.school.update({
            where: { id: schoolId },
            data: { status: "ACTIVE" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        // 1. Mark subscription as canceled
        await prisma.subscription.update({
          where: { stripeSubscriptionId: sub.id },
          data: { status: "canceled" },
        });

        // 2. 🔑 CRITICAL: Move School to EXPIRED
        if (schoolId) {
          await prisma.school.update({
            where: { id: schoolId },
            data: { status: "EXPIRED" },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        // Handle failed recurring payments
        if (schoolId) {
          await prisma.school.update({
            where: { id: schoolId },
            data: { status: "EXPIRED" }, // Or SUSPENDED
          });
        }
        break;
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook handling error:", err);
    return res.sendStatus(500);
  }
};

export const getSubscriptionStatus = async (req: Request, res: Response) => {
  const { schoolId } = req.params;

  try {
    const sub = await prisma.subscription.findFirst({
      where: { schoolId },
    });

    if (!sub) {
      return res.status(404).json({ active: false });
    }

    return res.status(200).json({
      active: sub.status === "active",
      subscription: sub,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};