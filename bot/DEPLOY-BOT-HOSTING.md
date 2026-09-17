# Déployer CRD sur bot-hosting.net

Ces 2 fichiers (`index.js`, `deploy-commands.js`) sont **ton bot actuel**
+ les 2 commandes CRD ajoutées (`/crdauth`, `/crdaccess`). Rien d'autre n'a
bougé — Dillan, les cases, l'anti-nuke, tout le reste est identique.

## 1) Avant tout : le SQL Supabase
Si ce n'est pas déjà fait, lance `supabase-schema.sql` (dans le zip du site
`crd-netlify.zip` que je t'ai donné avant) dans l'éditeur SQL de ton projet
Supabase. Sans ça, `/crdauth` va planter avec "database is not configured"
en boucle (en vrai il testera `supabase` qui existe déjà, mais les tables
`crd_sessions` / `crd_access` doivent exister).

## 2) Sur bot-hosting.net
1. Va dans ton panel bot-hosting.net, section **File Manager** de ton bot.
2. Remplace ton `index.js` actuel par celui-ci (upload / écrase).
3. Remplace ton `deploy-commands.js` par celui-ci.
4. **Redémarre le bot** (Restart) pour charger le nouveau `index.js`.
5. Une seule fois, lance `deploy-commands.js` pour enregistrer les 2
   nouvelles commandes slash auprès de Discord :
   - Si bot-hosting.net a une **Console**, tape : `node deploy-commands.js`
   - Sinon regarde s'il y a un bouton "Run install script" / "Startup command"
     temporaire — sur la plupart des panels bot-hosting.net tu peux juste
     ouvrir la console du bot et taper la commande directement.
6. Attends 1-2 minutes que Discord propage les nouvelles commandes globales,
   puis `/crdauth` et `/crdaccess` doivent apparaître.

Rien d'autre à toucher : `storage.js`, `linkedroles.js`, `config.json` restent
tels quels — ils ne sont pas concernés par cet ajout.

## 3) Test rapide
1. Ouvre `crd.nyuc.app`, note le code affiché.
2. Sur Discord, en tant que membre WL : `/crdauth CODE` → doit dire
   "logged in to CRD as Whitelist".
3. Avec un compte qui n'est ni WL ni granté : `/crdauth CODE` → doit refuser
   ("No authorization"), et le site doit afficher **NO AUTHORIZATION**.
4. En WL : `/crdaccess grant @quelqu'un` → cette personne peut maintenant se
   connecter en lecture seule.
