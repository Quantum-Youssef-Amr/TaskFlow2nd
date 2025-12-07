/* ========================================
   GLOBAL DATA & SYNC LAYER (main.js)
   Central source of truth for all pages
   ======================================== */

/* === Global State Initialization ===
   Core data containers used across the entire app */
window.projects = [];
window.tasks    = [];
window.appUsers = [];

// Basic user/session info (persisted in localStorage)
window.teamId      = localStorage.getItem('teamId')      || null;
window.userRole    = localStorage.getItem('role')        || null;
window.currentUser = localStorage.getItem('user')        || null;

// Attempt to restore persisted data from localStorage (offline support)
try {
  const storedProjects = localStorage.getItem('projects');
  const storedTasks    = localStorage.getItem('tasks');
  const storedUsers    = localStorage.getItem('teamUsers');

  if (storedProjects) window.projects = JSON.parse(storedProjects);
  if (storedTasks)    window.tasks    = JSON.parse(storedTasks);
  if (storedUsers)    window.appUsers = JSON.parse(storedUsers);
} catch (err) {
  console.warn('Failed to parse stored data from localStorage', err);
}

/* === Data Normalization ===
   Ensures consistent property names (handles camelCase vs snake_case from backend/local) */
function normalizeLocalData() {
  const normalizeString = v => (v === undefined || v === null) ? v : v;

  // Normalize projects
  window.projects = (window.projects || []).map(p => {
    const proj = Object.assign({}, p);
    if (!proj.description && proj.desc) proj.description = proj.desc;
    if (!proj.team_id && proj.teamId)   proj.team_id   = proj.teamId;
    return proj;
  });

  // Normalize tasks
  window.tasks = (window.tasks || []).map(t => {
    const task = Object.assign({}, t);
    if (!task.description && task.desc) task.description = task.desc;
    if (!task.projectId && task.project_id) task.projectId = task.project_id;
    if (!task.team_id && task.teamId)       task.team_id   = task.teamId;
    return task;
  });

  // Normalize users
  window.appUsers = (window.appUsers || []).map(u => {
    const user = Object.assign({}, u);
    if (!user.team_id && user.teamId) user.team_id = user.teamId;
    return user;
  });

  // Persist normalized data back to localStorage
  try {
    localStorage.setItem('projects', JSON.stringify(window.projects || []));
    localStorage.setItem('tasks',    JSON.stringify(window.tasks || []));
    localStorage.setItem('teamUsers', JSON.stringify(window.appUsers || []));
  } catch (err) {
    // Silently ignore quota errors
  }
}

/* === Run Early Normalization ===
   Ensures all pages see consistent property names immediately */
normalizeLocalData();

/* === Load Team Data from Backend ===
   Called after login or manual sync — overwrites local state with server truth */
function loadTeamData(data) {
  if (data.projects) {
    window.projects = (data.projects || []).map(p => ({
      ...p,
      description: p.description || p.desc || '',
      team_id:     p.team_id     || p.teamId || null
    }));
  }

  if (data.tasks) {
    window.tasks = (data.tasks || []).map(t => ({
      ...t,
      description: t.description || t.desc || '',
      projectId:   t.projectId   || t.project_id || null,
      team_id:     t.team_id     || t.teamId     || null
    }));
  }

  if (data.users) {
    window.appUsers = (data.users || []).map(u => ({
      ...u,
      team_id: u.team_id || u.teamId || null
    }));
  }

  if (data.team) {
    window.teamId = data.team.id;
    localStorage.setItem('teamId', data.team.id);
  }

  if (data.userRole) {
    window.userRole = data.userRole;
    localStorage.setItem('role', data.userRole);
  }

  if (data.currentUser) {
    window.currentUser = data.currentUser;
    localStorage.setItem('user', data.currentUser);
  }

  // Persist everything for offline/other pages
  try {
    localStorage.setItem('projects', JSON.stringify(window.projects || []));
    localStorage.setItem('tasks',    JSON.stringify(window.tasks || []));
    localStorage.setItem('teamUsers', JSON.stringify(window.appUsers || []));
    if (data.team && data.team.name) localStorage.setItem('teamName', data.team.name);
  } catch (err) {
    console.warn('Failed to persist team data', err);
  }
}

/* === Sync Local Changes to Backend ===
   Sends current team data to server and pulls back canonical version */
async function syncData() {
  if (!window.teamId) return;

  try {
    // Only sync data belonging to the current team
    const teamProjects = (window.projects || []).filter(p => String(p.team_id) === String(window.teamId));
    const teamTasks    = (window.tasks    || []).filter(t => String(t.team_id)    === String(window.teamId));

    const res = await fetch('http://localhost:5000/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'team-id': window.teamId
      },
      body: JSON.stringify({
        projects: teamProjects,
        tasks:    teamTasks
      })
    });

    const data = await res.json().catch(() => null);

    if (data && data.success) {
      // Replace local data with server-provided canonical data
      if (Array.isArray(data.projects)) {
        window.projects = data.projects;
        localStorage.setItem('projects', JSON.stringify(window.projects));
      }
      if (Array.isArray(data.tasks)) {
        window.tasks = data.tasks.map(t => {
          const task = { ...t };
          // Simple deduplication of comments (same user+text+time)
          if (Array.isArray(task.comments)) {
            const seen = new Set();
            task.comments = task.comments.filter(c => {
              const key = `${c.user}|${c.text}|${c.time}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }
          return task;
        });
        localStorage.setItem('tasks', JSON.stringify(window.tasks));
      }
    }
  } catch (err) {
    console.warn('Sync failed — working offline', err);
  }
}

/* === Personal Overdue Task Notifications ===
   Updates badge and dropdown with tasks assigned to current user that are overdue */
function updatePersonalNotifications() {
  if (!window.currentUser || !Array.isArray(window.tasks)) return;

  const normalize = s => (s || '').toString().trim().toLowerCase();

  const overdue = window.tasks.filter(t =>
    normalize(t.assignee) === normalize(window.currentUser) &&
    t.due && new Date(t.due) < new Date() &&
    (t.status || '').toLowerCase() !== 'done'
  );

  const badge = document.getElementById('notifBadge');
  const dropdown = document.getElementById('notifDropdown');

  if (badge) badge.textContent = overdue.length || '0';

  if (dropdown) {
    dropdown.innerHTML = overdue.length > 0
      ? overdue.map(t => `
          <li><a class="dropdown-item text-danger small" href="project-detail.html?id=${t.projectId}">
            ${t.title} overdue!
          </a></li>`).join('')
      : '<li><a class="dropdown-item text-muted">No overdue tasks</a></li>';
  }
}

/* === Navbar Injection ===
   Dynamically adds the main navigation bar to all authenticated pages */
const navbarHTML = `
<nav class="navbar navbar-expand-lg navbar-dark fixed-top">
  <div class="container-fluid">
    <a class="navbar-brand fw-bold fs-4" href="dashboard.html">TaskFlow</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="nav">
      <ul class="navbar-nav me-auto">
        <li class="nav-item"><a class="nav-link" href="dashboard.html">Dashboard</a></li>
        <li class="nav-item"><a class="nav-link" href="projects.html">Projects</a></li>
        ${window.userRole === 'manager'
          ? '<li class="nav-item"><a class="nav-link" href="reports.html">Reports</a></li><li class="nav-item"><a class="nav-link" href="users.html">Users</a></li>'
          : ''
        }
      </ul>
      <ul class="navbar-nav">
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown">
            <span class="badge badge-accent" id="notifBadge">0</span> My Tasks
          </a>
          <ul class="dropdown-menu dropdown-menu-end" id="notifDropdown"></ul>
        </li>
        <li class="nav-item"><a class="nav-link" href="login.html" onclick="localStorage.clear()">Logout</a></li>
      </ul>
    </div>
  </div>
</nav>
<div style="height: 80px;"></div>
`;

// Inject navbar on all pages except login/register/landing
if (!location.pathname.includes('login.html') &&
    !location.pathname.includes('register.html') &&
    !location.pathname.includes('index.html')) {
  document.body.insertAdjacentHTML('afterbegin', navbarHTML);

  // Initial notification update + periodic refresh
  setTimeout(updatePersonalNotifications, 500);
  setInterval(updatePersonalNotifications, 10000);
}