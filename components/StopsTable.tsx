import React from 'react';
import type { OptimizedStop } from '@/lib/types';

export default function StopsTable({ stops }: { stops: OptimizedStop[] }) {
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
        {stops.map((s, i) => (
          <tr key={s.id} style={s.isDepotReturn ? { backgroundColor: '#f0f0f0', fontStyle: 'italic' } : undefined}>
            <td style={{ padding: 6 }}>{i + 1}</td>
            <td style={{ padding: 6 }}>{s.isDepotReturn ? '🏠 ' : ''}{s.name}</td>
            <td style={{ padding: 6 }}>{s.travelSecondsFromPrev ? Math.round(s.travelSecondsFromPrev / 60) + ' min' : (i === 0 ? '-' : '')}</td>
            <td style={{ padding: 6 }}>{s.waitSecondsBeforeWindow ? Math.round(s.waitSecondsBeforeWindow / 60) + ' min' : '-'}</td>
            <td style={{ padding: 6 }}>{new Date(s.etaIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td style={{ padding: 6 }}>{s.isDepotReturn ? '-' : `${new Date(s.timeWindowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(s.timeWindowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</td>
            <td style={{ padding: 6, color: s.arrivalDelayMinutes > 0 ? '#d93025' : '#188038' }}>{s.isDepotReturn ? '-' : s.arrivalDelayMinutes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


