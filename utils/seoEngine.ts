import { Event, TicketCategory } from '../types';
import { formatCurrency } from '../constants';

const SITE_URL = 'https://babipass.com';
const DEFAULT_IMAGE = 'https://insforgeinst.site/images/2026/07/09/log-babipass.png';
const BRAND_NAME = 'Babipass';

export interface GeneratedSEO {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  image: string;
  type: string;
  structuredData: Record<string, any>;
  breadcrumbsData?: Record<string, any>;
  aeoSummary?: string;
}

/**
 * Assainit une chaîne de caractères pour éliminer les balises HTML et les caractères de contrôle non sécurisés
 */
export const sanitizeText = (text?: string): string => {
  if (!text) return '';
  return text
    .replace(/<[^>]*>?/gm, '') // Enlever HTML
    .replace(/[\r\n\t]+/g, ' ') // Aplatir les retours à la ligne
    .replace(/\s{2,}/g, ' ') // Compacter les espaces multiples
    .trim();
};

/**
 * Formate une date ISO en format lisible en français
 */
const formatFrenchDate = (dateString?: string): string => {
  if (!dateString) return 'Bientôt';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Bientôt';
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch {
    return 'Bientôt';
  }
};

/**
 * Détermine le type Schema.org le plus précis selon la catégorie de l'événement
 */
const getSpecificEventType = (category?: string): string => {
  if (!category) return 'Event';
  const cat = category.toLowerCase();
  if (cat.includes('concert') || cat.includes('musique') || cat.includes('live')) return 'MusicEvent';
  if (cat.includes('festival')) return 'Festival';
  if (cat.includes('sport') || cat.includes('tournoi') || cat.includes('match') || cat.includes('marathon')) return 'SportsEvent';
  if (cat.includes('théâtre') || cat.includes('theatre') || cat.includes('humour') || cat.includes('spectacle')) return 'TheaterEvent';
  if (cat.includes('conférence') || cat.includes('conference') || cat.includes('salon') || cat.includes('business')) return 'BusinessEvent';
  if (cat.includes('fête') || cat.includes('fete') || cat.includes('soirée') || cat.includes('soiree') || cat.includes('club')) return 'SocialEvent';
  if (cat.includes('exposition') || cat.includes('art') || cat.includes('galerie')) return 'ExhibitionEvent';
  return 'Event';
};

/**
 * MOTEUR D'ALGORITHME SEO & RICH RESULTS POUR UN ÉVÉNEMENT
 */
export const generateEventSEO = (event: Partial<Event> & { ticket_types?: TicketCategory[] }): GeneratedSEO => {
  const cleanTitle = sanitizeText(event.title) || 'Événement';
  const cleanCity = sanitizeText(event.city) || 'Abidjan';
  const cleanLocation = sanitizeText(event.location) || 'Côte d\'Ivoire';
  const cleanCategory = sanitizeText(event.category) || 'Événement';
  const formattedDate = formatFrenchDate(event.date);
  const eventSlug = event.slug || event.id || '';
  const canonicalUrl = `${SITE_URL}/event/${eventSlug}`;
  const imageUrl = event.image || DEFAULT_IMAGE;
  const currentYear = new Date().getFullYear();

  // 1. Titre optimisé CTR (50 à 65 caractères maximum)
  let title = `${cleanTitle} à ${cleanCity} - Billetterie Officielle ${currentYear} | ${BRAND_NAME}`;
  if (title.length > 68) {
    title = `${cleanTitle} - Billetterie & Tickets | ${BRAND_NAME}`;
  }
  if (title.length > 70) {
    title = `${cleanTitle.slice(0, 48)}... | ${BRAND_NAME}`;
  }

  // 2. Meta-Description persuasive et psychologique (140-160 caractères)
  const priceDisplay = (typeof event.price === 'number' && event.price > 0)
    ? `dès ${formatCurrency(event.price)}`
    : 'en ligne';

  let description = `Participez à ${cleanTitle} le ${formattedDate} à ${cleanLocation} (${cleanCity}). Réservez vos tickets ${priceDisplay} via Wave, Orange Money, MTN. E-billet sécurisé avec QR code anti-fraude ✓`;
  if (description.length > 165) {
    description = `Réservez vos places pour ${cleanTitle} le ${formattedDate} à ${cleanCity}. Billetterie 100% sécurisée Wave, Orange Money, MTN. Pass immédiat ✓`;
  }

  // 3. Cluster sémantique de mots-clés hyper-ciblés (Côte d'Ivoire & Afrique)
  const keywordsList = [
    `ticket ${cleanTitle}`,
    `billetterie ${cleanTitle}`,
    `concert ${cleanCity}`,
    `événement ${cleanCity}`,
    `${cleanCategory} Côte d'Ivoire`,
    `acheter ticket wave`,
    `billet orange money`,
    `pass mtn momo`,
    `babipass ${cleanCity}`,
    `palais de la culture abidjan`,
    `tickets abidjan`,
    `sortir à ${cleanCity}`
  ];
  const keywords = keywordsList.join(', ');

  // 4. Schéma JSON-LD Schema.org Event (Rich Snippet Google)
  const specificType = getSpecificEventType(event.category);
  const ticketTypes = event.ticketTypes || event.ticket_types || [];

  const offers = ticketTypes.length > 0
    ? ticketTypes.map(t => ({
      '@type': 'Offer',
      name: t.name || 'Billet Standard',
      price: t.price || 0,
      priceCurrency: event.currency || 'XOF',
      availability: (t.available === undefined || t.available > 0)
        ? 'https://schema.org/InStock'
        : 'https://schema.org/SoldOut',
      url: canonicalUrl,
      validFrom: event.date || new Date().toISOString()
    }))
    : [{
      '@type': 'Offer',
      price: event.price || 0,
      priceCurrency: event.currency || 'XOF',
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
      validFrom: event.date || new Date().toISOString()
    }];

  const structuredData: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': specificType,
    name: cleanTitle,
    description: sanitizeText(event.description) || description,
    image: [imageUrl],
    startDate: event.date || new Date().toISOString(),
    endDate: event.endDate || event.date || new Date().toISOString(),
    eventStatus: event.status === 'ended'
      ? 'https://schema.org/EventCompleted'
      : event.cancellation_status === 'approved'
        ? 'https://schema.org/EventCancelled'
        : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: cleanLocation,
      address: {
        '@type': 'PostalAddress',
        streetAddress: cleanLocation,
        addressLocality: cleanCity,
        addressRegion: cleanCity,
        addressCountry: event.country || 'CI'
      },
      ...(event.coordinates ? {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: event.coordinates.lat,
          longitude: event.coordinates.lng
        }
      } : {})
    },
    offers: offers.length === 1 ? offers[0] : offers,
    organizer: {
      '@type': 'Organization',
      name: sanitizeText(event.organizer) || BRAND_NAME,
      url: SITE_URL
    },
    performer: {
      '@type': 'PerformingGroup',
      name: cleanTitle
    }
  };

  // 5. Breadcrumbs Schema.org
  const breadcrumbsData: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Accueil',
        item: SITE_URL
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: cleanCategory || 'Événements',
        item: `${SITE_URL}/?category=${encodeURIComponent(cleanCategory)}`
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: cleanTitle,
        item: canonicalUrl
      }
    ]
  };

  // 6. Résumé sémantique AEO (Artificial Engine Optimization pour ChatGPT / Perplexity / Claude)
  const aeoSummary = `L'événement ${cleanTitle} se déroule le ${formattedDate} à ${cleanLocation} à ${cleanCity} en Côte d'Ivoire. Les tickets officiels sont en vente sur Babipass avec paiement sécurisé par Mobile Money (Wave, Orange Money, MTN MoMo) et carte bancaire. Les billets sont infalsifiables et contrôlés par QR Code sécurisé à l'entrée.`;

  return {
    title,
    description,
    keywords,
    canonicalUrl,
    image: imageUrl,
    type: 'event',
    structuredData,
    breadcrumbsData,
    aeoSummary
  };
};

/**
 * MOTEUR SEO POUR LA PAGE D'ACCUEIL / MARKETPLACE BABIPASS
 * Génère la structure globale pour forcer les Expanded Sitelinks de Google (modèle Jumia)
 */
export const generateMarketplaceSEO = (userCountry = 'Côte d\'Ivoire'): GeneratedSEO => {
  const currentYear = new Date().getFullYear();
  const canonicalUrl = `${SITE_URL}/`;

  const title = `Babipass ${userCountry} | N°1 de la Billetterie & Événements en Afrique ${currentYear}`;
  const description = `Plateforme N°1 de Billetterie en Côte d'Ivoire & Afrique ✓Concerts à Abidjan, Festivals, Soirées VIP, Conférences, Tournois ✓Achat 100% sécurisé Wave, Orange Money, MTN ✓E-billet instantané`;
  const keywords = `billetterie cote d'ivoire, ticket concert abidjan, pass festival afrique, evenements abidjan, achat ticket wave, ticket orange money, reservation spectacle palais de la culture, babipass, billetterie afrique`;

  // Schémas multiples pour déclencher les Sitelinks Google et le Sitelinks Searchbox
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      // 1. Entité WebSite avec SearchAction (Boîte de recherche Google Sitelinks)
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: BRAND_NAME,
        alternateName: ['Babipass Côte d\'Ivoire', 'Babipass Billetterie', 'Babipass Africa'],
        description: 'La première plateforme de billetterie événementielle digitale et sécurisée en Afrique de l\'Ouest.',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/?search={search_term_string}`
          },
          'query-input': 'required name=search_term_string'
        },
        inLanguage: 'fr-FR'
      },
      // 2. Entité Organisation (Autorité et Marque officielle)
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: BRAND_NAME,
        legalName: 'Babipass Technologies SAS',
        url: SITE_URL,
        logo: {
          '@type': 'ImageObject',
          url: DEFAULT_IMAGE,
          width: 512,
          height: 512
        },
        description: 'Leader technologique de la billetterie intelligente et de l\'événementiel en Côte d\'Ivoire et en Afrique.',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Abidjan',
          addressRegion: 'Lagunes',
          addressCountry: 'CI'
        },
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: '+2250000000000',
          contactType: 'customer service',
          availableLanguage: ['French', 'English'],
          areaServed: ['CI', 'SN', 'ML', 'BF', 'TG', 'BJ']
        },
        sameAs: [
          'https://facebook.com/babipass',
          'https://instagram.com/babipass',
          'https://twitter.com/babipass',
          'https://linkedin.com/company/babipass'
        ]
      },
      // 3. SiteNavigationElement (Forçage des Expanded Sitelinks Google comme Jumia)
      {
        '@type': 'ItemList',
        '@id': `${SITE_URL}/#sitelinks`,
        name: 'Rubriques Populaires Babipass',
        itemListElement: [
          {
            '@type': 'SiteNavigationElement',
            position: 1,
            name: 'Concerts & Spectacles',
            description: 'Réservez vos places pour les plus grands concerts live au Palais de la Culture, Sofitel Ivoire et stades.',
            url: `${SITE_URL}/?category=Concerts`
          },
          {
            '@type': 'SiteNavigationElement',
            position: 2,
            name: 'Festivals & Culture',
            description: 'Vivez l\'intensité des festivals majeurs en Côte d\'Ivoire et en Afrique de l\'Ouest.',
            url: `${SITE_URL}/?category=Festivals`
          },
          {
            '@type': 'SiteNavigationElement',
            position: 3,
            name: 'Soirées & Nightlife',
            description: 'Accédez aux soirées sélects, beach parties et événements clubbing à Cocody, Marcory et Assinie.',
            url: `${SITE_URL}/?category=Soirées`
          },
          {
            '@type': 'SiteNavigationElement',
            position: 4,
            name: 'Sports & Tournois',
            description: 'Billets pour tournois de football, e-sport, marathons et compétitions sportives en direct.',
            url: `${SITE_URL}/?category=Sports`
          },
          {
            '@type': 'SiteNavigationElement',
            position: 5,
            name: 'Conférences & Business',
            description: 'Forums professionnels, masterclasses, séminaires et rencontres d\'affaires à Abidjan.',
            url: `${SITE_URL}/?category=Conférences`
          },
          {
            '@type': 'SiteNavigationElement',
            position: 6,
            name: 'Espace Organisateur',
            description: 'Créez votre billetterie en 2 minutes, encaissez par Wave/Orange Money et contrôlez les accès avec QR Code.',
            url: `${SITE_URL}/organizer/login`
          }
        ]
      },
      // 4. FAQPage Schema (Rich Results Question / Réponse sur Google)
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Comment acheter un billet sur Babipass en Côte d\'Ivoire ?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Sur Babipass, choisissez votre événement, sélectionnez le nombre de places et validez en quelques secondes via Wave, Orange Money, MTN MoMo ou carte bancaire. Vous recevez immédiatement votre billet numérique sécurisé par QR Code.'
            }
          },
          {
            '@type': 'Question',
            name: 'Quels sont les moyens de paiement acceptés sur Babipass ?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Babipass accepte tous les moyens de paiement locaux et internationaux : Wave, Orange Money Côte d\'Ivoire, MTN Mobile Money, Moov Money et cartes bancaires Visa / Mastercard.'
            }
          },
          {
            '@type': 'Question',
            name: 'Comment créer une billetterie pour mon événement sur Babipass ?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Rendez-vous dans l\'Espace Organisateur de Babipass, remplissez les informations de votre événement, fixez vos catégories de prix et publiez instantanément. Vous disposez d\'un tableau de bord de suivi en temps réel et de l\'application de scan anti-fraude.'
            }
          }
        ]
      }
    ]
  };

  return {
    title,
    description,
    keywords,
    canonicalUrl,
    image: DEFAULT_IMAGE,
    type: 'website',
    structuredData
  };
};
