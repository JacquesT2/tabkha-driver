import { supabase } from './supabase';

export type ClientData = {
    id: string;
    name: string;
    email: string;
    address: string | null;
    street: string | null;
    city: string | null;
    postalCode: string | null;
    lat: number | null;
    lng: number | null;
    orderCount: number;
    isSubscriber: boolean;
};

export async function fetchAllClients(): Promise<ClientData[]> {
    // 1. Fetch all profiles
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, adresse, city, postal_code, geocoded_lat, geocoded_lng');

    if (profilesError) {
        throw new Error(`Error fetching profiles: ${profilesError.message}`);
    }

    if (!profiles || profiles.length === 0) {
        return [];
    }

    // 2. Fetch all orders (grouped by user_id to count)
    // Since we can't easily do a "GROUP BY" with basic Supabase client without a view,
    // we'll fetch ID and user_id and aggregate in memory.
    // Optimally we would use rpc or a view, but in-memory is fine for < 10k users.
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('user_id');

    if (ordersError) {
        console.warn(`Error fetching orders: ${ordersError.message}`);
        // Non-fatal, just assume 0 orders
    }

    // 3. Fetch all active subscribers
    const { data: subscribers, error: subsError } = await supabase
        .from('subscription_new')
        .select('user_id, is_active')
        .eq('is_active', true);

    if (subsError) {
        console.warn(`Error fetching subscribers: ${subsError.message}`);
        // Non-fatal
    }

    // Aggregation Maps
    const orderCounts = new Map<string, number>();
    if (orders) {
        for (const order of orders) {
            if (order.user_id) {
                orderCounts.set(order.user_id, (orderCounts.get(order.user_id) || 0) + 1);
            }
        }
    }

    const subscriberSet = new Set<string>();
    if (subscribers) {
        for (const sub of subscribers) {
            if (sub.user_id) {
                subscriberSet.add(sub.user_id);
            }
        }
    }

    // 4. Merge Data
    const clients: ClientData[] = profiles.map((p: any) => {
        // Construct full address
        const addressParts = [p.adresse, p.postal_code, p.city].filter(Boolean);
        const address = addressParts.length > 0 ? addressParts.join(', ') : null;

        const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown';

        return {
            id: p.id,
            name,
            email: p.email,
            address,
            street: p.adresse,
            city: p.city,
            postalCode: p.postal_code,
            lat: p.geocoded_lat,
            lng: p.geocoded_lng,
            orderCount: orderCounts.get(p.id) || 0,
            isSubscriber: subscriberSet.has(p.id)
        };
    });

    return clients;
}
