import { useEffect, useRef, useState } from 'react';

interface LocationLog {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    timestamp: string;
    session_id: string; // e.g., date
}

export function useDriverTracking(sessionId: string | null, enabled: boolean) {
    const [isTracking, setIsTracking] = useState(false);
    const [lastLocation, setLastLocation] = useState<{ lat: number; lng: number } | null>(null);
    const bufferRef = useRef<LocationLog[]>([]);
    const watchIdRef = useRef<number | null>(null);
    const FLUSH_INTERVAL_MS = 30000; // Send batches every 30s

    useEffect(() => {
        if (!enabled || !sessionId) {
            stopTracking();
            return;
        }

        startTracking();

        const flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);

        return () => {
            stopTracking();
            clearInterval(flushTimer);
            flushBuffer(); // Flush remaining on unmount
        };
    }, [enabled, sessionId]);

    const startTracking = () => {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported');
            return;
        }

        if (watchIdRef.current !== null) return;

        setIsTracking(true);
        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy, speed, heading } = position.coords;

                // Update local state for UI
                setLastLocation({ lat: latitude, lng: longitude });

                // Add to buffer
                const log: LocationLog = {
                    latitude,
                    longitude,
                    accuracy,
                    speed,
                    heading,
                    timestamp: new Date(position.timestamp).toISOString(),
                    session_id: sessionId!
                };
                bufferRef.current.push(log);
            },
            (error) => {
                console.warn('Geolocation error:', error);
                setIsTracking(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 5000
            }
        );
    };

    const stopTracking = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setIsTracking(false);
    };

    const flushBuffer = async () => {
        if (bufferRef.current.length === 0) return;

        const logsToSend = [...bufferRef.current];
        bufferRef.current = []; // Clear buffer immediately

        try {
            await fetch('/api/driver/location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs: logsToSend })
            });
        } catch (err) {
            console.error('Failed to flush location logs:', err);
            // Optional: Re-queue logs if failed? For now, we drop them to avoid memory leaks
        }
    };

    return {
        isTracking,
        lastLocation
    };
}
