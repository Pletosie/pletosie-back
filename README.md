# Pletosie — version locale de développement

Le front Next.js et l’API NestJS sont dans leurs dossiers existants. Les données locales sont persistantes dans `pletosie-back/work/pletosie.sqlite` (SQL.js / SQLite). La configuration de production utilise PostgreSQL et des migrations TypeORM explicites ; `synchronize` y est désactivé.

## Démarrer

Depuis ce dossier, lancer `./Start-Pletosie.ps1 -Open`. Le script démarre l’API et le front dans des processus cachés, sans remplacer un programme déjà présent sur les ports. `./Stop-Pletosie.ps1` arrête les processus enregistrés par le lanceur. Les journaux du lanceur se trouvent dans `work/`.

- Boutique : http://localhost:3000
- Compte : http://localhost:3000/compte
- Administration, après connexion : http://localhost:3000/admin
- Documentation API : http://localhost:4000/api/docs

Les identifiants administratrice de développement ont été générés dans le document « Acces-local-Pletosie.md » livré avec cette session. Le mot de passe n’est pas inclus dans les sources. Il doit être remplacé avant production. `ADMIN_EMAIL` et `ADMIN_PASSWORD` servent uniquement à créer le premier compte absent, pas à réinitialiser un compte existant.

## Parcours disponibles

Catalogue rendu côté serveur, recherche et filtres partageables, pagination progressive, fiches produit, photos par coloris, tailles et stock, panier local et fusion avec le panier connecté (quantité maximale par variante pour éviter de doubler une sélection déjà synchronisée), inscription et connexion email, sessions HttpOnly, profil, adresses, commandes avec instantanés, réservations de 15 minutes et expiration, messagerie texte et vocaux privés, propositions versionnées et commande personnalisée séparée, quota de confection par jour, notifications internes, gestion des produits et des variantes, livraison et guide des mesures administrables, suivi des commandes, audit et export CSV.

Les images sont des illustrations SVG originales de démonstration. Les noms, prix et tailles P1/P2/P3 sont des exemples ; ils ne représentent pas un catalogue commercial validé. Le logo est un mot-symbole provisoire.

## Paramètres qui restent à fournir ou valider

Les ventes restent désactivées (`COMMERCE_ENABLED=false`). Avant ouverture : catalogue réel, logo et visuels, mesures de la marque, coordonnées commerciales, zones/frais et règles de calcul des trois jours, conditions commerciales, modalités de remboursement, compte FeexPay, opérateurs autorisés, Cloudinary et hébergement. L’email de récupération attend le choix et la configuration d’un prestataire.

Le développement utilise provisoirement email/mot de passe, XOF et un délai de trois jours calendaires après confirmation serveur. Les pages commerciales sont explicitement des projets. L’annulation payée est bloquée tant que `CANCELLATION_POLICY` n’est pas configurée. `full_refund` active un remboursement total demandé avant ou à 24 heures ; après expédition/livraison, une résolution administrative est requise. La validation de ce choix commercial est indispensable avant activation.

## Paiement

L’adaptateur FeexPay v2 est désactivé par défaut. Il utilise des clés serveur, une tentative persistante par initiation, la référence renvoyée par le prestataire et une vérification via son endpoint de statut. Les montants, la référence, la devise lorsqu’elle est retournée et l’environnement sont contrôlés. En cas de timeout d’initiation, aucune relance automatique d’encaissement : recherche par description unique et rapprochement. Les statuts incertains sont recontrôlés toutes les minutes avec un maximum de 120 vérifications par tentative.

Renseigner `FEEXPAY_ENABLED`, `FEEXPAY_API_KEY`, `FEEXPAY_SHOP_ID`, `FEEXPAY_MODE` (`sandbox` ou `live`), `FEEXPAY_OPERATORS` (liste parmi `mtn,moov,celtiis_bj`) et un secret aléatoire `FEEXPAY_WEBHOOK_SECRET`. Configurer le webhook HTTPS `/api/v1/payments/webhook` avec l’authentification Bearer correspondante dans le tableau de bord marchand. Le webhook déclenche un rapprochement ; son corps ne confirme jamais à lui seul un paiement. Vérifier le contrat de réponse avec le compte réel avant activation. Aucun paiement réel n’a été effectué.

Documentation consultée : https://docs.feexpay.me/ (19 octobre 2026). Les accès marchands et le paiement réel de recette restent à fournir.

## Audio

Enregistrement navigateur, aperçu, suppression, lecture et limites de trois minutes / dix mégaoctets. Le serveur analyse réellement le contenu avec ffprobe, refuse les pistes vidéo et les formats inconnus. La durée des WebM sans métadonnée de durée est calculée à partir des paquets. Le binaire doit être compatible avec l’hôte.

En local, les vocaux sont conservés dans la base privée. En production, Cloudinary est obligatoire : upload de type `authenticated`, ressources vidéo contenant uniquement une piste audio, lecture par proxy serveur après contrôle des participants. Aucune URL Cloudinary privée n’est renvoyée au client. Les formats sont testés par le serveur, mais la recette sur un iPhone et un Android physiques reste nécessaire.

## Vérifier le code

Dans `pletosie-back` : `npm run build`, puis `npm run test:critical`. Dans `pletosie-front` : `npm run build`. La suite critique couvre l’authentification HTTP, les droits, l’idempotence, la concurrence sur la dernière unité en base locale, les annulations, l’expiration, les faux vocaux, les confirmations de paiement simulées et le quota. Les intégrations marchandes, Cloudinary réel et PostgreSQL ne sont pas remplacées par ces tests.

## PostgreSQL, déploiement et sauvegarde

1. Configurer une base et des secrets séparés pour la recette et la production. Voir `compose.yaml` pour une base locale conteneurisée optionnelle.
2. Définir `DATABASE_URL`, `DATABASE_SSL`, `FRONTEND_URL`, `HOST` et les secrets côté API. `HOST=0.0.0.0` est nécessaire en conteneur. Côté front : `NEXT_PUBLIC_API_URL` et `SITE_URL` réels avant compilation.
3. Construire l’API. À l’initialisation PostgreSQL, TypeORM applique les migrations en attente avant le catalogue, le seed et les autres services Nest ; `synchronize` reste désactivé. `npm run migration:run` reste disponible pour les lancer séparément. Sauvegarder avant toute migration à risque. Pour une mise à l’échelle sur plusieurs instances, appliquer les migrations via une étape de pré-déploiement unique avant le démarrage des instances.
4. Construire le front et lancer les services avec un superviseur, derrière HTTPS et sur un même site pour les cookies SameSite. Isoler les ports API/base du réseau public. Configurer les sauvegardes et l’alerting de l’hébergeur.
5. Exécuter une sauvegarde PostgreSQL via `scripts/Backup-Database.ps1`, puis une restauration dans une base de recette vide distincte avec `pg_restore --exit-on-error --no-owner --dbname <URL_RECETTE> <archive>`. Contrôler les données et les médias après restauration. Aucun test de restauration réel n’a été exécuté sur ce poste, où PostgreSQL et Docker ne sont pas installés.

## Limites connues avant production

- Le modèle des variantes et des lignes est stocké en JSON transactionnel. Les combinaisons et références sont validées par le service. Une normalisation en tables dédiées avec contraintes uniques de base reste nécessaire pour aligner complètement le schéma sur le cahier des charges et permettre une forte volumétrie.
- La réservation PostgreSQL utilise des transactions sérialisables et verrouille les produits ; ses scénarios concurrents doivent encore être exécutés sur une vraie instance PostgreSQL.
- Les notifications internes sont persistantes dans la transaction. Le rafraîchissement de la messagerie utilise une interrogation périodique de cinq secondes ; Socket.IO, proposé par le document, n’est pas utilisé dans cette version.
- Les statistiques sont des agrégats bornés de données réelles, sans déduplication des consultations, conversion, filtre de période ni calcul complet des ventes nettes. Les remboursements restent consultables séparément. L’interface expose ces limites.
- Les réglages commerciaux définitifs, l’email de récupération, la double authentification admin, la suppression/anonymisation, la supervision externe, les alertes opérationnelles détaillées et la recette de performance ne sont pas finalisés.
- L’envoi vocal possède un état d’attente mais pas encore une barre de progression réseau. Les conversations paginent côté API ; l’interface affiche les 50 derniers messages.
- Le catalogue API est borné à 200 produits ; le panier à 30 variantes et 20 unités par variante. Le catalogue de démonstration doit être remplacé et le trafic de test purgé avant ouverture.

Cette version est un socle fonctionnel local, pas une déclaration de conformité à tous les critères de recette ni une autorisation de mise en production.
