// Draft copy grounded in the services currently used by JOBMITER.
// Owner identity, contact channel and retention periods still require decisions.
export const legalVersion = "2026-09-23-draft-2";

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
        "טיוטה לשירות JOBMITER החינמי בשלב בדיקת שוק. המסמך טעון אישור עורך דין ישראלי לפני השקה. זהות המפעיל המשפטי טרם נמסרה. לפניות: info@jobmiter.com.",
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
          body: "ניתוח קורות החיים, דירוג והתאמת משרות נעשים גם באמצעות OpenAI ועלולים להיות שגויים או לא שלמים. יש לבדוק משרות, דרישות והמלצות באופן עצמאי. אין התחייבות למציאת עבודה, לקבלת ראיון או לדיוק ההתאמות.",
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
          body: "הדין החל על השירות והסמכות השיפוטית ייקבעו בטיוטה הסופית לאחר זיהוי המפעיל ובדיקה משפטית. שינויים מהותיים בתנאים יוצגו למשתמשים לפני תחולתם כאשר הדבר נדרש.",
        },
      ],
    },
    privacy: {
      title: "מדיניות פרטיות",
      introduction:
        "טיוטה המתארת את פעולת המוצר כפי שנמצאה בקוד. זהות בעל השליטה במידע, תקופות שמירה ותהליך מחיקה מלא טעונים החלטת בעלים ובדיקה משפטית לפני השקה. לפניות פרטיות: info@jobmiter.com.",
      sections: [
        {
          heading: "מידע שנאסף",
          body: "בכניסה עם Google מתקבלים פרטי חשבון כגון שם וכתובת אימייל ומזהי אימות. השירות שומר קורות חיים וקבצים, טקסט מחולץ, פרופיל, ניסיון, כישורים, השכלה, שפות, מיקומים והעדפות עבודה. נשמרים גם חיפושים, משרות שנמצאו, התאמות, העדפת תדירות עדכוני משרות וסטטוס מסירה, הערות, סטטוס מועמדויות ואינטראקציות עם השירות. מערכות האירוח והאבטחה עשויות לעבד כתובת IP, דפדפן, זמן בקשה ונתוני תקלה טכניים. PostHog אמור לקבל צפיות בעמודים בלבד אחרי הסכמה לעוגיות לא חיוניות.",
        },
        {
          heading: "מטרות העיבוד",
          body: "המידע משמש לאימות, שמירת החשבון, ניתוח קורות חיים, איתור ודירוג משרות, שליחת עדכוני משרות לפי התדירות שבחר המשתמש, מעקב מועמדויות, אבטחה, טיפול בתקלות ושיפור שימושיות בכפוף להסכמה לניתוח שימוש. אין בקוד מנגנון דיוור שיווקי פעיל.",
        },
        {
          heading: "ספקים והעברות",
          body: "Vercel מארחת את אתר האינטרנט; Convex מספקת מסד נתונים, אחסון קבצים ואימות; Google מספקת כניסה באמצעות OAuth והצעות מיקום ב־Maps; OpenAI מעבדת תכנים לצורכי ניתוח קורות חיים ומשרות; Resend שולחת עדכוני משרות לכתובת האימייל של המשתמש; Sentry משמשת לדיווח תקלות; PostHog משמשת לניתוח צפיות לאחר הסכמה. שימוש בספקים אלה עשוי לכלול עיבוד מחוץ לישראל. מדינות האחסון, תנאי ההעברה ורשימת ספקי המשנה המעודכנת טעונים אימות בעלים.",
        },
        {
          heading: "שמירה ומחיקה",
          body: "עדיין לא נקבעו תקופות שמירה לקורות חיים, פרופילים, חשבונות, יומנים או גיבויים. אפשר למחוק קורות חיים בודדים או ליזום מחיקת חשבון מתוך הפרופיל. מחיקת חשבון מסירה בשלבים נתונים וקבצים המשויכים למשתמש ב־Convex, לרבות רשומות אימות. נתוני משרות משותפים, לוגים, נתוני ספקים וגיבויים אינם נכללים כיום במחיקה אוטומטית מלאה. מדיניות מחיקה וזמני השלמה עדיין טעונים אימות.",
        },
        {
          heading: "זכויות ובקשות",
          body: "ניתן לבקש עיון במידע, תיקון או מחיקה בכתובת info@jobmiter.com, בכפוף לדין. יש להגדיר תהליך אימות וטיפול בבקשות לפני השקה. המשתמש יכול לערוך חלק מפרטי הפרופיל ולמחוק קורות חיים בממשק.",
        },
        {
          heading: "אבטחה",
          body: "גישה למידע נשענת על אימות והרשאות יישום; עדיין נדרשת בדיקת אבטחה מלאה של סביבת הייצור, שחזור גיבוי, מדיניות לוגים ותהליך אירוע אבטחה. אין התחייבות לאבטחה מוחלטת.",
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
          body: "אימות באמצעות Convex Auth, שמירת בחירת שפה ושמירת החלטת ההסכמה נדרשים לתפקוד השירות. הם פועלים ללא הסכמה לניתוח שימוש. סוגי העוגיות, משך חייהן והדומיינים שלהם דורשים בדיקה בדפדפן הייצור.",
        },
        {
          heading: "ניתוח שימוש אופציונלי",
          body: "PostHog נטען רק לאחר אישור מפורש. התצורה מתירה צפיות בעמודים בלבד, ללא איסוף אוטומטי של לחיצות, ללא הקלטת שימוש וללא שליחת תוכן פרופיל או קורות חיים. עצם החיבור לספק עשוי להעביר אליו מידע טכני כגון כתובת IP; יש לאמת בייצור שהגדרת מחיקת IP פעילה בפרויקט PostHog. בחירת דחייה מונעת את טעינתו; ביטול הסכמה מפסיק איסוף נוסף.",
        },
        {
          heading: "ניהול הבחירה",
          body: "אפשר לאשר הכול, לדחות אחסון לא חיוני או לבחור בהעדפות. ההחלטה נשמרת בדפדפן עם גרסת המדיניות וזמן הבחירה. ניקוי נתוני הדפדפן יחייב בחירה מחדש.",
        },
      ],
    },
    accessibility: {
      title: "הצהרת נגישות",
      introduction:
        "הצהרה זמנית. טרם הושלמה בדיקה מקיפה ולכן אין הצהרה על עמידה מלאה ב־WCAG 2.1 AA או בת״י 5568. תאריך עדכון הטיוטה: 22.09.2026.",
      sections: [
        {
          heading: "התאמות שבוצעו",
          body: "נוספו קישור דילוג לתוכן, מבנה סמנטי לעמודים מרכזיים, תוויות לפקדים והגדרות להפחתת תנועה. הממשק תומך בעברית מימין לשמאל ובאנגלית משמאל לימין. ההתאמות עדיין דורשות בדיקות ידניות ואוטומטיות בכל מסכי האפליקציה.",
        },
        {
          heading: "מגבלות ידועות",
          body: "טרם אומתו כל זרימות המקלדת, ניגודיות, הגדלה ל־200%, הודעות שגיאה, רכיבי Google Maps ותהליכי העלאת קובץ. לא נקבעו עדיין פרטי רכז נגישות.",
        },
        {
          heading: "דיווח על קושי",
          body: "אפשר לדווח על בעיית נגישות או לבקש עזרה בכתובת info@jobmiter.com. יש לוודא טיפול בפניות לפני השקה.",
        },
      ],
    },
    contact: {
      title: "צור קשר",
      introduction:
        "לפניות משתמשים, פרטיות ונגישות: info@jobmiter.com. יש לוודא שהתיבה מנוטרת לפני השקה.",
      sections: [
        {
          heading: "פרטי מפעיל",
          body: "שם משפטי, כתובת ופרטי רישום טרם נמסרו. השירות מוצע כעת בחינם לצורך בדיקת שוק; יש לאשר את הניסוח המשפטי עם עורך דין ישראלי.",
        },
      ],
    },
  },
  en: {
    terms: {
      title: "Terms of use",
      introduction:
        "Draft for JOBMITER's free market-testing service. An Israeli lawyer must review this document before launch. The operator's legal identity has not been supplied. Contact: info@jobmiter.com.",
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
          body: "Resume analysis, ranking and job matches use OpenAI and may be inaccurate or incomplete. Verify listings and advice independently. We do not promise a job, an interview or accurate matches.",
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
          body: "Applicable law and venue must be finalized after identifying the operator and obtaining legal review. Material changes will be presented before they take effect where required.",
        },
      ],
    },
    privacy: {
      title: "Privacy policy",
      introduction:
        "Draft based on the product code. Controller identity, retention periods and complete deletion procedures require owner decisions and legal review before launch. Privacy contact: info@jobmiter.com.",
      sections: [
        {
          heading: "Information collected",
          body: "Google sign-in provides account details such as name, email and authentication identifiers. We store resume files and extracted text; profile, experience, skills, education, languages, location and job preferences; searches, discovered jobs, matches, job-email frequency and delivery status, notes and application status. Hosting and security services may process IP address, browser, request time and technical error data. PostHog is intended to receive page views only after optional analytics consent.",
        },
        {
          heading: "Purposes",
          body: "Data is used for authentication, account storage, resume analysis, job discovery and ranking, user-controlled job-match email notifications, application tracking, security, error handling and usability analytics with consent. The code does not send marketing email.",
        },
        {
          heading: "Providers and transfers",
          body: "Vercel hosts the website; Convex provides database, file storage and authentication; Google provides OAuth sign-in and Maps location suggestions; OpenAI processes content for resume and job analysis; Resend sends job notifications to the user's email address; Sentry reports errors; PostHog provides consent-based page analytics. Processing may take place outside Israel. Hosting countries, transfer terms and current subprocessors require owner verification.",
        },
        {
          heading: "Retention and deletion",
          body: "Retention periods for resumes, profiles, accounts, logs and backups have not been set. You can delete individual resumes or start account deletion from your profile. Account deletion removes user-linked Convex records and files in stages, including authentication records. Shared job data, logs, vendor data and backups are not fully covered by automatic deletion. The deletion policy and completion time still require verification.",
        },
        {
          heading: "Rights and requests",
          body: "You may request access, correction or deletion at info@jobmiter.com, subject to law. A verified request process must be established before launch. Some profile details can be edited and resumes deleted in the product.",
        },
        {
          heading: "Security",
          body: "Access relies on authentication and application permissions. A complete production security audit, backup restore, logging policy and incident process remain outstanding. No system can guarantee absolute security.",
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
          body: "Convex Auth sign-in, language preference and consent choice are needed for the service. They work without optional analytics consent. Actual cookie names, lifetimes and domains require verification in the production browser.",
        },
        {
          heading: "Optional analytics",
          body: "PostHog loads only after an explicit opt-in. The configuration allows page views only, with no automatic click capture, session recording, profile or resume content. Connecting to the provider may transmit technical data such as IP address; its project-level IP discard setting must be verified in production. Rejecting keeps it unloaded; revoking consent stops further capture.",
        },
        {
          heading: "Managing your choice",
          body: "You can accept all, reject optional storage or manage preferences. The choice is stored in your browser with policy version and decision time. Clearing browser data will prompt you again.",
        },
      ],
    },
    accessibility: {
      title: "Accessibility statement",
      introduction:
        "Interim statement. A comprehensive audit has not finished, so we do not claim full WCAG 2.1 AA or Israeli Standard 5568 conformance. Draft updated September 22, 2026.",
      sections: [
        {
          heading: "Improvements made",
          body: "The site includes a skip link, semantic structure on major pages, control labels and reduced-motion support. The interface supports Hebrew right-to-left and English left-to-right. These measures need manual and automated verification across the full app.",
        },
        {
          heading: "Known limitations",
          body: "Keyboard journeys, contrast, 200% zoom, error messages, Google Maps controls and file-upload flows have not all been verified. An accessibility coordinator has not been designated.",
        },
        {
          heading: "Report a barrier",
          body: "You can request help or report a barrier at info@jobmiter.com. The response process must be verified before launch.",
        },
      ],
    },
    contact: {
      title: "Contact",
      introduction:
        "For support, privacy and accessibility requests: info@jobmiter.com. The inbox must be monitored before launch.",
      sections: [
        {
          heading: "Operator details",
          body: "Legal name, address and registration details have not been supplied. The service is currently offered free while testing market demand; Israeli legal counsel should approve the final wording.",
        },
      ],
    },
  },
};
