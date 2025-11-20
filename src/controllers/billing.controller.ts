import type { Request, Response } from "express";
import prisma from "../services/prisma.service";
import { initializeSubscription } from "../services/paystack.service";
import crypto from "crypto";

export const createSubscriptionSession = async (
  req: Request,
  res: Response
) => {
  try {
    const { schoolId, planTier, adminEmail } = req.body;

    if (!schoolId || !planTier || !adminEmail) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const planCode =
      planTier === "basic"
        ? process.env.PAYSTACK_BASIC_PLAN
        : planTier === "standard"
        ? process.env.PAYSTACK_STANDARD_PLAN
        : process.env.PAYSTACK_PREMIUM_PLAN;

    if (!planCode) {
      return res.status(400).json({ error: "Invalid plan tier." });
    }

    // initialize checkout URL
    const session = await initializeSubscription({
      email: adminEmail,
      plan: planCode,
    });

    return res.status(200).json({
      authorizationUrl: session.data.authorization_url,
      reference: session.data.reference,
    });
  } catch (err) {
    console.error("Paystack init error:", err);
    return res
      .status(500)
      .json({ error: "Failed to initialize subscription." });
  }
};

export const paystackWebhook = async (req: Request, res: Response) => {
  const secret = process.env.PAYSTACK_SECRET_KEY!;
  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.body.event;
  const data = req.body.data;

  try {
    switch (event) {
      case "subscription.create":
        console.log("Subscription created:", data);

        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: data.subscription_code }, // reuse field
          update: {
            schoolId: data.customer.metadata.schoolId,
            planTier: data.plan.name,
            status: data.status,
            currentPeriodEnd: new Date(data.next_payment_date),
          },
          create: {
            schoolId: data.customer.metadata.schoolId,
            stripeSubscriptionId: data.subscription_code,
            planTier: data.plan.name,
            status: data.status,
            currentPeriodEnd: new Date(data.next_payment_date),
          },
        });

        break;

      case "invoice.payment_succeeded":
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: data.subscription.subscription_code },
          data: {
            status: "active",
            currentPeriodEnd: new Date(data.subscription.next_payment_date),
          },
        });
        break;

      case "invoice.payment_failed":
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: data.subscription.subscription_code },
          data: { status: "past_due" },
        });
        break;

      case "subscription.disable":
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: data.subscription_code },
          data: { status: "cancelled" },
        });
        break;
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Webhook handling error:", err);
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
      return res
        .status(404)
        .json({ active: false, message: "No subscription found" });
    }

    return res.status(200).json({
      active: sub.status === "active",
      subscription: sub,
    });
  } catch (err) {
    console.error("Error fetching subscription:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
