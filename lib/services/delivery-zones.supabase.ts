import { supabase } from './supabase';

export type DeliveryZone = {
    id: string;
    postal_code: string;
    city: string | null;
    region: string | null;
    is_active: boolean;
    created_at: string | null;
    updated_at: string | null;
};

/**
 * Fetch all active delivery zones from the database
 */
export async function fetchActiveDeliveryZones(): Promise<DeliveryZone[]> {
    const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('is_active', true)
        .order('postal_code', { ascending: true });

    if (error) {
        throw new Error(`Failed to fetch delivery zones: ${error.message}`);
    }

    return data || [];
}

/**
 * Fetch all delivery zones from the database
 */
export async function fetchAllDeliveryZones(): Promise<DeliveryZone[]> {
    const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .order('postal_code', { ascending: true });

    if (error) {
        throw new Error(`Failed to fetch delivery zones: ${error.message}`);
    }

    return data || [];
}
