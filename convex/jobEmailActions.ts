"use node";

import { Resend } from "resend";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { buildJobMatchesEmail } from "./jobEmailTemplate";

export const sendJobMatches = internalAction({
  args: { userId: v.id("users"), dayKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const delivery = await ctx.runMutation(
      internal.emailPreferences.prepareDelivery,
      { ...args, now },
    );
    if (!delivery) return null;

    const siteUrl = env.SITE_URL.replace(/\/$/, "");
    const content = buildJobMatchesEmail({
      displayName: delivery.displayName,
      jobs: delivery.jobs,
      dashboardUrl: siteUrl,
      preferencesUrl: `${siteUrl}/profile/emails`,
    });
    const resend = new Resend(env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send(
      {
        from: "JOBMITER <info@jobmiter.com>",
        to: [delivery.to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      },
      { idempotencyKey: delivery.deliveryKey },
    );
    await ctx.runMutation(internal.emailPreferences.finishDelivery, {
      userId: args.userId,
      deliveryKey: delivery.deliveryKey,
      sent: !error,
      resendEmailId: data?.id,
      now: Date.now(),
    });
    if (error) throw new Error(`Resend failed: ${error.name}`);
    return null;
  },
});
