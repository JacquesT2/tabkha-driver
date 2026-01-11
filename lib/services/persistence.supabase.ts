import { supabase } from './supabase';
import { supabaseDriver } from './supabase-driver';
import type { Stop, OptimizedStop, OptimizeResponse } from '@/lib/types';

/**
 * Stores geocoding results for stops (by user profile)
 * Since addresses are stored in profiles, geocoding is stored there too
 * 
 * @param stops - Stops with geocoded coordinates
 * @param excludeStopIds - Set of stop IDs to exclude from saving (e.g., those that used fallback geocoding)
 */
export async function saveGeocodingForStops(
  stops: Stop[],
  excludeStopIds: Set<string> = new Set()
): Promise<void> {
  if (stops.length === 0) return;

  // Get meal_selection IDs to look up user_ids, excluding stops that used fallbacks
  const stopIds = stops
    .filter(s => s.lat != null && s.lng != null && s.id && !excludeStopIds.has(s.id))
    .map(s => s.id);

  if (stopIds.length === 0) return;

  // Fetch user_ids from meal_selections
  const { data: selections, error: selError } = await supabase
    .from('meal_selections')
    .select('id, user_id')
    .in('id', stopIds);

  if (selError) {
    // eslint-disable-next-line no-console
    console.warn('[PERSISTENCE] Failed to fetch meal_selections:', selError.message);
    return;
  }

  if (!selections || selections.length === 0) return;

  // Create a map of meal_selection_id -> user_id, and group by user_id
  const stopMap = new Map(stops.map(s => [s.id, s]));
  const userGeocoding = new Map<string, { lat: number; lng: number }>();

  for (const selection of selections) {
    if (!selection.user_id) continue;
    const stop = stopMap.get(selection.id);
    if (stop && stop.lat != null && stop.lng != null) {
      // Use the first geocoded result for each user (they should all be the same)
      if (!userGeocoding.has(selection.user_id)) {
        userGeocoding.set(selection.user_id, { lat: stop.lat, lng: stop.lng });
      }
    }
  }

  // Update profiles with geocoded coordinates
  for (const [userId, coords] of userGeocoding.entries()) {
    const { error } = await supabase
      .from('profiles')
      .update({
        geocoded_lat: coords.lat,
        geocoded_lng: coords.lng,
        geocoded_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[PERSISTENCE] Failed to save geocoding for user ${userId}:`, error.message);
    }
  }
}

/**
 * Loads geocoding results for stops (from user profiles)
 * Since addresses are stored in profiles, geocoding is loaded from there
 */
export async function loadGeocodingForStops(stops: Stop[]): Promise<Stop[]> {
  if (stops.length === 0) return stops;

  const stopIds = stops.map(s => s.id).filter(Boolean);
  if (stopIds.length === 0) return stops;

  // Fetch user_ids from meal_selections
  const { data: selections, error: selError } = await supabase
    .from('meal_selections')
    .select('id, user_id')
    .in('id', stopIds);

  if (selError) {
    // eslint-disable-next-line no-console
    console.warn('[PERSISTENCE] Failed to fetch meal_selections:', selError.message);
    return stops;
  }

  if (!selections || selections.length === 0) return stops;

  // Get unique user_ids
  const userIds = Array.from(new Set(
    selections
      .map(s => s.user_id)
      .filter((id): id is string => id != null)
  ));

  if (userIds.length === 0) return stops;

  // Fetch geocoded coordinates from profiles
  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, geocoded_lat, geocoded_lng')
    .in('id', userIds);

  if (profError) {
    // eslint-disable-next-line no-console
    console.warn('[PERSISTENCE] Failed to load geocoding from profiles:', profError.message);
    return stops;
  }

  // Create maps: meal_selection_id -> user_id, and user_id -> coordinates
  const selectionToUser = new Map(
    selections
      .filter(s => s.user_id != null)
      .map(s => [s.id, s.user_id!])
  );

  const userGeocodeMap = new Map(
    (profiles || [])
      .filter(p => p.geocoded_lat != null && p.geocoded_lng != null)
      .map(p => [p.id, { lat: p.geocoded_lat as number, lng: p.geocoded_lng as number }])
  );

  // Merge geocoded coordinates into stops
  return stops.map(stop => {
    const userId = selectionToUser.get(stop.id);
    if (userId) {
      const geocode = userGeocodeMap.get(userId);
      if (geocode) {
        return { ...stop, lat: geocode.lat, lng: geocode.lng };
      }
    }
    return stop;
  });
}

/**
 * Saves an optimized route for a delivery date
 * USES SECONDARY DRIVER DATABASE
 */
export async function saveRouteForDate(
  deliveryDate: string,
  route: OptimizeResponse,
  depot: { lat: number; lng: number }
): Promise<void> {
  const { error } = await supabaseDriver
    .from('delivery_routes')
    .upsert({
      delivery_date: deliveryDate,
      depot_lat: depot.lat,
      depot_lng: depot.lng,
      ordered_stops: route.orderedStops,
      total_distance_meters: Math.round(route.totalDistanceMeters || 0),
      total_duration_seconds: Math.round(route.totalDurationSeconds || 0),
      overview_polyline: route.overviewPolyline,
      driver_start_time_iso: route.driverStartTimeIso,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'delivery_date'
    });

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[PERSISTENCE] Failed to save route to driver DB:', error.message);
    throw new Error(`Failed to save route: ${error.message}`);
  }
}

/**
 * Loads an optimized route for a delivery date
 * USES SECONDARY DRIVER DATABASE
 */
export async function loadRouteForDate(
  deliveryDate: string
): Promise<{ route: OptimizeResponse; depot: { lat: number; lng: number } } | null> {
  const { data, error } = await supabaseDriver
    .from('delivery_routes')
    .select('*')
    .eq('delivery_date', deliveryDate)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No route found
      return null;
    }
    // eslint-disable-next-line no-console
    console.warn('[PERSISTENCE] Failed to load route from driver DB:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    route: {
      orderedStops: data.ordered_stops as OptimizedStop[],
      totalDistanceMeters: data.total_distance_meters,
      totalDurationSeconds: data.total_duration_seconds,
      overviewPolyline: data.overview_polyline || '',
      driverStartTimeIso: data.driver_start_time_iso
    },
    depot: {
      lat: data.depot_lat,
      lng: data.depot_lng
    }
  };
}

