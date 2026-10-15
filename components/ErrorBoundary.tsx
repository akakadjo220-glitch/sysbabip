import React from 'react';
import { reportError } from '../utils/reportError';

// Filet de sécurité : si une page plante, le visiteur voit un message clair et
// un bouton pour recharger, au lieu d'un écran blanc ; l'erreur est signalée.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    reportError(error, 'Page plantée');
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
        <h2 className="text-2xl font-black text-white mb-2">Un problème est survenu</h2>
        <p className="text-slate-400 mb-6 max-w-md">
          Cette page n'a pas pu s'afficher. Vos billets et vos paiements ne sont pas concernés.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white font-bold"
        >
          Recharger la page
        </button>
      </div>
    );
  }
}
