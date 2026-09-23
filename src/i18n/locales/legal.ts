export const legalVersion = "2026-09-23";

type Section = { heading: string; body: string };
type Page = { title: string; introduction: string; sections: Section[] };
type LegalLocale = Record<
  "terms" | "privacy" | "cookies" | "accessibility" | "contact",
  Page
>;

export const legalPages: Record<"he" | "en", LegalLocale> = {
  he: {
    terms: {
      title: "תנאי שימוש",
      introduction:
        "תנאים אלה מסדירים את השימוש ב־JOBMITER, שירות חינמי הנמצא בשלב בדיקת שוק. לפניות: info@jobmiter.com.",
      sections: [
        {
          heading: "השירות והזכאות",
          body: "JOBMITER מאפשר יצירת פרופיל, העלאת קורות חיים, ניתוח בעזרת AI, חיפוש משרות ומעקב אחר מועמדויות. השימוש מיועד לבני 18 ומעלה. השירות מוצע כרגע ללא תשלום ויכול להשתנות.",
        },
        {
          heading: "חשבון ושימוש מותר",
          body: "הכניסה מתבצעת באמצעות חשבון Google. יש למסור מידע נכון, להגן על הגישה לחשבון, ולהשתמש בשירות רק למטרות חוקיות. אין להעלות מידע של אדם אחר ללא הרשאה, לנסות לגשת למידע של משתמשים אחרים, לעקוף מגבלות או להפריע להפעלת השירות.",
        },
        {
          heading: "AI והחלטות תעסוקה",
          body: "ניתוח קורות החיים, דירוג והתאמת משרות נעשים גם באמצעות כלי AI ועלולים להיות שגויים או לא שלמים. יש לבדוק משרות, דרישות והמלצות באופן עצמאי. אין התחייבות למציאת עבודה, לקבלת ראיון או לדיוק ההתאמות.",
        },
        {
          heading: "משרות וקישורים חיצוניים",
          body: "מודעות וקישורים עשויים להוביל לאתרי מעסיקים או לצדדים שלישיים. המשרות עשויות להשתנות, לפוג או להיות לא מדויקות. תנאי אותם אתרים ומדיניות הפרטיות שלהם חלים על השימוש בהם.",
        },
        {
          heading: "תוכן וקניין רוחני",
          body: "הזכויות במידע ובקורות החיים שהמשתמש מעלה נשארות שלו או של בעל הזכויות. המשתמש מתיר עיבוד שלהם לצורך אספקת השירות כמתואר במדיניות הפרטיות. הזכויות בממשק, בתוכנה ובמותג JOBMITER נשמרות לבעליהן.",
        },
        {
          heading: "השעיה וסגירה",
          body: "אפשר להפסיק שימוש בשירות וליזום מחיקת חשבון מתוך הפרופיל. מפעיל השירות עשוי להגביל גישה במקרה של שימוש לרעה, סיכון אבטחה או חובה חוקית. גבולות המחיקה מפורטים במדיניות הפרטיות.",
        },
        {
          heading: "אחריות ושיפוי",
          body: "השירות ניתן כפי שהוא, בכפוף לדין החל ולזכויות שאי אפשר להתנות עליהן. משתמש שמפר את התנאים או זכויות צד שלישי עשוי לשאת באחריות לנזק שנגרם עקב כך, בכפוף לדין. אין בסעיף זה כדי לשלול זכויות קוגנטיות.",
        },
        {
          heading: "דין ושינויים",
          body: "על התנאים והשימוש בשירות יחולו דיני מדינת ישראל, בכפוף לכל דין מחייב. שינויים מהותיים בתנאים יוצגו למשתמשים לפני תחולתם כאשר הדבר נדרש.",
        },
      ],
    },
    privacy: {
      title: "מדיניות פרטיות",
      introduction:
        "מדיניות זו מסבירה איזה מידע JOBMITER מעבדת, לאילו מטרות ומהן אפשרויות השליטה של המשתמש. לפניות פרטיות: info@jobmiter.com.",
      sections: [
        {
          heading: "מידע שנאסף",
          body: "בכניסה עם Google מתקבלים פרטי חשבון כגון שם וכתובת אימייל ומזהי אימות. השירות שומר קורות חיים וקבצים, טקסט מחולץ, פרופיל, ניסיון, כישורים, השכלה, שפות, מיקומים והעדפות עבודה. נשמרים גם חיפושים, משרות שנמצאו, התאמות, העדפת תדירות עדכוני משרות וסטטוס מסירה, הערות, סטטוס מועמדויות ואינטראקציות עם השירות. מערכות האירוח והאבטחה עשויות לעבד כתובת IP, דפדפן, זמן בקשה ונתוני תקלה טכניים. צפיות אנונימיות בעמודים נאספות רק לאחר הסכמה לעוגיות לא חיוניות.",
        },
        {
          heading: "מטרות העיבוד",
          body: "המידע משמש לאימות, שמירת החשבון, ניתוח קורות חיים, איתור ודירוג משרות, שליחת עדכוני משרות לפי התדירות שבחר המשתמש, מעקב מועמדויות, אבטחה, טיפול בתקלות ושיפור שימושיות בכפוף להסכמה לניתוח שימוש. אין בקוד מנגנון דיוור שיווקי פעיל.",
        },
        {
          heading: "ספקים והעברות",
          body: "Vercel מארחת את האתר; Convex מספקת מסד נתונים, אחסון קבצים ואימות; Google מספקת כניסה והצעות מיקום; OpenAI מעבדת תכנים לצורכי ניתוח קורות חיים ומשרות; Resend שולחת עדכוני משרות; Sentry משמשת לדיווח תקלות; PostHog משמשת לניתוח צפיות לאחר הסכמה. ספקים אלה עשויים לעבד מידע מחוץ לישראל בהתאם לתנאים ולאמצעי ההגנה שלהם.",
        },
        {
          heading: "שמירה ומחיקה",
          body: "מידע נשמר כל עוד החשבון פעיל וככל שנדרש להפעלת השירות, לאבטחה ולעמידה בחובות משפטיות. אפשר למחוק קורות חיים בודדים או למחוק את החשבון מתוך הפרופיל. עותקים מוגבלים עשויים להישמר זמנית בלוגים, בגיבויים או אצל ספקים עד למחזור המחיקה הרגיל שלהם.",
        },
        {
          heading: "זכויות ובקשות",
          body: "ניתן לבקש עיון במידע, תיקון או מחיקה בכתובת info@jobmiter.com, בכפוף לאימות הבקשה ולדין. אפשר גם לערוך פרטי פרופיל ולמחוק קורות חיים או את החשבון מתוך השירות.",
        },
        {
          heading: "אבטחה",
          body: "JOBMITER משתמשת באמצעים טכניים וארגוניים שנועדו להגביל גישה לא מורשית, לרבות אימות והרשאות לפי משתמש. אין מערכת שמבטיחה אבטחה מוחלטת.",
        },
      ],
    },
    cookies: {
      title: "מדיניות עוגיות ואחסון מקומי",
      introduction:
        "גרסה זו מתארת את מנגנון ההסכמה באתר. אפשר לשנות בחירה בכל עת באמצעות הקישור בתחתית כל עמוד.",
      sections: [
        {
          heading: "אחסון חיוני",
          body: "אחסון הנדרש להתחברות מאובטחת, לשמירת בחירת השפה ולשמירת החלטת ההסכמה חיוני לתפקוד השירות. הוא פועל ללא הסכמה לניתוח שימוש.",
        },
        {
          heading: "ניתוח שימוש אופציונלי",
          body: "ניתוח שימוש נטען רק לאחר אישור מפורש. התצורה מתירה צפיות בעמודים בלבד, ללא איסוף אוטומטי של לחיצות, ללא הקלטת שימוש וללא שליחת תוכן פרופיל או קורות חיים. החיבור עשוי להעביר מידע טכני כגון כתובת IP; בחירת דחייה מונעת את טעינתו וביטול הסכמה מפסיק איסוף נוסף. פרטי הספק מופיעים במדיניות הפרטיות.",
        },
        {
          heading: "ניהול הבחירה",
          body: "אפשר לאשר ניתוח שימוש או להישאר עם אחסון חיוני בלבד. ההחלטה נשמרת בדפדפן וניתן לשנות אותה בכל עת דרך הקישור בתחתית האתר.",
        },
      ],
    },
    accessibility: {
      title: "הצהרת נגישות",
      introduction:
        "JOBMITER פועלת לשפר את נגישות השירות בהתאם לעקרונות WCAG 2.1 AA ות״י 5568. בשלב זה אין הצהרה על התאמה מלאה. ההצהרה עודכנה ב־23.09.2026.",
      sections: [
        {
          heading: "התאמות שבוצעו",
          body: "האתר כולל קישור דילוג לתוכן, מבנה סמנטי, תוויות לפקדים ותמיכה בהפחתת תנועה. הממשק תומך בעברית מימין לשמאל ובאנגלית משמאל לימין.",
        },
        {
          heading: "מגבלות ידועות",
          body: "ייתכנו פערים ברכיבי מפות של צד שלישי ובחלק מזרימות העלאת הקבצים. נשמח לקבל דיווח כדי שנוכל לבדוק ולטפל בקושי.",
        },
        {
          heading: "דיווח על קושי",
          body: "אפשר לדווח על בעיית נגישות או לבקש עזרה בכתובת info@jobmiter.com.",
        },
      ],
    },
    contact: {
      title: "צור קשר",
      introduction: "לפניות משתמשים, פרטיות ונגישות: info@jobmiter.com.",
      sections: [
        {
          heading: "על השירות",
          body: "JOBMITER מוצע כעת ללא תשלום במסגרת בדיקת שוק.",
        },
      ],
    },
  },
  en: {
    terms: {
      title: "Terms of use",
      introduction:
        "These terms govern use of JOBMITER, a free service currently offered while testing market demand. Contact: info@jobmiter.com.",
      sections: [
        {
          heading: "Service and eligibility",
          body: "JOBMITER lets you create a profile, upload a resume, use AI analysis, discover jobs and track applications. You must be at least 18. The service is currently free and may change.",
        },
        {
          heading: "Accounts and permitted use",
          body: "Sign-in uses Google. Provide accurate information, protect account access, and use the service lawfully. Do not upload another person's data without authority, access others' information, bypass limits or disrupt the service.",
        },
        {
          heading: "AI and employment decisions",
          body: "Resume analysis, ranking and job matches use AI tools and may be inaccurate or incomplete. Verify listings and advice independently. We do not promise a job, an interview or accurate matches.",
        },
        {
          heading: "Jobs and third-party links",
          body: "Listings may link to employers or other sites. Jobs can change, expire or contain errors. Those sites have their own terms and privacy practices.",
        },
        {
          heading: "Content and intellectual property",
          body: "You or the relevant owner keep rights in content you upload. You permit its processing to deliver the service as described in the privacy policy. Rights in the JOBMITER interface, software and brand remain with their owners.",
        },
        {
          heading: "Suspension and closure",
          body: "You may stop using the service and start account deletion from your profile. Access may be limited for misuse, security risk or legal obligations. See the privacy policy for the limits of deletion.",
        },
        {
          heading: "Liability and indemnity",
          body: "The service is supplied as available, subject to mandatory legal rights. A user who breaches these terms or third-party rights may be responsible for resulting harm, subject to applicable law. This does not waive rights that cannot legally be waived.",
        },
        {
          heading: "Law and changes",
          body: "Israeli law applies to these terms and use of the service, subject to mandatory law. Material changes will be presented before they take effect where required.",
        },
      ],
    },
    privacy: {
      title: "Privacy policy",
      introduction:
        "This policy explains what information JOBMITER processes, why it is used, and the controls available to users. Privacy contact: info@jobmiter.com.",
      sections: [
        {
          heading: "Information collected",
          body: "Google sign-in provides account details such as name, email and authentication identifiers. We store resume files and extracted text; profile, experience, skills, education, languages, location and job preferences; searches, discovered jobs, matches, job-email frequency and delivery status, notes and application status. Hosting and security services may process IP address, browser, request time and technical error data. Anonymous page views are collected only after optional analytics consent.",
        },
        {
          heading: "Purposes",
          body: "Data is used for authentication, account storage, resume analysis, job discovery and ranking, user-controlled job-match email notifications, application tracking, security, error handling and usability analytics with consent. The code does not send marketing email.",
        },
        {
          heading: "Providers and transfers",
          body: "Vercel hosts the website; Convex provides database, file storage and authentication; Google provides sign-in and location suggestions; OpenAI processes content for resume and job analysis; Resend sends job notifications; Sentry reports errors; PostHog provides consent-based page analytics. These providers may process information outside Israel under their terms and safeguards.",
        },
        {
          heading: "Retention and deletion",
          body: "Information is kept while the account is active and as needed to operate the service, maintain security and meet legal obligations. You can delete individual resumes or your account from the profile. Limited copies may remain temporarily in logs, backups or provider systems until their normal deletion cycle completes.",
        },
        {
          heading: "Rights and requests",
          body: "You may request access, correction or deletion at info@jobmiter.com, subject to request verification and applicable law. You can also edit profile details and delete resumes or your account within the service.",
        },
        {
          heading: "Security",
          body: "JOBMITER uses technical and organizational measures intended to limit unauthorized access, including authentication and per-user permissions. No system can guarantee absolute security.",
        },
      ],
    },
    cookies: {
      title: "Cookie and local storage policy",
      introduction:
        "This version describes the site's consent controls. You can change your choice at any time using the footer link.",
      sections: [
        {
          heading: "Essential storage",
          body: "Storage needed for secure sign-in, language preference and consent choice is essential to the service. It works without optional analytics consent.",
        },
        {
          heading: "Optional analytics",
          body: "Analytics loads only after an explicit opt-in. The configuration allows page views only, with no automatic click capture, session recording, profile or resume content. The connection may transmit technical data such as an IP address. Rejecting keeps it unloaded and revoking consent stops further capture. Provider details appear in the privacy policy.",
        },
        {
          heading: "Managing your choice",
          body: "You can allow analytics or continue with essential storage only. The choice is stored in your browser and can be changed at any time using the footer link.",
        },
      ],
    },
    accessibility: {
      title: "Accessibility statement",
      introduction:
        "JOBMITER works to improve accessibility in line with WCAG 2.1 AA and Israeli Standard 5568. We do not currently claim full conformance. Updated September 23, 2026.",
      sections: [
        {
          heading: "Improvements made",
          body: "The site includes a skip link, semantic structure, control labels and reduced-motion support. The interface supports Hebrew right-to-left and English left-to-right.",
        },
        {
          heading: "Known limitations",
          body: "Some barriers may remain in third-party map controls and parts of the file-upload flow. Please report any difficulty so we can investigate and address it.",
        },
        {
          heading: "Report a barrier",
          body: "You can request help or report a barrier at info@jobmiter.com.",
        },
      ],
    },
    contact: {
      title: "Contact",
      introduction:
        "For support, privacy and accessibility requests: info@jobmiter.com.",
      sections: [
        {
          heading: "About the service",
          body: "JOBMITER is currently offered free while testing market demand.",
        },
      ],
    },
  },
};
