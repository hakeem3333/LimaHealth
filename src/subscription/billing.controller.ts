import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import {
  stripe,
  createStripeCheckoutSession,
} from "../services/stripe.service";

export const createSubscriptionSession = async (
  req: Request,
  res: Response
) => {
  try {
    const { schoolId, planTier, adminEmail } = req.body;

    if (!schoolId || !planTier || !adminEmail) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const priceId =
      planTier === "basic"
        ? process.env.STRIPE_BASIC_PRICE
        : planTier === "standard"
        ? process.env.STRIPE_STANDARD_PRICE
        : process.env.STRIPE_PREMIUM_PRICE;

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
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("⚠️ Webhook signature verification failed:", err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;

        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: sub.id },
          update: {
            schoolId: sub.metadata.schoolId,
            planTier: sub.items.data[0].price.nickname || "",
            status: sub.status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
          create: {
            schoolId: sub.metadata.schoolId,
            stripeSubscriptionId: sub.id,
            planTier: sub.items.data[0].price.nickname || "",
            status: sub.status,
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: "canceled" },
        });
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
