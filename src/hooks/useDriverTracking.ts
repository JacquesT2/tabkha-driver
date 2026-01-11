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
    const [error, setError] = useState<string | null>(null);
    const bufferRef = useRef<LocationLog[]>([]);
    const watchIdRef = useRef<number | null>(null);
    const wakeLockRef = useRef<any>(null);
    const FLUSH_INTERVAL_MS = 30000; // Send batches every 30s

    useEffect(() => {
        if (!enabled || !sessionId) {
            stopTracking();
            return;
        }

        startTracking();

        const flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);

        // Re-request wake lock and ensure tracking is active on visibility change
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && enabled) {
                requestWakeLock();
                // Attempt to restart tracking if it was stopped/killed
                startTracking();
                // Force an immediate read to update UI/buffer ASAP
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        setLastLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                        // We don't buffer this explicit read to avoid duplicating the watch event that might fire, 
                        // or we can; but mostly doing this to wake up the radio and update UI.
                    },
                    (err) => console.warn('Immediate fix error:', err),
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            stopTracking();
            clearInterval(flushTimer);
            flushBuffer(); // Flush remaining on unmount
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [enabled, sessionId]);

    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            }
        } catch (err) {
            console.warn('Wake Lock request failed:', err);
        }
    };

    const startTracking = () => {
        requestWakeLock();

        if (!navigator.geolocation) {
            setError('Geolocation is not supported by this browser. Ensure you are using HTTPS.');
            return;
        }

        if (watchIdRef.current !== null) return;

        setIsTracking(true);
        setError(null);

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
            (err) => {
                console.warn('Geolocation error:', err);
                setIsTracking(false);
                // Critical: clear ref so we can restart
                watchIdRef.current = null;

                let msg = 'Unknown geolocation error';
                switch (err.code) {
                    case err.PERMISSION_DENIED:
                        msg = 'Location permission denied';
                        break;
                    case err.POSITION_UNAVAILABLE:
                        msg = 'Location unavailable';
                        break;
                    case err.TIMEOUT:
                        // Don't show error for timeout, just retry silently or let visibility change fix it
                        msg = 'Location request timed out';
                        break;
                }
                setError(msg);
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
        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => { });
            wakeLockRef.current = null;
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
            console.error('Failed to flush location logs, re-queueing:', err);
            // Re-queue logs at the beginning of the buffer to preserve order roughly
            bufferRef.current = [...logsToSend, ...bufferRef.current];
        }
    };

    return {
        isTracking,
        lastLocation,
        error
    };
}
