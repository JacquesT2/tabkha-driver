'use client';

import React from 'react';
import Link from 'next/link';

export default function UnauthorizedPage() {
    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#faf6f1',
            textAlign: 'center',
            padding: '2rem'
        }}>
            <span style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚫</span>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#292524', marginBottom: '1rem' }}>Access Denied</h1>
            <p style={{ color: '#57534e', maxWidth: '400px', marginBottom: '2rem', lineHeight: '1.5' }}>
                Your email address is not in the authorized driver list.
                Please contact the administrator to request access.
            </p>

            <Link href="/login" style={{
                backgroundColor: '#ea580c',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '600'
            }}>
                Back to Login
            </Link>
        </div>
    );
}
