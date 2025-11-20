import axios from "axios";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

export const initializeSubscription = async ({
  email,
  plan,
}: {
  email: string;
  plan: string;
}) => {
  const response = await axios.post(
    "https://api.paystack.co/transaction/initialize",
    {
      email,
      plan,
    },
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
};
