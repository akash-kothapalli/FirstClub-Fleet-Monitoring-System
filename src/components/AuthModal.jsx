import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function AuthModal({ isOpen, onClose }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('manager@firstclub.com');
  const [password, setPassword] = useState('password123');

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await login(email, password);
      onClose();
    } catch (err) {
      alert(`Login failed: ${err.message}`);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/firstclub-logo.png" style={{ height: '36px', width: '36px', borderRadius: '8px' }} alt="Logo" />
            <h2 style={{ fontFamily: 'var(--font-heading)', color: '#ffffff' }}>Sign In to FirstClub FFMS</h2>
          </div>
          <button className="map-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Email Address</label>
            <input type="email" className="input-search" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Password</label>
            <input type="password" className="input-search" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <strong>Demo Roles Credentials:</strong><br />
            • Ops Manager: <code>manager@firstclub.com</code><br />
            • Vendor Manager: <code>vendor1@apexmedia.in</code><br />
            • Driver: <code>sunil@apexmedia.in</code><br />
            (Password for all: <code>password123</code>)
          </div>

          <button type="submit" className="duty-btn start" style={{ padding: '12px', fontSize: '16px' }}>Log In</button>
        </form>
      </div>
    </div>
  );
}
