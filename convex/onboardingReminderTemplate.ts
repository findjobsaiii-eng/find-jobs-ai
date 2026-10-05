import en from "../src/i18n/locales/en.json";
import he from "../src/i18n/locales/he.json";

export const reminderCopy = {
  en: en.onboardingReminder,
  he: he.onboardingReminder,
};
export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
export function buildOnboardingReminderEmail(args: {
  language: "en" | "he";
  phase: "24h" | "72h";
  displayName: string | null;
  setupUrl: string;
  unsubscribeUrl: string;
}) {
  const copy = reminderCopy[args.language];
  const final = args.phase === "72h";
  const subject = final ? copy.subject72 : copy.subject24;
  const heading = final ? copy.heading72 : copy.heading24;
  const body = final ? copy.body72 : copy.body24;
  const greeting = `${copy.greeting}${args.displayName?.trim() ? ` ${args.displayName.trim()}` : ""},`;
  const direction = args.language === "he" ? "rtl" : "ltr";
  const alignment = direction === "rtl" ? "right" : "left";
  const html = `<!doctype html><html lang="${args.language}" dir="${direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeEmailHtml(subject)}</title></head>
<body style="margin:0;background:#f3f7fb;font-family:Arial,sans-serif;color:#12233f" dir="${direction}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:white;border-radius:20px">
<tr><td style="padding:26px 30px;background:#12233f;color:white;font-size:22px;font-weight:800;text-align:${alignment};border-radius:20px 20px 0 0">JOBMITER</td></tr>
<tr><td style="padding:30px;text-align:${alignment}"><p style="font-size:16px;line-height:1.7">${escapeEmailHtml(greeting)}</p><h1 style="font-size:25px;line-height:1.4">${escapeEmailHtml(heading)}</h1><p style="font-size:16px;line-height:1.8;color:#50627d">${escapeEmailHtml(body)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px auto 8px"><tr><td style="background:#1677ff;border-radius:12px"><a href="${escapeEmailHtml(args.setupUrl)}" style="display:inline-block;padding:15px 22px;color:white;text-decoration:none;font-weight:700;font-size:15px">${escapeEmailHtml(copy.cta)}</a></td></tr></table></td></tr>
<tr><td style="padding:20px 30px;border-top:1px solid #e6edf5;text-align:center;color:#738198;font-size:12px;line-height:1.8">${escapeEmailHtml(copy.footer)}<br><a href="${escapeEmailHtml(args.unsubscribeUrl)}" style="color:#50627d">${escapeEmailHtml(copy.unsubscribe)}</a></td></tr>
</table></td></tr></table></body></html>`;
  return {
    subject,
    html,
    text: [
      greeting,
      heading,
      body,
      `${copy.cta}: ${args.setupUrl}`,
      copy.footer,
      `${copy.unsubscribe}: ${args.unsubscribeUrl}`,
    ].join("\n\n"),
  };
}
