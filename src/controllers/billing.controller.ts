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
    const { orgId, planTier, adminEmail } = req.body;

    if (!orgId || !planTier || !adminEmail) {
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
      orgId,
    });

    return res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("Stripe initialization error:", err);
    return res.status(500).json({ error: "Failed to initialize subscription." });
  }
};

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
    console.error("Webhook signature verification failed:", err);
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  try {
    const dataObject = event.data.object;

    let orgId = dataObject.metadata?.orgId;

    // Fallback: for invoice events, metadata lives on the subscription
    if (!orgId && dataObject.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        dataObject.subscription as string,
      );
      orgId = subscription.metadata?.orgId;
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        if (!orgId) break;

        const periodEndTimestamp = dataObject.current_period_end;
        const currentPeriodEnd = periodEndTimestamp
          ? new Date(periodEndTimestamp * 1000)
          : new Date();

        const planTierName =
          dataObject.items?.data[0]?.price?.nickname || "Standard";

        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: dataObject.id },
          update: {
            status: dataObject.status,
            currentPeriodEnd,
          },
          create: {
            orgId,
            stripeSubscriptionId: dataObject.id,
            planTier: planTierName,
            status: dataObject.status,
            currentPeriodEnd,
          },
        });

        if (dataObject.status === "active") {
          await prisma.organisation.update({
            where: { id: orgId },
            data: { status: "ACTIVE" },
          });
        }
        break;
      }

      case "checkout.session.completed": {
        if (dataObject.payment_status === "paid" && orgId) {
          await prisma.organisation.update({
            where: { id: orgId },
            data: { status: "ACTIVE" },
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        await prisma.subscription.update({
          where: { stripeSubscriptionId: dataObject.id },
          data: { status: "canceled" },
        });

        if (orgId) {
          await prisma.organisation.update({
            where: { id: orgId },
            data: { status: "EXPIRED" },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        if (orgId) {
          await prisma.organisation.update({
            where: { id: orgId },
            data: { status: "EXPIRED" },
          });
        }
        break;
      }

      default:
        // Unhandled event types are intentionally ignored
        break;
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook handling error:", err);
    // Return 200 to prevent Stripe from retrying; error is logged above
    return res.sendStatus(200);
  }
};

export const getSubscriptionStatus = async (req: Request, res: Response) => {
  const { orgId } = req.params;
  try {
    const sub = await prisma.subscription.findFirst({
      where: { orgId },
    });

    if (!sub) {
      return res.status(404).json({ active: false });
    }

    return res.status(200).json({
      active: sub.status === "active",
      subscription: sub,
    });
  } catch (err) {
    console.error("Error fetching subscription status:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
