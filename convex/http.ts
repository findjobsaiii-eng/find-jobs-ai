import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handle as resendWebhook } from "./resendWebhook";
import { handle as unsubscribeReminder } from "./onboardingReminderUnsubscribe";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/resend-webhook", method: "POST", handler: resendWebhook });
http.route({
  path: "/onboarding-reminders/unsubscribe",
  method: "GET",
  handler: unsubscribeReminder,
});
http.route({
  path: "/onboarding-reminders/unsubscribe",
  method: "POST",
  handler: unsubscribeReminder,
});

export default http;
