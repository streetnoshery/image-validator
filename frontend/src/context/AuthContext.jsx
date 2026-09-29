import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  login as loginApi,
  register as registerApi,
  fetchMe,
  claimOrphanedImages,
  setAuthToken,
  getAuthToken,
} from '../services/api';

const AuthContext = createContext(null);

/**
 * @typedef {'checking'|'authenticated'|'anonymous'} AuthStatus
 */

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(/** @type {AuthStatus} */ ('checking'));

  // On mount, a stored token just means "try it" — /auth/me is the source
  // of truth (an expired/revoked token still resets to anonymous).
  useEffect(() => {
    let cancelled = false;

    if (!getAuthToken()) {
      setStatus('anonymous');
      return;
    }

    fetchMe()
      .then(({ user: me }) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        setAuthToken(null);
        setStatus('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 from any API call (expired/invalid token) resets us to logged-out.
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setStatus('anonymous');
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, []);

  const afterAuthSuccess = useCallback((token, authedUser) => {
    setAuthToken(token);
    setUser(authedUser);
    setStatus('authenticated');
    // One-time convenience: adopt any pre-auth images (best-effort, quiet).
    claimOrphanedImages()
      .then(({ claimed }) => {
        if (claimed > 0) {
          toast.success(`Found ${claimed} image${claimed !== 1 ? 's' : ''} from before accounts existed — added to your gallery.`);
        }
      })
      .catch(() => {});
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { token, user: authedUser } = await loginApi(email, password);
      afterAuthSuccess(token, authedUser);
    },
    [afterAuthSuccess]
  );

  const register = useCallback(
    async (email, password) => {
      const { token, user: authedUser } = await registerApi(email, password);
      afterAuthSuccess(token, authedUser);
    },
    [afterAuthSuccess]
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
