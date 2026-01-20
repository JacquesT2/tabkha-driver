import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TEST_ACCOUNTS } from '@/lib/constants';

type ClientData = {
    id: string;
    name: string;
    email: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    orderCount: number;
    isSubscriber: boolean;
};

export default function ClientMapPage() {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const [clients, setClients] = useState<ClientData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [depot] = useState({ lat: 48.86, lng: 2.33 }); // Default Paris center
    const [minOrderCount, setMinOrderCount] = useState(0);
    const [excludeTestAccounts, setExcludeTestAccounts] = useState(true);

    useEffect(() => {
        // Fetch client data
        const fetchData = async () => {
            try {
                const res = await fetch('/api/clients');
                if (!res.ok) throw new Error('Failed to fetch clients');
                const data = await res.json();
                setClients(data.clients);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    useEffect(() => {
        if (!mapRef.current || loading) return;

        if (!mapInstanceRef.current) {
            mapInstanceRef.current = new maplibregl.Map({
                container: mapRef.current,
                style: {
                    version: 8,
                    sources: {
                        'osm-tiles': {
                            type: 'raster',
                            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                            tileSize: 256,
                            attribution: '© OpenStreetMap contributors'
                        }
                    },
                    layers: [
                        {
                            id: 'osm-layer',
                            type: 'raster',
                            source: 'osm-tiles'
                        }
                    ]
                },
                center: [depot.lng, depot.lat],
                zoom: 11
            });

            // Add navigation controls
            mapInstanceRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');
        }

        const map = mapInstanceRef.current;

        // Clear existing markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        // Add markers
        const bounds = new maplibregl.LngLatBounds();
        let hasMarkers = false;

        const filteredClients = clients.filter(c =>
            c.orderCount >= minOrderCount &&
            (!excludeTestAccounts || !TEST_ACCOUNTS.includes(c.email))
        );

        filteredClients.forEach(client => {
            if (client.lat && client.lng) {
                hasMarkers = true;
                bounds.extend([client.lng, client.lat]);

                // Determine color
                let color = '#9e9e9e'; // Grey (default/0 orders)
                if (client.isSubscriber) {
                    color = '#34a853'; // Green (Subscriber)
                } else if (client.orderCount > 0) {
                    color = '#1a73e8'; // Blue (Has orders)
                }

                const marker = new maplibregl.Marker({ color, scale: 0.8 })
                    .setLngLat([client.lng, client.lat])
                    .setPopup(new maplibregl.Popup().setHTML(`
            <div style="font-family: sans-serif; padding: 5px;">
              <strong>${client.name}</strong><br/>
              Orders: ${client.orderCount}<br/>
              Subscriber: ${client.isSubscriber ? 'Yes' : 'No'}<br/>
              <span style="font-size: 0.9em; color: #666;">${client.address || ''}</span>
            </div>
          `))
                    .addTo(map);

                markersRef.current.push(marker);
            }
        });

        if (hasMarkers) {
            map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
        }

    }, [clients, loading, depot.lat, depot.lng, minOrderCount, excludeTestAccounts]);

    if (loading) return <div style={{ padding: 20 }}>Loading client map...</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>;

    const filteredClients = clients.filter(c =>
        c.orderCount >= minOrderCount &&
        (!excludeTestAccounts || !TEST_ACCOUNTS.includes(c.email))
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            <div style={{ padding: '10px 20px', background: '#fff', borderBottom: '1px solid #ddd', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0 }}>Client Map</h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #eee', paddingLeft: '15px' }}>
                    <label style={{ fontSize: '14px', fontWeight: 500 }}>Min Orders:</label>
                    <select
                        value={minOrderCount}
                        onChange={(e) => setMinOrderCount(Number(e.target.value))}
                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        <option value={0}>0+</option>
                        <option value={1}>1+</option>
                        <option value={2}>2+</option>
                        <option value={3}>3+</option>
                        <option value={5}>5+</option>
                        <option value={10}>10+</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #eee', paddingLeft: '15px' }}>
                    <label style={{ fontSize: '14px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={excludeTestAccounts}
                            onChange={(e) => setExcludeTestAccounts(e.target.checked)}
                        />
                        Exclude Test Accounts
                    </label>
                </div>

                <div style={{ display: 'flex', gap: '15px', borderLeft: '1px solid #eee', paddingLeft: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#34a853' }}></div>
                        <span style={{ fontSize: '14px' }}>Subscriber</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#1a73e8' }}></div>
                        <span style={{ fontSize: '14px' }}>Ordered ({'>'}0)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#9e9e9e' }}></div>
                        <span style={{ fontSize: '14px' }}>Potential (0)</span>
                    </div>
                </div>

                <div style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 500 }}>
                    Total: {filteredClients.length} | Mapped: {filteredClients.filter(c => c.lat && c.lng).length}
                </div>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            </div>
        </div>
    );
}
