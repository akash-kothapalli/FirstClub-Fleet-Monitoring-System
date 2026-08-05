import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function AuthPage() {
  const { login, registerDriver } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'register'
  
  // Clean production login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Driver Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPrimaryPhone, setRegPrimaryPhone] = useState('');
  const [regSecondaryPhone, setRegSecondaryPhone] = useState('');
  const [regTargetCity, setRegTargetCity] = useState('Bengaluru');
  const [regCampaignAreas, setRegCampaignAreas] = useState('Bellandur, Sarjapur, Indiranagar');

  const [errorMsg, setErrorMsg] = useState('');

  async function handleLoginSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    try {
      await login(email, password);
    } catch (err) {
      setErrorMsg(err.message || 'Login failed');
    }
  }

  async function handleRegisterSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    try {
      await registerDriver({
        fullName: regName,
        email: regEmail,
        password: regPassword,
        phone: regPrimaryPhone,
        secondaryPhone: regSecondaryPhone,
        targetCity: regTargetCity,
        targetCampaignAreas: regCampaignAreas
      });
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed');
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: 'radial-gradient(circle at top, #1e293b 0%, #0b0f19 70%)', padding: '20px'
    }}>
      <div style={{
        background: '#151c2c', border: '1px solid #232f48', borderRadius: '20px',
        width: '100%', maxWidth: '460px', padding: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <img src="/firstclub-logo.png" style={{ height: '56px', width: '56px', borderRadius: '12px', marginBottom: '10px' }} alt="FirstClub Logo" />
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '24px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
            FirstClub FFMS
          </h1>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', letterSpacing: '0.5px' }}>
            CAMPAIGN COMMAND CENTER & DRIVER PORTAL
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: '#0f172a', padding: '4px', borderRadius: '10px', marginBottom: '20px' }}>
          <button
            style={{
              flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontWeight: 700, fontSize: '13px',
              background: tab === 'login' ? '#10b981' : 'transparent',
              color: tab === 'login' ? '#0b0f19' : '#94a3b8'
            }}
            onClick={() => setTab('login')}
          >
            🔐 Log In
          </button>
          <button
            style={{
              flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontWeight: 700, fontSize: '13px',
              background: tab === 'register' ? '#10b981' : 'transparent',
              color: tab === 'register' ? '#0b0f19' : '#94a3b8'
            }}
            onClick={() => setTab('register')}
          >
            📋 Driver Self-Registration
          </button>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171', padding: '10px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px', textAlign: 'center' }}>
            ⚠️ {errorMsg}
          </div>
        )}

        {/* LOGIN FORM */}
        {tab === 'login' && (
          <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Email Address</label>
              <input type="email" className="input-search" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Password</label>
              <input type="password" className="input-search" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            <button type="submit" className="duty-btn start" style={{ padding: '12px', fontSize: '15px', marginTop: '6px' }}>
              Sign In
            </button>
          </form>
        )}

        {/* DRIVER SELF-REGISTRATION FORM */}
        {tab === 'register' && (
          <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Full Driver Name</label>
              <input type="text" className="input-search" placeholder="e.g. Sunil Kumar" value={regName} onChange={e => setRegName(e.target.value)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Email Address</label>
                <input type="email" className="input-search" placeholder="driver@domain.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Password</label>
                <input type="password" className="input-search" placeholder="••••••••" value={regPassword} onChange={e => setRegPassword(e.target.value)} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Primary Mobile (Req)</label>
                <input type="text" className="input-search" placeholder="+91 98765 43210" value={regPrimaryPhone} onChange={e => setRegPrimaryPhone(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Secondary Mobile</label>
                <input type="text" className="input-search" placeholder="+91 98765 43211" value={regSecondaryPhone} onChange={e => setRegSecondaryPhone(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Target Operating City</label>
              <select className="select-filter" value={regTargetCity} onChange={e => setRegTargetCity(e.target.value)}>
                <option value="Bengaluru">Bengaluru</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="Mumbai">Mumbai</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '2px' }}>Target Campaign Operating Areas</label>
              <input type="text" className="input-search" placeholder="e.g. Bellandur, Sarjapur, Indiranagar" value={regCampaignAreas} onChange={e => setRegCampaignAreas(e.target.value)} />
            </div>

            <button type="submit" className="duty-btn start" style={{ padding: '12px', fontSize: '15px', marginTop: '6px' }}>
              📝 Register & Start Shift
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
