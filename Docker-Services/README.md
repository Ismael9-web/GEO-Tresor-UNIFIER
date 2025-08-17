# Guide de restauration Docker pour Mayan EDMS

Ce guide explique comment restaurer et tester l'application Mayan EDMS avec Docker après avoir cloné le dépôt. Il couvre la restauration des données, le démarrage des services et la vérification de l'installation.

---

## 1. Cloner le dépôt

Clonez le dépôt sur votre machine locale :

```bash
git clone https://github.com/<votre-utilisateur>/mayan-export.git
cd mayan-export
```

---

## 2. Recréer les volumes Docker

Créez les volumes Docker nécessaires pour les données sauvegardées :

```bash
docker volume create mayan_mayan-redis-1
docker volume create mayan_mayan-postgresql-1
docker volume create mayan_mayan-app-1
docker volume create mayan_mayan-rabbitmq-1
```

---

## 3. Restaurer les données sauvegardées

Copiez les données de sauvegarde du dépôt dans les volumes nouvellement créés.

### Données Redis

```bash
docker run --rm \
  -v mayan_mayan-redis-1:/data \
  -v $(pwd)/mayan-backup/redis:/backup \
  alpine sh -c "cp -r /backup/. /data/"
```

### Données PostgreSQL

```bash
docker run --rm \
  -v mayan_mayan-postgresql-1:/var/lib/postgresql/data \
  -v $(pwd)/mayan-backup/postgresql:/backup \
  alpine sh -c "cp -r /backup/. /var/lib/postgresql/data/"
```

### Données médias Mayan

```bash
docker run --rm \
  -v mayan_mayan-app-1:/var/lib/mayan \
  -v $(pwd)/mayan-backup/media:/backup \
  alpine sh -c "cp -r /backup/. /var/lib/mayan/"
```

### Données RabbitMQ

```bash
docker run --rm \
  -v mayan_mayan-rabbitmq-1:/var/lib/rabbitmq \
  -v $(pwd)/mayan-backup/rabbitmq:/backup \
  alpine sh -c "cp -r /backup/. /var/lib/rabbitmq/"
```

---

## 4. Démarrer l'application

Démarrez l'application et ses services avec Docker Compose :

```bash
docker-compose up -d
```

Cela lance Mayan EDMS et ses dépendances (Redis, PostgreSQL, RabbitMQ).

---

## 5. Vérifier l'application

Après le démarrage des conteneurs :

1. **Vérifier les logs** :

   ```bash
   docker-compose logs -f
   ```

2. **Accéder à l'application** :

   Ouvrez votre navigateur et allez sur :

   ```text
   http://localhost:80
   ```

3. **Connexion** :

   Utilisez les identifiants administrateur (voir les variables d'environnement dans `docker-compose.yml`).

---

## 6. Nettoyer après les tests

Pour arrêter et supprimer l'application :

```bash
docker-compose down
```

Pour supprimer les volumes :

```bash
docker volume rm mayan_mayan-redis-1 mayan_mayan-postgresql-1 mayan_mayan-app-1 mayan_mayan-rabbitmq-1
```

---

## Notes

- Vérifiez que votre fichier `docker-compose.yml` correspond à la configuration de la sauvegarde.
- Pour le dépannage, consultez les logs des conteneurs individuellement.

---

Pour toute assistance supplémentaire, n'hésitez pas à demander !
