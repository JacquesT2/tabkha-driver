import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type SimulationPoint = {
    id: string;
    lng: number;
    lat: number;
    deliveryWindowStart: string; // "HH:mm"
    deliveryWindowEnd: string;   // "HH:mm"
};

export default function DeliverySimulationPage() {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);

    // Simulation State
    const [points, setPoints] = useState<SimulationPoint[]>([]);

    // Example Scenarios
    const EXAMPLE_SCENARIOS = {
        dense: [
            { id: 'd1', lat: 48.914, lng: 2.360, deliveryWindowStart: '09:00', deliveryWindowEnd: '10:00' },
            { id: 'd2', lat: 48.912, lng: 2.365, deliveryWindowStart: '09:30', deliveryWindowEnd: '10:30' },
            { id: 'd3', lat: 48.908, lng: 2.355, deliveryWindowStart: '10:00', deliveryWindowEnd: '11:00' },
            { id: 'd4', lat: 48.915, lng: 2.350, deliveryWindowStart: '10:30', deliveryWindowEnd: '11:30' },
            { id: 'd5', lat: 48.910, lng: 2.370, deliveryWindowStart: '11:00', deliveryWindowEnd: '12:00' },
        ],
        scattered: [
            { id: 's1', lat: 48.930, lng: 2.300, deliveryWindowStart: '09:00', deliveryWindowEnd: '11:00' }, // Gennevilliers
            { id: 's2', lat: 48.890, lng: 2.400, deliveryWindowStart: '10:00', deliveryWindowEnd: '12:00' }, // Pantin
            { id: 's3', lat: 48.950, lng: 2.350, deliveryWindowStart: '11:00', deliveryWindowEnd: '13:00' }, // Sarcelles
            { id: 's4', lat: 48.910, lng: 2.250, deliveryWindowStart: '12:00', deliveryWindowEnd: '14:00' }, // Colombes
        ],
        clusters: [
            // Cluster A (St-Ouen)
            { id: 'c1', lat: 48.910, lng: 2.330, deliveryWindowStart: '09:00', deliveryWindowEnd: '10:00' },
            { id: 'c2', lat: 48.912, lng: 2.332, deliveryWindowStart: '09:15', deliveryWindowEnd: '10:15' },
            // Cluster B (Aubervilliers)
            { id: 'c3', lat: 48.910, lng: 2.380, deliveryWindowStart: '10:30', deliveryWindowEnd: '11:30' },
            { id: 'c4', lat: 48.912, lng: 2.382, deliveryWindowStart: '10:45', deliveryWindowEnd: '11:45' },
        ]
    };

    const loadScenario = (key: keyof typeof EXAMPLE_SCENARIOS) => {
        setPoints(EXAMPLE_SCENARIOS[key]);
    };

    const [hourlyCost, setHourlyCost] = useState<number>(25); // €/hour
    const [serviceTime, setServiceTime] = useState<number>(10); // minutes per stop
    const [calculating, setCalculating] = useState(false);
    const [depot] = useState({ lat: 48.910790500083145, lng: 2.3593634359991196 });

    // Calculated Results
    const [totalDistance, setTotalDistance] = useState<number>(0);
    const [totalTime, setTotalTime] = useState<number>(0);
    const [travelTime, setTravelTime] = useState<number>(0);
    const [totalServiceTime, setTotalServiceTime] = useState<number>(0);
    const [totalCost, setTotalCost] = useState<number>(0);

    // Initial Map Setup
    useEffect(() => {
        if (!mapRef.current) return;

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

            mapInstanceRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');

            // Add Depot Marker (Static)
            const el = document.createElement('div');
            el.className = 'marker-depot';
            el.style.backgroundColor = '#000';
            el.style.width = '24px';
            el.style.height = '24px';
            el.style.borderRadius = '4px'; // Square for depot
            el.style.border = '2px solid white';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.color = 'white';
            el.style.fontWeight = 'bold';
            el.style.fontSize = '12px';
            el.innerText = 'L'; // Labo
            el.title = "Labo (Depot)";
            el.style.cursor = 'default';

            new maplibregl.Marker({ element: el })
                .setLngLat([depot.lng, depot.lat])
                // @ts-ignore
                .addTo(mapInstanceRef.current);

            // Click listener to add points
            mapInstanceRef.current.on('click', (e) => {
                const newPoint: SimulationPoint = {
                    id: Math.random().toString(36).substr(2, 9),
                    lng: e.lngLat.lng,
                    lat: e.lngLat.lat,
                    deliveryWindowStart: '09:00',
                    deliveryWindowEnd: '12:00'
                };
                setPoints((prev) => [...prev, newPoint]);
            });
        }
    }, [depot.lat, depot.lng]);

    // Update Markers when points change
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        // Clear existing markers
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        points.forEach((point, index) => {
            // Create a custom element for the marker to handle right-clicks or sophisticated UI
            const el = document.createElement('div');
            el.className = 'marker';
            el.style.backgroundColor = '#ea580c';
            el.style.width = '24px';
            el.style.height = '24px';
            el.style.borderRadius = '50%';
            el.style.border = '2px solid white';
            el.style.cursor = 'pointer';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.color = 'white';
            el.style.fontWeight = 'bold';
            el.innerHTML = `${index + 1}`;

            // Add right click to remove
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                setPoints(prev => prev.filter(p => p.id !== point.id));
            });

            const marker = new maplibregl.Marker({ element: el, draggable: true })
                .setLngLat([point.lng, point.lat])
                .addTo(map);

            marker.on('dragend', () => {
                const lngLat = marker.getLngLat();
                setPoints(prev => prev.map(p =>
                    p.id === point.id ? { ...p, lng: lngLat.lng, lat: lngLat.lat } : p
                ));
            });

            // Add popup for delivery window editing
            // We use a React-like HTML string but handling events inside popup is tricky with vanilla JS strings.
            // For simplicity, we can just update state via global or re-render. 
            // Better approach for "editing": Click marker updates a "Selected Point" state in the sidebar.
            el.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent map click
                // Select point logic could go here, for now let's just focus on sidebar list
            });

            markersRef.current.push(marker);
        });

    }, [points]);

    // Calculation Logic
    useEffect(() => {
        if (points.length === 0) {
            setTotalDistance(0);
            setTotalTime(0);
            setTotalCost(0);
            return;
        }

        const calculateRoute = async () => {
            setCalculating(true);
            try {
                // Depot -> Points -> Depot
                const coords = [
                    [depot.lng, depot.lat],
                    ...points.map(p => [p.lng, p.lat]),
                    [depot.lng, depot.lat]
                ];

                const res = await fetch('/api/simulation/calculate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ points: coords })
                });

                if (!res.ok) throw new Error('Calculation failed');

                const data = await res.json();

                // Distance
                const distKm = data.distanceMeters / 1000;
                setTotalDistance(distKm);

                // Time
                // Travel time (from API) + Service time
                const totalTravelTimeHours = data.durationSeconds / 3600;
                const totalServiceTimeHours = (points.length * serviceTime) / 60;

                const totalHours = totalTravelTimeHours + totalServiceTimeHours;
                setTotalTime(totalHours);
                setTravelTime(totalTravelTimeHours);
                setTotalServiceTime(totalServiceTimeHours);

                // Cost Calculation (just time-based)
                setTotalCost(totalHours * hourlyCost);

            } catch (err) {
                console.error("Simulation error:", err);
            } finally {
                setCalculating(false);
            }
        };

        // Debounce slightly to avoid rapid API calls during drag
        const timeoutId = setTimeout(calculateRoute, 500);
        return () => clearTimeout(timeoutId);

    }, [points, hourlyCost, serviceTime, depot]);


    return (
        <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            {/* Sidebar Controls */}
            <div style={{
                width: '320px',
                backgroundColor: 'white',
                borderRight: '1px solid #ddd',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                overflowY: 'auto'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#ea580c' }}>Simulation</h2>
                    <button
                        onClick={() => setPoints([])}
                        style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', background: 'white', cursor: 'pointer' }}
                    >
                        Clear
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => loadScenario('dense')}
                        style={{ flex: 1, padding: '6px', fontSize: '0.8rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px', cursor: 'pointer', color: '#0284c7' }}
                    >
                        Dense
                    </button>
                    <button
                        onClick={() => loadScenario('scattered')}
                        style={{ flex: 1, padding: '6px', fontSize: '0.8rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', cursor: 'pointer', color: '#16a34a' }}
                    >
                        Wide
                    </button>
                    <button
                        onClick={() => loadScenario('clusters')}
                        style={{ flex: 1, padding: '6px', fontSize: '0.8rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '4px', cursor: 'pointer', color: '#ea580c' }}
                    >
                        Pockets
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Driver Cost (€/hr)</label>
                    <input
                        type="number"
                        value={hourlyCost}
                        onChange={(e) => setHourlyCost(Number(e.target.value))}
                        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                </div>



                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '0.9rem', fontWeight: 600 }}>Service Time (min/stop)</label>
                    <input
                        type="number"
                        value={serviceTime}
                        onChange={(e) => setServiceTime(Number(e.target.value))}
                        style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                </div>

                {calculating && (
                    <div style={{ padding: '10px', background: '#fff3cd', borderRadius: '4px', color: '#856404', fontSize: '0.9rem' }}>
                        Calculating route...
                    </div>
                )}

                <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>Estimations</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Stops:</span>
                            <strong>{points.length}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Total Distance:</span>
                            <strong>{totalDistance.toFixed(1)} km</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Total Time:</span>
                            <strong>
                                {Math.floor(totalTime)}h {Math.round((totalTime % 1) * 60)}m
                            </strong>
                        </div>

                        {/* Time Balance Bar */}
                        {totalTime > 0 && (
                            <div style={{ marginTop: '5px', marginBottom: '5px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px', color: '#666' }}>
                                    <span>Driving: {Math.round((travelTime / totalTime) * 100)}%</span>
                                    <span>Service: {Math.round((totalServiceTime / totalTime) * 100)}%</span>
                                </div>
                                <div style={{ height: '8px', width: '100%', backgroundColor: '#eee', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{ width: `${(travelTime / totalTime) * 100}%`, backgroundColor: '#3b82f6' }} title="Driving Time" />
                                    <div style={{ width: `${(totalServiceTime / totalTime) * 100}%`, backgroundColor: '#ea580c' }} title="Service Time" />
                                </div>
                            </div>
                        )}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            borderTop: '1px solid #eee',
                            paddingTop: '10px',
                            marginTop: '5px',
                            fontSize: '1.1rem',
                            color: '#1e7e34'
                        }}>
                            <span>Total Cost:</span>
                            <strong>€{totalCost.toFixed(2)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#666', marginTop: '-5px' }}>
                            <span>Cost per Drop:</span>
                            <strong>€{(points.length > 0 ? totalCost / points.length : 0).toFixed(2)}</strong>
                        </div>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>Points ({points.length})</h3>
                    <div style={{ fontSize: '0.85rem', color: '#666', fontStyle: 'italic', marginBottom: '10px' }}>
                        Click map to add. Right-click marker to remove.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {points.map((p, i) => (
                            <div key={p.id} style={{
                                padding: '10px',
                                background: '#f8f9fa',
                                border: '1px solid #eee',
                                borderRadius: '4px'
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: '5px' }}>Stop #{i + 1}</div>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <input
                                        type="time"
                                        value={p.deliveryWindowStart}
                                        onChange={(e) => setPoints(prev => prev.map(pt => pt.id === p.id ? { ...pt, deliveryWindowStart: e.target.value } : pt))}
                                        style={{ fontSize: '0.8rem', padding: '2px', width: '70px' }}
                                    />
                                    <span>-</span>
                                    <input
                                        type="time"
                                        value={p.deliveryWindowEnd}
                                        onChange={(e) => setPoints(prev => prev.map(pt => pt.id === p.id ? { ...pt, deliveryWindowEnd: e.target.value } : pt))}
                                        style={{ fontSize: '0.8rem', padding: '2px', width: '70px' }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Map Area */}
            <div style={{ flex: 1, position: 'relative' }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
            </div>
        </div>
    );
}
