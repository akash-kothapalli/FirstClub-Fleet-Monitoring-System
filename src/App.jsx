import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FleetProvider } from './context/FleetContext';
import { AuthPage } from './components/AuthPage';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { DriverApp } from './components/DriverApp';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { ReportModal } from './components/ReportModal';
import { DriverDistanceModal } from './components/DriverDistanceModal';

function MainApp() {
  const { user, isDriver } = useAuth();
  
  // Default view based on logged-in role
  const [view, setView] = useState(isDriver ? 'driver' : 'command');
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isDistanceOpen, setIsDistanceOpen] = useState(false);

  // Unauthenticated user -> Show dedicated AuthPage Portal
  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="app-container">
      <Header
        currentView={isDriver ? 'driver' : view}
        setView={setView}
        openAuth={() => setIsAuthOpen(true)}
        openAdmin={() => setIsAdminOpen(true)}
        openReport={() => setIsReportOpen(true)}
        openDistanceModal={() => setIsDistanceOpen(true)}
      />

      <main>
        {isDriver ? (
          <DriverApp />
        ) : (
          <>
            {view === 'command' && <Dashboard openDistanceModal={() => setIsDistanceOpen(true)} />}
            {view === 'driver' && <DriverApp />}
          </>
        )}
      </main>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <AdminPanel isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} />
      <ReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} />
      <DriverDistanceModal isOpen={isDistanceOpen} onClose={() => setIsDistanceOpen(false)} />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <FleetProvider>
        <MainApp />
      </FleetProvider>
    </AuthProvider>
  );
}

export default App;
