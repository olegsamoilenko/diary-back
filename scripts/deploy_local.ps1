$ErrorActionPreference = "Stop"

Write-Host "===> Building image (full production image) ..."

docker build --pull --no-cache --platform linux/amd64 -t nemory-backend:verify .

if ($LASTEXITCODE -ne 0) {
  Write-Error "Build FAILED with exit code $LASTEXITCODE"
  exit 1
}

Write-Host "===> OK. Build succeeded."
exit 0
