import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

/**
 * Gate shown when there's no authenticated session — login/register
 * toggle. Nothing about uploads or the gallery renders until this
 * resolves (see App.jsx), so there's no anonymous path to either.
 */
export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(email, password);
        toast.success('Account created.');
      } else {
        await login(email, password);
        toast.success('Welcome back.');
      }
    } catch (err) {
      const message = err.response?.data?.error || 'Something went wrong. Please try again.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-bg)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          padding: 32,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <span style={{ fontSize: 28 }}>🔍</span>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>Image Validator</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {isRegister ? 'Create an account to get your own private gallery.' : 'Sign in to your gallery.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
            Password
            <input
              type="password"
              required
              minLength={isRegister ? 8 : undefined}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
            {isRegister && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 400 }}>
                At least 8 characters.
              </span>
            )}
          </label>

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 6,
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: submitting ? '#a5b4fc' : 'var(--color-primary)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          onClick={() => setMode(isRegister ? 'login' : 'register')}
          style={{
            marginTop: 18,
            width: '100%',
            border: 'none',
            background: 'none',
            color: 'var(--color-primary)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
