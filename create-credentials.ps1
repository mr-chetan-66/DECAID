# Create demo credentials for DECAID

# Login as institution to get token
$loginBody = @{
    username = "institution1"
    password = "institution123"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "http://127.0.0.1:8001/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResponse.token

Write-Host "Logged in as institution1" -ForegroundColor Green

# Create individual credential
$credentialBody = @{
    studentId = "STU-DEMO-001"
    issuerId = "INST-DEMO-001"
    credentialData = "Bachelor of Computer Science, Certificate Number CS-2024-DEMO-001, CGPA 8.5, Issued 2024-01-15"
    issuedAt = "2024-01-15T00:00:00Z"
    certificateNumber = "CS-2024-DEMO-001"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/credentials/issue" -Method POST -ContentType "application/json" -Body $credentialBody -Headers @{Authorization = "Bearer $token"}
    Write-Host "Created credential for STU-DEMO-001" -ForegroundColor Green
    Write-Host "Credential Hash: $($response.credentialHash)" -ForegroundColor Cyan
} catch {
    Write-Host "Error creating credential: $_" -ForegroundColor Red
}

# Create batch credentials
$batchBody = @{
    issuerId = "INST-DEMO-001"
    batchId = "BATCH-DEMO-001"
    credentials = @(
        @{
            studentId = "STU-DEMO-002"
            issuerId = "INST-DEMO-001"
            credentialData = "Bachelor of Science in Data Science, Certificate Number DS-2024-DEMO-002, CGPA 8.2"
            issuedAt = "2024-02-01T00:00:00Z"
            certificateNumber = "DS-2024-DEMO-002"
        },
        @{
            studentId = "STU-DEMO-003"
            issuerId = "INST-DEMO-001"
            credentialData = "Master of Business Administration, Certificate Number MBA-2024-DEMO-003, CGPA 7.8"
            issuedAt = "2024-02-15T00:00:00Z"
            certificateNumber = "MBA-2024-DEMO-003"
        },
        @{
            studentId = "STU-DEMO-004"
            issuerId = "INST-DEMO-001"
            credentialData = "Bachelor of Engineering in Mechanical, Certificate Number ME-2024-DEMO-004, CGPA 8.0"
            issuedAt = "2024-03-01T00:00:00Z"
            certificateNumber = "ME-2024-DEMO-004"
        },
        @{
            studentId = "STU-DEMO-005"
            issuerId = "INST-DEMO-001"
            credentialData = "Bachelor of Arts in Economics, Certificate Number EC-2024-DEMO-005, CGPA 7.5"
            issuedAt = "2024-03-15T00:00:00Z"
            certificateNumber = "EC-2024-DEMO-005"
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:5000/api/institutions/batches" -Method POST -ContentType "application/json" -Body $batchBody -Headers @{Authorization = "Bearer $token"}
    Write-Host "Created batch BATCH-DEMO-001 with 4 credentials" -ForegroundColor Green
    Write-Host "Batch ID: $($response.batchId)" -ForegroundColor Cyan
} catch {
    Write-Host "Error creating batch: $_" -ForegroundColor Red
}

Write-Host "`nDemo credentials created successfully!" -ForegroundColor Cyan
Write-Host "`nStudent IDs for testing:" -ForegroundColor Cyan
Write-Host "  STU-DEMO-001 (Individual credential)" -ForegroundColor White
Write-Host "  STU-DEMO-002 (Batch credential - Data Science)" -ForegroundColor White
Write-Host "  STU-DEMO-003 (Batch credential - MBA)" -ForegroundColor White
Write-Host "  STU-DEMO-004 (Batch credential - Mechanical)" -ForegroundColor White
Write-Host "  STU-DEMO-005 (Batch credential - Economics)" -ForegroundColor White
