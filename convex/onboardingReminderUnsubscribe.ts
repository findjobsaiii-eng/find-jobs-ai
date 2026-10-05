import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { escapeEmailHtml, reminderCopy } from "./onboardingReminderTemplate";

export const handle = httpAction(async (ctx, request) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/u.test(token))
    return new Response("Not found", { status: 404 });
  const language = await ctx.runQuery(
    internal.onboardingReminders.unsubscribeLanguage,
    { token },
  );
  if (!language) return new Response("Not found", { status: 404 });
  const copy = reminderCopy[language];
  const posted = request.method === "POST";
  if (posted)
    await ctx.runMutation(internal.onboardingReminders.unsubscribe, { token });
  // GET only shows confirmation: link scanners cannot unsubscribe a user.
  const content = posted
    ? `<h1>${escapeEmailHtml(copy.unsubscribed)}</h1>`
    : `<h1>${escapeEmailHtml(copy.unsubscribeTitle)}</h1><p>${escapeEmailHtml(copy.unsubscribeBody)}</p><form method="post"><button type="submit">${escapeEmailHtml(copy.unsubscribeConfirm)}</button></form>`;
  return new Response(
    `<!doctype html><html lang="${language}" dir="${language === "he" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeEmailHtml(copy.unsubscribe)}</title></head><body style="font-family:Arial,sans-serif;background:#f3f7fb;color:#12233f;padding:24px"><main style="max-width:520px;margin:40px auto;padding:28px;background:white;border-radius:16px">${content}</main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
});
