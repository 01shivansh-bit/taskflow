# Clean & Simple To-Do App

A clean, modern, and lightweight To-Do application built with **Node.js** and vanilla web technologies (HTML5, CSS3, ES6 JavaScript). No bulky frameworks, no external npm packages required — fast, minimal, and fully self-contained.

---

## ✨ Features

- 📝 **Add Tasks**: Quickly add tasks with a title and optional due date via keyboard (`Enter`) or the Add button.
- 📅 **Due Dates & Status Badges**: Visual indicator on each card (Overdue, Due Today, Due Tomorrow, or formatted date).
- ✅ **Mark as Complete**: Toggle tasks as complete or active with a single click and smooth strikethrough animation.
- 🗑️ **Delete Tasks**: Remove any task with one click.
- 🧹 **Clear Completed**: Batch delete all finished tasks when done.
- 📊 **Statistics Summary & Health Bar**: 4-card interactive statistics grid (Total, Active, Overdue, Done) plus a multi-segment health bar (Green = Completed, Blue = Active, Red = Overdue).
- 🔍 **Interactive 4-Way Filters**: Quick-filter by clicking any top stat card or bottom tab (**All**, **Active**, **Overdue**, **Done**).
- 💙 **Black & Blue Theme**: Pure OLED black background with electric blue accents and subtle ambient glow.
- 💾 **Data Persistence & Google Drive Sync**: Save tasks locally or sync in real-time to your personal Google Drive account (`taskflow_todos.json`) across your Mac and smartphone.
- ⚡ **Zero External Dependencies**: Powered entirely by Node.js standard libraries (`http`, `fs`, `path`, `crypto`).

---

## 🚀 Quick Start

### 1. Start the Server

In this directory, simply run:

```bash
node server.js
```

Or using npm:

```bash
npm start
```

### 2. Open in Browser

Open your browser and navigate to:

👉 **[http://localhost:3000](http://localhost:3000)**

---

## ☁️ Google Cloud Deployment (Cloud Run)

The application is containerized and optimized for **Google Cloud Run**:

1. **Deploy with Automated Script**:
   ```bash
   ./deploy-gcp.sh
   ```
   *(Or via `npm run deploy:gcp`)*

2. **Deploy Manually via `gcloud`**:
   ```bash
   # 1. Create a new GCP project
   gcloud projects create my-taskflow-app --name="TaskFlow"
   gcloud config set project my-taskflow-app

   # 2. Enable Cloud Run & Cloud Build
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com

   # 3. Deploy container directly to Cloud Run
   gcloud run deploy taskflow --source . --port 8080 --allow-unauthenticated
   ```

---

## 📁 Project Structure

```
to do app/
├── server.js          # Lightweight Node.js HTTP server & REST API
├── package.json       # Project metadata & npm scripts
├── README.md          # Project documentation
├── data/
│   └── todos.json     # JSON database for persisting tasks
└── public/
    ├── index.html     # Semantic, accessible HTML markup
    ├── style.css      # Clean, modern styling with Dark Mode
    └── app.js         # Reactive client logic & optimistic UI updates
```

---

## 🔌 REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/todos` | Retrieve all tasks |
| `POST` | `/api/todos` | Create a new task (`{ "title": "..." }`) |
| `PATCH` | `/api/todos/:id` | Update task status or title (`{ "completed": true }`) |
| `DELETE` | `/api/todos/:id` | Delete a single task by ID |
| `DELETE` | `/api/todos?completed=true` | Clear all completed tasks |

