import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import type { BillingPlan, BillingStatus } from '../shared/billing';
import './billing.css';

async function billingApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/billing/${path}`,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Facturation indisponible.');
  return data;
}
const statusLabels: Record<string, string> = {
  none: 'Offre gratuite',
  active: 'Abonnement actif',
  trialing: 'Période d’essai',
  past_due: 'Paiement à régulariser',
  unpaid: 'Paiement impayé',
  incomplete: 'Paiement en attente',
  paused: 'Abonnement suspendu',
  canceled: 'Abonnement résilié',
  incomplete_expired: 'Paiement expiré',
};
export default function BillingPanel({
  privateWorkspace = false,
  onQuotaChange,
}: {
  privateWorkspace?: boolean;
  onQuotaChange?: (value: number) => void;
}) {
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const returned = new URLSearchParams(window.location.search).get('billing');
  const load = useCallback(async () => {
    setError('');
    const results = await Promise.allSettled([
      billingApi<BillingPlan>('plan'),
      ...(privateWorkspace ? [billingApi<BillingStatus>('status')] : []),
    ]);
    const price = results[0];
    if (price.status === 'fulfilled') setPlan(price.value as BillingPlan);
    else {
      setPlan(null);
      setError(price.reason.message);
    }
    if (privateWorkspace) {
      const state = results[1];
      if (state.status === 'fulfilled') {
        const value = state.value as BillingStatus;
        setStatus(value);
        onQuotaChange?.(value.maxStorageMb);
      } else {
        setStatus(null);
        setError(state.reason.message);
      }
    }
    setLoading(false);
  }, [privateWorkspace, onQuotaChange]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!privateWorkspace || returned !== 'success' || status?.premium) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts++;
      void load();
      if (attempts >= 5) window.clearInterval(timer);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [privateWorkspace, returned, status?.premium, load]);
  async function redirect(kind: 'checkout' | 'portal') {
    setBusy(true);
    setError('');
    try {
      const result = await billingApi<{ url: string }>(
        kind,
        kind === 'checkout' ? { expectedAmount: plan?.unitAmount } : {},
      );
      const url = new URL(result.url);
      if (
        url.protocol !== 'https:' ||
        !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)
      )
        throw new Error('Adresse Stripe inattendue.');
      window.location.assign(url.href);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  const amount =
    plan?.unitAmount != null
      ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
          plan.unitAmount / 100,
        )
      : 'À configurer';
  return (
    <article
      className="plan-card premium-card billing-card"
      id={privateWorkspace ? 'billing' : 'premium-subscription'}
      aria-labelledby="billing-title"
    >
      <span className="plan-label">
        <CreditCard size={20} /> PREMIUM / STRIPE{' '}
        <span className="coming-soon">
          {plan?.enabled ? (plan.testMode ? 'MODE TEST' : 'MENSUEL') : 'NON ACTIVÉ'}
        </span>
      </span>
      <h3 id="billing-title">
        Votre espace.
        <br />
        Un abonnement mensuel.
      </h3>
      <div className="plan-price">
        {loading ? 'Chargement…' : amount}
        <span>{plan?.unitAmount != null ? '/ mois' : 'en euros · mensuel'}</span>
      </div>
      {plan?.unitAmount != null && (
        <p className="billing-tax">
          {plan.taxBehavior === 'inclusive'
            ? 'Taxes incluses dans le tarif Stripe.'
            : 'Taxes éventuelles précisées dans Stripe avant paiement.'}
        </p>
      )}
      <p>
        Un abonnement pour cette installation privée. Le règlement et la gestion de votre abonnement
        se font dans Stripe.
      </p>
      <ul>
        <li>
          <Check size={17} />
          {plan
            ? `${plan.premiumStorageMb.toLocaleString('fr-FR')} Mo de capacité de dépôt`
            : 'Capacité de dépôt étendue'}
        </li>
        <li>
          <Check size={17} />
          Factures et moyen de paiement dans Stripe
        </li>
        <li>
          <Check size={17} />
          Gestion et résiliation depuis le portail Stripe
        </li>
        <li>
          <Check size={17} />
          Vos originaux restent sur votre installation
        </li>
      </ul>
      <p className="billing-limit">
        Capacité logicielle, sous réserve de l’espace disque disponible. Hébergement, intervention
        d’un commissaire de justice et horodatage externe non inclus.
      </p>
      {plan?.testMode && plan.enabled && (
        <div className="billing-note">
          Mode test Stripe : utilisez une carte de test, aucun paiement réel n’est encaissé.
        </div>
      )}
      {!loading && plan && !plan.enabled && (
        <div className="billing-note">
          Le paiement sera disponible une fois le compte Stripe et le tarif mensuel configurés.
          Aucun paiement n’est possible pour le moment.
        </div>
      )}
      {privateWorkspace && returned && (
        <p role="status" className="billing-return">
          {returned === 'cancel'
            ? 'Vous avez quitté Checkout. Votre abonnement n’a pas été activé par ce retour.'
            : status?.premium
              ? 'Votre accès Premium a été confirmé par Stripe.'
              : 'Retour de Stripe. Le statut ci-dessous est vérifié auprès de Stripe ; ce retour ne confirme pas un paiement.'}
        </p>
      )}
      {privateWorkspace && status && (
        <div className="billing-status">
          <ShieldCheck size={18} />
          <span>
            {statusLabels[status.status] || status.status}
            {status.cancelAtPeriodEnd && ' · Résiliation prévue en fin de période'}
            <small>
              {status.premium ? 'Capacité Premium active' : 'Capacité gratuite active'} ·{' '}
              {status.maxStorageMb.toLocaleString('fr-FR')} Mo
            </small>
          </span>
        </div>
      )}
      {error && (
        <p role="alert" className="billing-error">
          {error}
        </p>
      )}
      <div className="billing-actions">
        {privateWorkspace ? (
          <>
            {!status?.canManage || status.status === 'none' ? (
              <button
                className="button primary"
                disabled={busy || loading || !plan?.enabled || !status}
                onClick={() => redirect('checkout')}
              >
                {busy
                  ? 'Ouverture…'
                  : plan?.testMode
                    ? 'Tester l’abonnement Stripe'
                    : 'S’abonner avec Stripe'}
                <ArrowRight size={16} />
              </button>
            ) : null}
            {status?.canManage && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => redirect('portal')}
              >
                Gérer mon abonnement <ArrowRight size={16} />
              </button>
            )}
          </>
        ) : plan?.enabled ? (
          <a
            className="button primary"
            href="#connexion"
            onClick={() => {
              try {
                sessionStorage.setItem('preuvix-open-billing', '1');
              } catch {
                /* Navigation remains available in the workspace. */
              }
            }}
          >
            Se connecter pour s’abonner <ArrowRight size={16} />
          </a>
        ) : (
          <button className="button primary" disabled>
            Paiement non activé
          </button>
        )}
        <button
          className="billing-refresh"
          disabled={busy || loading}
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          <RefreshCw size={14} /> Actualiser {privateWorkspace ? 'le statut' : 'le tarif'}
        </button>
      </div>
      {!privateWorkspace && (
        <a className="billing-partners" href="#constat">
          Faire appel à un commissaire de justice
        </a>
      )}
    </article>
  );
}
