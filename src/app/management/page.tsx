'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';

// Dynamically import map components to avoid SSR issues with maplibre-gl
const Planner = dynamic(() => import('@/components/pages/Planner'), { ssr: false });
const History = dynamic(() => import('@/components/pages/History'), { ssr: false });
const ClientMapPage = dynamic(() => import('@/components/pages/ClientMapPage'), { ssr: false });
const GeocodingManagerPage = dynamic(() => import('@/components/pages/GeocodingManagerPage'), { ssr: false });
const DeliveryZonesMapPage = dynamic(() => import('@/components/pages/DeliveryZonesMapPage'), { ssr: false });

// Tabkha brand colors - designed for good contrast
const COLORS = {
    background: '#faf6f1',     // Lighter cream for content area
    headerBg: '#ffffff',       // White header for clean look
    accent: '#ea580c',         // Darker orange for better contrast
    accentHover: '#c2410c',    // Even darker on hover
    accentLight: '#fff7ed',    // Very light orange
    text: '#292524',           // Very dark brown (stone-800)
    textMuted: '#57534e',      // Muted text (stone-600) 
    border: '#d6d3d1',         // Stone border
};

export default function ManagementPage() {
    const [activeView, setActiveView] = useState<'planner' | 'history' | 'clients' | 'geocoding' | 'zones'>('planner');

    const buttonStyle = (view: string) => ({
        padding: '8px 16px',
        border: 'none',
        borderRadius: 8,
        backgroundColor: activeView === view ? COLORS.accent : 'transparent',
        color: activeView === view ? 'white' : COLORS.text,
        cursor: 'pointer' as const,
        fontWeight: activeView === view ? 600 : 500,
        fontSize: '0.9rem',
        transition: 'all 0.2s ease',
    });

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: COLORS.background }}>
            <header style={{
                padding: '12px 20px',
                backgroundColor: COLORS.headerBg,
                borderBottom: `2px solid ${COLORS.border}`,
                display: 'flex',
                gap: 20,
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Link href="/" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                        <span style={{ fontSize: '1.5rem' }}>🍲</span>
                    </Link>
                    <strong style={{ fontSize: '1.1rem', color: COLORS.text }}>Tabkha Manager</strong>
                </div>
                <nav style={{
                    display: 'flex',
                    gap: 4,
                    backgroundColor: COLORS.accentLight,
                    padding: 4,
                    borderRadius: 10
                }}>
                    <Link href="/" style={{ textDecoration: 'none' }}>
                        <button style={{
                            ...buttonStyle(''),
                            backgroundColor: COLORS.text,
                            color: 'white',
                            marginRight: '8px'
                        }}>
                            🏠 Home
                        </button>
                    </Link>
                    <button onClick={() => setActiveView('planner')} style={buttonStyle('planner')}>
                        📋 Planner
                    </button>
                    <button onClick={() => setActiveView('history')} style={buttonStyle('history')}>
                        📜 History
                    </button>
                    <button onClick={() => setActiveView('clients')} style={buttonStyle('clients')}>
                        👥 Clients
                    </button>
                    <button onClick={() => setActiveView('geocoding')} style={buttonStyle('geocoding')}>
                        📍 Geocoding
                    </button>
                    <button onClick={() => setActiveView('zones')} style={buttonStyle('zones')}>
                        🗺️ Zones
                    </button>
                </nav>
            </header>
            <div style={{ flex: 1, minHeight: 0, backgroundColor: COLORS.background }}>
                {activeView === 'planner' ? <Planner /> :
                    activeView === 'history' ? <History /> :
                        activeView === 'clients' ? <ClientMapPage /> :
                            activeView === 'geocoding' ? <GeocodingManagerPage /> :
                                <DeliveryZonesMapPage />}
            </div>
        </div>
    );
}
