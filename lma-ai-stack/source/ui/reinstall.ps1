# Cleanup and reinstall npm dependencies
Write-Host "Cleaning up node_modules and package-lock.json..." -ForegroundColor Yellow

# Remove node_modules
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "Removed node_modules" -ForegroundColor Green
}

# Remove package-lock.json
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
    Write-Host "Removed package-lock.json" -ForegroundColor Green
}

# Clear npm cache
Write-Host "Clearing npm cache..." -ForegroundColor Yellow
npm cache clean --force

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Done!" -ForegroundColor Green
