param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
if (-not $env:DATABASE_URL) { throw 'Configurer DATABASE_URL dans cet environnement.' }
$backupExecutable=(Get-Command pg_dump -ErrorAction Stop).Source
$destinationPath=[IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $destinationPath) { throw 'Le fichier de sauvegarde existe déjà. Choisir un autre nom.' }
& $backupExecutable --format=custom --no-owner --file=$destinationPath --dbname=$env:DATABASE_URL
if ($LASTEXITCODE -ne 0) { throw 'Échec de la sauvegarde PostgreSQL.' }
Write-Output "Sauvegarde créée : $destinationPath"
