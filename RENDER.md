# Démarrer l’API sur Render

- Build Command : `npm ci --include=dev && npm run build`
- Start Command : `npm run start:prod` (`npm run start` reste compatible).
- Health Check Path : `/api/v1/health`
- Définir `DATABASE_URL` avec la base PostgreSQL voulue et `NODE_ENV=production`.
- Définir `FRONTEND_URL` et les identifiants Google avec les URLs de production. Ne pas copier les secrets dans Git.
- Régler `DATABASE_SSL` selon la connexion PostgreSQL utilisée.
- Laisser Render fournir `PORT` ; l’application écoute automatiquement sur `0.0.0.0` lorsque `RENDER=true`.
- Choisir `SEED_DEMO=false` pour une vraie boutique, ou `true` pour initialiser les produits de démonstration uniquement si le catalogue est vide.

Le démarrage PostgreSQL applique les migrations versionnées en attente avant tout accès aux tables. Une base vide reçoit donc notamment `products`, `users`, `messages` et la table de suivi des migrations. Les migrations déjà appliquées ne sont pas rejouées. Les données existantes ne sont pas réinitialisées ; la synchronisation automatique reste désactivée.

Vérification locale : `npm run test:postgres` crée une base temporaire distincte sur le PostgreSQL local, démarre Nest, contrôle les migrations, le seed et `/api/v1/health`, puis vérifie un second démarrage et supprime uniquement sa base temporaire. Ce test refuse les serveurs PostgreSQL distants.

L’erreur `relation "products" does not exist` interrompait Nest avant l’ouverture du port HTTP. L’absence de port signalée par Render était donc d’abord une conséquence de cet arrêt. Le binding réseau est également adapté à Render.

Si plusieurs instances démarrent simultanément, exécuter les migrations dans une étape de pré-déploiement unique avant leur démarrage. Une base déjà remplie créée sans historique de migrations demande une vérification spécifique : ne pas effacer ses tables pour faire disparaître une erreur.
