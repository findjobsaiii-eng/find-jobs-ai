"use node";
import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";

export const send = internalAction({
  args: { reminderId: v.id("onboardingReminders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (env.ONBOARDING_REMINDERS_ENABLED !== "true") return null;
    const delivery = await ctx.runMutation(
      internal.onboardingReminders.prepare,
      { ...args, unsubscribeToken: randomBytes(32).toString("hex") },
    );
    if (!delivery) return null;
    // Freeze recipient/content in prepare so every retry has the same idempotent payload.
    let resendEmailId: string | undefined;
    let retryable = true;
    try {
      const result = await new Resend(env.RESEND_API_KEY).emails.send(
        {
          from: "JOBMITER <info@jobmiter.com>",
          to: [delivery.to],
          ...delivery.message,
          headers: {
            "List-Unsubscribe": `<${delivery.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        },
        { idempotencyKey: delivery.deliveryKey },
      );
      resendEmailId = result.data?.id;
      if (result.error)
        retryable =
          !result.error.statusCode ||
          result.error.statusCode === 429 ||
          result.error.statusCode >= 500;
    } catch {
      // The scheduled watchdog retries network failures with the same key.
    }
    await ctx.runMutation(internal.onboardingReminders.finish, {
      reminderId: args.reminderId,
      attempt: delivery.attempt,
      resendEmailId,
      retryable,
    });
    return null;
  },
});
