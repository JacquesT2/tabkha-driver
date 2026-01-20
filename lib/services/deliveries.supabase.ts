import { supabase } from './supabase';
import type { Stop } from '@/lib/types';

/**
 * Maps delivery_time text to time window hours
 * Expected formats: "08:00-10:00", "8-10", "08-10", etc.
 */
function parseTimeWindow(deliveryTime: string | null, baseDate: Date): { start: Date; end: Date } {
  if (!deliveryTime) {
    // Default to 08:00-10:00 if not specified
    const start = new Date(baseDate);
    start.setHours(8, 0, 0, 0);
    const end = new Date(baseDate);
    end.setHours(10, 0, 0, 0);
    return { start, end };
  }

  // Try to parse formats like "08:00-10:00", "8-10", "08-10"
  const match = deliveryTime.match(/(\d{1,2}):?(\d{2})?-(\d{1,2}):?(\d{2})?/);
  if (match) {
    const startHour = parseInt(match[1], 10);
    const endHour = parseInt(match[3], 10);
    const start = new Date(baseDate);
    start.setHours(startHour, 0, 0, 0);
    const end = new Date(baseDate);
    end.setHours(endHour, 0, 0, 0);
    return { start, end };
  }

  // Fallback: try simple hour ranges like "8-10"
  const parts = deliveryTime.split('-').map(s => parseInt(s.trim(), 10));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const start = new Date(baseDate);
    start.setHours(parts[0], 0, 0, 0);
    const end = new Date(baseDate);
    end.setHours(parts[1], 0, 0, 0);
    return { start, end };
  }

  // Default fallback
  const start = new Date(baseDate);
  start.setHours(8, 0, 0, 0);
  const end = new Date(baseDate);
  end.setHours(10, 0, 0, 0);
  return { start, end };
}

/**
 * Fetches orders for a delivery date and converts them to Stop format.
 */
export async function fetchDeliveriesForDate(deliveryDate: string): Promise<Stop[]> {
  // Fetch orders for the given delivery date
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, user_id, delivery_window, status')
    .eq('delivery_date', deliveryDate)
    .neq('status', 'cancelled');

  if (ordersError) {
    throw new Error(`Supabase error: ${ordersError.message}`);
  }

  if (!orders || orders.length === 0) {
    return [];
  }

  // Fetch profiles for all user_ids
  const userIds = orders.filter(o => o.user_id).map(o => o.user_id) as string[];
  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, adresse, city, postal_code, geocoded_lat, geocoded_lng')
    .in('id', userIds);

  if (profError) {
    throw new Error(`Supabase profiles error: ${profError.message}`);
  }

  // Create a map for quick lookup
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  const baseDate = new Date(deliveryDate);
  const stops: Stop[] = [];

  for (const order of orders as any[]) {
    const profile = profileMap.get(order.user_id);

    if (!profile) {
      // eslint-disable-next-line no-console
      console.warn(`No profile found for order ${order.id} (user_id: ${order.user_id}), skipping`);
      continue;
    }

    // Construct full address from adresse, city, postal_code
    const addressParts = [
      profile.adresse,
      profile.postal_code,
      profile.city
    ].filter(Boolean);

    const address = addressParts.length > 0 ? addressParts.join(', ') : null;

    if (!address) {
      // eslint-disable-next-line no-console
      console.warn(`No address found for order ${order.id} (user_id: ${order.user_id}), skipping`);
      continue;
    }

    const { start, end } = parseTimeWindow(order.delivery_window, baseDate);
    const name = profile.first_name && profile.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : profile.first_name || profile.last_name || profile.email?.split('@')[0] || `Delivery ${order.id.slice(0, 8)}`;

    // Include geocoded coordinates from profile if available
    const stop: Stop = {
      id: order.id,
      name,
      email: profile.email,
      address,
      timeWindowStart: start.toISOString(),
      timeWindowEnd: end.toISOString(),
      serviceMinutes: 5, // Default service time
    };

    // Add geocoded coordinates from profile if available
    if (profile.geocoded_lat != null && profile.geocoded_lng != null) {
      stop.lat = profile.geocoded_lat;
      stop.lng = profile.geocoded_lng;
    }

    stops.push(stop);
  }

  return stops;
}

/**
 * Fetches all unique delivery dates from orders, ordered by date (newest first)
 */
export async function getAllDeliveryDates(): Promise<string[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('delivery_date')
    .neq('status', 'cancelled')
    .not('delivery_date', 'is', null)
    .order('delivery_date', { ascending: false });

  if (error) {
    throw new Error(`Supabase error: ${error.message}`);
  }

  // Get unique dates and sort (newest first)
  const uniqueDates = Array.from(new Set(
    data.map((row: any) => row.delivery_date).filter(Boolean)
  )).sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

  return uniqueDates as string[];
}

