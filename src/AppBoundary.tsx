import { Component, type ReactNode } from 'react';
export default class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="knowledge-page">
        <h1>Impossible d’afficher cette page</h1>
        <p>
          Vérifiez votre connexion puis rechargez. Les brouillons déjà sauvegardés restent sur cet
          appareil.
        </p>
        <button className="button primary" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
