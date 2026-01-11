import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { OptimizedStop, RouteSegment } from '@/lib/types';

type Props = {
  depot: { lat: number; lng: number };
  stops: OptimizedStop[];
  polyline: string;
  routeSegments?: RouteSegment[];
};

export default function MapView({ depot, stops, polyline, routeSegments }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
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
      zoom: 12
    });

    mapInstanceRef.current = map;

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update markers and route when data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const updateMap = () => {
      // Clear existing markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // Add depot marker
      const depotMarker = new maplibregl.Marker({ color: '#1a73e8' })
        .setLngLat([depot.lng, depot.lat])
        .setPopup(new maplibregl.Popup().setText('Depot'))
        .addTo(map);
      markersRef.current.push(depotMarker);

      // Add stop markers
      stops.forEach((s, i) => {
        if (s.lat && s.lng) {
          const stopMarker = new maplibregl.Marker({ color: s.isDepotReturn ? '#FFA500' : '#34a853' })
            .setLngLat([s.lng, s.lat])
            .setPopup(new maplibregl.Popup().setText(`${i + 1}. ${s.name}`))
            .addTo(map);
          markersRef.current.push(stopMarker);
        }
      });

      // Remove existing route layers
      const existingLayers = ['route-line-outline', 'route-line'];
      const existingSources = ['route'];
      for (let i = 0; i < 10; i++) {
        existingLayers.push(`route-segment-${i}-outline`, `route-segment-${i}`);
        existingSources.push(`route-segment-${i}`);
      }
      existingLayers.forEach(layerId => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
      });
      existingSources.forEach(sourceId => {
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });

      // Identify route segments: each leg from depot to depot return
      // Each segment: depot → delivery stops → depot return
      const segments: Array<{ startIdx: number; endIdx: number; color: string }> = [];
      const colors = ['#1a73e8', '#ea4335', '#fbbc04', '#34a853', '#9c27b0', '#ff9800', '#00bcd4', '#e91e63'];
      let segmentStart = 0;
      let colorIndex = 0;

      // Build segments: each segment ends at a depot return
      for (let i = 0; i < stops.length; i++) {
        if (stops[i].isDepotReturn) {
          // This depot return marks the end of the current segment
          segments.push({
            startIdx: segmentStart,
            endIdx: i, // Include the depot return stop
            color: colors[colorIndex % colors.length]
          });
          colorIndex++;
          segmentStart = i + 1; // Next segment starts after this depot return
        }
      }
      
      // If there's a final segment (stops after last depot return, ending with final return)
      // This should already be handled above if the final stop is a depot return
      // But if somehow there are stops without a final return, add them
      if (segmentStart < stops.length) {
        // Check if the last stop is a depot return (should be)
        const lastStop = stops[stops.length - 1];
        if (!lastStop.isDepotReturn) {
          // This shouldn't happen with our current implementation, but handle it
          segments.push({
            startIdx: segmentStart,
            endIdx: stops.length - 1,
            color: colors[colorIndex % colors.length]
          });
        }
      }

      // If no segments found (no depot returns), create one segment for the whole route
      if (segments.length === 0 && stops.length > 0) {
        segments.push({
          startIdx: 0,
          endIdx: stops.length - 1,
          color: colors[0]
        });
      }

      // Draw each segment
      let allBounds: maplibregl.LngLatBounds | null = null;
      
      segments.forEach((segment, segIdx) => {
        let segmentCoords: number[][] = [];
        
        // Try to use routeSegments if available (preferred)
        if (routeSegments && routeSegments[segIdx]) {
          const routeSegment = routeSegments[segIdx];
          if (routeSegment.polyline && routeSegment.polyline.trim()) {
            try {
              segmentCoords = decodePolyline(routeSegment.polyline);
              if (segmentCoords.length > 0) {
                const firstCoord = segmentCoords[0];
                const distanceFromDepot = Math.abs(firstCoord[0] - depot.lng) + Math.abs(firstCoord[1] - depot.lat);
                if (distanceFromDepot > 1) {
                  segmentCoords = decodePolylineRaw(routeSegment.polyline);
                }
              }
            } catch (err) {
              console.error('Failed to decode segment polyline:', err);
              segmentCoords = [];
            }
          }
        }
        
        // Fallback: use straight lines between stops
        if (segmentCoords.length < 2) {
          segmentCoords = [[depot.lng, depot.lat]];
          for (let i = segment.startIdx; i <= segment.endIdx; i++) {
            const stop = stops[i];
            if (stop.lat && stop.lng) {
              segmentCoords.push([stop.lng, stop.lat]);
            }
          }
          if (!stops[segment.endIdx]?.isDepotReturn) {
            segmentCoords.push([depot.lng, depot.lat]);
          }
        }

        if (segmentCoords.length < 2) return; // Need at least 2 points for a line

        // Add segment source and layers
        const sourceId = `route-segment-${segIdx}`;
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: segmentCoords
            }
          }
        });

        // Add outline
        map.addLayer({
          id: `route-segment-${segIdx}-outline`,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 6,
            'line-opacity': 0.9
          }
        });

        // Add main segment line with unique color
        map.addLayer({
          id: `route-segment-${segIdx}`,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': segment.color,
            'line-width': 4,
            'line-opacity': 1
          }
        });

        // Update bounds
        segmentCoords.forEach(coord => {
          if (!allBounds) {
            allBounds = new maplibregl.LngLatBounds(coord as [number, number], coord as [number, number]);
          } else {
            allBounds.extend(coord as [number, number]);
          }
        });
      });

      // Fit bounds
      if (allBounds) {
        map.fitBounds(allBounds, { padding: 48 });
      } else {
        // Fallback: fit bounds to markers
        const bounds = new maplibregl.LngLatBounds([depot.lng, depot.lat], [depot.lng, depot.lat]);
        stops.forEach(s => {
          if (s.lat && s.lng) bounds.extend([s.lng, s.lat]);
        });
        map.fitBounds(bounds, { padding: 48 });
      }
    };

    if (map.loaded()) {
      updateMap();
    } else {
      map.once('load', updateMap);
    }
  }, [depot.lat, depot.lng, polyline, routeSegments, stops]);

  return <div style={{ width: '100%', height: '100%' }} ref={mapRef} />;
}

// Decode polyline format (same algorithm as Google/OSRM)
// OSRM uses the same polyline encoding as Google Maps
function decodePolyline(encoded: string): number[][] {
  const poly: number[][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    // Standard polyline encoding: coordinates are stored as integers, divide by 1e5
    poly.push([lng / 1e5, lat / 1e5] as [number, number]);
  }
  return poly;
}

// Alternative decoder without division (in case OSRM returns different format)
function decodePolylineRaw(encoded: string): number[][] {
  const poly: number[][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    poly.push([lng, lat] as [number, number]);
  }
  return poly;
}
