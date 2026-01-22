import { NextResponse } from 'next/server';
import { fetchAllParkingSpots } from '@/lib/services/parking-spots.supabase';

export async function GET() {
    try {
        const spots = await fetchAllParkingSpots();
        return NextResponse.json({ spots });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
