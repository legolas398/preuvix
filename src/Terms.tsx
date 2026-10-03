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
    'L’application Free est gratuite sur votre installation. Premium est proposé à 10,99 € par mois en euros, lorsque la facturation est activée ; le montant, les taxes applicables et les conditions sont présentés dans Stripe avant confirmation. Le mode test ne donne lieu à aucun encaissement réel. L’abonnement porte sur la capacité logicielle de dépôt de cette installation, sans fourniture d’hébergement ni de disque. Il est renouvelé mensuellement tant qu’il n’est pas résilié selon les modalités proposées dans le portail Stripe. Les frais d’hébergement, d’horodatage externe et de constat professionnel restent distincts. Le lien vers l’annuaire est accessible à tous ; toute mission de constat se convient directement avec le professionnel, selon son devis. Preuvix ne réserve ni ne transmet automatiquement votre dossier.',
  ],
  [
    'Données personnelles et partage',
    'Les fichiers déposés, leur contexte et leurs métadonnées sont enregistrés sur le serveur de cette installation. La comparaison locale d’une copie se déroule dans le navigateur sans envoi de ce fichier. Vérifiez les informations de vérification avant de diffuser un lien ; un export contient l’original et ses éventuelles métadonnées personnelles. Si un service d’horodatage est configuré, l’empreinte du manifeste lui est transmise. La facturation communique un identifiant d’installation à Stripe et conserve des identifiants de client et d’état d’abonnement. Les données de paiement sont saisies chez Stripe ; les fichiers de preuve ne lui sont pas transmis.',
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
