import React from 'react';
import ReactDOM from 'react-dom/client';
import FinanceTracker from '../personal-finance-tracker';
import DevelopmentTracker from '../personal-development-tracker';

function AppShell() {
  const [view, setView] = React.useState(() => {
    const hashView = window.location.hash.replace('#', '');
    return hashView === 'development' ? 'development' : 'finance';
  });

  const navigate = React.useCallback((nextView) => {
    setView(nextView);
    window.location.hash = nextView;
  }, []);

  React.useEffect(() => {
    const handleHashChange = () => {
      const hashView = window.location.hash.replace('#', '');
      setView(hashView === 'development' ? 'development' : 'finance');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return view === 'development'
    ? <DevelopmentTracker onNavigate={navigate} />
    : <FinanceTracker onNavigate={navigate} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
