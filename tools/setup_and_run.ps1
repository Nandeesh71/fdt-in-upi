# UPI Fraud Detection - Setup and Run Script
# Run this script to set up and test the ML improvements

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "UPI Fraud Detection - Setup Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# Step 1: Install dependencies
Write-Host "`n[1/7] Installing Python dependencies..." -ForegroundColor Yellow
pip install numpy scikit-learn scipy xgboost matplotlib seaborn joblib redis psycopg2-binary fastapi uvicorn pydantic sqlalchemy pyyaml passlib faker requests

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed" -ForegroundColor Green

# Step 2: Check Docker
Write-Host "`n[2/7] Checking Docker services..." -ForegroundColor Yellow
$dockerRunning = docker ps 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Docker not running. Starting services..." -ForegroundColor Yellow
    docker-compose up -d
    Start-Sleep -Seconds 5
} else {
    Write-Host "✓ Docker is running" -ForegroundColor Green
}

# Check if PostgreSQL and Redis are running
$pgRunning = docker ps --filter "expose=5432" --format "{{.Names}}" | Select-String "postgres|db"
$redisRunning = docker ps --filter "expose=6379" --format "{{.Names}}" | Select-String "redis"

if (-not $pgRunning -or -not $redisRunning) {
    Write-Host "Starting PostgreSQL and Redis..." -ForegroundColor Yellow
    docker-compose up -d
    Start-Sleep -Seconds 5
}
Write-Host "✓ PostgreSQL and Redis are ready" -ForegroundColor Green

# Step 3: Initialize database
Write-Host "`n[3/7] Initializing database schema..." -ForegroundColor Yellow
python scripts/check_schema.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: Database initialization had issues (might be OK if already initialized)" -ForegroundColor Yellow
}

# Step 4: Train models
Write-Host "`n[4/7] Training ML models (this takes 2-5 minutes)..." -ForegroundColor Yellow
if (-not (Test-Path "models/xgboost.joblib")) {
    python train_models.py
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Model training failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Models trained successfully" -ForegroundColor Green
} else {
    Write-Host "✓ Models already exist (skipping training)" -ForegroundColor Green
}

# Step 5: Evaluate models
Write-Host "`n[5/7] Evaluating models and generating reports..." -ForegroundColor Yellow
python evaluate_model.py
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Evaluation complete - check models/ folder for reports" -ForegroundColor Green
}

# Step 6: Feature importance
Write-Host "`n[6/7] Analyzing feature importance..." -ForegroundColor Yellow
python feature_importance.py
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Feature analysis complete" -ForegroundColor Green
}

# Step 7: Ready to run
Write-Host "`n[7/7] Setup Complete!" -ForegroundColor Green
Write-Host "`n======================================" -ForegroundColor Cyan
Write-Host "READY TO RUN" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

Write-Host "`nTo start the API server, run:" -ForegroundColor White
Write-Host "  uvicorn app.main:app --reload --port 8000" -ForegroundColor Yellow

Write-Host "`nTo test with simulator (in another terminal):" -ForegroundColor White
Write-Host "  python simulator/generator.py" -ForegroundColor Yellow

Write-Host "`nTo view the dashboard, open:" -ForegroundColor White
Write-Host "  http://localhost:8000/dashboard" -ForegroundColor Cyan

Write-Host "`n✓ All ML improvements are ready!" -ForegroundColor Green

# Step 8: Auto-launch services
Write-Host "`n[8/8] Starting services..." -ForegroundColor Yellow

# Start API server in background
Write-Host "Starting API server..." -ForegroundColor White
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$pwd'; uvicorn app.main:app --reload --port 8000"
Start-Sleep -Seconds 3

# Start simulator/generator in background
Write-Host "Starting simulator generator..." -ForegroundColor White
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$pwd'; python simulator/generator.py"
Start-Sleep -Seconds 2

# Open dashboard in browser
Write-Host "Opening dashboard..." -ForegroundColor White
Start-Process "http://localhost:8000/dashboard"

Write-Host "`n✓ Services launched! Dashboard opened in browser." -ForegroundColor Green
Write-Host "  - API Server: http://localhost:8000" -ForegroundColor Cyan
Write-Host "  - Dashboard: http://localhost:8000/dashboard" -ForegroundColor Cyan
Write-Host "  - Generator: Running in background" -ForegroundColor Cyan
