import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    keywords?: string;
}

export const SEO: React.FC<SEOProps> = ({
    title = "Babipass - La Billetterie de Demain",
    description = "Babipass est la plateforme africaine premium pour découvrir, acheter et revendre vos billets d'événements en toute sécurité.",
    image = "https://supabasekong-l4cw40oks4kso84ko44ogkkw.188.241.58.227.sslip.io/storage/v1/object/public/events/verso.png",
    url = "https://afritix.com",
    type = "website",
    keywords = "billetterie afrique, tickets eventi africain, concert abidjan, dakar"
}) => {
    // Ensure title always has the brand extension except if it's the exact homepage title
    const finalTitle = title === "Babipass - La Billetterie de Demain"
        ? title
        : `${title} | Babipass`;

    return (
        <Helmet>
            {/* Standard Metadata */}
            <title>{finalTitle}</title>
            <meta name="description" content={description} />
            <meta name="keywords" content={keywords} />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content={type} />
            <meta property="og:url" content={url} />
            <meta property="og:title" content={finalTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />
            <meta property="og:site_name" content="Babipass" />

            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:url" content={url} />
            <meta name="twitter:title" content={finalTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />
        </Helmet>
    );
};
