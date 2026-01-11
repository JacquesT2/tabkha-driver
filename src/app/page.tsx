'use client';

import React from 'react';
import Link from 'next/link';

// Tabkha brand colors
const COLORS = {
  background: '#faf6f1',
  text: '#292524',
  accent: '#ea580c',
  accentHover: '#c2410c',
};

export default function LandingPage() {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.background,
      fontFamily: 'sans-serif'
    }}>
      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <span style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}>🍲</span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', color: COLORS.text, marginBottom: '0.5rem' }}>Tabkha</h1>
        <p style={{ fontSize: '1.2rem', color: '#57534e' }}>Operational Dashboard</p>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Link href="/management" style={{ textDecoration: 'none' }}>
          <div style={{
            width: '200px',
            height: '200px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            border: '2px solid transparent'
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
              e.currentTarget.style.borderColor = COLORS.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</span>
            <span style={{ fontSize: '1.2rem', fontWeight: '600', color: COLORS.text }}>Management</span>
          </div>
        </Link>

        <Link href="/driver" style={{ textDecoration: 'none' }}>
          <div style={{
            width: '200px',
            height: '200px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            border: '2px solid transparent'
          }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
              e.currentTarget.style.borderColor = COLORS.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚚</span>
            <span style={{ fontSize: '1.2rem', fontWeight: '600', color: COLORS.text }}>Driver App</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
