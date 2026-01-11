'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { OptimizeResponse, LatLng } from '@/lib/types';

// Dynamic import for map to avoid SSR issues
const HistoryMapView = dynamic(() => import('@/components/HistoryMapView'), { ssr: false });

interface RoutePreviewProps {
    data: {
        route: OptimizeResponse;
        depot: LatLng;
    };
    onStart: () => void;
    date: string;
}

export default function RoutePreview({ data, onStart, date }: RoutePreviewProps) {
    const { route, depot } = data;

    // Calculate simple stats
    const stopCount = route.orderedStops.length;
    // Helper to format duration
    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };
    const duration = formatDuration(route.totalDurationSeconds);
    const distance = (route.totalDistanceMeters / 1000).toFixed(1) + ' km';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Map Area - take available space */}
            <div style={{ flex: 1, position: 'relative' }}>
                <HistoryMapView
                    depot={depot}
                    stops={route.orderedStops}
                    polyline={route.overviewPolyline}
                    routeSegments={route.routeSegments}
                    key={date}
                />
            </div>

            {/* Summary Card - Fixed at bottom */}
            <div style={{
                padding: '20px',
                backgroundColor: 'white',
                borderTop: '1px solid #e5e5e5',
                boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1c1917' }}>
                    Route for {date}
                </h2>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', color: '#57534e' }}>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '600', color: '#1c1917' }}>{stopCount}</span>
                        <span style={{ fontSize: '0.85rem' }}>Stops</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '600', color: '#1c1917' }}>{duration}</span>
                        <span style={{ fontSize: '0.85rem' }}>Time</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ display: 'block', fontSize: '1.1rem', fontWeight: '600', color: '#1c1917' }}>{distance}</span>
                        <span style={{ fontSize: '0.85rem' }}>Distance</span>
                    </div>
                </div>

                <button
                    onClick={onStart}
                    style={{
                        width: '100%',
                        padding: '16px',
                        backgroundColor: '#ea580c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 4px 6px -1px rgba(234, 88, 12, 0.3)'
                    }}
                >
                    Start Route 🚀
                </button>
            </div>
        </div>
    );
}
