import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { handle as resendWebhook } from "./resendWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({ path: "/resend-webhook", method: "POST", handler: resendWebhook });

export default http;
