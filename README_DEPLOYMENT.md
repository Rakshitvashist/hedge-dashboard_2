# GitHub Deployment Guide: Institutional Hedge Dashboard

Follow these steps **exactly once** to set up your automated hosting.

### 1. Initialize Git & First Commit
Open your terminal in `d:\Host_portfolio` and run:
```powershell
git init
git add index.html style.css app.js data.js Institutional_Run.ps1
git commit -m "Initial dashboard setup"
```

### 2. Create a GitHub Repository
1. Go to [GitHub](https://github.com/new).
2. Create a new repository named `hedge-dashboard`.
3. Do NOT initialize with a README.

### 3. Push to GitHub
Replace `<your-username>` with your actual GitHub username:
```powershell
git remote add origin https://github.com/<your-username>/hedge-dashboard.git
git branch -M main
git push -u origin main
```

### 4. Enable GitHub Pages
1. In your GitHub repository, go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select `Deploy from a branch`.
3. Select `main` branch and `/ (root)` folder.
4. Click **Save**.

### 5. Access Your Dashboard
After a minute, your dashboard will be live at:
`https://<your-username>.github.io/hedge-dashboard/`

---

### Updating the Data
Whenever you run a new backtest and want to update the dashboard:
1. Run `python extract_dashboard_data.py` to update `data.js`.
2. Push the changes:
```powershell
git add data.js
git commit -m "Update dashboard data"
git push
```
The dashboard will update automatically!
