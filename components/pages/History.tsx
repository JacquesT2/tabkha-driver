import React, { useEffect, useState } from 'react';
import { fetchAllDeliveryDates, fetchDeliveries, geocodeStops, optimize, saveGeocoding, saveRoute, loadRoute } from '@/lib/api';
import type { Stop, OptimizeRequest, OptimizeResponse } from '@/lib/types';
import HistoryMapView from '@/components/HistoryMapView';
import StopsTable from '@/components/StopsTable';

const DEPOT = { lat: 48.910790500083145, lng: 2.3593634359991196 };

export default function History() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [geocodedStops, setGeocodedStops] = useState<Stop[]>([]);
  const [geocodeWarnings, setGeocodeWarnings] = useState<Array<{ stopId: string; address: string; fallbackQuery: string }>>([]);
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDates();
  }, []);

  const loadDates = async () => {
    try {
      const allDates = await fetchAllDeliveryDates();
      setDates(allDates);
    } catch (err: any) {
      setError(err.message || 'Failed to load delivery dates');
    }
  };

  const loadDeliveries = async (date: string) => {
    setSelectedDate(date);
    setLoading(true);
    setError(null);
    setStops([]);
    setGeocodedStops([]);
    setOptimizedRoute(null);
    try {
      const loadedStops = await fetchDeliveries(date);
      if (loadedStops.length === 0) {
        setError(`No deliveries found for ${date}`);
        return;
      }
      setStops(loadedStops);

      // Check if stops already have geocoding (from persistence)
      const stopsWithGeocoding = loadedStops.filter(s => s.lat != null && s.lng != null);
      if (stopsWithGeocoding.length > 0) {
        setGeocodedStops(stopsWithGeocoding);
      }

      // Try to load persisted route
      try {
        const persistedRoute = await loadRoute(date);
        if (persistedRoute) {
          setOptimizedRoute(persistedRoute.route);
          // Update depot if different
          if (persistedRoute.depot.lat !== DEPOT.lat || persistedRoute.depot.lng !== DEPOT.lng) {
            // Note: We're using the constant DEPOT, but could update it if needed
          }
        }
      } catch (err: any) {
        // Silently fail if no route exists
        // eslint-disable-next-line no-console
        console.log('No persisted route found for', date);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  };

  const handleGeocode = async () => {
    if (stops.length === 0) return;
    setGeocoding(true);
    setError(null);
    setGeocodeWarnings([]);
    try {
      const result = await geocodeStops(stops);
      setGeocodedStops(result.stops);
      setGeocodeWarnings(result.warnings || []);

      // Persist geocoding results (excluding fallback matches)
      try {
        await saveGeocoding(result.stops, result.warnings);
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('Failed to persist geocoding:', err);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to geocode addresses');
    } finally {
      setGeocoding(false);
    }
  };

  const handleOptimize = async () => {
    if (geocodedStops.length === 0) {
      setError('Please geocode addresses first');
      return;
    }
    if (!selectedDate) {
      setError('No delivery date selected');
      return;
    }
    setOptimizing(true);
    setError(null);
    try {
      // Normalize time windows to the delivery date
      const deliveryDate = new Date(selectedDate);
      deliveryDate.setHours(0, 0, 0, 0);

      const normalizedStops = geocodedStops.map(stop => {
        const windowStart = new Date(stop.timeWindowStart);
        const windowEnd = new Date(stop.timeWindowEnd);
        const startHour = windowStart.getHours();
        const startMinute = windowStart.getMinutes();
        const endHour = windowEnd.getHours();
        const endMinute = windowEnd.getMinutes();

        const normalizedStart = new Date(deliveryDate);
        normalizedStart.setHours(startHour, startMinute, 0, 0);

        const normalizedEnd = new Date(deliveryDate);
        normalizedEnd.setHours(endHour, endMinute, 0, 0);

        return {
          ...stop,
          timeWindowStart: normalizedStart.toISOString(),
          timeWindowEnd: normalizedEnd.toISOString()
        };
      });

      // Set start time to the delivery date, early morning (8 AM)
      // The optimizer will adjust based on the earliest time window
      const vehicleStartDate = new Date(deliveryDate);
      vehicleStartDate.setHours(8, 0, 0, 0);

      const req: OptimizeRequest = {
        vehicleStartTimeIso: vehicleStartDate.toISOString(),
        depot: DEPOT,
        stops: normalizedStops
      };
      const result = await optimize(req);
      setOptimizedRoute(result);

      // Persist the optimized route
      if (selectedDate) {
        try {
          await saveRoute(selectedDate, result, DEPOT);
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.warn('Failed to persist route:', err);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to optimize route');
    } finally {
      setOptimizing(false);
    }
  };

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {viewMode === 'list' && (
        <>
          <div style={{ padding: 16, borderBottom: '1px solid #eee', flexShrink: 0 }}>
            <h2 style={{ marginTop: 0 }}>Delivery History</h2>
            {dates.length === 0 ? (
              <div>No delivery dates found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '200px', overflowY: 'auto' }}>
                {dates.map(date => {
                  const d = new Date(date);
                  const isSelected = selectedDate === date;
                  return (
                    <button
                      key={date}
                      onClick={() => loadDeliveries(date)}
                      disabled={loading}
                      style={{
                        padding: 12,
                        textAlign: 'left',
                        border: `2px solid ${isSelected ? '#1a73e8' : '#ddd'}`,
                        borderRadius: 8,
                        backgroundColor: isSelected ? '#e8f0fe' : 'white',
                        cursor: loading ? 'wait' : 'pointer'
                      }}
                    >
                      <strong>{d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
                      <div style={{ fontSize: '0.9em', color: '#666' }}>{date}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {loading && <div style={{ padding: 16 }}>Loading deliveries...</div>}
            {error && <div style={{ color: '#d93025', padding: 16 }}>{error}</div>}

            {stops.length > 0 && selectedDate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: 16, border: '1px solid #eee', borderRadius: 8 }}>
                  <h3 style={{ marginTop: 0 }}>Deliveries for {new Date(selectedDate).toLocaleDateString()}</h3>
                  <div style={{ marginBottom: 12 }}>
                    <strong>{stops.length} stops loaded</strong>
                    {geocodedStops.length > 0 && (
                      <div style={{ fontSize: '0.9em', color: '#188038', marginTop: 4 }}>
                        {geocodedStops.length} stops geocoded
                      </div>
                    )}
                    {optimizedRoute && (
                      <div style={{ fontSize: '0.9em', color: '#188038', marginTop: 4 }}>
                        Route optimized: {Math.round(optimizedRoute.totalDistanceMeters / 1000)} km, {Math.round(optimizedRoute.totalDurationSeconds / 60)} min
                      </div>
                    )}
                    <div style={{ fontSize: '0.9em', color: '#666', marginTop: 4 }}>
                      {stops.slice(0, 5).map(s => s.name).join(', ')}
                      {stops.length > 5 && ` and ${stops.length - 5} more...`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={handleGeocode}
                      disabled={geocoding || stops.length === 0}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: '#1a73e8',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: (geocoding || stops.length === 0) ? 'not-allowed' : 'pointer',
                        fontSize: '1em',
                        fontWeight: 'bold'
                      }}
                    >
                      {geocoding ? 'Geocoding...' : 'Geocode Addresses'}
                    </button>
                    <button
                      onClick={handleOptimize}
                      disabled={optimizing || geocodedStops.length === 0}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: '#34a853',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: (optimizing || geocodedStops.length === 0) ? 'not-allowed' : 'pointer',
                        fontSize: '1em',
                        fontWeight: 'bold'
                      }}
                    >
                      {optimizing ? 'Optimizing Route...' : 'Optimize Route'}
                    </button>
                    {(geocodedStops.length > 0 || optimizedRoute) && (
                      <button
                        onClick={() => setViewMode('map')}
                        style={{
                          padding: '12px 24px',
                          backgroundColor: '#5f6368',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: '1em',
                          fontWeight: 'bold'
                        }}
                      >
                        View Full Map
                      </button>
                    )}
                  </div>
                  {geocodeWarnings.length > 0 && (
                    <div style={{ marginTop: 12, padding: 8, backgroundColor: '#fff3cd', borderRadius: 4, fontSize: '0.9em' }}>
                      <strong>Geocoding warnings:</strong>
                      <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                        {geocodeWarnings.map((w, i) => (
                          <li key={i}>{w.address} → {w.fallbackQuery}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {geocoding && <div style={{ padding: 16 }}>Geocoding addresses (calling Nominatim)...</div>}
                {optimizing && <div style={{ padding: 16 }}>Optimizing route...</div>}

                {(geocodedStops.length > 0 || optimizedRoute) && (
                  <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', height: '300px', minHeight: '300px' }}>
                    <HistoryMapView
                      depot={DEPOT}
                      stops={optimizedRoute ? optimizedRoute.orderedStops : geocodedStops}
                      polyline={optimizedRoute?.overviewPolyline}
                      routeSegments={optimizedRoute?.routeSegments}
                    />
                  </div>
                )}

                {optimizedRoute && (
                  <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, overflow: 'auto' }}>
                    <h4 style={{ marginTop: 0 }}>Optimized Route</h4>
                    <div style={{ marginBottom: 12, fontSize: '0.9em', color: '#666' }}>
                      Total distance: {Math.round(optimizedRoute.totalDistanceMeters / 1000)} km
                      <br />
                      Total duration: {Math.round(optimizedRoute.totalDurationSeconds / 60)} minutes
                      {optimizedRoute.driverStartTimeIso && (
                        <>
                          <br />
                          Driver start time: {new Date(optimizedRoute.driverStartTimeIso).toLocaleString()}
                        </>
                      )}
                    </div>
                    <StopsTable stops={optimizedRoute.orderedStops} />
                  </div>
                )}

                <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                  <h4 style={{ marginTop: 0 }}>Delivery Locations</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>#</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Address</th>
                        <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Time Window</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stops.map((s, i) => (
                        <tr key={s.id}>
                          <td style={{ padding: 6 }}>{i + 1}</td>
                          <td style={{ padding: 6 }}>{s.name}</td>
                          <td style={{ padding: 6 }}>{s.address}</td>
                          <td style={{ padding: 6 }}>
                            {new Date(s.timeWindowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(s.timeWindowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {viewMode === 'map' && (
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {/* Full-page map */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <HistoryMapView
              depot={DEPOT}
              stops={optimizedRoute ? optimizedRoute.orderedStops : geocodedStops}
              polyline={optimizedRoute?.overviewPolyline}
              routeSegments={optimizedRoute?.routeSegments}
            />
          </div>

          {/* Back button overlay */}
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              style={{
                padding: '8px 16px',
                background: 'white',
                border: '1px solid #ddd',
                borderRadius: 6,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              ← Back to List
            </button>
          </div>

          {/* Date and stats overlay */}
          {selectedDate && (
            <div style={{
              position: 'absolute',
              top: 10,
              left: 130,
              zIndex: 10,
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.95)',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}>
              <strong>{new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
              {optimizedRoute && (
                <span style={{ marginLeft: 12, color: '#666', fontSize: '0.9em' }}>
                  {Math.round(optimizedRoute.totalDistanceMeters / 1000)} km · {Math.round(optimizedRoute.totalDurationSeconds / 60)} min
                </span>
              )}
            </div>
          )}

          {/* Itinerary sidebar overlay */}
          <div style={{
            position: 'absolute',
            top: 10,
            right: 10,
            bottom: 10,
            width: 320,
            zIndex: 10,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: '1em' }}>
                {optimizedRoute ? 'Optimized Itinerary' : 'Stops'}
              </h3>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
              {optimizedRoute ? (
                <StopsTable stops={optimizedRoute.orderedStops} />
              ) : (
                <div style={{ fontSize: '0.9em' }}>
                  {geocodedStops.map((s, i) => (
                    <div key={s.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <strong>{i + 1}. {s.name}</strong>
                      <div style={{ color: '#666', fontSize: '0.85em' }}>{s.address}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

