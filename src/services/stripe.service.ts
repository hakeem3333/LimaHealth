import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export const createStripeCheckoutSession = async ({
  email,
  priceId,
  schoolId,
}: {
  email: string;
  priceId: string;
  schoolId: string;
}) => {
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
};
