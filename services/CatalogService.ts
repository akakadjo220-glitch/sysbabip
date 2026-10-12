/**
 * Babipass — Catalogue public servi par le serveur (filtré, paginé, mis en cache).
 * Le navigateur ne télécharge plus tous les événements à chaque visite.
 */
import { SERVER_URL } from '../config';

export interface CatalogQuery {
  country: string;
  category: string;
  city: string;
  q: string;
  page: number;
  limit: number;
}

export interface CatalogPage {
  events: any[];
  total: number;
  page: number;
  pages: number;
  cities: string[];
}

async function getJson(path: string) {
  const res = await fetch(`${SERVER_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    const err: any = new Error(data.error || 'Catalogue indisponible.');
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Ajoute ticketTypes (format attendu par l'interface) à partir de ticket_types. */
const withTicketTypes = (e: any) => ({ ...e, ticketTypes: e.ticket_types, video: e.video_url ?? e.video });

export const CatalogService = {
  async listEvents(query: CatalogQuery): Promise<CatalogPage> {
    const params = new URLSearchParams({
      country: query.country,
      category: query.category,
      city: query.city,
      q: query.q,
      page: String(query.page),
      limit: String(query.limit),
    });
    const data = await getJson(`/api/public/events?${params}`);
    return { ...data, events: (data.events || []).map(withTicketTypes) };
  },

  async mapEvents(country: string): Promise<any[]> {
    const data = await getJson(`/api/public/events-map?country=${encodeURIComponent(country)}`);
    return (data.events || []).map(withTicketTypes);
  },

  /** Page événement publiée ; null si introuvable (ex. brouillon non public). */
  async getEvent(slug: string): Promise<any | null> {
    try {
      const data = await getJson(`/api/public/events/${encodeURIComponent(slug)}`);
      return data.event;
    } catch (err: any) {
      if (err.status === 404) return null;
      throw err;
    }
  },
};
