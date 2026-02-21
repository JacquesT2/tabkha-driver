import type { Stop } from '@/lib/types';

export interface TimeSlotBatch {
    slotName: string;
    slotStart: number; // Hour (0-23)
    slotEnd: number;   // Hour (0-23)
    stops: Stop[];
}

/**
 * Groups stops by their delivery time windows into predefined time slots
 * Slots: Morning (8-12), Afternoon (12-16), Evening (16-20)
 */
export function batchStopsByTimeSlot(stops: Stop[]): TimeSlotBatch[] {
    const batches: TimeSlotBatch[] = [
        { slotName: 'Morning', slotStart: 8, slotEnd: 12, stops: [] },
        { slotName: 'Afternoon', slotStart: 12, slotEnd: 16, stops: [] },
        { slotName: 'Evening', slotStart: 16, slotEnd: 20, stops: [] },
    ];

    for (const stop of stops) {
        const windowStart = new Date(stop.timeWindowStart);
        const startHour = windowStart.getHours();

        // Assign to appropriate batch based on time window start
        if (startHour >= 8 && startHour < 12) {
            batches[0].stops.push(stop);
        } else if (startHour >= 12 && startHour < 16) {
            batches[1].stops.push(stop);
        } else if (startHour >= 16 && startHour < 20) {
            batches[2].stops.push(stop);
        }
        // Stops outside these windows are skipped (could add warning/error handling)
    }

    // Return only non-empty batches
    return batches.filter(batch => batch.stops.length > 0);
}
