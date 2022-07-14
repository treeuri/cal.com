import { Prisma } from "@prisma/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { stringify } from "querystring";
import z from "zod";

import prisma from "@calcom/prisma";
import stripe, { StripeData } from "@calcom/stripe/server";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const querySchema = z.object({
    code: z.string(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  });

  const parsedQuery = querySchema.safeParse(req.query);
  const { code, error, error_description } = parsedQuery.success
    ? parsedQuery.data
    : { code: undefined, error: undefined, error_description: undefined };

  if (!code) {
    if (error) {
      const query = stringify({ error, error_description });
      res.redirect("/apps/installed?" + query);
      return;
    }
  }

  if (!req.session?.user?.id) {
    return res.status(401).json({ message: "You must be logged in to do this" });
  }

  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });

  const data: StripeData = { ...response, default_currency: "" };
  if (response["stripe_user_id"]) {
    const account = await stripe.accounts.retrieve(response["stripe_user_id"]);
    data["default_currency"] = account.default_currency;
  }

  await prisma.credential.create({
    data: {
      type: "stripe_payment",
      key: data as unknown as Prisma.InputJsonObject,
      userId: req.session.user.id,
      appId: "stripe",
    },
  });

  res.redirect("/apps/installed");
}
