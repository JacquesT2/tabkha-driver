import React, { useEffect, useState } from 'react';
import { getAllDeliveryDates, fetchOrdersForManualTracking, updateOrderStatus } from '@/lib/services/deliveries.supabase';
import type { ManualOrder } from '@/lib/types';

export default function ManualDeliveryPage() {
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [orders, setOrders] = useState<ManualOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ total: 0, delivered: 0, pending: 0 });

    useEffect(() => {
        loadDates();
    }, []);

    useEffect(() => {
        if (selectedDate) {
            loadOrders(selectedDate);
        }
    }, [selectedDate]);

    const loadDates = async () => {
        try {
            const d = await getAllDeliveryDates();
            setDates(d);
            if (d.length > 0) setSelectedDate(d[0]);
        } catch (err) {
            console.error('Failed to load dates', err);
        }
    };

    const loadOrders = async (date: string) => {
        setLoading(true);
        try {
            const data = await fetchOrdersForManualTracking(date);
            setOrders(data);
            calculateStats(data);
        } catch (err) {
            console.error('Failed to load orders', err);
        } finally {
            setLoading(false);
        }
    };

    const calculateStats = (data: ManualOrder[]) => {
        const delivered = data.filter(o => o.status === 'delivered').length;
        setStats({
            total: data.length,
            delivered,
            pending: data.length - delivered
        });
    };

    const toggleStatus = async (order: ManualOrder) => {
        const newStatus = order.status === 'delivered' ? 'pending' : 'delivered';

        // Optimistic update
        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: newStatus } : o));
        calculateStats(orders.map(o => o.id === order.id ? { ...o, status: newStatus } : o));

        try {
            await updateOrderStatus(order.id, newStatus);
        } catch (err) {
            console.error('Failed to update status', err);
            // Revert on error
            loadOrders(selectedDate);
            alert('Failed to update status');
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Manual Delivery Tracker</h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label>Select Date:</label>
                    <select
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    >
                        {dates.map(date => (
                            <option key={date} value={date}>{new Date(date).toLocaleDateString()}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '20px',
                marginBottom: '30px'
            }}>
                <StatCard title="Total Orders" value={stats.total} color="#f3f4f6" />
                <StatCard title="Delivered" value={stats.delivered} color="#dcfce7" textColor="#166534" />
                <StatCard title="Pending" value={stats.pending} color="#fff7ed" textColor="#9a3412" />
            </div>

            {loading ? (
                <div>Loading orders...</div>
            ) : orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>No orders found for this date.</div>
            ) : (
                <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <tr>
                                <th style={{ padding: '12px 16px', fontWeight: '600', fontSize: '0.875rem' }}>Customer</th>
                                <th style={{ padding: '12px 16px', fontWeight: '600', fontSize: '0.875rem' }}>Address</th>
                                <th style={{ padding: '12px 16px', fontWeight: '600', fontSize: '0.875rem' }}>Time Window</th>
                                <th style={{ padding: '12px 16px', fontWeight: '600', fontSize: '0.875rem' }}>Status</th>
                                <th style={{ padding: '12px 16px', fontWeight: '600', fontSize: '0.875rem' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((order) => (
                                <tr key={order.id} style={{
                                    borderBottom: '1px solid #e5e7eb',
                                    backgroundColor: order.status === 'delivered' ? '#f0fdf4' : 'white'
                                }}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontWeight: 500 }}>{order.customerName}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {order.id.slice(0, 8)}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px', maxWidth: '300px' }}>{order.address}</td>
                                    <td style={{ padding: '12px 16px' }}>{order.deliveryWindow}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '999px',
                                            fontSize: '0.75rem',
                                            fontWeight: 500,
                                            backgroundColor: order.status === 'delivered' ? '#dcfce7' : '#f3f4f6',
                                            color: order.status === 'delivered' ? '#166534' : '#374151'
                                        }}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <button
                                            onClick={() => toggleStatus(order)}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '4px',
                                                border: '1px solid',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                                backgroundColor: order.status === 'delivered' ? 'white' : '#ea580c',
                                                color: order.status === 'delivered' ? '#374151' : 'white',
                                                borderColor: order.status === 'delivered' ? '#d1d5db' : '#ea580c'
                                            }}
                                        >
                                            {order.status === 'delivered' ? 'Undo' : 'Mark Delivered'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function StatCard({ title, value, color, textColor = 'inherit' }: { title: string, value: number, color: string, textColor?: string }) {
    return (
        <div style={{
            backgroundColor: color,
            padding: '20px',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: textColor
        }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '5px' }}>{title}</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{value}</div>
        </div>
    );
}
