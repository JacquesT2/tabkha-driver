'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-auth/client';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isMagicLink, setIsMagicLink] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);
    const router = useRouter();
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            if (isMagicLink) {
                const { error } = await supabase.auth.signInWithOtp({
                    email,
                    options: {
                        emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                });
                if (error) throw error;
                setMessage({ type: 'success', text: 'Check your email for the login link!' });
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                router.push('/');
                router.refresh();
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#faf6f1'
        }}>
            <form onSubmit={handleLogin} style={{
                padding: '2rem',
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                width: '100%',
                maxWidth: '400px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.2rem'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '3rem', display: 'block', marginBottom: '0.5rem' }}>🍲</span>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#292524' }}>Tabkha Driver</h1>
                    <p style={{ color: '#57534e', fontSize: '0.9rem' }}>Sign in to access dashboard</p>
                </div>

                <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#57534e' }}>Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@tabkha.fr"
                        style={{ width: '100%' }}
                        required
                    />
                </div>

                {!isMagicLink && (
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#57534e' }}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            style={{ width: '100%' }}
                            required
                        />
                    </div>
                )}

                {message && (
                    <div style={{
                        padding: '10px',
                        borderRadius: '6px',
                        fontSize: '0.9rem',
                        backgroundColor: message.type === 'error' ? '#fee2e2' : '#dcfce7',
                        color: message.type === 'error' ? '#ef4444' : '#22c55e'
                    }}>
                        {message.text}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary"
                    style={{ width: '100%', marginTop: '0.5rem' }}
                >
                    {loading ? 'Processing...' : (isMagicLink ? 'Send Magic Link' : 'Sign In')}
                </button>

                <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                    <button
                        type="button"
                        onClick={() => setIsMagicLink(!isMagicLink)}
                        style={{ background: 'none', border: 'none', color: '#ea580c', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                    >
                        {isMagicLink ? 'Sign in with Password' : 'Or sign in with Magic Link'}
                    </button>
                </div>
            </form>
        </div>
    );
}
