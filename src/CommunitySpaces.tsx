import { useEffect, useState, type ComponentType } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Gavel,
  HeartHandshake,
  Mail,
  MapPin,
  Microscope,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { z } from 'zod';
import {
  communityResponseSchema,
  type CommunityMember,
  type CommunitySpace,
} from '../shared/community';
import { partnerSchema } from '../shared/partners';
import './community.css';

type SpaceId = 'commissaires' | CommunitySpace;
const spaces: {
  id: SpaceId;
  title: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  summary: string;
  helps: string[];
  check: string;
}[] = [
  {
    id: 'commissaires',
    title: 'Commissaires de justice',
    icon: Scale,
    summary: 'Faire constater une situation par un officier public et ministériel.',
    helps: [
      'Constat immobilier, internet ou de travaux',
      'Devis et modalités avant toute intervention',
      'Procès-verbal des faits personnellement observés',
    ],
    check: 'Chaque étude renvoie vers sa fiche dans l’annuaire officiel de la profession.',
  },
  {
    id: 'avocats',
    title: 'Avocats',
    icon: Gavel,
    summary: 'Être conseillé sur vos droits, votre stratégie de preuve et la procédure.',
    helps: [
      'Analyse de votre situation',
      'Choix et présentation des preuves',
      'Assistance et représentation en justice',
    ],
    check: 'Vérifiez l’inscription au barreau dans l’annuaire national des avocats.',
  },
  {
    id: 'associations',
    title: 'Associations d’aide',
    icon: HeartHandshake,
    summary:
      'Être accompagné, souvent gratuitement : victimes, logement, consommation, accès au droit.',
    helps: [
      'Écoute et orientation',
      'Aide pour rassembler et organiser les faits',
      'Mise en relation avec les bons interlocuteurs',
    ],
    check: 'Aide aux victimes : 116 006, numéro national gratuit.',
  },
  {
    id: 'experts',
    title: 'Experts',
    icon: Microscope,
    summary: 'Faire analyser techniquement un média, un bâtiment ou un dommage.',
    helps: [
      'Expertise amiable ou judiciaire',
      'Analyse d’un fichier, de ses métadonnées et de son contexte',
      'Rapport technique argumenté',
    ],
    check: 'Les experts judiciaires sont inscrits sur les listes des cours d’appel.',
  },
];

export default function CommunitySpaces() {
  const [selected, setSelected] = useState<SpaceId>('commissaires');
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [commissaires, setCommissaires] = useState(0);
  const [contact, setContact] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error();
      return response.json();
    };
    Promise.all([load('/api/community'), load('/api/partners')])
      .then(([community, partners]) => {
        const parsed = communityResponseSchema.parse(community);
        setMembers(parsed.members);
        setContact(parsed.contact);
        setCommissaires(
          z.object({ partners: z.array(partnerSchema) }).parse(partners).partners.length,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  const space = spaces.find((item) => item.id === selected)!;
  const count = (id: SpaceId) =>
    id === 'commissaires' ? commissaires : members.filter((m) => m.space === id).length;
  const listed = members.filter((member) => member.space === selected);
  const Icon = space.icon;
  return (
    <section className="welcome-section community-section" id="communaute">
      <div className="section-heading">
        <div>
          <span className="welcome-kicker">04 / LA COMMUNAUTÉ PREUVIX</span>
          <h2>
            Vous n’êtes pas seul.
            <br />
            <em>Des partenaires pour la suite.</em>
          </h2>
        </div>
        <p>
          Quatre espaces réunissent les professionnels et les associations qui peuvent vous aider à
          faire valoir vos preuves. Seuls les partenaires confirmés y figurent.
        </p>
      </div>
      <div className="community-tabs" role="group" aria-label="Espaces de la communauté">
        {spaces.map(({ id, title, icon: TabIcon }) => (
          <button key={id} aria-pressed={id === selected} onClick={() => setSelected(id)}>
            <TabIcon size={22} strokeWidth={1.5} />
            <span>{title}</span>
            <small>
              {error
                ? 'Indisponible'
                : count(id)
                  ? `${count(id)} partenaire${count(id) > 1 ? 's' : ''}`
                  : 'Espace ouvert'}
            </small>
          </button>
        ))}
      </div>
      <article
        className="community-panel"
        aria-live="polite"
        aria-labelledby="community-space-title"
      >
        <div className="community-panel-intro">
          <Icon size={34} strokeWidth={1.3} />
          <h3 id="community-space-title">{space.title}</h3>
          <p>{space.summary}</p>
          <ul>
            {space.helps.map((help) => (
              <li key={help}>{help}</li>
            ))}
          </ul>
          <p className="community-check">
            <ShieldCheck size={15} /> {space.check}
          </p>
        </div>
        <div className="community-members">
          {selected === 'commissaires' ? (
            <div className="community-empty">
              <strong>
                {commissaires
                  ? `${commissaires} étude${commissaires > 1 ? 's' : ''} partenaire${commissaires > 1 ? 's' : ''}`
                  : 'Réseau en construction'}
              </strong>
              <p>
                Recherchez une étude par ville ou département, sur la carte ou dans l’annuaire
                officiel, et préparez votre demande de constat.
              </p>
              <a className="welcome-button solid" href="#commissaires">
                Voir le réseau des commissaires <ArrowRight size={16} />
              </a>
            </div>
          ) : error ? (
            <div className="community-empty">
              <p>Cet espace est momentanément indisponible. Réessayez plus tard.</p>
            </div>
          ) : listed.length ? (
            listed.map((member) => (
              <div className="community-card" key={member.id}>
                <h4>{member.name}</h4>
                <span className="community-area">
                  <MapPin size={13} /> {member.area}
                </span>
                <p>{member.description}</p>
                {member.topics.length > 0 && (
                  <div className="community-topics">
                    {member.topics.map((topic) => (
                      <span key={topic}>{topic}</span>
                    ))}
                  </div>
                )}
                <div className="community-links">
                  <a href={member.website} target="_blank" rel="noopener noreferrer">
                    Site du partenaire <ArrowUpRight size={13} />
                  </a>
                  {member.verificationUrl && (
                    <a href={member.verificationUrl} target="_blank" rel="noopener noreferrer">
                      Vérifier son inscription <ArrowUpRight size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="community-empty">
              <strong>Espace en construction</strong>
              <p>
                Aucun partenaire confirmé pour le moment. Les premières fiches apparaîtront ici
                après vérification de leur inscription et de leur accord.
              </p>
            </div>
          )}
        </div>
      </article>
      <div className="community-join">
        <div>
          <strong>Vous êtes professionnel ou association ?</strong>
          <p>
            Rejoignez l’espace qui vous correspond. Chaque fiche est publiée après vérification de
            votre inscription et de votre accord sur son contenu.
          </p>
        </div>
        {contact ? (
          <a
            className="welcome-button subtle"
            href={`mailto:${contact}?subject=${encodeURIComponent(`Devenir partenaire Preuvix — ${space.title}`)}`}
          >
            <Mail size={16} /> Devenir partenaire
          </a>
        ) : (
          <span className="community-soon">Candidatures bientôt ouvertes</span>
        )}
      </div>
      <p className="community-boundary">
        Aucune transmission automatique de dossier ni réservation. Chaque professionnel reste seul
        responsable de ses conseils, constats et honoraires.
      </p>
    </section>
  );
}
