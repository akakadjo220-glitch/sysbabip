
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  ORGANIZER = 'ORGANIZER',
  ADMIN = 'ADMIN',
  STAFF = 'STAFF'
}

export interface ProgramItem {
  time: string;
  title: string;
  description: string;
}

export interface TicketCategory {
  id: string;
  name: string;
  price: number;
  available: number;
  type: 'standard' | 'vip' | 'early_bird' | 'group' | 'free' | 'donation';
  features: string[];
}

export interface Event {
  id: string;
  slug?: string;
  cancellation_status?: 'none' | 'requested' | 'approved' | 'rejected';
  cancellation_reason?: string | null;
  title: string;
  date: string; // ISO date
  endDate?: string;
  location: string;
  city: string;
  country: string; // Added country field
  coordinates?: { lat: number, lng: number };
  price: number; // Lowest price for display
  currency: string;
  image: string;
  gallery?: string[];
  video?: string; // YouTube/Vimeo link or direct mp4 url
  category: string;
  organizer: string;
  sold: number;
  capacity: number;
  description: string;
  program?: ProgramItem[];
  practicalInfos?: { icon: string, title: string, description: string }[];
  ticketTypes?: TicketCategory[];
  status: 'published' | 'draft' | 'ended' | 'pending_review';
  commission_rate?: number;
  physical_commission_rate?: number;
  advance_rate?: number;
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  sold: number;
  features: string[];
}

export interface Transaction {
  id: string;
  eventId: string;
  eventName: string;
  amount: number;
  date: string;
  customer: string;
  method: 'WAVE' | 'OM' | 'MTN' | 'CB' | 'MOOV';
  status: 'completed' | 'pending' | 'failed' | 'valid';
  refund_status?: 'none' | 'pending' | 'refunded' | 'failed';
}

export interface AnalyticData {
  name: string;
  value: number;
  uv?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'banned' | 'pending';
  joinedAt: string;
  avatar: string;
}

export interface PayoutRequest {
  id: string;
  organizerId: string;
  organizerName: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  requestDate: string;
  method: string;
}

export interface Attendee {
  id: string;
  name: string;
  email: string;
  ticketType: string;
  orderId: string;
  status: 'checked_in' | 'pending';
  checkInTime?: string;
  eventId: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discount: number; // Percentage or fixed amount
  type: 'percent' | 'fixed';
  usageCount: number;
  maxUsage: number;
  expiryDate: string;
  status: 'active' | 'expired';
}
