import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type DeliveryZone = {
    id: string;
    postal_code: string;
    city: string | null;
    region: string | null;
    is_active: boolean;
};

type PostalCodeFeature = {
    postal_code: string;
    city: string | null;
    region: string | null;
    geometry: GeoJSON.Geometry | null;
    center: [number, number] | null;
};

// Fetch commune boundaries for a postal code from the French government geo API
async function fetchPostalCodeBoundary(postalCode: string): Promise<{
    geometry: GeoJSON.Geometry | null;
    center: [number, number] | null;
}> {
    try {
        // Get communes for this postal code
        const response = await fetch(
            `https://geo.api.gouv.fr/communes?codePostal=${postalCode}&fields=nom,centre,contour&format=json`
        );
        const communes = await response.json();

        if (!communes || communes.length === 0) {
            return { geometry: null, center: null };
        }

        // If single commune, return its contour
        if (communes.length === 1) {
            const commune = communes[0];
            return {
                geometry: commune.contour || null,
                center: commune.centre?.coordinates || null
            };
        }

        // Multiple communes: merge into a MultiPolygon
        const polygons: GeoJSON.Position[][][] = [];
        let centerSum: [number, number] = [0, 0];
        let centerCount = 0;

        for (const commune of communes) {
            if (commune.contour) {
                if (commune.contour.type === 'Polygon') {
                    polygons.push(commune.contour.coordinates);
                } else if (commune.contour.type === 'MultiPolygon') {
                    polygons.push(...commune.contour.coordinates);
                }
            }
            if (commune.centre?.coordinates) {
                centerSum[0] += commune.centre.coordinates[0];
                centerSum[1] += commune.centre.coordinates[1];
                centerCount++;
            }
        }

        if (polygons.length === 0) {
            return { geometry: null, center: null };
        }

        return {
            geometry: {
                type: 'MultiPolygon',
                coordinates: polygons
            },
            center: centerCount > 0
                ? [centerSum[0] / centerCount, centerSum[1] / centerCount]
                : null
        };
    } catch {
        return { geometry: null, center: null };
    }
}

export default function DeliveryZonesMapPage() {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<maplibregl.Map | null>(null);
    const [zones, setZones] = useState<DeliveryZone[]>([]);
    const [geoFeatures, setGeoFeatures] = useState<PostalCodeFeature[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchingBoundaries, setFetchingBoundaries] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [center] = useState({ lat: 48.86, lng: 2.33 }); // Paris center
    const [hoveredZone, setHoveredZone] = useState<string | null>(null);

    // Fetch delivery zones
    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/delivery-zones');
                if (!res.ok) throw new Error('Failed to fetch delivery zones');
                const data = await res.json();
                setZones(data.zones);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Fetch boundaries for all postal codes
    useEffect(() => {
        if (zones.length === 0) return;

        const fetchAllBoundaries = async () => {
            setFetchingBoundaries(true);
            const results: PostalCodeFeature[] = [];

            for (const zone of zones) {
                const { geometry, center } = await fetchPostalCodeBoundary(zone.postal_code);
                results.push({
                    postal_code: zone.postal_code,
                    city: zone.city,
                    region: zone.region,
                    geometry,
                    center
                });
            }

            setGeoFeatures(results);
            setFetchingBoundaries(false);
        };

        fetchAllBoundaries();
    }, [zones]);

    // Initialize map and add polygon layers
    useEffect(() => {
        if (!mapRef.current || loading || fetchingBoundaries) return;

        // Create map if not exists
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
                center: [center.lng, center.lat],
                zoom: 10
            });

            mapInstanceRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');
        }

        const map = mapInstanceRef.current;

        const setupLayers = () => {
            // Remove existing layers and sources
            if (map.getLayer('zones-fill')) map.removeLayer('zones-fill');
            if (map.getLayer('zones-outline')) map.removeLayer('zones-outline');
            if (map.getLayer('zones-labels')) map.removeLayer('zones-labels');
            if (map.getSource('delivery-zones')) map.removeSource('delivery-zones');
            if (map.getSource('zone-labels')) map.removeSource('zone-labels');

            // Build GeoJSON FeatureCollection for polygons
            const features: GeoJSON.Feature[] = [];
            const labelFeatures: GeoJSON.Feature[] = [];
            const bounds = new maplibregl.LngLatBounds();

            geoFeatures.forEach(feature => {
                if (feature.geometry) {
                    features.push({
                        type: 'Feature',
                        properties: {
                            postal_code: feature.postal_code,
                            city: feature.city || '',
                            region: feature.region || ''
                        },
                        geometry: feature.geometry
                    });

                    // Add center point for label
                    if (feature.center) {
                        labelFeatures.push({
                            type: 'Feature',
                            properties: {
                                postal_code: feature.postal_code,
                                city: feature.city || ''
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: feature.center
                            }
                        });
                        bounds.extend(feature.center);
                    }
                }
            });

            if (features.length === 0) return;

            // Add polygon source
            map.addSource('delivery-zones', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features
                }
            });

            // Add label source
            map.addSource('zone-labels', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: labelFeatures
                }
            });

            // Fill layer (semi-transparent green)
            map.addLayer({
                id: 'zones-fill',
                type: 'fill',
                source: 'delivery-zones',
                paint: {
                    'fill-color': '#34a853',
                    'fill-opacity': 0.35
                }
            });

            // Outline layer (darker green border)
            map.addLayer({
                id: 'zones-outline',
                type: 'line',
                source: 'delivery-zones',
                paint: {
                    'line-color': '#1e7e34',
                    'line-width': 2.5,
                    'line-opacity': 0.9
                }
            });

            // Label layer
            map.addLayer({
                id: 'zones-labels',
                type: 'symbol',
                source: 'zone-labels',
                layout: {
                    'text-field': ['get', 'postal_code'],
                    'text-size': 12,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-anchor': 'center',
                    'text-allow-overlap': false
                },
                paint: {
                    'text-color': '#1e7e34',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 2
                }
            });

            // Fit map to bounds
            if (!bounds.isEmpty()) {
                map.fitBounds(bounds, { padding: 50, maxZoom: 12 });
            }

            // Add hover popup
            const popup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false
            });

            map.on('mousemove', 'zones-fill', (e) => {
                if (e.features && e.features.length > 0) {
                    const feature = e.features[0];
                    const props = feature.properties;

                    map.getCanvas().style.cursor = 'pointer';
                    setHoveredZone(props?.postal_code || null);

                    popup.setLngLat(e.lngLat).setHTML(`
                        <div style="font-family: sans-serif; padding: 5px;">
                            <strong style="font-size: 1.1em;">${props?.postal_code}</strong><br/>
                            ${props?.city ? `<span>${props.city}</span><br/>` : ''}
                            ${props?.region ? `<span style="color: #666; font-size: 0.9em;">${props.region}</span>` : ''}
                        </div>
                    `).addTo(map);
                }
            });

            map.on('mouseleave', 'zones-fill', () => {
                map.getCanvas().style.cursor = '';
                setHoveredZone(null);
                popup.remove();
            });
        };

        if (map.loaded()) {
            setupLayers();
        } else {
            map.on('load', setupLayers);
        }
    }, [geoFeatures, loading, fetchingBoundaries, center.lat, center.lng]);

    if (loading) return <div style={{ padding: 20 }}>Loading delivery zones...</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>Error: {error}</div>;

    const mappedCount = geoFeatures.filter(f => f.geometry !== null).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
            <div style={{
                padding: '10px 20px',
                background: '#fff',
                borderBottom: '1px solid #ddd',
                display: 'flex',
                gap: '20px',
                alignItems: 'center'
            }}>
                <h2 style={{ margin: 0 }}>Delivery Zones</h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: 20,
                        height: 14,
                        background: 'rgba(52, 168, 83, 0.35)',
                        border: '2px solid #1e7e34',
                        borderRadius: 2
                    }}></div>
                    <span>Delivery Area</span>
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {fetchingBoundaries && (
                        <span style={{ color: '#666', fontStyle: 'italic' }}>
                            Loading boundaries...
                        </span>
                    )}
                    <span>
                        Total Zones: {zones.length} | Mapped: {mappedCount}
                    </span>
                </div>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

                {/* Postal codes list overlay */}
                <div style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    background: 'rgba(255,255,255,0.95)',
                    borderRadius: 8,
                    padding: '10px 15px',
                    maxHeight: 'calc(100% - 20px)',
                    overflowY: 'auto',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                    minWidth: 200,
                    maxWidth: 280
                }}>
                    <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: 8 }}>
                        Active Postal Codes ({zones.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {zones.map(zone => (
                            <div
                                key={zone.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '4px 6px',
                                    borderBottom: '1px solid #f0f0f0',
                                    fontSize: 13,
                                    borderRadius: 4,
                                    background: hoveredZone === zone.postal_code
                                        ? 'rgba(52, 168, 83, 0.15)'
                                        : 'transparent',
                                    transition: 'background 0.15s'
                                }}
                            >
                                <strong>{zone.postal_code}</strong>
                                <span style={{ color: '#666' }}>{zone.city || '-'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
