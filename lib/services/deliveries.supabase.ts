import { supabase } from './supabase';
import type { Stop, ManualOrder } from '@/lib/types';
import { loadModifiedDropsForDate, loadDropsMovedToDate } from './persistence.supabase';

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
  // 1. Fetch originally scheduled orders for the given date
  const { data: originalOrders, error: ordersError } = await supabase
    .from('orders')
    .select('id, user_id, delivery_window, status, delivery_date')
    .eq('delivery_date', deliveryDate)
    .neq('status', 'cancelled');

  if (ordersError) {
    throw new Error(`Supabase error: ${ordersError.message}`);
  }

  // 2. Fetch modified drops rules for this date (moved away, time changed, or moved TO this date)
  const modifiedDropsAwayOrChanged = await loadModifiedDropsForDate(deliveryDate);
  const modifiedDropsToHere = await loadDropsMovedToDate(deliveryDate);

  // Create a fast lookup for modifications
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modsByOrderId = new Map<string, any>();
  for (const mod of [...modifiedDropsAwayOrChanged, ...modifiedDropsToHere]) {
    // Keep the most recent modification if there are multiple (shouldn't happen with proper upsert)
    modsByOrderId.set(mod.order_id, mod);
  }

  // 3. Filter and adjust the current day's drops
  let ordersList = originalOrders || [];

  // - Filter out drops moved away
  ordersList = ordersList.filter(o => {
    const mod = modsByOrderId.get(o.id);
    if (!mod) return true; // No modification = keep

    // If it has a new date and it's NOT today, exclude it
    if (mod.new_delivery_date && mod.new_delivery_date !== deliveryDate) {
      return false;
    }
    return true; // Keep if date is same or new_date is null (e.g. just a time change)
  });

  // - Add drops moved TO this date from other dates
  if (modifiedDropsToHere.length > 0) {
    const toHereIds = modifiedDropsToHere.map(m => m.order_id);
    const { data: movedOrders } = await supabase
      .from('orders')
      .select('id, user_id, delivery_window, status, delivery_date')
      .in('id', toHereIds)
      .neq('status', 'cancelled');

    if (movedOrders) {
      for (const movedOrder of movedOrders) {
        // Prevent duplicates
        if (!ordersList.some(o => o.id === movedOrder.id)) {
          ordersList.push(movedOrder);
        }
      }
    }
  }

  // Redundant check removed to fix TS error
  if (!ordersList || ordersList.length === 0) {
    return [];
  }

  // Fetch profiles for all user_ids
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = ordersList.filter((o: any) => o.user_id).map((o: any) => o.user_id) as string[];
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const order of ordersList as any[]) {
    const profile = profileMap.get(order.user_id);

    if (!profile) {
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
      console.warn(`No address found for order ${order.id} (user_id: ${order.user_id}), skipping`);
      continue;
    }

    // Apply time window overrides if a modification exists
    const mod = modsByOrderId.get(order.id);
    let timeWindowStr = order.delivery_window;

    if (mod && mod.new_delivery_window_start && mod.new_delivery_window_end) {
      timeWindowStr = `${mod.new_delivery_window_start}-${mod.new_delivery_window_end}`;
    }

    const { start, end } = parseTimeWindow(timeWindowStr, baseDate);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.map((row: any) => row.delivery_date).filter(Boolean)
  )).sort((a, b) => b.localeCompare(a)); // Sort descending (newest first)

  return uniqueDates as string[];
}

/**
 * Fetches orders for manual tracking/accounting on a specific date.
 */
export async function fetchOrdersForManualTracking(deliveryDate: string): Promise<ManualOrder[]> {
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, user_id, delivery_window, status, delivery_date')
    .eq('delivery_date', deliveryDate)
    .neq('status', 'cancelled');

  if (ordersError) {
    throw new Error(`Supabase error: ${ordersError.message}`);
  }

  if (!orders || orders.length === 0) {
    return [];
  }

  const userIds = orders.filter(o => o.user_id).map(o => o.user_id) as string[];
  let profileMap = new Map();

  if (userIds.length > 0) {
    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, adresse, city, postal_code')
      .in('id', userIds);

    if (profError) {
      throw new Error(`Supabase profiles error: ${profError.message}`);
    }
    profileMap = new Map((profiles || []).map(p => [p.id, p]));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return orders.map((order: any) => {
    const profile = profileMap.get(order.user_id);

    let address = 'No address found';
    let customerName = 'Unknown Customer';

    if (profile) {
      const addressParts = [
        profile.adresse,
        profile.postal_code,
        profile.city
      ].filter(Boolean);
      if (addressParts.length > 0) address = addressParts.join(', ');

      customerName = profile.first_name && profile.last_name
        ? `${profile.first_name} ${profile.last_name}`
        : profile.first_name || profile.last_name || profile.email?.split('@')[0] || `Delivery ${order.id.slice(0, 8)}`;
    }

    return {
      id: order.id,
      customerName,
      address,
      deliveryWindow: order.delivery_window || 'Unspecified',
      status: order.status,
      deliveryDate: order.delivery_date
    };
  });
}

/**
 * Updates the status of an order.
 */
export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId);

  if (error) {
    throw new Error(`Supabase update error: ${error.message}`);
  }
}


