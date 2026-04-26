import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './lib/auth.jsx';
import App from './App.jsx';

const rsvKey = new URLSearchParams(window.location.search).get('rsvKey');

if (rsvKey) {
  // Reservation standalone OS window
  import('./windows/ReservationStandaloneApp.jsx').then(({ default: ReservationStandaloneApp }) => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <ReservationStandaloneApp rsvKey={rsvKey} />
      </React.StrictMode>
    );
  });
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </React.StrictMode>
  );
}
