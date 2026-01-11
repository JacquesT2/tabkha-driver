'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { loadRoute } from '@/lib/api';
import { OptimizeResponse, LatLng } from '@/lib/types';
import RoutePreview from '@/components/driver/RoutePreview';
import StopsList from '@/components/driver/StopsList';

// Tabkha brand colors
const COLORS = {
    background: '#faf6f1',
    headerBg: '#ffffff',
    text: '#292524',
    border: '#d6d3d1',
    accent: '#ea580c',
};

type ViewState = 'selection' | 'preview' | 'list';

import { useDriverTracking } from '@/hooks/useDriverTracking';

export default function DriverPage() {
    const [view, setView] = useState<ViewState>('selection');
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [routeData, setRouteData] = useState<{ route: OptimizeResponse; depot: LatLng } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Enable tracking when we have a route (in preview or list mode)
    // We use the 'date' as the session ID
    const isTrackingEnabled = (view === 'preview' || view === 'list') && !!routeData;
    const { isTracking, error: trackingError } = useDriverTracking(date, isTrackingEnabled);

    const handleLoadRoute = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await loadRoute(date);
            if (data) {
                setRouteData(data);
                setView('preview');
            } else {
                setError('No route found for this date.');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load route');
        } finally {
            setLoading(false);
        }
    };

    const handleStartRoute = () => {
        setView('list');
    };

    const handleBack = () => {
        if (view === 'list') setView('preview');
        else if (view === 'preview') setView('selection');
    };

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: COLORS.background }}>
            {/* Header - Only show in Selection and Preview modes (List has its own header) */}
            {view !== 'list' && (
                <header style={{
                    padding: '12px 20px',
                    backgroundColor: COLORS.headerBg,
                    borderBottom: `2px solid ${COLORS.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Link href="/" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <span style={{ fontSize: '1.5rem' }}>🍲</span>
                        </Link>
                        <strong style={{ fontSize: '1.1rem', color: COLORS.text }}>Driver App</strong>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        {isTracking && (
                            <div style={{ fontSize: '0.8rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 8, height: 8, backgroundColor: '#16a34a', borderRadius: '50%', display: 'inline-block' }}></span>
                                Tracking
                            </div>
                        )}
                        {trackingError && (
                            <div style={{ fontSize: '0.7rem', color: '#ef4444', maxWidth: '150px', textAlign: 'right' }}>
                                ⚠️ {trackingError}
                            </div>
                        )}
                    </div>
                </header>
            )}

            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {view === 'selection' && (
                    <div style={{
                        padding: '2rem',
                        maxWidth: '400px',
                        margin: '0 auto',
                        marginTop: '2rem',
                        textAlign: 'center'
                    }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: COLORS.text }}>
                            Select Route Date
                        </h1>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                style={{
                                    padding: '12px',
                                    fontSize: '1.1rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${COLORS.border}`,
                                    width: '100%',
                                    textAlign: 'center'
                                }}
                            />
                        </div>

                        {error && (
                            <div style={{
                                padding: '12px',
                                backgroundColor: '#fee2e2',
                                color: '#ef4444',
                                borderRadius: '8px',
                                marginBottom: '1.5rem'
                            }}>
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleLoadRoute}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '14px',
                                backgroundColor: COLORS.accent,
                                color: 'white',
                                border: 'none',
                                borderRadius: '10px',
                                fontSize: '1.1rem',
                                fontWeight: '600',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.7 : 1,
                                boxShadow: '0 4px 6px -1px rgba(234, 88, 12, 0.3)'
                            }}
                        >
                            {loading ? 'Loading...' : 'Load Route'}
                        </button>
                    </div>
                )}

                {view === 'preview' && routeData && (
                    <RoutePreview
                        data={routeData}
                        date={date}
                        onStart={handleStartRoute}
                    />
                )}

                {view === 'list' && routeData && (
                    <StopsList
                        stops={routeData.route.orderedStops}
                        onBack={handleBack}
                        isTracking={isTracking}
                        trackingError={trackingError}
                    />
                )}
            </div>
        </div>
    );
}
