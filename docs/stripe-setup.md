# Abonnement Stripe — 10,99 € par mois

L’intégration est prête dans le code, mais désactivée tant que les trois variables Stripe ne sont pas renseignées. Aucun compte Stripe, produit, prix ou paiement réel n’a été créé par cette modification.

## Configuration en mode test

1. Dans votre compte Stripe, activez le mode test et créez un produit **Preuvix Premium**, avec un prix fixe récurrent de **10,99 EUR chaque mois**, quantité 1. Le serveur refuse une autre devise, un autre montant ou une autre périodicité. Choisissez le traitement fiscal adapté à votre activité dans Stripe et vérifiez le total présenté avant commercialisation ; aucune taxe n’est calculée automatiquement par Preuvix.
2. Copiez son identifiant `price_…` et votre clé secrète de test dans `.env` (sur le serveur uniquement). N’utilisez jamais de variable `VITE_` pour une clé secrète et ne collez pas de clés dans une conversation.

   ```dotenv
   STRIPE_SECRET_KEY=sk_test_VOTRE_CLE
   STRIPE_PRICE_ID=price_VOTRE_PRIX
   STRIPE_WEBHOOK_SECRET=whsec_VOTRE_SECRET
   STRIPE_ALLOW_LIVE=false
   PREMIUM_STORAGE_MB=5000
   ```

   Ces valeurs sont des emplacements à remplacer, pas des identifiants utilisables. Le quota de 5 000 Mo est une limite logicielle : il ne fournit ni disque ni hébergement.

3. Pour les essais locaux, installez la CLI Stripe, puis exécutez `stripe login` et :

   ```sh
   stripe listen --forward-to localhost:3000/api/billing/webhook
   ```

   Utilisez le `whsec_…` fourni par cette commande. Pour une installation accessible en HTTPS, enregistrez plutôt l’URL `https://votre-domaine/api/billing/webhook` dans Stripe Workbench et utilisez le secret de cet endpoint.

4. Écoutez les événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` et `invoice.payment_failed` (événements snapshot pour le SDK Stripe installé).
5. Activez et configurez le portail client Stripe : affichage des factures, mise à jour du paiement et résiliation en fin de période. Désactivez le changement de prix/produit dans ce portail : cette version ne prend en charge qu’un seul tarif Premium mensuel.
6. Redémarrez Preuvix. Le tarif apparaît sur l’accueil ; connectez-vous puis ouvrez **Mon abonnement**. Le bouton **Tester l’abonnement Stripe** ouvre Checkout. Utilisez une carte de test Stripe, par exemple `4242 4242 4242 4242`, une date future et un CVC de test. Ne saisissez pas de carte réelle en mode test.
7. Après le retour, attendez le statut confirmé ou utilisez **Actualiser le statut**. Vérifiez la capacité de dépôt, le portail de gestion, une résiliation et un paiement en échec. Le paramètre `?billing=success` ne donne jamais accès à Premium à lui seul.

## Périmètre actuel

- Une installation privée correspond à un seul propriétaire et à un seul compte de facturation par mode Stripe. Il n’y a pas de comptes clients publics ni d’inscription multi-utilisateur.
- Premium augmente le quota de dépôt pendant que Stripe indique `active` ou `trialing` pour le prix configuré et l’installation concernée. `past_due`, `unpaid`, `paused` et les états terminés n’ouvrent pas la capacité Premium. Une résiliation en fin de période conserve l’accès tant que l’abonnement est actif.
- Les originaux et exports restent accessibles après déclassement. Si l’espace utilisé dépasse le quota gratuit, seuls les nouveaux dépôts sont bloqués : aucun fichier n’est supprimé automatiquement.
- Le quota est contrôlé sur le serveur. Le statut est rapproché de Stripe après notification signée, lors de l’ouverture/actualisation de la facturation et, si la dernière vérification date de plus de cinq minutes, au chargement de l’espace connecté ou avant un dépôt. En cas de panne Stripe, les tentatives automatiques sont espacées de cinq minutes. Un cache non vérifié depuis plus de 24 heures ne donne plus la capacité Premium ; aucune preuve n’est supprimée.
- Les événements sont dédupliqués après traitement réussi. L’état actuel est relu chez Stripe pour supporter des notifications en désordre. Les échecs transitoires renvoient 503 pour permettre une nouvelle livraison.
- Les sessions Checkout ouvertes sont réutilisées ; la création du client et des sessions utilise des clés d’idempotence. Un abonnement non terminé empêche une nouvelle souscription ; régularisez-le dans le portail.
- Ne changez pas de compte Stripe ou de prix sans prévoir une migration des abonnements existants. Conservez la base de données qui associe votre installation aux identifiants Stripe.
- Ce pilote exécute un seul processus serveur par base SQLite. Aucun déploiement Vercel n’est réalisé ici. Le stockage SQLite local actuel exige un disque persistant ; pour Vercel Functions, il faut d’abord déplacer la persistance vers des services adaptés, ou conserver ce serveur séparé et utiliser Vercel pour le frontend avec un routage cohérent.

## Activation réelle

Après validation complète en test, configurez un prix mensuel réel à 10,99 EUR, les clés et le secret webhook **du mode réel**, HTTPS, `COOKIE_SECURE=true`, et `STRIPE_ALLOW_LIVE=true`. Configurez également les informations commerciales, les conditions et la politique de confidentialité de l’exploitant avant de proposer le paiement au public. Le simple ajout d’une clé `sk_live_` ne suffit pas et fait échouer le démarrage sans ces paramètres techniques.

L’hébergement géré, les espaces partagés, les honoraires du commissaire de justice et l’horodatage externe ne sont pas inclus par cette intégration. Aucune preuve n’est envoyée à Stripe ; seuls les identifiants techniques de facturation y sont associés. Les données de carte sont saisies dans Stripe.

Références officielles : [Checkout et abonnements](https://docs.stripe.com/payments/checkout/build-subscriptions), [webhooks](https://docs.stripe.com/webhooks), [portail client](https://docs.stripe.com/customer-management/integrate-customer-portal), [SQLite sur Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
