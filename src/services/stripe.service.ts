import Stripe from "stripe";

// --- 1. Environment Variable Validation ---
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is not set.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

interface CheckoutSessionParams {
  email: string;
  priceId: string;
  schoolId: string;
}

export const createStripeCheckoutSession = async ({
  email,
  priceId,
  schoolId,
}: CheckoutSessionParams) => {

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],

      metadata: {
        schoolId: schoolId,
      },

      subscription_data: {
        metadata: {
          schoolId: schoolId,
        },
      },

      success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/billing/cancel`,
    });

    return session;
  } catch (error) {
    console.error("Stripe Checkout Session Creation Failed:", error);

    throw new Error("Failed to process payment request via Stripe.");
  }
};
