import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { legalPages, legalVersion } from "@/i18n/locales/legal";
import { SITE_URL } from "@/app/site-metadata";
import { LegalLanguageSync } from "@/features/privacy/legal-language-sync";

const slugs = [
  "terms",
  "privacy",
  "cookies",
  "accessibility",
  "contact",
] as const;
type LegalSlug = (typeof slugs)[number];
type Props = { params: Promise<{ lang: string; legalPage: string }> };

function getPage(lang: string, slug: string) {
  if ((lang !== "he" && lang !== "en") || !slugs.includes(slug as LegalSlug))
    return null;
  return {
    language: lang as "he" | "en",
    slug: slug as LegalSlug,
    content: legalPages[lang][slug as LegalSlug],
  };
}

export function generateStaticParams() {
  return (["he", "en"] as const).flatMap((lang) =>
    slugs.map((legalPage) => ({ lang, legalPage })),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, legalPage } = await params;
  const page = getPage(lang, legalPage);
  if (!page) return {};
  return {
    title: page.content.title,
    description: page.content.introduction,
    alternates: {
      canonical: `${SITE_URL}/${lang}/${legalPage}`,
      languages: {
        he: `${SITE_URL}/he/${legalPage}`,
        en: `${SITE_URL}/en/${legalPage}`,
      },
    },
  };
}

export default async function LegalPage({ params }: Props) {
  const { lang, legalPage } = await params;
  const page = getPage(lang, legalPage);
  if (!page) notFound();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      lang={lang}
      dir={lang === "he" ? "rtl" : "ltr"}
      className="bg-background text-foreground min-h-svh px-5 py-12 sm:py-16"
    >
      <LegalLanguageSync language={page.language} />
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-primary text-sm underline underline-offset-4"
        >
          {lang === "he" ? "חזרה ל־JOBMITER" : "Back to JOBMITER"}
        </Link>
        <h1 className="mt-8 text-3xl font-semibold sm:text-4xl">
          {page.content.title}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          {lang === "he" ? "גרסה" : "Version"} {legalVersion} ·{" "}
          {lang === "he" ? "עודכן" : "Updated"} 23.09.2026
        </p>
        <p className="mt-7 text-lg leading-8">{page.content.introduction}</p>
        {legalPage === "contact" ? (
          <a
            href="mailto:info@jobmiter.com"
            className="text-primary mt-5 inline-block text-lg underline underline-offset-4"
          >
            info@jobmiter.com
          </a>
        ) : null}
        <div className="mt-10 space-y-9">
          {page.content.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold">{section.heading}</h2>
              <p className="text-muted-foreground mt-3 leading-8">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
