'use client';

import React, { useState } from 'react';
import type { OptimizedStop } from '@/lib/types';

interface StopsListProps {
    stops: OptimizedStop[];
    onBack: () => void;
}

export default function StopsList({ stops, onBack }: StopsListProps) {
    // Local state for completed stops
    const [completedStops, setCompletedStops] = useState<Set<number>>(new Set());

    const toggleStop = (index: number) => {
        const newCompleted = new Set(completedStops);
        if (newCompleted.has(index)) {
            newCompleted.delete(index);
        } else {
            newCompleted.add(index);
        }
        setCompletedStops(newCompleted);
    };

    const getGoogleMapsLink = (lat?: number, lng?: number) => {
        if (!lat || !lng) return '#';
        return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    };

    // Calculate progress
    const progress = stops.length > 0 ? Math.round((completedStops.size / stops.length) * 100) : 0;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f3f4f6' }}>
            {/* Header */}
            <header style={{
                padding: '16px',
                backgroundColor: 'white',
                borderBottom: '1px solid #e5e5e5',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                position: 'sticky',
                top: 0,
                zIndex: 10,
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}>
                <button
                    onClick={onBack}
                    style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px'
                    }}
                >
                    ←
                </button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: '1.1rem', fontWeight: 'bold', margin: '0 0 4px 0', color: '#1c1917' }}>Today's Route</h1>
                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                            width: `${progress}%`,
                            height: '100%',
                            backgroundColor: '#ea580c',
                            transition: 'width 0.3s ease'
                        }} />
                    </div>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#57534e' }}>
                    {completedStops.size}/{stops.length}
                </div>
            </header>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {stops.map((stop, index) => {
                        const isCompleted = completedStops.has(index);
                        const isNext = !isCompleted && (index === 0 || completedStops.has(index - 1));

                        return (
                            <div key={stop.id || index} style={{
                                backgroundColor: 'white',
                                borderRadius: '12px',
                                padding: '16px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                borderLeft: isNext ? '4px solid #ea580c' : '4px solid transparent',
                                opacity: isCompleted ? 0.6 : 1,
                                transition: 'all 0.2s ease'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            backgroundColor: isNext ? '#ea580c' : '#f5f5f4',
                                            color: isNext ? 'white' : '#57534e',
                                            padding: '2px 8px',
                                            borderRadius: '99px',
                                            fontSize: '0.75rem',
                                            fontWeight: '600'
                                        }}>
                                            Stop {index + 1}
                                        </span>
                                        {/* Show ETA if available (OptimizedStop has etaIso) */}
                                        {stop.etaIso && (
                                            <span style={{ fontSize: '0.85rem', color: '#ea580c', fontWeight: '500' }}>
                                                🕒 {new Date(stop.etaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={isCompleted}
                                        onChange={() => toggleStop(index)}
                                        style={{ width: '24px', height: '24px', accentColor: '#ea580c', cursor: 'pointer' }}
                                    />
                                </div>

                                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: '600', color: '#1c1917', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                                    {stop.name}
                                </h3>
                                <p style={{ margin: '0 0 16px 0', color: '#57534e', fontSize: '0.95rem' }}>
                                    {stop.address || 'No address provided'}
                                </p>

                                {stop.lat && stop.lng && (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <a
                                            href={getGoogleMapsLink(stop.lat, stop.lng)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                flex: 1,
                                                textAlign: 'center',
                                                padding: '12px',
                                                backgroundColor: '#eff6ff',
                                                color: '#2563eb',
                                                borderRadius: '8px',
                                                textDecoration: 'none',
                                                fontWeight: '600',
                                                fontSize: '1rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            🧭 Navigate
                                        </a>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Quick Action for Depot Return if it exists */}
            {/* Could summarize "Return to Kitchen" here */}
        </div>
    );
}
