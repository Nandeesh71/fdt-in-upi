# 🔐 FDT Login Guide - UPDATED

## ✅ All Services Are Running!

### 📱 How to Access the App

**If you're using the preview/external URL:**
- The frontend will automatically proxy API requests to the backend
- Just use the preview URL provided by your environment

**If you're using localhost:**
- Frontend: http://localhost:3000
- Backend: http://localhost:8001

---

## 🔑 Login Credentials (ALL VERIFIED)

### Demo Users - Password: `password123`

| Name | Phone Number | Password | Balance |
|------|--------------|----------|---------|
| **Rajesh Kumar** | `+919876543210` | `password123` | ₹24,500 |
| **Priya Sharma** | `+919876543211` | `password123` | ₹15,000 |
| **Amit Patel** | `+919876543212` | `password123` | ₹30,000 |

---

## 📝 Login Instructions

1. **Open the app** in your browser (use preview URL or localhost:3000)

2. **Enter these exact details:**
   ```
   Phone: +919876543210
   Password: password123
   ```

3. **Click "Sign In"**

---

## ✅ Verified Working

I've just tested the login and it's working:
```bash
✓ Backend API: Running on port 8001
✓ Frontend: Running on port 3000
✓ Database: Connected with 3 users
✓ Login API: Responding correctly
✓ Proxy: Configured for external access
```

Test result:
```json
{
  "status": "success",
  "message": "Login successful",
  "user": {
    "name": "Rajesh Kumar",
    "phone": "+919876543210",
    "balance": 24500.0
  }
}
```

---

## 🐛 If Login Still Fails

### Check 1: Verify Services Are Running
```bash
/app/quick_start.sh
```

### Check 2: Test API Directly
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "password": "password123"}'
```

### Check 3: Check Browser Console
- Open Developer Tools (F12)
- Go to Console tab
- Look for any error messages
- Check Network tab to see if API call is being made

### Check 4: Clear Browser Cache
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Or clear browser cache completely

### Check 5: Try Different Phone Format
If for some reason the + sign is causing issues, try:
```
Phone: 919876543210
Password: password123
```

---

## 🧪 Test Transaction After Login

Once logged in, try these:

**Low Risk (Auto-approved):**
- Amount: 500
- Recipient: merchant@upi

**High Risk (Shows fraud alert):**
- Amount: 15000
- Recipient: unknown@upi

---

## 📞 Quick Commands

**Restart All Services:**
```bash
/app/quick_start.sh
```

**Check Backend Logs:**
```bash
tail -20 /tmp/backend.log
```

**Check Frontend Logs:**
```bash
tail -20 /tmp/frontend.log
```

**Test Login from Terminal:**
```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "password": "password123"}'
```

---

## ✨ System Status: 🟢 ALL OPERATIONAL

- PostgreSQL: ✅ Running
- Redis: ✅ Running
- Backend (Port 8001): ✅ Running
- Frontend (Port 3000): ✅ Running
- Proxy Configuration: ✅ Active
- Login API: ✅ Tested & Working

---

**If you're still having issues, please share:**
1. The exact error message you see
2. Browser console errors (F12 → Console)
3. Network tab showing the failed request (F12 → Network)
