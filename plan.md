# PREUVIX — Plan de développement

> **Vision :** permettre à n'importe qui de créer simplement une preuve numérique horodatée, intègre, vérifiable et exploitable dans un contexte juridique.

## 1. Définir précisément le produit

### Objectif

Créer une plateforme web extrêmement simple permettant de capturer et conserver un élément de preuve numérique tout en documentant son origine et son intégrité.

### Types de preuves envisagés

- Photo
- Vidéo
- Audio
- Capture réalisée depuis l'application
- Document
- Texte / déclaration
- À terme : capture de page web

### Parcours idéal

```text
Créer une preuve
      ↓
Choisir le type
      ↓
Capturer
      ↓
Collecter les métadonnées autorisées
      ↓
Calculer l'empreinte cryptographique
      ↓
Horodater
      ↓
Sceller / enregistrer
      ↓
Stocker
      ↓
Générer le certificat
      ↓
QR / lien de vérification
```

Objectif UX :

**moins de 60 secondes entre l'ouverture de PREUVIX et la création d'une preuve.**

---

# 2. Définir le cadre juridique

Avant de promettre qu'une preuve est « recevable », « certifiée » ou possède une certaine force probante, faire valider les formulations et le processus par un professionnel du droit.

Étudier notamment :

- Code civil — preuve électronique
- Article 1366 du Code civil
- Article 1367 du Code civil
- Règlement eIDAS / eIDAS 2
- Horodatage électronique
- Horodatage électronique qualifié
- Signature électronique
- Cachet électronique
- Conservation et intégrité des données
- RGPD
- Hébergement des données dans l'UE
- Politique de conservation
- Chaîne de traçabilité de la preuve

### Principe PREUVIX

PREUVIX ne doit pas simplement dire :

> « Faites-nous confiance. »

Le système doit permettre de **vérifier techniquement l'intégrité d'une preuve**.

---

# 3. Définir le MVP

Ne pas essayer de construire toute la plateforme immédiatement.

## MVP V1

Fonctionnalités essentielles :

- Création de compte
- Connexion
- Dashboard
- Création d'une preuve
- Capture photo
- Upload contrôlé si juridiquement pertinent
- Date et heure
- Géolocalisation avec consentement
- Métadonnées techniques
- Calcul SHA-256
- Horodatage
- Stockage sécurisé
- Journal d'événements
- Génération d'un certificat PDF
- QR code
- Page permettant de vérifier une preuve
- Téléchargement du certificat
- Historique des preuves

---

# 4. Concevoir l'identité PREUVIX

PREUVIX doit avoir sa propre identité et ne pas copier Smartpreuve.

## Positionnement

**PREUVIX**

> La preuve numérique, simplement.

Autres pistes de promesse :

> Créez une preuve vérifiable en quelques secondes.

> Capturez. Scellez. Prouvez.

> Vos preuves numériques, horodatées et vérifiables.

### Direction graphique

Style :

- LegalTech moderne
- Fintech
- Minimaliste
- Premium
- Très rassurant
- Mobile-first

Éviter l'apparence traditionnelle des sites juridiques.

---

# 5. Concevoir l'UX

## Landing page

```text
Navbar

Hero
"Créez une preuve numérique vérifiable en quelques secondes."

[Créer une preuve]

Comment ça marche ?

1. Capturez
2. PREUVIX horodate et protège l'intégrité
3. Obtenez votre certificat

Cas d'utilisation

Pourquoi PREUVIX ?

Sécurité / technologie

FAQ

Tarifs

Footer
```

## Application

```text
/dashboard

/preuves

/preuves/nouvelle

/preuves/[id]

/verification/[id]

/compte

/facturation
```

---

# 6. Concevoir le parcours « Créer une preuve »

Écran 1 :

```text
Que souhaitez-vous enregistrer ?

[ Photo ]

[ Vidéo ]

[ Audio ]

[ Document ]
```

Écran 2 :

Capture.

Écran 3 :

Informations contextuelles.

Exemple :

```text
Date
Heure
Localisation
Appareil
Type de fichier
Taille
Empreinte SHA-256
```

Écran 4 :

```text
Création de votre preuve...

✓ Fichier enregistré
✓ Empreinte calculée
✓ Horodatage effectué
✓ Intégrité enregistrée
✓ Certificat généré
```

Écran final :

```text
PREUVE CRÉÉE

ID : PRX-XXXXXXXX

✓ Intégrité vérifiable
✓ Horodatage enregistré
✓ Métadonnées enregistrées

[Voir le certificat]

[Télécharger]

[Partager]

[QR code]
```

---

# 7. Architecture technique

Stack envisagée :

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend

- Next.js API / serveur dédié si nécessaire
- PostgreSQL
- Supabase au démarrage

### Authentification

- Supabase Auth
ou
- Clerk

### Stockage

Stockage objet sécurisé avec région européenne.

Les fichiers originaux doivent être protégés contre les modifications.

### Paiements

Stripe.

### Emails

Resend ou équivalent.

---

# 8. Concevoir le modèle de données

Tables principales :

```text
users
proofs
proof_files
proof_metadata
proof_hashes
timestamps
audit_logs
certificates
verification_events
subscriptions
```

Exemple de `proof` :

```text
id
public_id
user_id
type
status
created_at
sealed_at
file_hash
timestamp_id
certificate_url
```

---

# 9. Intégrité cryptographique

Lorsqu'une preuve est créée :

```text
FICHIER ORIGINAL
      ↓
SHA-256
      ↓
EMPREINTE
      ↓
HORODATAGE
      ↓
ENREGISTREMENT
```

Exemple :

```text
photo.jpg

↓

SHA-256

↓

8F94B8F7A1...
```

Si un seul octet du fichier change, son empreinte change.

Cela permet à PREUVIX de vérifier ultérieurement si le fichier présenté correspond à celui enregistré.

---

# 10. Horodatage

Étudier l'intégration d'un prestataire d'horodatage conforme au cadre européen.

Architecture :

```text
SHA-256
   ↓
Prestataire d'horodatage
   ↓
Jeton d'horodatage
   ↓
PREUVIX
```

Conserver :

```text
hash
timestamp
timestamp_token
provider
algorithm
verification_status
```

---

# 11. Journal d'audit

Chaque action importante doit générer un événement.

Exemple :

```text
12:31:02 — preuve créée
12:31:03 — fichier reçu
12:31:03 — SHA-256 calculé
12:31:04 — géolocalisation enregistrée
12:31:05 — demande d'horodatage
12:31:06 — horodatage obtenu
12:31:07 — preuve scellée
12:31:08 — certificat généré
```

Le journal doit être conçu pour rendre les modifications détectables et préserver une chaîne de traçabilité.

---

# 12. Certificat PREUVIX

Générer automatiquement un PDF.

Contenu envisagé :

```text
PREUVIX

CERTIFICAT DE PREUVE NUMÉRIQUE

Identifiant
PRX-XXXXXXXX

Création
27 septembre 2026 — 14:32:05

Type
Photographie

SHA-256
8F94B8F7A1...

Horodatage
...

Localisation
...

Informations techniques
...

Chronologie
...

QR CODE

Vérifier cette preuve :
PREUVIX / verification / XXXXX
```

Le certificat doit expliquer précisément **ce qui est attesté techniquement et ce qui ne l'est pas**.

---

# 13. Vérification publique

Créer :

```text
/verification/PRX-XXXXXXXX
```

Le QR code du certificat mène vers cette page.

Elle peut afficher :

```text
PREUVIX

✓ PREUVE TROUVÉE

Identifiant
PRX-XXXXXXXX

✓ Empreinte enregistrée
✓ Horodatage vérifié
✓ Intégrité vérifiée

Créée le
...

SHA-256
...
```

Éviter d'exposer publiquement le contenu sensible de la preuve.

---

# 14. Sécurité

La sécurité fait partie du produit.

Prévoir :

- HTTPS
- chiffrement au repos
- chiffrement en transit
- URLs de téléchargement temporaires
- contrôle d'accès
- séparation données publiques / privées
- logs de sécurité
- rate limiting
- protection anti-bot
- sauvegardes
- MFA
- gestion sécurisée des secrets
- suppression contrôlée des données
- monitoring

Ne jamais permettre à une modification silencieuse d'un fichier original de passer inaperçue.

---

# 15. RGPD

Prévoir dès le MVP :

```text
Consentement
Politique de confidentialité
CGU
Gestion des données personnelles
Durée de conservation
Export des données
Suppression lorsque juridiquement applicable
Sous-traitants
Localisation des données
```

Attention particulière aux photos, vidéos, données de localisation et documents pouvant contenir des données personnelles de tiers.

---

# 16. Business model

Commencer simplement.

### Gratuit

```text
1 ou quelques preuves
Certificat basique
```

### PREUVIX Plus

```text
9,90 € / mois

preuves supplémentaires
stockage
certificats
historique
```

### Paiement à l'acte

Exemple :

```text
Preuve certifiée / horodatée
4,90 €
```

Les prix seront validés après tests utilisateurs et calcul du coût réel de stockage, d'horodatage et de paiement.

---

# 17. Version professionnelle

Après validation du marché :

```text
PREUVIX PRO
```

Pour :

- avocats
- entreprises
- assurances
- immobilier
- artisans
- experts
- gestionnaires immobiliers
- professionnels du bâtiment

Fonctionnalités :

```text
équipes
dossiers
API
exports
gestion des utilisateurs
permissions
facturation entreprise
preuves en volume
```

---

# 18. Intégration juridique avancée

V2/V3 :

Créer un réseau ou des intégrations avec des professionnels du droit.

Exemple :

```text
PREUVIX

Preuve numérique
      ↓
Demander une intervention
      ↓
Professionnel compétent
      ↓
Traitement du dossier
```

Cela doit rester clairement distinct du certificat technique PREUVIX.

---

# 19. Ordre de développement dans Cursor

## Sprint 1 — Fondation

```text
Créer Next.js
Configurer TypeScript
Configurer Tailwind
Installer shadcn/ui
Créer design system
Créer layout
Créer navbar
Créer landing page
```

## Sprint 2 — Auth

```text
Supabase
Signup
Login
Logout
Reset password
Protection routes
```

## Sprint 3 — Dashboard

```text
Dashboard
Liste des preuves
Empty states
Navigation
```

## Sprint 4 — Création d'une preuve

```text
Nouvelle preuve
Capture
Upload
Métadonnées
Géolocalisation
```

## Sprint 5 — Moteur de preuve

```text
SHA-256
Stockage
Audit log
Horodatage
Scellement
```

## Sprint 6 — Certificat

```text
Génération PDF
QR code
Identifiant public
Téléchargement
```

## Sprint 7 — Vérification

```text
/verification/[id]

Recherche preuve
Validation hash
Validation horodatage
Affichage résultat
```

## Sprint 8 — Paiement

```text
Stripe
Plans
Checkout
Webhooks
Factures
Limites d'utilisation
```

## Sprint 9 — Sécurité

```text
Permissions
RLS
Rate limiting
Audit sécurité
Backups
Monitoring
```

## Sprint 10 — Production

```text
Tests
SEO
Analytics
Emails
Mentions légales
CGU
Confidentialité
Monitoring
Déploiement
```

---

# 20. Tests indispensables

Tester notamment :

```text
Création de compte
Capture mobile
Refus géolocalisation
Perte de connexion
Très gros fichier
Fichier corrompu
Modification d'une preuve
Hash différent
Horodatage indisponible
Double création
Accès non autorisé
QR invalide
Certificat supprimé
Tentative de modification API
```

Créer également des tests automatiques sur toute la chaîne :

```text
capture
→ hash
→ stockage
→ horodatage
→ audit
→ certificat
→ vérification
```

---

# 21. Avant lancement

### Produit

- [ ] Landing terminée
- [ ] Auth terminée
- [ ] Capture fonctionnelle
- [ ] Hash fonctionnel
- [ ] Horodatage fonctionnel
- [ ] Stockage sécurisé
- [ ] Certificat PDF
- [ ] QR code
- [ ] Vérification publique
- [ ] Paiement

### Sécurité

- [ ] Audit permissions
- [ ] RLS
- [ ] Rate limiting
- [ ] Logs
- [ ] Backups
- [ ] Monitoring

### Juridique

- [ ] Validation du parcours probatoire
- [ ] Validation des affirmations marketing
- [ ] CGU
- [ ] Politique de confidentialité
- [ ] Mentions légales
- [ ] RGPD
- [ ] Politique de conservation

---

# 22. Roadmap

```text
PHASE 1
Landing + identité PREUVIX

↓

PHASE 2
Application + authentification

↓

PHASE 3
Capture de preuve

↓

PHASE 4
Hash + stockage + audit

↓

PHASE 5
Horodatage

↓

PHASE 6
Certificat PDF + QR

↓

PHASE 7
Vérification publique

↓

PHASE 8
Paiement

↓

PHASE 9
Sécurité + conformité

↓

PHASE 10
Beta privée

↓

PHASE 11
Retours utilisateurs

↓

PHASE 12
Lancement PREUVIX
```

# Principe directeur

À chaque décision de développement, se poser trois questions :

**1. Est-ce simple pour l'utilisateur ?**

**2. Est-ce techniquement vérifiable ?**

**3. Pourra-t-on expliquer précisément comment cette preuve a été créée et conservée plusieurs années plus tard ?**

Si la réponse à l'une de ces questions est non, la fonctionnalité doit être repensée.