// Copyright (C) 2026 Tanguy Marsault - Eigora
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

/** Canonical origin. Baked in at build time, since the pages are static. */
export const SITE_URL = "https://eigora.tampipo.fr";

/**
 * Map every locale to its own URL for a given path, so search engines pair the
 * translations instead of reading them as duplicate pages.
 */
function languageAlternates(path: string): Record<string, string> {
  return Object.fromEntries(
    routing.locales.map((locale) => [locale, `/${locale}${path}`]),
  );
}

/**
 * Metadata for one course module page.
 *
 * Title and description come from `<domain>.modules.<slug>` in the message
 * files, which already carry `title` and `summary` in both locales — so the
 * tab, the search result and the link preview all stay in step with the
 * sidebar label, and translations need no separate authoring.
 *
 * `domain` is both the message namespace and the URL segment, which is what
 * lets one helper serve every subject: the two have to agree anyway, so
 * deriving them from a single argument makes disagreeing impossible.
 */
export async function moduleMetadata(
  locale: string,
  slug: string,
  domain: string = "qm",
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: `${domain}.modules` });
  const title = t(`${slug}.title`);
  const description = t(`${slug}.summary`);
  const path = `/${domain}/${slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: languageAlternates(path),
    },
    openGraph: {
      // Next merges metadata field by field, and a child `openGraph` replaces
      // the parent's entirely — so every property the root layout supplies has
      // to be restated. `type` is one of OpenGraph's four required properties,
      // and WhatsApp discards the whole card when it is missing.
      type: "website",
      siteName: "Eigora",
      title,
      description,
      url: `/${locale}${path}`,
      locale,
      // An explicit `openGraph` replaces the inherited one wholesale, so the
      // file-based card has to be named again or the page ships without one.
      images: [`/${locale}/opengraph-image`],
    },
  };
}

/**
 * Metadata for a non-module page (home, the QM overview) that takes its strings
 * from an arbitrary namespace rather than the module catalogue.
 */
export async function pageMetadata(
  locale: string,
  path: string,
  title: string,
  description: string,
): Promise<Metadata> {
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}${path}`,
      languages: languageAlternates(path),
    },
    openGraph: {
      // Next merges metadata field by field, and a child `openGraph` replaces
      // the parent's entirely — so every property the root layout supplies has
      // to be restated. `type` is one of OpenGraph's four required properties,
      // and WhatsApp discards the whole card when it is missing.
      type: "website",
      siteName: "Eigora",
      title,
      description,
      url: `/${locale}${path}`,
      locale,
      images: [`/${locale}/opengraph-image`],
    },
  };
}
