import React, { useEffect, useState, useCallback, useRef } from 'react';
import { fetchAllDeliveryDates, fetchDeliveries, geocodeStops, optimize, refineWithTraffic, optimizeByTimeSlots, saveGeocoding, saveRoute, loadRoute, listCustomRoutes, saveCustomRouteApi, loadCustomRouteApi } from '@/lib/api';
import type { Stop, OptimizeRequest, OptimizeResponse, OptimizedStop } from '@/lib/types';
import type { CustomRouteSummary } from '@/lib/services/persistence.supabase';
import HistoryMapView from '@/components/HistoryMapView';
import StopsTable from '@/components/StopsTable';
import { TEST_ACCOUNTS } from '@/lib/constants';
import { ParkingSpot } from '@/lib/services/parking-spots.supabase';
import { fetchAllParkingSpots } from '@/lib/services/parking-spots.supabase';

const DEPOT = { lat: 48.910790500083145, lng: 2.3593634359991196 };

const COLORS = {
  accent: '#ea580c',
  accentLight: '#fff7ed',
  success: '#16a34a',
  successLight: '#f0fdf4',
  blue: '#1d4ed8',
  blueLight: '#eff6ff',
  purple: '#7c3aed',
  purpleLight: '#f5f3ff',
  red: '#dc2626',
  gray: '#6b7280',
  border: '#e5e7eb',
  bg: '#f9fafb',
};

// ─── Draggable stop row ──────────────────────────────────────────────────────
function DraggableStopRow({
  stop,
  index,
  groupId,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  stop: OptimizedStop;
  index: number;
  groupId: string;
  onDragStart: (groupId: string, index: number) => void;
  onDragOver: (e: React.DragEvent, groupId: string, index: number) => void;
  onDrop: (groupId: string, index: number) => void;
  isDragging: boolean;
}) {
  return (
    <tr
      draggable
      onDragStart={() => onDragStart(groupId, index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, groupId, index); }}
      onDrop={() => onDrop(groupId, index)}
      style={{
        cursor: 'grab',
        backgroundColor: isDragging ? '#fef3c7' : 'transparent',
        opacity: isDragging ? 0.5 : 1,
        transition: 'background 0.15s, opacity 0.15s',
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <td style={{ padding: '6px 4px', color: '#9ca3af', fontSize: '1.1em', userSelect: 'none' }}>⠿</td>
      <td style={{ padding: '6px 4px', fontWeight: 600, color: COLORS.gray, fontSize: '0.85em' }}>{index + 1}</td>
      <td style={{ padding: '6px 4px', fontWeight: 500, fontSize: '0.9em' }}>{stop.name}</td>
      <td style={{ padding: '6px 4px', color: COLORS.gray, fontSize: '0.85em', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stop.address}</td>
      <td style={{ padding: '6px 4px', fontSize: '0.8em', color: COLORS.gray, whiteSpace: 'nowrap' }}>
        {stop.etaIso ? new Date(stop.etaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
      </td>
      <td style={{ padding: '6px 4px', fontSize: '0.8em', color: COLORS.gray, whiteSpace: 'nowrap' }}>
        {new Date(stop.timeWindowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
        {new Date(stop.timeWindowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </td>
    </tr>
  );
}

export default function History() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [geocodedStops, setGeocodedStops] = useState<Stop[]>([]);
  const [geocodeWarnings, setGeocodeWarnings] = useState<Array<{ stopId: string; address: string; fallbackQuery: string }>>([]);
  const [optimizedRoute, setOptimizedRoute] = useState<OptimizeResponse | null>(null);
  const [googleRoute, setGoogleRoute] = useState<OptimizeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizingGoogle, setOptimizingGoogle] = useState(false);
  const [optimizingBatches, setOptimizingBatches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excludeTestAccounts, setExcludeTestAccounts] = useState(true);

  // Parking State
  const [showParking, setShowParking] = useState(false);
  const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
  const [parkingLoading, setParkingLoading] = useState(false);

  // Custom route state
  const [savedRoutes, setSavedRoutes] = useState<CustomRouteSummary[]>([]);
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false);
  const [viewingCustomRoute, setViewingCustomRoute] = useState<{ name: string; route: OptimizeResponse; depot: { lat: number; lng: number } } | null>(null);
  const [saveRouteName, setSaveRouteName] = useState('');
  const [saveRouteDescription, setSaveRouteDescription] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savingCustomRoute, setSavingCustomRoute] = useState(false);
  const [loadingCustomRoute, setLoadingCustomRoute] = useState<string | null>(null);

  // Drag-and-drop state
  const [dragging, setDragging] = useState<{ groupId: string; index: number } | null>(null);
  const [isModified, setIsModified] = useState(false);
  // We keep a local "working" copy of the route for reordering
  const [workingRoute, setWorkingRoute] = useState<OptimizeResponse | null>(null);

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Modify drop state
  const [modifyingStop, setModifyingStop] = useState<Stop | null>(null);
  const [modifyDate, setModifyDate] = useState('');
  const [modifyWindowStart, setModifyWindowStart] = useState('');
  const [modifyWindowEnd, setModifyWindowEnd] = useState('');
  const [modifyNotes, setModifyNotes] = useState('');
  const [modifySaving, setModifySaving] = useState(false);
  const [modifyError, setModifyError] = useState<string | null>(null);
  const [modifiedStopIds, setModifiedStopIds] = useState<Set<string>>(new Set());

  const openModifyModal = (stop: Stop) => {
    setModifyingStop(stop);
    setModifyDate(selectedDate || '');
    // Extract HH:MM from ISO strings
    const startTime = new Date(stop.timeWindowStart);
    const endTime = new Date(stop.timeWindowEnd);
    setModifyWindowStart(`${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`);
    setModifyWindowEnd(`${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`);
    setModifyNotes('');
    setModifyError(null);
  };

  const handleModifyDrop = async () => {
    if (!modifyingStop || !selectedDate) return;
    setModifySaving(true);
    setModifyError(null);
    try {
      const payload = {
        order_id: modifyingStop.id,
        original_delivery_date: selectedDate,
        new_delivery_date: modifyDate !== selectedDate ? modifyDate : null,
        new_delivery_window_start: modifyWindowStart || null,
        new_delivery_window_end: modifyWindowEnd || null,
        notes: modifyNotes || null,
      };
      const res = await fetch('/api/deliveries/modify-drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save modification');
      }
      setModifiedStopIds(prev => new Set(prev).add(modifyingStop.id));
      setModifyingStop(null);
    } catch (err: any) {
      setModifyError(err.message || 'Error saving modification');
    } finally {
      setModifySaving(false);
    }
  };

  useEffect(() => {
    if (showParking && parkingSpots.length === 0) {
      setParkingLoading(true);
      fetchAllParkingSpots()
        .then(spots => setParkingSpots(spots))
        .catch(err => console.error('Failed to fetch parking spots:', err))
        .finally(() => setParkingLoading(false));
    }
  }, [showParking, parkingSpots.length]);

  useEffect(() => {
    loadDates();
  }, []);

  // Sync workingRoute with optimizedRoute when it changes (but not on drag reorders)
  useEffect(() => {
    setWorkingRoute(optimizedRoute);
    setIsModified(false);
  }, [optimizedRoute]);

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
    setGoogleRoute(null);
    setWorkingRoute(null);
    setIsModified(false);
    setViewingCustomRoute(null);
    setSavedRoutes([]);
    try {
      const loadedStops = await fetchDeliveries(date);
      if (loadedStops.length === 0) {
        setError(`No deliveries found for ${date}`);
        return;
      }
      setStops(loadedStops);

      const stopsWithGeocoding = loadedStops.filter(s => s.lat != null && s.lng != null);
      if (stopsWithGeocoding.length > 0) {
        setGeocodedStops(stopsWithGeocoding);
      }

      // Load persisted default route
      try {
        const persistedRoute = await loadRoute(date);
        if (persistedRoute) {
          setOptimizedRoute(persistedRoute.route);
        }
      } catch (err: any) {
        console.log('No persisted route found for', date);
      }

      // Load saved custom routes list
      loadSavedRoutes(date);
    } catch (err: any) {
      setError(err.message || 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  };

  const loadSavedRoutes = async (date: string) => {
    setLoadingSavedRoutes(true);
    try {
      const routes = await listCustomRoutes(date);
      setSavedRoutes(routes);
    } catch (err: any) {
      console.warn('Failed to load saved routes:', err.message);
    } finally {
      setLoadingSavedRoutes(false);
    }
  };

  const handleGeocode = async () => {
    const filteredStops = stops.filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email));
    if (filteredStops.length === 0) return;
    setGeocoding(true);
    setError(null);
    setGeocodeWarnings([]);
    try {
      const result = await geocodeStops(filteredStops);
      setGeocodedStops(result.stops);
      setGeocodeWarnings(result.warnings || []);
      try {
        await saveGeocoding(result.stops, result.warnings);
      } catch (err: any) {
        console.warn('Failed to persist geocoding:', err);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to geocode addresses');
    } finally {
      setGeocoding(false);
    }
  };

  const handleOptimize = async () => {
    if (geocodedStops.length === 0) { setError('Please geocode addresses first'); return; }
    if (!selectedDate) { setError('No delivery date selected'); return; }
    setOptimizing(true);
    setError(null);
    try {
      const deliveryDate = new Date(selectedDate);
      deliveryDate.setHours(0, 0, 0, 0);
      const normalizedStops = geocodedStops.map(stop => {
        const windowStart = new Date(stop.timeWindowStart);
        const windowEnd = new Date(stop.timeWindowEnd);
        const normalizedStart = new Date(deliveryDate);
        normalizedStart.setHours(windowStart.getHours(), windowStart.getMinutes(), 0, 0);
        const normalizedEnd = new Date(deliveryDate);
        normalizedEnd.setHours(windowEnd.getHours(), windowEnd.getMinutes(), 0, 0);
        return { ...stop, timeWindowStart: normalizedStart.toISOString(), timeWindowEnd: normalizedEnd.toISOString() };
      });
      const vehicleStartDate = new Date(deliveryDate);
      vehicleStartDate.setHours(8, 0, 0, 0);
      const req: OptimizeRequest = {
        vehicleStartTimeIso: vehicleStartDate.toISOString(),
        depot: DEPOT,
        stops: normalizedStops.filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email))
      };
      const result = await optimize(req);
      setOptimizedRoute(result);
      if (selectedDate) {
        try { await saveRoute(selectedDate, result, DEPOT); } catch (err: any) { console.warn('Failed to persist route:', err); }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to optimize route');
    } finally {
      setOptimizing(false);
    }
  };

  const handleRefineWithTraffic = async () => {
    if (!optimizedRoute) { setError('Please optimize route with ORS first'); return; }
    if (!selectedDate) { setError('No delivery date selected'); return; }
    setOptimizingGoogle(true);
    setError(null);
    try {
      const req: OptimizeRequest & { routes?: any[] } = {
        vehicleStartTimeIso: optimizedRoute.driverStartTimeIso || new Date().toISOString(),
        depot: DEPOT,
        stops: optimizedRoute.orderedStops,
        routes: optimizedRoute.routes
      };
      const result = await refineWithTraffic(req);
      setGoogleRoute(result);
    } catch (err: any) {
      setError(err.message || 'Failed to refine route with Google Maps traffic');
    } finally {
      setOptimizingGoogle(false);
    }
  };

  const handleOptimizeByTimeSlots = async () => {
    if (geocodedStops.length === 0) { setError('Please geocode addresses first'); return; }
    if (!selectedDate) { setError('No delivery date selected'); return; }
    setOptimizingBatches(true);
    setError(null);
    try {
      const deliveryDate = new Date(selectedDate);
      deliveryDate.setHours(0, 0, 0, 0);
      const normalizedStops = geocodedStops.map(stop => {
        const windowStart = new Date(stop.timeWindowStart);
        const windowEnd = new Date(stop.timeWindowEnd);
        const normalizedStart = new Date(deliveryDate);
        normalizedStart.setHours(windowStart.getHours(), windowStart.getMinutes(), 0, 0);
        const normalizedEnd = new Date(deliveryDate);
        normalizedEnd.setHours(windowEnd.getHours(), windowEnd.getMinutes(), 0, 0);
        return { ...stop, timeWindowStart: normalizedStart.toISOString(), timeWindowEnd: normalizedEnd.toISOString() };
      });
      const vehicleStartDate = new Date(deliveryDate);
      vehicleStartDate.setHours(8, 0, 0, 0);
      const req: OptimizeRequest = {
        vehicleStartTimeIso: vehicleStartDate.toISOString(),
        depot: DEPOT,
        stops: normalizedStops.filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email))
      };
      const result = await optimizeByTimeSlots(req);
      setOptimizedRoute(result);
      setGoogleRoute(null);
    } catch (err: any) {
      setError(err.message || 'Failed to optimize by time slots');
    } finally {
      setOptimizingBatches(false);
    }
  };

  // ──────────────── Drag-and-Drop Handlers ────────────────────────────────────
  const handleDragStart = useCallback((groupId: string, index: number) => {
    setDragging({ groupId, index });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, groupId: string, index: number) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((groupId: string, dropIndex: number) => {
    if (!dragging || !workingRoute) return;
    if (dragging.groupId !== groupId) { setDragging(null); return; }

    const dragIndex = dragging.index;
    if (dragIndex === dropIndex) { setDragging(null); return; }

    setWorkingRoute(prev => {
      if (!prev) return prev;

      // Multi-route case
      if ((prev.routes?.length || 0) > 0 && prev.routes) {
        const routeIndex = parseInt(groupId, 10);
        const newRoutes = prev.routes.map((r, ri) => {
          if (ri !== routeIndex) return r;
          const newStops = [...r.stops];
          const [moved] = newStops.splice(dragIndex, 1);
          newStops.splice(dropIndex, 0, moved);
          return { ...r, stops: newStops };
        });
        return { ...prev, routes: newRoutes };
      }

      // Single route case
      const newStops = [...prev.orderedStops];
      const [moved] = newStops.splice(dragIndex, 1);
      newStops.splice(dropIndex, 0, moved);
      return { ...prev, orderedStops: newStops };
    });

    setIsModified(true);
    setDragging(null);
  }, [dragging, workingRoute]);

  // ──────────────── Save Custom Route ─────────────────────────────────────────
  const handleSaveCustomRoute = async () => {
    if (!workingRoute || !selectedDate) return;
    if (!saveRouteName.trim()) return;
    setSavingCustomRoute(true);
    try {
      await saveCustomRouteApi(selectedDate, saveRouteName.trim(), saveRouteDescription.trim() || undefined, workingRoute, DEPOT);
      setShowSaveDialog(false);
      setSaveRouteName('');
      setSaveRouteDescription('');
      // Refresh saved routes list
      await loadSavedRoutes(selectedDate);
    } catch (err: any) {
      setError(err.message || 'Failed to save custom route');
    } finally {
      setSavingCustomRoute(false);
    }
  };

  // ──────────────── Load a Saved Custom Route (read-only) ──────────────────────
  const handleLoadCustomRoute = async (id: string) => {
    if (!selectedDate) return;
    setLoadingCustomRoute(id);
    try {
      const result = await loadCustomRouteApi(selectedDate, id);
      if (result) {
        setViewingCustomRoute(result);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load custom route');
    } finally {
      setLoadingCustomRoute(null);
    }
  };

  const activeRouteForMap = viewingCustomRoute ? viewingCustomRoute.route : (workingRoute || optimizedRoute);

  // ──────────────── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: COLORS.bg }}>
      {viewMode === 'list' && (
        <>
          {/* Header row */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}`, backgroundColor: 'white', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>Route Coordination</h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.85rem', cursor: 'pointer', color: '#374151' }}>
                  <input type="checkbox" checked={excludeTestAccounts} onChange={e => setExcludeTestAccounts(e.target.checked)} />
                  Exclude Test Accounts
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.85rem', cursor: 'pointer', color: '#374151' }}>
                  <input type="checkbox" checked={showParking} onChange={e => setShowParking(e.target.checked)} />
                  {parkingLoading ? 'Loading...' : 'Show Parking'}
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* LEFT: Date picker */}
            <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${COLORS.border}`, backgroundColor: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Delivery Dates</div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {dates.length === 0 ? (
                  <div style={{ padding: 12, fontSize: '0.85rem', color: '#9ca3af' }}>No delivery dates found.</div>
                ) : (
                  dates.map(date => {
                    const d = new Date(date);
                    const isSelected = selectedDate === date;
                    return (
                      <button
                        key={date}
                        onClick={() => loadDeliveries(date)}
                        disabled={loading}
                        style={{
                          display: 'block',
                          width: '100%',
                          marginBottom: 4,
                          padding: '10px 10px',
                          textAlign: 'left',
                          border: `1.5px solid ${isSelected ? COLORS.accent : COLORS.border}`,
                          borderRadius: 8,
                          backgroundColor: isSelected ? COLORS.accentLight : 'transparent',
                          cursor: loading ? 'wait' : 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: isSelected ? COLORS.accent : '#111827' }}>
                          {d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{date}</div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT: Main content */}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 16 }}>
              {loading && <div style={{ padding: 16, color: '#6b7280' }}>Loading deliveries…</div>}
              {error && <div style={{ color: COLORS.red, padding: '10px 16px', backgroundColor: '#fef2f2', borderRadius: 8, marginBottom: 12, fontSize: '0.9rem' }}>{error}</div>}

              {/* Viewing a saved custom route — banner */}
              {viewingCustomRoute && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px', backgroundColor: COLORS.purpleLight, borderRadius: 8,
                  border: `1.5px solid #c4b5fd`, marginBottom: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '1.1em' }}>🔍</span>
                    <span style={{ fontWeight: 600, color: COLORS.purple, fontSize: '0.9rem' }}>
                      Viewing saved route: <em>{viewingCustomRoute.name}</em>
                    </span>
                  </div>
                  <button
                    onClick={() => setViewingCustomRoute(null)}
                    style={{ padding: '4px 12px', backgroundColor: COLORS.purple, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    ← Back to working route
                  </button>
                </div>
              )}

              {stops.length > 0 && selectedDate && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* Info + Action bar */}
                  <div style={{ padding: 14, backgroundColor: 'white', border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                          {new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </h3>
                        <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 4 }}>
                          {stops.length} stops
                          {geocodedStops.length > 0 && <span style={{ color: COLORS.success, marginLeft: 8 }}>· {geocodedStops.length} geocoded</span>}
                          {workingRoute && (
                            <span style={{ color: COLORS.blue, marginLeft: 8 }}>
                              · {Math.round(workingRoute.totalDistanceMeters / 1000)} km · {Math.round(workingRoute.totalDurationSeconds / 60)} min
                            </span>
                          )}
                          {isModified && (
                            <span style={{
                              marginLeft: 8, fontSize: '0.75rem', fontWeight: 700,
                              backgroundColor: '#fef3c7', color: '#92400e',
                              padding: '1px 8px', borderRadius: 99, border: '1px solid #fcd34d'
                            }}>🔀 Modified</span>
                          )}
                        </div>
                      </div>
                      {(geocodedStops.length > 0 || workingRoute) && (
                        <button
                          onClick={() => setViewMode('map')}
                          style={{ padding: '6px 14px', backgroundColor: COLORS.gray, color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, flexShrink: 0 }}
                        >
                          🗺 Full Map
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <ActionButton onClick={handleGeocode} disabled={geocoding || stops.filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email)).length === 0} loading={geocoding} loadingLabel="Geocoding…" label="📍 Geocode" color="#1d4ed8" />
                      <ActionButton onClick={handleOptimize} disabled={optimizing || geocodedStops.length === 0} loading={optimizing} loadingLabel="Optimizing…" label="✨ Optimize Route" color={COLORS.success} />
                      <ActionButton onClick={handleRefineWithTraffic} disabled={optimizingGoogle || !optimizedRoute} loading={optimizingGoogle} loadingLabel="Refining…" label="🚦 Refine (Google)" color={COLORS.red} />
                      <ActionButton onClick={handleOptimizeByTimeSlots} disabled={optimizingBatches || geocodedStops.length === 0} loading={optimizingBatches} loadingLabel="Optimizing…" label="🕐 Optimize by Slots" color="#0891b2" />
                    </div>

                    {geocodeWarnings.length > 0 && (
                      <div style={{ marginTop: 10, padding: 8, backgroundColor: '#fefce8', borderRadius: 6, fontSize: '0.8em', border: '1px solid #fde68a' }}>
                        <strong>Geocoding warnings:</strong>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                          {geocodeWarnings.map((w, i) => <li key={i}>{w.address} → {w.fallbackQuery}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Save Route button & dialog */}
                  {workingRoute && !viewingCustomRoute && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      {!showSaveDialog ? (
                        <button
                          onClick={() => setShowSaveDialog(true)}
                          style={{
                            padding: '8px 18px', backgroundColor: COLORS.purple, color: 'white',
                            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          💾 Save Route
                          {isModified && <span style={{ fontSize: '0.75rem', backgroundColor: '#fde68a', color: '#92400e', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>modified</span>}
                        </button>
                      ) : (
                        <div style={{ padding: 14, backgroundColor: COLORS.purpleLight, borderRadius: 10, border: `1.5px solid #c4b5fd`, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: COLORS.purple, marginBottom: 8 }}>Save this route</div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Route name *</label>
                              <input
                                autoFocus
                                value={saveRouteName}
                                onChange={e => setSaveRouteName(e.target.value)}
                                placeholder="e.g. Route matinée"
                                style={{ width: '100%', padding: '7px 10px', border: `1px solid #c4b5fd`, borderRadius: 6, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveCustomRoute(); if (e.key === 'Escape') setShowSaveDialog(false); }}
                              />
                            </div>
                            <div style={{ flex: 1.5, minWidth: 200 }}>
                              <label style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 3 }}>Description (optional)</label>
                              <input
                                value={saveRouteDescription}
                                onChange={e => setSaveRouteDescription(e.target.value)}
                                placeholder="Notes about this route…"
                                style={{ width: '100%', padding: '7px 10px', border: `1px solid #c4b5fd`, borderRadius: 6, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={handleSaveCustomRoute}
                                disabled={savingCustomRoute || !saveRouteName.trim()}
                                style={{ padding: '7px 16px', backgroundColor: savingCustomRoute || !saveRouteName.trim() ? '#a78bfa' : COLORS.purple, color: 'white', border: 'none', borderRadius: 6, cursor: savingCustomRoute || !saveRouteName.trim() ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                              >
                                {savingCustomRoute ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setShowSaveDialog(false); setSaveRouteName(''); setSaveRouteDescription(''); }}
                                style={{ padding: '7px 14px', backgroundColor: 'white', color: '#6b7280', border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: 'pointer', fontSize: '0.9rem' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mini map preview */}
                  {(geocodedStops.length > 0 || workingRoute) && (
                    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', height: 260, flexShrink: 0 }}>
                      <HistoryMapView
                        depot={DEPOT}
                        stops={(activeRouteForMap ? activeRouteForMap.orderedStops : geocodedStops).filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email))}
                        polyline={activeRouteForMap?.overviewPolyline}
                        routeSegments={activeRouteForMap?.routeSegments}
                        showParking={showParking}
                        parkingSpots={parkingSpots}
                      />
                    </div>
                  )}

                  {/* Working route / Viewing route table */}
                  {(workingRoute || viewingCustomRoute) && (() => {
                    const displayRoute = viewingCustomRoute ? viewingCustomRoute.route : workingRoute!;
                    return (
                      <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, backgroundColor: 'white', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: viewingCustomRoute ? COLORS.purpleLight : 'white' }}>
                          <h4 style={{ margin: 0, fontSize: '0.95rem', color: viewingCustomRoute ? COLORS.purple : '#111827' }}>
                            {viewingCustomRoute ? `📌 ${viewingCustomRoute.name}` : '✨ Optimized Route'}
                            {!viewingCustomRoute && isModified && <span style={{ fontSize: '0.75rem', marginLeft: 8, color: '#92400e', backgroundColor: '#fef3c7', padding: '1px 7px', borderRadius: 99, border: '1px solid #fcd34d' }}>Modified – not saved</span>}
                          </h4>
                          <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                            {Math.round(displayRoute.totalDistanceMeters / 1000)} km · {Math.round(displayRoute.totalDurationSeconds / 60)} min
                            {(displayRoute.routes?.length || 0) > 0 && (
                              <span style={{ marginLeft: 8, fontWeight: 700, color: COLORS.success }}>
                                €{(displayRoute.routes || []).reduce((s, r) => s + r.estimatedCost, 0).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Route groups */}
                        {(displayRoute.routes?.length || 0) > 0 ? (
                          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {displayRoute.routes!.map((route, idx) => {
                              const trafficRoute = googleRoute?.routes?.[idx];
                              const groupId = String(idx);
                              return (
                                <div key={route.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: `1px solid ${COLORS.border}`, backgroundColor: COLORS.bg }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Route {idx + 1}</span>
                                    <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                                      <span style={{ fontWeight: 700, color: COLORS.success }}>€{route.estimatedCost.toFixed(2)}</span>
                                      <span style={{ color: '#6b7280', marginLeft: 8 }}>{Math.round(route.totalDurationSeconds / 60)} min</span>
                                      {trafficRoute && Math.abs(trafficRoute.totalDurationSeconds - route.totalDurationSeconds) > 30 && (
                                        <span style={{ color: COLORS.red, marginLeft: 6 }}>({Math.round(trafficRoute.totalDurationSeconds / 60)} min w/ traffic)</span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ overflowX: 'auto' }}>
                                    {viewingCustomRoute ? (
                                      <StopsTable stops={route.stops} trafficStops={trafficRoute?.stops} />
                                    ) : (
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                          <tr style={{ backgroundColor: COLORS.bg }}>
                                            <th style={{ padding: '6px 4px', color: '#9ca3af', width: 20 }}></th>
                                            <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280', width: 30 }}>#</th>
                                            <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280' }}>Name</th>
                                            <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280' }}>Address</th>
                                            <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280' }}>ETA</th>
                                            <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280' }}>Window</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {route.stops.map((stop, si) => (
                                            <DraggableStopRow
                                              key={stop.id}
                                              stop={stop}
                                              index={si}
                                              groupId={groupId}
                                              onDragStart={handleDragStart}
                                              onDragOver={handleDragOver}
                                              onDrop={handleDrop}
                                              isDragging={dragging?.groupId === groupId && dragging?.index === si}
                                            />
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div>
                            {viewingCustomRoute ? (
                              <div style={{ padding: 12 }}>
                                <StopsTable stops={displayRoute.orderedStops} trafficStops={googleRoute?.orderedStops} />
                              </div>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                  <tr style={{ backgroundColor: COLORS.bg }}>
                                    <th style={{ padding: '6px 4px', color: '#9ca3af', width: 20 }}></th>
                                    <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280', width: 30 }}>#</th>
                                    <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280' }}>Name</th>
                                    <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280' }}>Address</th>
                                    <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280' }}>ETA</th>
                                    <th style={{ padding: '6px 4px', textAlign: 'left', color: '#6b7280' }}>Window</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {displayRoute.orderedStops.filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email)).map((stop, si) => (
                                    <DraggableStopRow
                                      key={stop.id}
                                      stop={stop}
                                      index={si}
                                      groupId="single"
                                      onDragStart={handleDragStart}
                                      onDragOver={handleDragOver}
                                      onDrop={handleDrop}
                                      isDragging={dragging?.groupId === 'single' && dragging?.index === si}
                                    />
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Saved routes panel */}
                  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, backgroundColor: 'white', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`, backgroundColor: COLORS.bg }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#374151' }}>
                        💾 Saved Custom Routes
                        {savedRoutes.length > 0 && <span style={{ marginLeft: 6, fontSize: '0.8rem', backgroundColor: COLORS.purple, color: 'white', padding: '1px 7px', borderRadius: 99 }}>{savedRoutes.length}</span>}
                      </h4>
                    </div>
                    <div style={{ padding: 12 }}>
                      {loadingSavedRoutes ? (
                        <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: 4 }}>Loading…</div>
                      ) : savedRoutes.length === 0 ? (
                        <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: 4 }}>No saved routes for this date yet. Use "Save Route" above to save a named variant.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {savedRoutes.map(sr => (
                            <div
                              key={sr.id}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 12px', border: `1.5px solid ${viewingCustomRoute?.name === sr.name ? '#c4b5fd' : COLORS.border}`,
                                borderRadius: 8, backgroundColor: viewingCustomRoute?.name === sr.name ? COLORS.purpleLight : 'white',
                                transition: 'all 0.15s',
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>{sr.name}</div>
                                {sr.description && <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>{sr.description}</div>}
                                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 3 }}>
                                  {Math.round(sr.total_distance_meters / 1000)} km · {Math.round(sr.total_duration_seconds / 60)} min ·{' '}
                                  {new Date(sr.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              <button
                                onClick={() => handleLoadCustomRoute(sr.id)}
                                disabled={loadingCustomRoute === sr.id}
                                style={{
                                  padding: '6px 14px', backgroundColor: loadingCustomRoute === sr.id ? '#a78bfa' : COLORS.purple,
                                  color: 'white', border: 'none', borderRadius: 6,
                                  cursor: loadingCustomRoute === sr.id ? 'not-allowed' : 'pointer',
                                  fontWeight: 600, fontSize: '0.85rem', flexShrink: 0, marginLeft: 12
                                }}
                              >
                                {loadingCustomRoute === sr.id ? 'Loading…' : '🔍 Inspect'}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Raw delivery locations table */}
                  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, backgroundColor: 'white', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: `1px solid ${COLORS.border}`, backgroundColor: COLORS.bg }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#374151' }}>📋 All Delivery Stops</h4>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: COLORS.bg }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', borderBottom: `1px solid ${COLORS.border}` }}>#</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', borderBottom: `1px solid ${COLORS.border}` }}>Name</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', borderBottom: `1px solid ${COLORS.border}` }}>Address</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', borderBottom: `1px solid ${COLORS.border}` }}>Time Window</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', borderBottom: `1px solid ${COLORS.border}` }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stops.filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email)).map((s, i) => (
                            <tr key={s.id} style={{ borderBottom: `1px solid ${COLORS.border}`, backgroundColor: modifiedStopIds.has(s.id) ? '#f0fdf4' : 'transparent' }}>
                              <td style={{ padding: '8px 12px', color: '#9ca3af' }}>{i + 1}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                                {s.name}
                                {modifiedStopIds.has(s.id) && <span style={{ marginLeft: 6, fontSize: '0.7rem', backgroundColor: COLORS.success, color: 'white', padding: '1px 6px', borderRadius: 99 }}>modified</span>}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#6b7280' }}>{s.address}</td>
                              <td style={{ padding: '8px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                {new Date(s.timeWindowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(s.timeWindowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <button
                                  onClick={() => openModifyModal(s)}
                                  style={{ padding: '4px 10px', fontSize: '0.78rem', backgroundColor: 'white', border: `1px solid ${COLORS.border}`, borderRadius: 6, cursor: 'pointer', color: '#374151', fontWeight: 500 }}
                                >
                                  ✏️ Modify
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modify Drop Modal ──────────────────────────────────────────── */}
      {modifyingStop && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700 }}>✏️ Modify Drop</h3>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 16 }}>{modifyingStop.name} · {modifyingStop.address}</div>

            {modifyError && <div style={{ color: COLORS.red, fontSize: '0.85rem', marginBottom: 12, padding: '8px 12px', backgroundColor: '#fef2f2', borderRadius: 6 }}>{modifyError}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: 4 }}>New Delivery Date</label>
                <input
                  type="date"
                  value={modifyDate}
                  onChange={e => setModifyDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
                {modifyDate === selectedDate && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 3 }}>Same as original — only time window will change</div>}
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: 4 }}>Time Window</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="time"
                    value={modifyWindowStart}
                    onChange={e => setModifyWindowStart(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: '0.9rem' }}
                  />
                  <span style={{ color: '#9ca3af' }}>–</span>
                  <input
                    type="time"
                    value={modifyWindowEnd}
                    onChange={e => setModifyWindowEnd(e.target.value)}
                    style={{ flex: 1, padding: '8px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes (optional)</label>
                <input
                  type="text"
                  value={modifyNotes}
                  onChange={e => setModifyNotes(e.target.value)}
                  placeholder="Reason for modification…"
                  style={{ width: '100%', padding: '8px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModifyingStop(null)}
                style={{ padding: '8px 16px', backgroundColor: 'white', border: `1px solid ${COLORS.border}`, borderRadius: 7, cursor: 'pointer', fontSize: '0.9rem', color: '#374151' }}
              >
                Cancel
              </button>
              <button
                onClick={handleModifyDrop}
                disabled={modifySaving}
                style={{ padding: '8px 18px', backgroundColor: modifySaving ? '#9ca3af' : COLORS.accent, color: 'white', border: 'none', borderRadius: 7, cursor: modifySaving ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: 600 }}
              >
                {modifySaving ? 'Saving…' : '💾 Save Modification'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full map view */}
      {viewMode === 'map' && (
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <HistoryMapView
              depot={DEPOT}
              stops={(activeRouteForMap ? activeRouteForMap.orderedStops : geocodedStops).filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email))}
              polyline={activeRouteForMap?.overviewPolyline}
              routeSegments={activeRouteForMap?.routeSegments}
              showParking={showParking}
              parkingSpots={parkingSpots}
            />
          </div>

          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', cursor: 'pointer', fontWeight: 500 }}
            >
              ← Back to List
            </button>
          </div>

          {selectedDate && (
            <div style={{ position: 'absolute', top: 10, left: 130, zIndex: 10, padding: '8px 16px', background: 'rgba(255,255,255,0.95)', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              <strong>{new Date(selectedDate).toLocaleDateString('fr-FR', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
              {activeRouteForMap && (
                <span style={{ marginLeft: 12, color: '#666', fontSize: '0.9em' }}>
                  {Math.round(activeRouteForMap.totalDistanceMeters / 1000)} km · {Math.round(activeRouteForMap.totalDurationSeconds / 60)} min
                </span>
              )}
              {viewingCustomRoute && (
                <span style={{ marginLeft: 10, fontSize: '0.8rem', backgroundColor: COLORS.purple, color: 'white', padding: '1px 8px', borderRadius: 99 }}>
                  {viewingCustomRoute.name}
                </span>
              )}
            </div>
          )}

          <div style={{ position: 'absolute', top: 10, right: 10, bottom: 10, width: 450, zIndex: 10, background: 'rgba(255,255,255,0.95)', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: '1em' }}>
                {viewingCustomRoute ? `📌 ${viewingCustomRoute.name}` : (activeRouteForMap ? 'Optimized Itinerary' : 'Stops')}
              </h3>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
              {activeRouteForMap ? (
                <>
                  {(activeRouteForMap.routes?.length || 0) > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {activeRouteForMap.routes!.map((route, idx) => (
                        <div key={route.id} style={{ border: '1px solid #ddd', borderRadius: 6, padding: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid #eee', paddingBottom: 4 }}>
                            <h4 style={{ margin: 0, fontSize: '0.95em' }}>Route {idx + 1}</h4>
                            <span style={{ fontSize: '0.9em', fontWeight: 700, color: COLORS.success }}>€{route.estimatedCost.toFixed(2)}</span>
                          </div>
                          <StopsTable stops={route.stops} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <StopsTable stops={activeRouteForMap.orderedStops} />
                  )}
                </>
              ) : (
                <div style={{ fontSize: '0.9em' }}>
                  {geocodedStops.filter(s => !excludeTestAccounts || !s.email || !TEST_ACCOUNTS.includes(s.email)).map((s, i) => (
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

// ─── Tiny helper component ───────────────────────────────────────────────────
function ActionButton({ onClick, disabled, loading, loadingLabel, label, color }: {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  loadingLabel: string;
  label: string;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 16px',
        backgroundColor: disabled ? '#9ca3af' : color,
        color: 'white',
        border: 'none',
        borderRadius: 7,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.875rem',
        fontWeight: 600,
        transition: 'background 0.15s',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {loading ? loadingLabel : label}
    </button>
  );
}
