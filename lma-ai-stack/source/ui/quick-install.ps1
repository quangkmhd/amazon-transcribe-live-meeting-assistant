# Quick reinstall with legacy peer deps
Write-Host "Installing dependencies with --legacy-peer-deps..." -ForegroundColor Yellow

# Stop any running npm processes
Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force -ErrorAction SilentlyContinue

# Clear npm cache  
npm cache clean --force

# Install with legacy peer deps to avoid conflicts
npm install --legacy-peer-deps

Write-Host "Done!" -ForegroundColor Green
