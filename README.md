# Suivi Machines — Centre Galilée

Tableau de bord de suivi des pannes machine et des Work Orders, pensé pour être
étendu à d'autres centres par la suite.

- **Onglet Registre Pannes** : deux sous-onglets (RX4010518, RX4010562). Chaque
  ligne = une panne (date, heure de début, heure de fin, erreur rencontrée
  choisie dans une liste éditable, commentaire libre).
- **Onglet Work Order** : six sous-onglets (RX4010518, RX4010562, RayStation,
  Siemens Go.Sim, IMDS, Mosaiq). Chaque ligne = un Work Order avec statut,
  statut du WO, numéro de WO, date d'intervention, rapport reçu (oui/non) et
  commentaires. Le bouton **+** en bout de ligne ouvre une fenêtre pour :
  - cocher « résolu lors d'une maintenance préventive » + une date,
  - ajouter une ou plusieurs périodes d'immobilisation machine (date/heure de
    début et de fin).
- **Onglet Liste des pannes** : gestion manuelle de la liste des erreurs
  utilisée dans le Registre Pannes (ajout, désactivation, suppression).

Stack : React + Vite, Supabase (Postgres) comme base de données, déploiement
Vercel. Accès protégé par un mot de passe simple (pas de comptes utilisateurs).

---

## 1. Créer le projet Supabase

1. Sur [supabase.com](https://supabase.com), créez un nouveau projet (le plan
   gratuit suffit largement pour ce volume de données).
2. Une fois le projet créé, allez dans **SQL Editor** et exécutez, **dans
   l'ordre**, le contenu des trois fichiers du dossier `supabase/` :
   1. `01_schema.sql` — crée toutes les tables, contraintes et policies.
   2. `02_seed_centres_machines.sql` — crée le centre « Centre Galilée », les
      deux machines et les six équipements du Work Order.
   3. `03_seed_panne_types.sql` — importe la liste de pannes fournie (générée
      à partir de votre fichier `liste_panne.txt`).
3. Allez dans **Project Settings > API** et notez :
   - `Project URL` → variable `VITE_SUPABASE_URL`
   - `anon public` key → variable `VITE_SUPABASE_ANON_KEY`

> Remarque sécurité : les policies RLS créées ouvrent l'accès en lecture/
> écriture via la clé `anon`, car l'application n'utilise pas l'authentification
> Supabase (juste un mot de passe applicatif, cf. plus bas). N'y stockez pas de
> données patient nominatives. Si vous voulez un jour restreindre l'accès par
> utilisateur, on pourra basculer vers l'auth Supabase et des policies liées à
> `auth.uid()`.

## 2. Mettre le code sur GitHub

Depuis ce dossier :

```bash
git init
git add .
git commit -m "Initial commit — suivi machines Centre Galilée"
git branch -M main
git remote add origin https://github.com/<votre-compte>/<votre-repo>.git
git push -u origin main
```

(Créez d'abord le dépôt vide sur GitHub si ce n'est pas déjà fait, sans README
ni .gitignore pour éviter les conflits.)

## 3. Déployer sur Vercel

1. Sur [vercel.com](https://vercel.com), **Add New… > Project**, puis
   importez le dépôt GitHub que vous venez de créer.
2. Vercel détecte automatiquement Vite (`Build Command: vite build`,
   `Output Directory: dist`) — rien à changer.
3. Dans **Environment Variables**, ajoutez :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_PASSWORD` (le mot de passe que votre équipe utilisera pour
     accéder à l'outil)
4. Déployez. Vercel vous donne une URL type `votre-projet.vercel.app`,
   accessible depuis n'importe quel appareil.

## 4. Développement local

```bash
cp .env.example .env.local   # puis renseignez vos propres valeurs
npm install
npm run dev
```

## 5. Ajouter un futur centre

La table `centers` et les colonnes `center_id` sur `machines` et
`wo_equipments` sont prévues pour ça. Pour ajouter un centre :

1. `insert into centers (code, name) values ('bourgogne', 'Centre Bourgogne');`
2. Ajoutez ses machines dans `machines` et ses équipements Work Order dans
   `wo_equipments`, en réutilisant le modèle de `02_seed_centres_machines.sql`.
3. Le code actuel n'affiche que `CENTER_CODE = "galilee"` (défini dans
   `src/lib/supabaseClient.js`) — il faudra ajouter un sélecteur de centre dans
   l'interface pour basculer entre centres. Dites-moi quand vous voulez cette
   étape, je l'ajoute.

## 6. Mettre à jour la liste des pannes plus tard

Deux options :
- Directement dans l'appli, onglet **Liste des pannes** (ajout, désactivation,
  suppression) — c'est le chemin normal au quotidien.
- En bloc : modifiez `supabase/liste_panne_source.txt` puis relancez
  `node supabase/parse_pannes.mjs` dans ce dossier pour régénérer
  `03_seed_panne_types.sql`, à exécuter ensuite dans le SQL Editor Supabase.

## Structure du projet

```
machine-dashboard/
├── src/
│   ├── App.jsx                     shell + onglets principaux
│   ├── components/
│   │   ├── PasswordGate.jsx        écran de mot de passe
│   │   ├── RegistrePannes.jsx       onglet Registre Pannes
│   │   ├── WorkOrders.jsx           onglet Work Order
│   │   ├── DowntimeModal.jsx        immobilisations + maintenance préventive
│   │   ├── PanneTypesManager.jsx    onglet Liste des pannes
│   │   └── ui.jsx                   composants partagés (onglets, badges)
│   └── lib/supabaseClient.js
├── supabase/
│   ├── 01_schema.sql
│   ├── 02_seed_centres_machines.sql
│   ├── 03_seed_panne_types.sql
│   ├── liste_panne_source.txt
│   └── parse_pannes.mjs
└── .env.example
```
