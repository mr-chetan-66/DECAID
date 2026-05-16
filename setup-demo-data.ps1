# Demo Data Setup Script for DECAID

# Register demo users
Write-Host "Registering demo users..." -ForegroundColor Green

# Student user
$body = @{
    username = "student1"
    password = "student123"
    role = "student"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8001/register" -Method POST -ContentType "application/json" -Body $body
    Write-Host "✓ Student user created: student1 / student123" -ForegroundColor Green
} catch {
    Write-Host "✗ Student user may already exist or error occurred" -ForegroundColor Yellow
}

# Institution user
$body = @{
    username = "institution1"
    password = "institution123"
    role = "institution"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8001/register" -Method POST -ContentType "application/json" -Body $body
    Write-Host "✓ Institution user created: institution1 / institution123" -ForegroundColor Green
} catch {
    Write-Host "✗ Institution user may already exist or error occurred" -ForegroundColor Yellow
}

# Employer user
$body = @{
    username = "employer1"
    password = "employer123"
    role = "employer"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8001/register" -Method POST -ContentType "application/json" -Body $body
    Write-Host "✓ Employer user created: employer1 / employer123" -ForegroundColor Green
} catch {
    Write-Host "✗ Employer user may already exist or error occurred" -ForegroundColor Yellow
}

Write-Host "`nDemo users registered successfully!" -ForegroundColor Cyan
Write-Host "`nLogin credentials:" -ForegroundColor Cyan
Write-Host "  Admin: admin / admin123" -ForegroundColor White
Write-Host "  Student: student1 / student123" -ForegroundColor White
Write-Host "  Institution: institution1 / institution123" -ForegroundColor White
Write-Host "  Employer: employer1 / employer123" -ForegroundColor White
