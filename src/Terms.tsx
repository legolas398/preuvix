const sections = [
  [
    'Objet et accès',
    'Preuvix permet de conserver des photos, de documenter leur intégrité et de partager un dossier vérifiable. Cette installation pilote est accessible au propriétaire disposant du mot de passe. Les liens de vérification activés peuvent être consultés par leurs destinataires. Protégez vos identifiants et communiquez vos liens uniquement aux personnes concernées.',
  ],
  [
    'Vos fichiers et vos obligations',
    'Vous restez titulaire de vos droits sur vos contenus. Déposez uniquement des éléments que vous êtes autorisé à détenir et à utiliser. Respectez la vie privée, le droit à l’image, les droits de propriété intellectuelle et les règles applicables à la collecte de preuves. Ne présentez pas un contenu modifié comme un original ; décrivez les faits et leur contexte avec exactitude.',
  ],
  [
    'Portée du dossier et de l’horodatage',
    'Une empreinte permet de comparer les octets de fichiers. Elle ne prouve ni la véracité de la scène, ni l’identité de son auteur, ni la date de prise de vue. L’horodatage indépendant dépend de la configuration et de la réponse du prestataire ; le statut affiché indique le résultat technique. Preuvix ne garantit ni l’admissibilité en justice, ni l’issue d’un litige. Les démonstrations sont des simulations.',
  ],
  [
    'Free, Premium et commissaire de justice',
    'Ce prototype privé permet de conserver, vérifier et exporter des dossiers. La préparation Premium est une offre en préparation, accessible uniquement avec un statut de test activé côté serveur. Aucun paiement ni envoi professionnel n’est activé. Les éventuels honoraires du commissaire sont distincts de l’option PREUVIX et se conviennent directement avec lui. Aucun constat automatique, acceptation de mission ou garantie juridique n’est promis.',
  ],
  [
    'Données personnelles et partage',
    'Les fichiers déposés, leur contexte et leurs métadonnées sont enregistrés sur le serveur de cette installation. La comparaison locale d’une copie se déroule dans le navigateur sans envoi de ce fichier. Vérifiez les informations de vérification avant de diffuser un lien ; un export contient l’original et ses éventuelles métadonnées personnelles. Si un service d’horodatage est configuré, l’empreinte du manifeste lui est transmise. La facturation est désactivée dans ce prototype. Les liens de préparation donnent accès uniquement aux éléments confirmés ; leur porteur n’est pas authentifié par son nom.',
  ],
  [
    'Conservation, export et suppression',
    'Vous pouvez exporter et supprimer vos dossiers depuis votre espace. Conservez une copie indépendante des originaux et des exports utiles avant toute suppression. L’exploitant doit préciser la durée de conservation, les modalités des sauvegardes et leur effacement ; aucune durée universelle n’est promise pour toutes les installations. La suppression dans Preuvix ne retire pas les copies déjà téléchargées par des tiers.',
  ],
  [
    'Cookies, préférences et droits',
    'Un cookie de session permet l’authentification, avec une durée maximale configurée de douze heures. Le thème et le choix d’animation sont mémorisés localement dans votre navigateur. Les droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité s’exercent selon leurs conditions légales auprès du responsable du traitement. Une réclamation peut être adressée à la CNIL. Les coordonnées du responsable, finalités, bases légales, destinataires et durées propres à cette installation doivent figurer dans une notice de confidentialité complétée par l’exploitant.',
  ],
  [
    'Disponibilité et évolution',
    'La version pilote peut connaître des interruptions, des limites de stockage ou des évolutions. Les références juridiques sont des repères généraux et ne remplacent pas un conseil adapté à votre situation. Les responsabilités demeurent régies par les règles applicables ; aucune disposition de ce document ne vise à écarter un droit impératif. Toute offre payante future devra présenter ses propres conditions avant souscription.',
  ],
];

export default function Terms() {
  return (
    <section className="welcome-section terms-section" id="cgu" aria-labelledby="terms-title">
      <div className="section-heading">
        <div>
          <span className="welcome-kicker">TRANSPARENCE & CONDITIONS D’UTILISATION</span>
          <h2 id="terms-title">
            Conditions générales
            <br />
            <em>d’utilisation.</em>
          </h2>
        </div>
        <p>
          Version du 30 septembre 2026
          <br />
          Projet pour l’installation pilote.
        </p>
      </div>
      <div className="terms-status">
        <strong>Informations de l’exploitant à compléter</strong>
        <p>
          Identité ou raison sociale, adresse, contact et hébergeur : non renseignés. Ce projet de
          CGU doit être adapté à l’exploitant et revu avant une ouverture publique ou commerciale.
        </p>
      </div>
      <div className="terms-accordion">
        {sections.map(([title, text], index) => (
          <details key={title}>
            <summary>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {title}
            </summary>
            <p>{text}</p>
          </details>
        ))}
      </div>
      <p className="terms-source">
        Pour comprendre vos droits :{' '}
        <a
          href="https://www.cnil.fr/fr/passer-laction/les-droits-des-personnes-sur-leurs-donnees"
          target="_blank"
          rel="noopener noreferrer"
        >
          informations officielles de la CNIL
        </a>
        . Les références sur la preuve sont consultables dans <a href="#droits">Vos droits</a>.
      </p>
    </section>
  );
}
