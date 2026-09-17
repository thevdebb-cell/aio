# case.nyuc.app — déploiement VPS (OVH / Windows Server)

Petit site **public** : montre uniquement les cases CRD `confidentiality = public`
(déclassifiées), avec leurs documents téléchargeables. Backend Express sur
`127.0.0.1:3003`, servi par Caddy sur `case.nyuc.app`. Rien de sensible côté
navigateur : la clé service Supabase reste dans le `.env` du serveur.

## 1. DNS (OVH → Web Cloud → Domaines → nyuc.app → Zone DNS)

Ajoute un enregistrement :

| Type | Sous-domaine | Cible |
|------|--------------|-------|
| A | `case` | IPv4 du VPS |

Vérifie avant de continuer (le certif Let's Encrypt en dépend) :

```powershell
Resolve-DnsName case.nyuc.app
```

## 2. Déposer l'app sur le VPS

```powershell
New-Item -Path "C:\nyuc\apps\case-public" -ItemType Directory -Force
New-Item -Path "C:\nyuc\logs\case-public" -ItemType Directory -Force
```

Copie le dossier `case-public\` (server.js, package.json, public\) dans
`C:\nyuc\apps\case-public`. Puis :

```powershell
Set-Location C:\nyuc\apps\case-public
npm ci --omit=dev
```

Crée le `.env` (jamais dans git) à partir de `.env.example` :

```powershell
Copy-Item .env.example .env
notepad .env    # remplis SUPABASE_URL et SUPABASE_SERVICE_KEY, garde PORT=3003
icacls .env /inheritance:r
icacls .env /grant "Administrators:(R,W)"
icacls .env /grant "SYSTEM:(R,W)"
```

## 3. Service Windows (NSSM)

```powershell
$nssm = "C:\nyuc\tools\nssm\nssm.exe"
$node = (Get-Command node).Source
& $nssm install nyuc-case-public $node "C:\nyuc\apps\case-public\server.js"
& $nssm set nyuc-case-public AppDirectory "C:\nyuc\apps\case-public"
& $nssm set nyuc-case-public AppStdout "C:\nyuc\logs\case-public\out.log"
& $nssm set nyuc-case-public AppStderr "C:\nyuc\logs\case-public\err.log"
& $nssm set nyuc-case-public AppRotateFiles 1
& $nssm set nyuc-case-public AppRotateBytes 10485760
& $nssm set nyuc-case-public AppThrottle 5000
& $nssm set nyuc-case-public AppExit Default Restart
& $nssm set nyuc-case-public Start SERVICE_AUTO_START
Start-Service nyuc-case-public
```

Test local (doit répondre du JSON) :

```powershell
Invoke-WebRequest http://127.0.0.1:3003/api/cases | Select-Object -ExpandProperty Content
```

## 4. Caddy — ajouter le bloc

Dans `C:\nyuc\tools\caddy\Caddyfile`, ajoute :

```
case.nyuc.app {
    reverse_proxy 127.0.0.1:3003
    encode gzip
}
```

Valide puis recharge (sans coupure) :

```powershell
C:\nyuc\tools\caddy\caddy.exe validate --config C:\nyuc\tools\caddy\Caddyfile
C:\nyuc\tools\caddy\caddy.exe reload --config C:\nyuc\tools\caddy\Caddyfile
```

Caddy récupère le certificat HTTPS tout seul dès que le DNS pointe sur le VPS.
Ouvre `https://case.nyuc.app`.

## 5. Rendre une case publique

Une case n'apparaît ici **que** si, dans CRD, tu mets sa confidentialité sur
**Public** (et qu'elle n'est pas classified). Ouvre la case → **Edit** →
Confidentiality = *Public* → Save. Elle apparaît sur `case.nyuc.app` en quelques
secondes, avec ses documents.

## Mettre à jour l'app plus tard

```powershell
Set-Location C:\nyuc\apps\case-public
# remplace server.js / public\ par la nouvelle version
npm ci --omit=dev
Restart-Service nyuc-case-public
```

## Dépannage

- `Get-Service nyuc-case-public` → doit être `Running`.
- Logs : `Get-Content C:\nyuc\logs\case-public\err.log -Tail 50 -Wait`.
- 403 sur un fichier = le fichier n'appartient pas à une case publique (normal).
- Rien ne s'affiche = aucune case n'est en `Public` encore.
