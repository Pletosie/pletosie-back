# Connexion Google — Pletosie

La connexion et l’inscription utilisent désormais Google. Les anciennes routes email/mot de passe retournent HTTP 410. La migration PostgreSQL a ajouté l’identifiant Google unique et les tentatives OAuth temporaires, puis révoqué les anciennes sessions. Les comptes, commandes et conversations existants restent conservés.

## Configuration restante

Dans Google Cloud / Google Auth Platform, créer un client OAuth de type **Application Web**, configurer l’écran de consentement et, si le projet est en mode test, les utilisateurs de test. Déclarer exactement cette URI de redirection autorisée pour le développement local :

`http://localhost:4000/api/v1/auth/google/callback`

Renseigner dans `C:\Users\hp\pletosie\pletosie-back\.env` :

```dotenv
GOOGLE_CLIENT_ID=identifiant-fourni-par-google.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=secret-fourni-par-google
GOOGLE_CALLBACK_URL=http://localhost:4000/api/v1/auth/google/callback
GOOGLE_ADMIN_EMAIL=adresse-google-de-la-creatrice@gmail.com
```

Ne jamais mettre le secret dans le front, une variable `NEXT_PUBLIC_*`, un dépôt ou un message de chat. La configuration du fichier `.env` contient les champs nécessaires sans remplacer les autres paramètres.

Redémarrer ensuite le backend (`npm run start:dev`) et ouvrir `/compte`. Le bouton « Continuer avec Google » apparaît lorsque les trois paramètres OAuth sont présents. La création de compte est automatique au premier passage.

Pour la production : remplacer l’URI de callback par l’URL HTTPS réelle de l’API et ajouter cette URI exacte dans Google. `FRONTEND_URL` doit correspondre au site public. L’API et le front doivent être sur un même site pour les cookies SameSite utilisés par le projet.

## Administration et comptes existants

`GOOGLE_ADMIN_EMAIL` autorise explicitement l’adresse Gmail ou Google Workspace de l’administratrice. Le rôle admin n’est jamais fourni par le navigateur ni déduit d’un nom de domaine libre.

Une adresse Google vérifiée appartenant à Gmail ou Google Workspace peut rattacher un ancien compte client portant exactement la même adresse ; ses anciennes sessions sont révoquées. Le rattachement d’un ancien compte admin nécessite en plus que cette adresse soit explicitement configurée dans `GOOGLE_ADMIN_EMAIL`. Les adresses externes à Gmail/Workspace ne sont pas automatiquement rattachées à un compte préexistant.

Les anciens identifiants de développement email/mot de passe ne permettent plus de se connecter. L’ancien compte `atelier@pletosie.local` est conservé pour son historique, mais ne constitue pas un compte Google utilisable. Configurer l’adresse Google réelle pour l’administration.

## Sécurité et vérification

Flux code d’autorisation avec PKCE, state associé à un cookie HttpOnly et à un enregistrement serveur à usage unique de dix minutes, nonce vérifié, validation du jeton d’identité via la bibliothèque officielle Google (signature, audience, expiration), adresse vérifiée et session Pletosie HttpOnly. Les jetons Google ne sont pas conservés ni renvoyés au navigateur Pletosie. Seuls les scopes `openid email profile` sont demandés.

Les compilations front et back et les tests automatisés vérifient le raccordement. La connexion réelle au compte Google reste à tester après création du client OAuth ; aucun consentement Google réel n’a été demandé pendant le développement.

Documentation officielle : [OAuth pour applications serveur](https://developers.google.com/identity/protocols/oauth2/web-server).
