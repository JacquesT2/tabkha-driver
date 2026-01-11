import React, { useMemo, useState } from 'react';
import type { OptimizeRequest, OptimizeResponse, Stop } from '@/lib/types';
import { optimize, fetchDeliveries } from '@/lib/api';
import MapView from '@/components/MapView';
import StopsTable from '@/components/StopsTable';

export default function Planner() {
  // Google API key no longer needed - using open-source stack
  const [depotLat, setDepotLat] = useState<string>('48.910790500083145');
  const [depotLng, setDepotLng] = useState<string>('2.3593634359991196');

  // Initialize with next Monday by default
  const [planningDateStr, setPlanningDateStr] = useState<string>(() => {
    const d = new Date();
    const day = d.getDay(); // 0=Sun .. 1=Mon
    let add = (8 - day) % 7; // days until next Monday
    if (add === 0) add = 7; // if today is Monday, pick next week
    const nd = new Date(d);
    nd.setDate(nd.getDate() + add);
    // Format YYYY-MM-DD
    return nd.toLocaleDateString('en-CA');
  });

  // Departure time (HH:MM format)
  const [departureTime, setDepartureTime] = useState<string>('07:00');

  const planningDate = useMemo(() => new Date(planningDateStr), [planningDateStr]);

  const [activeTab, setActiveTab] = useState<'plan' | 'map'>('plan');

  const [stops, setStops] = useState<Stop[]>([
    { id: '1', name: 'Stop 1', address: '', timeWindowStart: new Date().toISOString(), timeWindowEnd: new Date(Date.now() + 60 * 60000).toISOString(), serviceMinutes: 5 }
  ]);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const depot = useMemo(() => ({ lat: parseFloat(depotLat), lng: parseFloat(depotLng) }), [depotLat, depotLng]);

  const toBaseIso = (hour: number, minute: number) => {
    const d = new Date(planningDate);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const addRow = () => {
    const id = String(Date.now());
    const start = toBaseIso(new Date().getHours(), 0);
    const end = toBaseIso(new Date().getHours() + 1, 0);
    setStops(prev => [...prev, { id, name: `Stop ${prev.length + 1}`, address: '', timeWindowStart: start, timeWindowEnd: end, serviceMinutes: 5 }]);
  };

  const loadTestData = () => {
    const slot = (from: number, to: number) => ({ fromIso: toBaseIso(from, 0), toIso: toBaseIso(to, 0) });
    const s0810 = slot(8, 10);
    const s1214 = slot(12, 14);
    const s2022 = slot(20, 22);
    const data: Stop[] = [
      { id: 'maya', name: 'Maya Beydoun', address: '67 rue Boissière, Paris, 75116', timeWindowStart: s0810.fromIso, timeWindowEnd: s0810.toIso, serviceMinutes: 5 },
      { id: 'rola', name: 'Rola Beydoun', address: '57 rue Boissiere, Paris, 75116', timeWindowStart: s0810.fromIso, timeWindowEnd: s0810.toIso, serviceMinutes: 5 },
      { id: 'jea', name: 'Jea Yammouni', address: '9 Boulevard Jourdan, Paris, 75014', timeWindowStart: s0810.fromIso, timeWindowEnd: s0810.toIso, serviceMinutes: 5 },
      { id: 'edwin', name: 'Edwin Sarrouh', address: '36 avenue du Président Wilson, Cachan, 94230', timeWindowStart: s1214.fromIso, timeWindowEnd: s1214.toIso, serviceMinutes: 5 },
      { id: 'muriel', name: 'Muriel El Hadari', address: '15 rue des Belles Feuilles, Paris, 75016', timeWindowStart: s2022.fromIso, timeWindowEnd: s2022.toIso, serviceMinutes: 5 }
    ];
    setStops(data);
  };
  const loadFromSupabase = async () => {
    setError(null);
    try {
      const dateStr = planningDateStr; // Use the selected date
      const deliveries = await fetchDeliveries(dateStr);
      if (deliveries.length === 0) {
        setError(`No deliveries found for ${dateStr}`);
        return;
      }
      // Normalize time windows to planningDate
      const normalized = deliveries.map(s => {
        const sh = new Date(s.timeWindowStart).getHours();
        const eh = new Date(s.timeWindowEnd).getHours();
        return { ...s, timeWindowStart: toBaseIso(sh, 0), timeWindowEnd: toBaseIso(eh, 0) };
      });
      setStops(normalized);
    } catch (err: any) {
      setError(err.message || 'Failed to load deliveries from Supabase');
    }
  };
  const updateStop = (idx: number, patch: Partial<Stop>) => {
    setStops(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };
  const removeStop = (idx: number) => setStops(prev => prev.filter((_, i) => i !== idx));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      // Normalize all stop windows to the base (next Monday) date
      const normalizedStops: Stop[] = stops.map(s => {
        const sh = new Date(s.timeWindowStart).getHours();
        const eh = new Date(s.timeWindowEnd).getHours();
        return { ...s, timeWindowStart: toBaseIso(sh, 0), timeWindowEnd: toBaseIso(eh, 0) };
      });
      // Build vehicle start time ISO from date + departure time
      const [depHour, depMin] = departureTime.split(':').map(Number);
      const vehicleStartTimeIso = toBaseIso(depHour, depMin);
      const req: OptimizeRequest = { depot, stops: normalizedStops, vehicleStartTimeIso } as any;
      const res = await optimize(req);
      setResult(res);
      setActiveTab('map');
    } catch (err: any) {
      setError(err.message || 'Unknown error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {activeTab === 'plan' && (
        <form onSubmit={onSubmit} style={{ padding: 16, overflow: 'auto', flex: 1 }}>
          {/* Using open-source stack - no API keys needed */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <label style={{ flex: 1 }}>Depot Lat<br />
              <input value={depotLat} onChange={e => setDepotLat(e.target.value)} style={{ width: '100%' }} />
            </label>
            <label style={{ flex: 1 }}>Depot Lng<br />
              <input value={depotLng} onChange={e => setDepotLng(e.target.value)} style={{ width: '100%' }} />
            </label>
            <label style={{ flex: 1 }}>Date<br />
              <input type="date" value={planningDateStr} onChange={e => setPlanningDateStr(e.target.value)} style={{ width: '100%' }} />
            </label>
            <label style={{ flex: 0.6 }}>Departure<br />
              <input
                type="time"
                value={departureTime}
                onChange={e => setDepartureTime(e.target.value)}
                style={{ width: '100%' }}
              />
            </label>
          </div>

          <div style={{ marginBottom: 12 }}>
            <strong>Stops ({stops.length})</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {stops.map((s, i) => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 240px 220px 120px 40px', gap: 6 }}>
                  <input placeholder="Name" value={s.name} onChange={e => updateStop(i, { name: e.target.value })} />
                  <input placeholder="Address" value={s.address || ''} onChange={e => updateStop(i, { address: e.target.value })} />
                  <select
                    value={`${new Date(s.timeWindowStart).getHours()}-${new Date(s.timeWindowEnd).getHours()}`}
                    onChange={e => {
                      const [from, to] = e.target.value.split('-').map(Number);
                      updateStop(i, { timeWindowStart: toBaseIso(from, 0), timeWindowEnd: toBaseIso(to, 0) });
                    }}
                  >
                    {[
                      [8, 10],
                      [10, 12],
                      [12, 14],
                      [14, 16],
                      [16, 18],
                      [18, 20],
                      [20, 22]
                    ].map(([a, b]) => (
                      <option key={`${a}-${b}`} value={`${a}-${b}`}>{`${a.toString().padStart(2, '0')}:00 - ${b.toString().padStart(2, '0')}:00`}</option>
                    ))}
                  </select>
                  <input placeholder="Service (min)" type="number" value={s.serviceMinutes} onChange={e => updateStop(i, { serviceMinutes: Number(e.target.value) })} />
                  <button type="button" onClick={() => removeStop(i)}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={addRow}>Add Stop</button>
                <button type="button" onClick={loadTestData}>Load Test Data</button>
                <button type="button" onClick={loadFromSupabase}>Load from Supabase ({planningDateStr})</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="submit" disabled={stops.length === 0}>Optimize</button>
            <button type="button" onClick={() => setActiveTab('map')} disabled={!result}>Go to Map</button>
          </div>
          {error && <div style={{ color: '#d93025', marginTop: 12 }}>{error}</div>}
        </form>
      )}

      {activeTab === 'map' && (
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {/* Full-page map */}
          <div style={{ position: 'absolute', inset: 0 }}>
            {result && <MapView depot={depot} stops={result.orderedStops} polyline={result.overviewPolyline} routeSegments={result.routeSegments} />}
            {!result && <div style={{ padding: 24, color: '#666' }}>Run optimization to see the map.</div>}
          </div>

          {/* Back button overlay */}
          <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10 }}>
            <button
              type="button"
              onClick={() => setActiveTab('plan')}
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
              ← Back to Plan
            </button>
          </div>

          {/* Geocode warnings overlay */}
          {result && result.geocodeWarnings && result.geocodeWarnings.length > 0 && (
            <div style={{
              position: 'absolute',
              top: 10,
              left: 150,
              right: 320,
              zIndex: 10,
              padding: 12,
              backgroundColor: 'rgba(255, 243, 205, 0.95)',
              border: '1px solid #ffc107',
              borderRadius: 8,
              color: '#856404',
              maxHeight: 150,
              overflowY: 'auto',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: '0.9em' }}>
                ⚠️ {result.geocodeWarnings.length} address{result.geocodeWarnings.length > 1 ? 'es' : ''} used approximate matches
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.85em' }}>
                {result.geocodeWarnings.slice(0, 3).map((w, idx) => {
                  const stop = stops.find(s => s.id === w.stopId);
                  return (
                    <li key={idx}><strong>{stop?.name || w.stopId}</strong>: "{w.fallbackQuery}"</li>
                  );
                })}
                {result.geocodeWarnings.length > 3 && <li>...and {result.geocodeWarnings.length - 3} more</li>}
              </ul>
            </div>
          )}

          {/* Itinerary sidebar overlay */}
          <div style={{
            position: 'absolute',
            top: 10,
            right: 10,
            bottom: 10,
            width: 300,
            zIndex: 10,
            background: 'rgba(255,255,255,0.95)',
            borderRadius: 8,
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: '1em' }}>Itinerary</h3>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
              {result ? (
                <StopsTable stops={result.orderedStops} />
              ) : (
                <div style={{ color: '#666', padding: 8 }}>No results yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


