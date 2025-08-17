# GEO-Tresor-UNIFIER

Version unifiée de l'application GEO-Tresor

---

## Table des matières

- [Présentation](#présentation)
- [Architecture du projet](#architecture-du-projet)
- [Installation rapide](#installation-rapide)
- [Backend](#backend)
- [Frontend](#frontend)
- [Docker & restauration Mayan EDMS](#docker--restauration-mayan-edms)
- [Notes et support](#notes-et-support)

---

## Présentation

GEO-Tresor-UNIFIER est une version consolidée de l'application GEO-Tresor, intégrant un backend Node.js/TypeScript, un frontend React/Vite, et la gestion documentaire Mayan EDMS via Docker.

---

## Architecture du projet

```text
GEO-Tresor-UNIFIER/
├── backend/           # API, scripts et services Node.js/TypeScript
├── frontend/          # Application React + Vite
├── Docker-Services/   # Sauvegardes, volumes et scripts Docker pour Mayan EDMS
├── ...                # Autres fichiers et configurations
```

---

## Installation rapide

### 1. Cloner le dépôt

```bash
git clone https://github.com/<votre-utilisateur>/GEO-Tresor-UNIFIER.git
cd GEO-Tresor-UNIFIER
```

### 2. Installer le backend

```bash
cd backend
pnpm install
```

Configurer les variables d'environnement et accès API si nécessaire.

Pour lancer le serveur :

```bash
pnpm start
```

Pour le développement TypeScript :

```bash
pnpm run dev
```

### 3. Installer le frontend

```bash
cd ../frontend
pnpm install
```

Pour lancer le serveur de développement :

```bash
pnpm run dev
```

Pour construire l'application en production :

```bash
pnpm run build
```

Pour vérifier la qualité du code :

```bash
pnpm run lint
```

---

## Backend

- Scripts de vérification (`checker.js`, `checker2.js`)
- Serveur principal (`server.js`, `server.ts`)
- Spécification OpenAPI (`mayan-openapi.json`)
- Endpoints et documentation (`endpts.txt`, `urls used by mayan edms.txt`)
- Tests unitaires et d'intégration à placer dans `src/` ou des fichiers dédiés

---

## Frontend

- Application React + TypeScript + Vite
- Composants réutilisables dans `src/components/`
- Services d'accès à l'API et S3 dans `services/`
- Fichiers statiques dans `public/`
- Configuration ESLint et TypeScript

---

## Docker & restauration Mayan EDMS

Ce projet inclut un guide complet pour restaurer l'application Mayan EDMS et ses données via Docker.

### Étapes principales

1. Créer les volumes Docker nécessaires :

   ```bash
   docker volume create mayan_mayan-redis-1
   docker volume create mayan_mayan-postgresql-1
   docker volume create mayan_mayan-app-1
   docker volume create mayan_mayan-rabbitmq-1
   ```

2. Restaurer les données sauvegardées dans chaque volume (voir `Docker-Services/README.md` pour les commandes exactes).

3. Démarrer l'application avec :

   ```bash
   docker-compose up -d
   ```

4. Vérifier le fonctionnement via les logs et l'accès à `http://localhost:80`.

5. Nettoyer les volumes après test si besoin.

---

## Notes et support

- Vérifiez que vos fichiers de configuration (`docker-compose.yml`, variables d'environnement, etc.) sont adaptés à votre environnement.
- Consultez les logs des conteneurs pour le dépannage.
- Pour toute assistance supplémentaire, n'hésitez pas à demander !
