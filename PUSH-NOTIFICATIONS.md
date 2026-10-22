# Notifications et ouverture des conversations

Mise à jour du 22 octobre 2026.

## Comportement livré

- « Discuter de cet article » ouvre ou retrouve immédiatement la conversation avec le contexte produit/variante. Le client peut écrire directement ; aucun second clic pour commencer n’est requis.
- Si la connexion Google est nécessaire, la destination est conservée sur cet onglet puis reprise après connexion.
- Un clic sur une notification ouvre le fil concerné, y compris si aucun onglet Pletosie n’était ouvert.
- Les messages texte et vocaux, les propositions reçues, les commandes payées et les changements de traitement de commande créent des notifications. Les événements sont persistés dans la transaction métier avant tout envoi push.
- L’API a une file persistante d’envoi Web Push avec reprise, tentatives limitées, déduplication, désactivation des abonnements expirés et contrôle de session. Un échec du service de push ne supprime ni message, ni commande.
- Une conversation dans un onglet en arrière-plan ne marque plus automatiquement les messages comme lus.
- Le service worker ne met aucune page privée en cache. Les alertes système contiennent un texte générique, pas le contenu du message ni un vocal.

## Activer sur un appareil

1. Se connecter à Pletosie.
2. Ouvrir **Mon compte → Notifications sur cet appareil** ou utiliser le bandeau d’invitation.
3. Cliquer sur **Activer les notifications**, puis accepter la demande du navigateur.
4. Cliquer sur **Envoyer une notification de test**. Pour la recette, fermer l’onglet et faire envoyer ensuite un message depuis l’autre compte.

Il n’est pas possible pour le site d’imposer l’autorisation du navigateur ni de contourner une interdiction du système. Si elle a été refusée, la réactiver dans les paramètres du site et du système.

Sur iPhone/iPad compatibles, ajouter Pletosie à l’écran d’accueil, ouvrir l’application depuis son icône puis activer les alertes. La réception reste soumise à la connectivité, aux autorisations et aux restrictions de fonctionnement en arrière-plan du navigateur/système ; une fermeture complète/forcée du navigateur peut empêcher la réception sur certaines plateformes.

## Configuration serveur

Les clés `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` ont été générées dans le `.env` du backend sans être affichées. Seule la clé publique est fournie au navigateur connecté. `VAPID_SUBJECT` utilise le contact configuré lorsqu’il existe ; remplacer tout contact de développement se terminant par `.invalid` par une adresse de contact réelle avant production. Le script `pletosie-back/scripts/Configure-Push.cjs` génère une paire seulement si elle n’existe pas déjà. Conserver la même paire lors des redéploiements, sinon les abonnements devront être renouvelés.

Le fonctionnement ne dépend pas de Firebase. Les transports utilisés sont les services push natifs des navigateurs. En production : HTTPS obligatoire, API active en continu, accès réseau sortant aux services push et exécution d’une instance du traitement d’envoi. En local, `localhost` est pris en charge par les navigateurs compatibles. Les migrations PostgreSQL correspondantes sont appliquées.

Les abonnements sont associés au compte et à la session. La déconnexion retire les abonnements de cette session ; les autres appareils restent gérables indépendamment. Une session expirée ne reçoit plus de nouvel envoi depuis le serveur. Une alerte déjà transmise au service du navigateur peut encore arriver après une déconnexion.

## Vérification

- Compilations NestJS et Next.js : réussies.
- **47 tests réussis**, dont nouvelles suites de file push et de service worker exécuté sans client ouvert.
- Tests d’envoi avec transport simulé, relances, expiration 410, session révoquée, notification déjà lue, destination push arbitraire refusée, déplacement d’abonnement refusé, concurrence, reprise après interruption et clic ouvrant le fil.
- Tests HTTP de création/retrouvaille de discussion produit en concurrence, contexte de variante et rejet d’une variante inexistante.
- API PostgreSQL initialisée avec la nouvelle migration et configuration push présente ; service worker et manifeste servis en HTTP 200.

La réception réelle d’une notification système sur un appareil autorisé et le parcours Google complet de cet appareil restent à confirmer. Aucun abonnement ni autorisation de navigateur n’a été forcé pendant les tests.

Références : [Push API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [inscription push — web.dev](https://web.dev/articles/push-notifications-subscribing-a-user), [notifications des applications d’écran d’accueil sur iOS — WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
