import React from 'react';
import type { OptimizedStop } from '@/lib/types';

interface StopsTableProps {
  stops: OptimizedStop[];
  trafficStops?: OptimizedStop[]; // Optional traffic-refined version of the same stops
}

export default function StopsTable({ stops, trafficStops }: StopsTableProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>#</th>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Drive</th>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Wait</th>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>ETA</th>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Window</th>
          <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>Delay (min)</th>
        </tr>
      </thead>
      <tbody>
        {stops.map((s, i) => {
          const trafficStop = trafficStops?.[i];
          const orsTravel = s.travelSecondsFromPrev || 0;
          const trafficTravel = trafficStop?.travelSecondsFromPrev || 0;
          const trafficDelay = trafficTravel - orsTravel;
          const hasTrafficData = trafficStops && Math.abs(trafficDelay) > 30; // Show if >30 seconds difference

          return (
            <tr key={s.id} style={s.isDepotReturn ? { backgroundColor: '#f0f0f0', fontStyle: 'italic' } : undefined}>
              <td style={{ padding: 6 }}>{i + 1}</td>
              <td style={{ padding: 6 }}>{s.isDepotReturn ? '🏠 ' : ''}{s.name}</td>
              <td style={{ padding: 6 }}>
                {s.travelSecondsFromPrev ? (
                  <div>
                    <div>{Math.round(s.travelSecondsFromPrev / 60)} min</div>
                    {hasTrafficData && (
                      <div style={{
                        fontSize: '0.85em',
                        color: trafficDelay > 0 ? '#ea4335' : '#34a853',
                        fontWeight: 'bold'
                      }}>
                        {Math.round(trafficTravel / 60)} min w/ traffic
                        <span style={{ marginLeft: 4 }}>
                          ({trafficDelay > 0 ? '+' : ''}{Math.round(trafficDelay / 60)} min)
                        </span>
                      </div>
                    )}
                  </div>
                ) : (i === 0 ? '-' : '')}
              </td>
              <td style={{ padding: 6 }}>{s.waitSecondsBeforeWindow ? Math.round(s.waitSecondsBeforeWindow / 60) + ' min' : '-'}</td>
              <td style={{ padding: 6 }}>
                <div>{new Date(s.etaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                {trafficStop && trafficStop.etaIso !== s.etaIso && (
                  <div style={{ fontSize: '0.85em', color: '#ea4335' }}>
                    {new Date(trafficStop.etaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} w/ traffic
                  </div>
                )}
              </td>
              <td style={{ padding: 6 }}>{s.isDepotReturn ? '-' : `${new Date(s.timeWindowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(s.timeWindowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</td>
              <td style={{ padding: 6, color: s.arrivalDelayMinutes > 0 ? '#d93025' : '#188038' }}>{s.isDepotReturn ? '-' : s.arrivalDelayMinutes}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
