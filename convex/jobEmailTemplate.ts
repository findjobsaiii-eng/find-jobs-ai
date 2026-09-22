export type JobEmailItem = {
  title: string;
  companyName: string;
  location: string | null;
  relevanceScore: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildJobMatchesEmail(args: {
  displayName: string | null;
  jobs: JobEmailItem[];
  dashboardUrl: string;
  preferencesUrl: string;
}) {
  const greeting = args.displayName?.trim()
    ? `היי ${escapeHtml(args.displayName.trim())},`
    : "היי,";
  const jobRows = args.jobs
    .map(
      (job) => `
        <tr><td style="padding:0 0 12px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dbe4f0;border-radius:14px;background:#ffffff">
            <tr><td style="padding:18px 20px;text-align:right">
              <div style="font-size:17px;font-weight:700;line-height:1.5;color:#12233f">${escapeHtml(job.title)}</div>
              <div style="margin-top:4px;font-size:14px;line-height:1.6;color:#50627d">${escapeHtml(job.companyName)}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</div>
              <div style="margin-top:10px;font-size:13px;font-weight:700;color:#087f8c">${Math.round(job.relevanceScore)}% התאמה</div>
            </td></tr>
          </table>
        </td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>משרות חדשות ב-JOBMITER</title></head>
<body dir="rtl" style="margin:0;background:#f3f7fb;font-family:Arial,'Noto Sans Hebrew',sans-serif;color:#12233f">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">מצאנו משרות שמתאימות לפרופיל שלך ב-JOBMITER</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7fb"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 10px 32px rgba(18,35,63,.08)">
      <tr><td style="background:#12233f;padding:28px 30px;text-align:right;color:#ffffff">
        <div style="font-size:22px;font-weight:800;letter-spacing:.2px">JOBMITER</div>
        <div style="margin-top:8px;font-size:14px;color:#cfe8ec">המשרות שלך, במקום אחד</div>
      </td></tr>
      <tr><td style="padding:30px;text-align:right">
        <p style="margin:0;font-size:17px;font-weight:700;line-height:1.7">${greeting}</p>
        <h1 style="margin:12px 0 8px;font-size:25px;line-height:1.4;color:#12233f">מצאנו משרות שמתאימות לך</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#50627d">בחרנו עבורך את ההתאמות המובילות לפי הפרופיל והעדפות העבודה שלך.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${jobRows}</table>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:14px auto 4px"><tr><td style="border-radius:12px;background:#1677ff">
          <a href="${escapeHtml(args.dashboardUrl)}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">לצפייה בכל המשרות</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="border-top:1px solid #e6edf5;padding:20px 30px;text-align:center;font-size:12px;line-height:1.8;color:#738198">
        קיבלת את ההודעה כי עדכוני המשרות פעילים בחשבון שלך.<br>
        <a href="${escapeHtml(args.preferencesUrl)}" style="color:#50627d;text-decoration:underline">שינוי תדירות או הפסקת הודעות</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    args.displayName?.trim() ? `היי ${args.displayName.trim()},` : "היי,",
    "מצאנו משרות שמתאימות לך ב-JOBMITER:",
    ...args.jobs.map(
      (job) =>
        `• ${job.title} — ${job.companyName}${job.location ? `, ${job.location}` : ""} (${Math.round(job.relevanceScore)}% התאמה)`,
    ),
    `לצפייה בכל המשרות: ${args.dashboardUrl}`,
    `שינוי תדירות או הפסקת הודעות: ${args.preferencesUrl}`,
  ].join("\n\n");

  return {
    subject: "מצאנו עבורך משרות מתאימות ב-JOBMITER",
    html,
    text,
  };
}
