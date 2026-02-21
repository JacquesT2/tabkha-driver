import { supabase } from './supabase';

export type ParkingSpot = {
    id: string;
    lat: number;
    lng: number;
    address: string | null;
    parking_type: string | null;
    regime: string | null;
};

/**
 * Fetch all delivery parking spots.
 * Intended to be cached client-side as the dataset is static-ish and manageable size (~9k rows).
 */
export async function fetchAllParkingSpots(): Promise<ParkingSpot[]> {
    const { data, error } = await supabase
        .from('delivery_parking_spots')
        .select('id, lat, lng, address, parking_type, regime')
        .not('lat', 'is', null)
        .not('lng', 'is', null);

    if (error) {
        console.error('Error fetching parking spots:', error);
        throw new Error(error.message);
    }

    return data || [];
}
