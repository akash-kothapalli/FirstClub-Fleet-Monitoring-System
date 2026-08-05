import React from 'react';
import { useAuth } from '../context/AuthContext';

export function Header({ currentView, setView, openAdmin, openReport }) {
  const { user, isOpsManager, isDriver, logout } = useAuth();

  const displayName = user ? (user.fullName || user.full_name || user.email) : 'GUEST';
  const roleLabel = user?.role ? user.role.toUpperCase() : 'GUEST';

  return (
    <header className="navbar">
      <div className="brand">
        <img src="/firstclub-logo.png" alt="FirstClub Logo" className="brand-logo-img" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.1, fontFamily: 'var(--font-heading)' }}>FirstClub FFMS</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.5px' }}>CAMPAIGN COMMAND CENTER</span>
        </div>
      </div>

      <nav className="nav-links">
        {!isDriver && (
          <button
            className={`nav-btn ${currentView === 'command' ? 'active' : ''}`}
            onClick={() => setView('command')}
          >
            📊 Command Center
          </button>
        )}

        <button
          className={`nav-btn ${currentView === 'driver' ? 'active' : ''}`}
          onClick={() => setView('driver')}
        >
          📱 Driver App
        </button>

        {!isDriver && isOpsManager && (
          <button className="nav-btn" onClick={openAdmin}>
            ⚙️ Admin CRUD
          </button>
        )}

        {!isDriver && (
          <button className="nav-btn" onClick={openReport}>
            📄 PDF Audit Report
          </button>
        )}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span className="role-badge">
          {displayName} ({roleLabel})
        </span>

        <button
          className="nav-btn"
          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)' }}
          onClick={() => logout()}
        >
          🚪 Log Out
        </button>
      </div>
    </header>
  );
}
