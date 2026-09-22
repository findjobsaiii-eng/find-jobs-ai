// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildJobMatchesEmail } from "./jobEmailTemplate";

describe("job match email", () => {
  it("renders an RTL Hebrew email and escapes job content", () => {
    const email = buildJobMatchesEmail({
      displayName: "דנה <script>",
      jobs: [
        {
          title: "מפתחת <Senior>",
          companyName: "Acme & Co",
          location: "תל אביב",
          relevanceScore: 82.4,
        },
      ],
      dashboardUrl: "https://jobmiter.com",
      preferencesUrl: "https://jobmiter.com/profile/emails",
    });

    expect(email.html).toContain('lang="he" dir="rtl"');
    expect(email.html).toContain("מפתחת &lt;Senior&gt;");
    expect(email.html).toContain("Acme &amp; Co");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("https://jobmiter.com/profile/emails");
  });
});
