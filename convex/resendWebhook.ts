import { Webhook } from "standardwebhooks";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";

const SUPPORTED_EMAIL_EVENTS: Record<
  string,
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked"
  | "failed"
  | "suppressed"
> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

export const handle = httpAction(async (ctx, request) => {
  const webhookSecret = (
    env as unknown as Record<string, string | undefined>
  ).RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return new Response("Webhook is not configured", { status: 503 });
  }

  const providerEventId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!providerEventId || !timestamp || !signature) {
    return new Response("Missing webhook signature", { status: 400 });
  }

  const payload = await request.text();
  let event: unknown;
  try {
    event = new Webhook(webhookSecret).verify(payload, {
      "webhook-id": providerEventId,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    });
  } catch {
    return new Response("Invalid webhook signature", { status: 400 });
  }

  if (
    typeof event !== "object" ||
    event === null ||
    !("type" in event) ||
    typeof event.type !== "string" ||
    !("created_at" in event) ||
    typeof event.created_at !== "string" ||
    !("data" in event) ||
    typeof event.data !== "object" ||
    event.data === null
  ) {
    return new Response("Invalid webhook payload", { status: 400 });
  }
  const type = SUPPORTED_EMAIL_EVENTS[event.type];
  if (!type || !("email_id" in event.data)) {
    return new Response(null, { status: 204 });
  }
  if (typeof event.data.email_id !== "string") {
    return new Response("Invalid email identifier", { status: 400 });
  }
  const occurredAt = Date.parse(event.created_at);
  if (!Number.isFinite(occurredAt)) {
    return new Response("Invalid event timestamp", { status: 400 });
  }

  const result = await ctx.runMutation(
    internal.emailDeliveryEvents.recordWebhookEvent,
    {
      providerEventId,
      resendEmailId: event.data.email_id,
      type,
      occurredAt,
    },
  );
  if (result === "delivery_not_found") {
    return new Response("Delivery is not registered yet", { status: 503 });
  }
  return new Response(null, { status: 204 });
});
