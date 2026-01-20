import React, { useEffect, useState } from 'react';
import { TEST_ACCOUNTS } from '@/lib/constants';

type ClientData = {
    id: string;
    name: string;
    email: string;
    address: string | null; // formatted address
    street: string | null;
    city: string | null;
    postalCode: string | null;
    lat: number | null;
    lng: number | null;
    orderCount: number;
    isSubscriber: boolean;
};

export default function GeocodingManagerPage() {
    const [clients, setClients] = useState<ClientData[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Edit form state
    const [editForm, setEditForm] = useState({
        street: '',
        city: '',
        postalCode: ''
    });
    const [minOrderCount, setMinOrderCount] = useState(0);
    const [excludeTestAccounts, setExcludeTestAccounts] = useState(true);

    const fetchClients = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/clients');
            if (!res.ok) throw new Error('Failed to fetch clients');
            const data = await res.json();
            setClients(data.clients);
        } catch (err) {
            console.error(err);
            alert('Error loading clients');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClients();
    }, []);

    const handleEditClick = (client: ClientData) => {
        setEditingId(client.id);
        setEditForm({
            street: client.street || '',
            city: client.city || '',
            postalCode: client.postalCode || ''
        });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
    };

    const handleSaveAddress = async (userId: string) => {
        try {
            const res = await fetch('/api/geocoding-manager/update-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    street: editForm.street,
                    city: editForm.city,
                    postalCode: editForm.postalCode
                })
            });

            if (!res.ok) throw new Error('Failed to update address');

            setEditingId(null);
            fetchClients(); // Refresh list
            alert('Address updated and geocoding triggered!');
        } catch (err) {
            console.error(err);
            alert('Failed to save address');
        }
    };

    const handleRetryGeocoding = async (userId: string) => {
        try {
            const res = await fetch('/api/geocoding-manager/geocode-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (!res.ok) throw new Error('Failed to retry geocoding');
            const data = await res.json();

            if (data.found) {
                alert('Geocoding successful!');
            } else {
                alert('Geocoding failed - address might be invalid.');
            }
            fetchClients(); // Refresh list
        } catch (err) {
            console.error(err);
            alert('Error retrying geocoding');
        }
    };

    // Filter for non-geocoded clients (lat/lng is null)
    // AND apply min order filter
    const nonGeocodedClients = clients.filter(c =>
        (c.lat === null || c.lng === null) &&
        c.orderCount >= minOrderCount &&
        (!excludeTestAccounts || !TEST_ACCOUNTS.includes(c.email))
    );

    if (loading) return <div>Loading...</div>;

    return (
        <div style={{ padding: '20px', height: '100%', overflowY: 'auto' }}>
            <h1>Geocoding Manager</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: 20 }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontWeight: 500 }}>Min Orders:</label>
                    <select
                        value={minOrderCount}
                        onChange={(e) => setMinOrderCount(Number(e.target.value))}
                        style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        <option value={0}>0+ (All)</option>
                        <option value={1}>1+</option>
                        <option value={2}>2+</option>
                        <option value={3}>3+</option>
                        <option value={5}>5+</option>
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

                <div style={{ width: '1px', height: '30px', background: '#ddd' }}></div>

                <p style={{ margin: 0 }}>Found {nonGeocodedClients.length} clients that need geocoding.</p>

                {nonGeocodedClients.length > 0 && (
                    <button
                        onClick={async () => {
                            if (!confirm(`This will try to geocode all ${nonGeocodedClients.length} visible clients. Continue?`)) return;
                            setLoading(true);

                            let success = 0;
                            let failed = 0;

                            for (const c of nonGeocodedClients) {
                                try {
                                    const res = await fetch('/api/geocoding-manager/geocode-user', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ userId: c.id })
                                    });
                                    const d = await res.json();
                                    if (d.found) success++;
                                    else failed++;
                                } catch (e) {
                                    failed++;
                                }
                                // tiny delay
                                await new Promise(r => setTimeout(r, 200));
                            }

                            alert(`Process checked ${nonGeocodedClients.length} clients.\nSuccess: ${success}\nFailed: ${failed}`);
                            setLoading(false);
                            fetchClients();
                        }}
                        style={{
                            background: '#673AB7',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            marginLeft: 'auto'
                        }}
                    >
                        Retry Visible ({nonGeocodedClients.length})
                    </button>
                )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
                <thead>
                    <tr style={{ background: '#f4f4f4', textAlign: 'left' }}>
                        <th style={{ padding: '10px' }}>Name</th>
                        <th style={{ padding: '10px' }}>Orders</th>
                        <th style={{ padding: '10px' }}>Current Address Details</th>
                        <th style={{ padding: '10px' }}>Status</th>
                        <th style={{ padding: '10px' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {nonGeocodedClients.map(client => (
                        <tr key={client.id} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: '10px' }}>
                                <strong>{client.name}</strong><br />
                                <small>{client.email}</small>
                            </td>
                            <td style={{ padding: '10px' }}>
                                <span style={{
                                    background: client.orderCount > 0 ? '#e3f2fd' : '#f5f5f5',
                                    color: client.orderCount > 0 ? '#1976d2' : '#757575',
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontWeight: 'bold',
                                    fontSize: '0.9em'
                                }}>
                                    {client.orderCount}
                                </span>
                            </td>
                            <td style={{ padding: '10px' }}>
                                {editingId === client.id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <input
                                            placeholder="Street"
                                            value={editForm.street}
                                            onChange={e => setEditForm({ ...editForm, street: e.target.value })}
                                            style={{ padding: '5px' }}
                                        />
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <input
                                                placeholder="Postal Code"
                                                value={editForm.postalCode}
                                                onChange={e => setEditForm({ ...editForm, postalCode: e.target.value })}
                                                style={{ width: '80px', padding: '5px' }}
                                            />
                                            <input
                                                placeholder="City"
                                                value={editForm.city}
                                                onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                                                style={{ flex: 1, padding: '5px' }}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        {client.address || (
                                            <span style={{ color: 'red' }}>Address Missing</span>
                                        )}
                                        <br />
                                        <small style={{ color: '#666' }}>
                                            Street: {client.street || 'N/A'}, Zip: {client.postalCode || 'N/A'}, City: {client.city || 'N/A'}
                                        </small>
                                    </div>
                                )}
                            </td>
                            <td style={{ padding: '10px' }}>
                                <span style={{
                                    background: '#ffebee',
                                    color: '#c62828',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    fontWeight: 'bold'
                                }}>
                                    NOT GEOCODED
                                </span>
                            </td>
                            <td style={{ padding: '10px' }}>
                                {editingId === client.id ? (
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button
                                            onClick={() => handleSaveAddress(client.id)}
                                            style={{ background: '#4CAF50', color: 'white', border: 'none', padding: '5px 10px', cursor: 'pointer', borderRadius: '4px' }}
                                        >
                                            Save & Geocode
                                        </button>
                                        <button
                                            onClick={handleCancelEdit}
                                            style={{ background: '#9e9e9e', color: 'white', border: 'none', padding: '5px 10px', cursor: 'pointer', borderRadius: '4px' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button
                                            onClick={() => handleEditClick(client)}
                                            style={{ background: '#2196F3', color: 'white', border: 'none', padding: '5px 10px', cursor: 'pointer', borderRadius: '4px' }}
                                        >
                                            Edit Address
                                        </button>
                                        <button
                                            onClick={() => handleRetryGeocoding(client.id)}
                                            style={{ background: '#FF9800', color: 'white', border: 'none', padding: '5px 10px', cursor: 'pointer', borderRadius: '4px' }}
                                        >
                                            Retry
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
                    {nonGeocodedClients.length === 0 && (
                        <tr>
                            <td colSpan={5} style={{ padding: '20px', textAlign: 'center' }}>
                                All clients are geocoded!
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
