'use client';

import { FormEvent, useEffect, useState } from 'react';

type Tokens = { accessToken: string; refreshToken: string };
type Session = { sessionId: string; deviceLabel: string; authStrength: string; createdAt: string; current: boolean; revoked: boolean };
const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, accessToken?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'Authentication failed' : 'Request failed');
  return await response.json() as T;
}

export default function BootstrapPage() {
  const [deviceId, setDeviceId] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState('');

  useEffect(() => setDeviceId(crypto.randomUUID()), []);
  async function onLogin(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const result = await request<{ mfaRequired: boolean; challengeToken?: string; accessToken?: string; refreshToken?: string }>('POST', '/v1/auth/login', { login, password, deviceId });
      setPassword('');
      if (result.mfaRequired) setChallenge(result.challengeToken ?? '');
      else if (result.accessToken && result.refreshToken) setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    } catch { setError('Authentication failed'); setPassword(''); }
  }
  async function onMfa(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const result = await request<Tokens>('POST', '/v1/auth/mfa/verify', { challengeToken: challenge, code });
      setTokens(result); setChallenge(''); setCode('');
    } catch { setError('Authentication failed'); setCode(''); }
  }
  async function loadSessions(access: string) {
    try { const result = await request<{ sessions: Session[] }>('GET', '/v1/me/sessions', undefined, access); setSessions(result.sessions); }
    catch { setError('Could not load sessions'); }
  }
  useEffect(() => { if (tokens) void loadSessions(tokens.accessToken); }, [tokens]);
  async function logout() {
    if (!tokens) return;
    try { await request('POST', '/v1/auth/logout', undefined, tokens.accessToken); }
    finally { setTokens(null); setSessions([]); setChallenge(''); setCode(''); setPassword(''); }
  }
  async function revokeSession(sessionId: string) {
    if (!tokens) return;
    try { await request('POST', `/v1/me/sessions/${encodeURIComponent(sessionId)}/commands/revoke`, undefined, tokens.accessToken); await loadSessions(tokens.accessToken); }
    catch { setError('Could not revoke session'); }
  }

  if (tokens) return <main><h1>Signed in</h1><button onClick={() => void loadSessions(tokens.accessToken)}>Refresh sessions</button><button onClick={() => void logout()}>Log out</button><ul>{sessions.map((session) => <li key={session.sessionId}>{session.deviceLabel} · {session.authStrength}{session.current ? ' · current session' : ''}{session.revoked ? ' · revoked' : !session.current && <button onClick={() => void revokeSession(session.sessionId)}>Revoke</button>}</li>)}</ul>{error && <p role="alert">{error}</p>}</main>;
  if (challenge) return <main><h1>Verify MFA</h1><form onSubmit={onMfa}><label>Authenticator code<input autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required /></label><button type="submit">Verify</button></form>{error && <p role="alert">{error}</p>}</main>;
  return <main><h1>Sign in</h1><form onSubmit={onLogin}><label>Login<input autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button type="submit" disabled={!deviceId}>Sign in</button></form>{error && <p role="alert">{error}</p>}</main>;
}
