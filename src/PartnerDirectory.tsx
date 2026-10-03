import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, MapPin, Search, Scale, X } from 'lucide-react';
import { z } from 'zod';
import { partnerSchema, partnerServices, type Partner } from '../shared/partners';
import './partners.css';
const PartnerMap = lazy(() => import('./PartnerMap'));

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export default function PartnerDirectory() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [service, setService] = useState('');
  const [selected, setSelected] = useState<Partner | null>(null);
  const [subject, setSubject] = useState('');
  const [context, setContext] = useState('');
  const requestRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/partners', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = z.object({ partners: z.array(partnerSchema) }).parse(await response.json());
        setPartners(data.partners);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            'Le répertoire est momentanément indisponible. Réessayez ou consultez l’annuaire officiel.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (selected) requestRef.current?.focus();
  }, [selected]);
  const filtered = partners.filter(
    (partner) =>
      (!service || partner.services.includes(service as (typeof partnerServices)[number])) &&
      normalize(`${partner.name} ${partner.city} ${partner.departments.join(' ')}`).includes(
        normalize(query.trim()),
      ),
  );
  function downloadRequest() {
    if (!selected) return;
    const text = `DEMANDE DE CONSTAT — BROUILLON PREUVIX\n\nDestinataire : ${selected.name}\nVille de l’étude : ${selected.city}\nObjet : ${subject.trim() || 'Demande de constat et de devis'}\n\nBonjour,\nJe souhaite échanger sur la possibilité de faire constater les faits suivants :\n${context.trim() || '[Décrire les faits, le lieu, les dates et les conditions d’accès.]'}\n\nJe dispose d’un dossier Preuvix et peux vous transmettre les éléments utiles après échange. Merci de préciser les modalités, disponibilités et honoraires avant toute intervention.\n\nMes coordonnées : [à compléter]\n\nPièces à préparer : fichiers originaux, contexte et export du dossier.\nCe brouillon ne vaut ni réservation, ni acceptation de mission, ni certification. Aucun fichier n’a été transmis par Preuvix.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `demande-constat-${selected.id}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section id="commissaires" className="partner-directory" aria-labelledby="partners-title">
      <div className="partner-heading">
        <div>
          <span className="welcome-kicker">LE RÉSEAU PREUVIX</span>
          <h3 id="partners-title">
            Trouvez votre partenaire
            <br />
            <em>pour la suite de votre dossier.</em>
          </h3>
        </div>
        <span className="partner-count">Commissaires de justice</span>
      </div>
      <p>
        Recherchez une étude partenaire, consultez sa fiche et préparez votre demande de constat. Le
        professionnel examine votre situation avant de convenir d’une intervention.
      </p>
      <div className="partner-filters">
        <div>
          <label htmlFor="partner-location">Ville, département ou étude</label>
          <div className="partner-search">
            <Search size={17} />
            <input
              id="partner-location"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex. : Paris, 75, nom de l’étude"
            />
          </div>
        </div>
        <div>
          <label htmlFor="partner-service">Type de constat</label>
          <select
            id="partner-service"
            value={service}
            onChange={(event) => setService(event.target.value)}
          >
            <option value="">Tous les constats</option>
            {partnerServices.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
        {(query || service) && (
          <button
            className="partner-reset"
            onClick={() => {
              setQuery('');
              setService('');
            }}
          >
            Effacer les filtres
          </button>
        )}
      </div>
      <Suspense fallback={<p>Chargement de la carte…</p>}>
        <PartnerMap partners={filtered} onSelect={setSelected} />
      </Suspense>
      {loading ? (
        <p role="status">Chargement des partenaires…</p>
      ) : error ? (
        <div className="partner-empty" role="alert">
          <p>{error}</p>
          <button className="welcome-button subtle" onClick={() => setAttempt(attempt + 1)}>
            Réessayer le répertoire
          </button>
        </div>
      ) : (
        <>
          <p className="partner-results" role="status">
            {filtered.length} étude{filtered.length > 1 ? 's' : ''} partenaire
            {filtered.length > 1 ? 's' : ''}
            {query || service
              ? ' correspondant à votre recherche'
              : ' référencée' + (filtered.length > 1 ? 's' : '')}
          </p>
          {!filtered.length ? (
            <div className="partner-empty">
              <Scale size={28} />
              <h4>
                {partners.length
                  ? 'Aucune étude ne correspond à ces critères.'
                  : 'Notre réseau de partenaires se prépare.'}
              </h4>
              <p>
                {partners.length
                  ? 'Essayez une autre ville, un département ou un autre type de constat.'
                  : 'Aucun partenaire Preuvix n’est référencé pour le moment. Les études apparaîtront ici après confirmation de leur partenariat.'}
              </p>
            </div>
          ) : (
            <div className="partner-grid">
              {filtered.map((partner) => (
                <article className="partner-card" key={partner.id}>
                  <span className="partner-label">
                    <Scale size={15} /> Partenaire Preuvix
                  </span>
                  <h4>{partner.name}</h4>
                  <p className="partner-location">
                    <MapPin size={15} /> {partner.city} · Départements :{' '}
                    {partner.departments.join(', ')}
                  </p>
                  <p>{partner.description}</p>
                  <div className="partner-tags">
                    {partner.services.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <a href={partner.directoryUrl} target="_blank" rel="noopener noreferrer">
                    Fiche dans l’annuaire officiel <ArrowUpRight size={14} />
                  </a>
                  <button
                    className="welcome-button solid"
                    aria-label={`Préparer une demande pour ${partner.name}`}
                    onClick={() => setSelected(partner)}
                  >
                    Préparer une demande <ArrowUpRight size={16} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {selected && (
        <div
          className="partner-request"
          ref={requestRef}
          tabIndex={-1}
          aria-labelledby="partner-request-title"
        >
          <div className="partner-request-heading">
            <h4 id="partner-request-title">Votre demande à {selected.name}</h4>
            <button aria-label="Fermer la préparation" onClick={() => setSelected(null)}>
              <X size={20} />
            </button>
          </div>
          <p>
            Rédigez un brouillon, téléchargez-le, puis contactez l’étude. Vos saisies restent sur
            cette page et disparaissent en la quittant ; aucun dossier n’est envoyé automatiquement.
          </p>
          <label htmlFor="request-subject">Objet de la demande</label>
          <input
            id="request-subject"
            maxLength={160}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Ex. : constat avant travaux"
          />
          <label htmlFor="request-context">Faits à constater, lieu et dates utiles</label>
          <textarea
            id="request-context"
            rows={4}
            maxLength={3000}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Décrivez la situation et l’urgence éventuelle."
          />
          <div className="partner-request-actions">
            <button className="welcome-button solid" onClick={downloadRequest}>
              <ArrowDownToLine size={16} /> Télécharger ma demande
            </button>
            <a
              className="welcome-button subtle"
              href={selected.website}
              target="_blank"
              rel="noopener noreferrer"
            >
              Contacter l’étude sur son site <ArrowUpRight size={16} />
            </a>
          </div>
          <small>
            Honoraires sur devis auprès du professionnel. Un dossier Preuvix ne certifie pas, à lui
            seul, les faits représentés.
          </small>
        </div>
      )}
      <div className="partner-fallback">
        <span>Vous pouvez aussi consulter l’ensemble de la profession.</span>
        <a
          href="https://annuaire.commissaire-justice.fr/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ouvrir l’annuaire officiel <ArrowUpRight size={15} />
        </a>
      </div>
    </section>
  );
}
