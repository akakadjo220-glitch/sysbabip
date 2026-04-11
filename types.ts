
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  AMBASSADOR = 'AMBASSADOR',
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
  stadium_zone?: string; // Zone du stade (Tribune Nord, VIP, Virage, Loge...)
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
  ambassador_enabled?: boolean;
  ambassador_commission_type?: 'percentage' | 'fixed';
  ambassador_commission_value?: number;
  sales_close_before_minutes?: number;
  views: number;
  average_rating: number;
  total_reviews: number;
  // Champs Sport (optionnels)
  sport_type?: string;   // 'football' | 'basketball' | 'rugby' | 'athletisme' | 'autre'
  home_team?: string;    // Équipe domicile
  away_team?: string;    // Équipe visiteur
  competition?: string;  // Compétition (AFCON, Ligue 1 CI, Amical...)
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
  referralCode?: string;
  ambassadorCommission?: number;
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

export interface PayoutSettings {
  id: string;
  organizer_id: string;
  bank_name: string;
  account_holder_name: string;
  iban: string;
  swift_bic: string;
  country?: string;
  created_at?: string;
  updated_at?: string;
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

export interface AmbassadorLink {
  id: string;
  created_at: string;
  user_id: string;
  event_id: string;
  code: string;
  clicks: number;
  sales: number;
  earned_amount: number;
}

export interface AmbassadorWithdrawal {
  id: string;
  created_at: string;
  user_id: string;
  amount: number;
  payment_method: string;
  payment_details: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  paid_at?: string;
}
