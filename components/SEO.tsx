import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    keywords?: string;
    structuredData?: Record<string, any> | Record<string, any>[];
    breadcrumbsData?: Record<string, any>;
    canonicalUrl?: string;
    geoRegion?: string;
    geoPlacename?: string;
    noIndex?: boolean;
}

/**
 * Assainit les données JSON pour injection sécurisée anti-XSS dans la balise script ld+json
 */
const safeJsonLd = (data: any): string => {
    try {
        return JSON.stringify(data)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');
    } catch {
        return '';
    }
};

export const SEO: React.FC<SEOProps> = ({
    title = "Babipass Côte d'Ivoire | N°1 de la Billetterie Événementielle en Afrique",
    description = "Babipass est la plateforme africaine premium pour découvrir, acheter et revendre vos billets d'événements en toute sécurité avec Wave, Orange Money, MTN.",
    image = "https://insforgeinst.site/images/2026/07/09/log-babipass.png",
    url = "https://babipass.com",
    type = "website",
    keywords = "billetterie cote d'ivoire, ticket concert abidjan, pass festival afrique, reservation spectacle, wave ticket, orange money concert, babipass",
    structuredData,
    breadcrumbsData,
    canonicalUrl,
    geoRegion = "CI-AB",
    geoPlacename = "Abidjan, Côte d'Ivoire",
    noIndex = false,
}) => {
    // S'assurer que le titre a toujours le nom de la marque sans duplication
    const finalTitle = title.includes("Babipass") ? title : `${title} | Babipass`;
    const finalUrl = canonicalUrl || url;

    return (
        <Helmet>
            {/* Standard Metadata */}
            <title>{finalTitle}</title>
            <meta name="description" content={description} />
            <meta name="keywords" content={keywords} />
            {finalUrl && <link rel="canonical" href={finalUrl} />}
            <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"} />

            {/* Balises Géographiques (SEO Local Côte d'Ivoire / Afrique) */}
            <meta name="geo.region" content={geoRegion} />
            <meta name="geo.placename" content={geoPlacename} />
            <meta name="geo.position" content="5.359952;-4.008256" />
            <meta name="ICBM" content="5.359952, -4.008256" />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content={type} />
            <meta property="og:url" content={finalUrl} />
            <meta property="og:title" content={finalTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />
            <meta property="og:image:alt" content={finalTitle} />
            <meta property="og:site_name" content="Babipass" />
            <meta property="og:locale" content="fr_CI" />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:url" content={finalUrl} />
            <meta name="twitter:title" content={finalTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />
            <meta name="twitter:site" content="@babipass" />

            {/* Données Structurées JSON-LD (Schema.org) sécurisées */}
            {structuredData && (
                <script type="application/ld+json">
                    {safeJsonLd(structuredData)}
                </script>
            )}

            {/* Données Structurées Fil d'Ariane (Breadcrumbs) */}
            {breadcrumbsData && (
                <script type="application/ld+json">
                    {safeJsonLd(breadcrumbsData)}
                </script>
            )}
        </Helmet>
    );
};

