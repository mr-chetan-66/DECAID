# Create demo users for DECAID

$jsonStudent = @{
    username = "student1"
    password = "student123"
    role = "student"
} | ConvertTo-Json

$jsonInstitution = @{
    username = "institution1"
    password = "institution123"
    role = "institution"
} | ConvertTo-Json

$jsonEmployer = @{
    username = "employer1"
    password = "employer123"
    role = "employer"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "http://127.0.0.1:8001/register" -Method POST -ContentType "application/json" -Body $jsonStudent
    Write-Host "Created student1" -ForegroundColor Green
} catch {
    Write-Host "Student1 may already exist" -ForegroundColor Yellow
}

try {
    Invoke-RestMethod -Uri "http://127.0.0.1:8001/register" -Method POST -ContentType "application/json" -Body $jsonInstitution
    Write-Host "Created institution1" -ForegroundColor Green
} catch {
    Write-Host "Institution1 may already exist" -ForegroundColor Yellow
}

try {
    Invoke-RestMethod -Uri "http://127.0.0.1:8001/register" -Method POST -ContentType "application/json" -Body $jsonEmployer
    Write-Host "Created employer1" -ForegroundColor Green
} catch {
    Write-Host "Employer1 may already exist" -ForegroundColor Yellow
}

Write-Host "`nDemo users:" -ForegroundColor Cyan
Write-Host "admin / admin123 (admin)" -ForegroundColor White
Write-Host "student1 / student123 (student)" -ForegroundColor White
Write-Host "institution1 / institution123 (institution)" -ForegroundColor White
Write-Host "employer1 / employer123 (employer)" -ForegroundColor White
