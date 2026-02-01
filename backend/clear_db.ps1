# Clear database script for PowerShell
# Run this to reset the database

Write-Host "Clearing database..." -ForegroundColor Yellow

# Activate conda environment and run Python script
conda activate webapp
python clear_db.py

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
