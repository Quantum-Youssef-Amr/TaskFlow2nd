// GLOBAL DATA — LOADED FROM BACKEND ON LOGIN
window.projects = [];
window.tasks = [];
window.appUsers = [];
// Try to initialize from localStorage so pages that don't load data from backend still behave
window.teamId = localStorage.getItem('teamId') || null;
window.userRole = localStorage.getItem('role') || null;
window.currentUser = localStorage.getItem('user') || null;
// Load persisted lists from localStorage if available
try {
  const storedProjects = localStorage.getItem('projects');
  const storedTasks = localStorage.getItem('tasks');
  const storedUsers = localStorage.getItem('teamUsers');
  if (storedProjects) window.projects = JSON.parse(storedProjects);
  if (storedTasks) window.tasks = JSON.parse(storedTasks);
  if (storedUsers) window.appUsers = JSON.parse(storedUsers);
} catch (err) {
  console.warn('Failed to parse stored data', err);
}

// Normalize keys from different data sources (dummy data, DB, localStorage)
function normalizeLocalData() {
  const normalizeString = v => (v === undefined || v === null) ? v : v;

  window.projects = (window.projects || []).map(p => {
    const proj = Object.assign({}, p);
    if (!proj.description && proj.desc) proj.description = proj.desc;
    if (!proj.team_id && proj.teamId) proj.team_id = proj.teamId;
    return proj;
  });

  window.tasks = (window.tasks || []).map(t => {
    const task = Object.assign({}, t);
    if (!task.description && task.desc) task.description = task.desc;
    // support both camelCase and snake_case coming from different sources
    if (!task.projectId && task.project_id) task.projectId = task.project_id;
    if (!task.team_id && task.teamId) task.team_id = task.teamId;
    return task;
  });

  window.appUsers = (window.appUsers || []).map(u => {
    const user = Object.assign({}, u);
    if (!user.team_id && user.teamId) user.team_id = user.teamId;
    return user;
  });

  try {
    localStorage.setItem('projects', JSON.stringify(window.projects || []));
    localStorage.setItem('tasks', JSON.stringify(window.tasks || []));
    localStorage.setItem('teamUsers', JSON.stringify(window.appUsers || []));
  } catch (err) {
    // ignore
  }
}

// Run normalization early so pages can rely on stable keys
normalizeLocalData();

// LOAD DATA FROM LOGIN RESPONSE (CRITICAL FIX!)
function loadTeamData(data) {
  if (data.projects) window.projects = (data.projects || []).map(p => ({
    ...p,
    description: p.description || p.desc || '',
    team_id: p.team_id || p.teamId || null
  }));
  if (data.tasks) window.tasks = (data.tasks || []).map(t => ({
    ...t,
    description: t.description || t.desc || '',
    projectId: t.projectId || t.project_id || null,
    team_id: t.team_id || t.teamId || null
  }));
  if (data.users) window.appUsers = (data.users || []).map(u => ({
    ...u,
    team_id: u.team_id || u.teamId || null
  }));
  if (data.team) {
    window.teamId = data.team.id;
    localStorage.setItem('teamId', data.team.id);
  }
  // If login supplied a role or current user, keep local state consistent
  if (data.userRole) {
    window.userRole = data.userRole;
    localStorage.setItem('role', data.userRole);
  }
  if (data.currentUser) {
    window.currentUser = data.currentUser;
    localStorage.setItem('user', data.currentUser);
  }
  // Persist lists for other pages
  try {
    localStorage.setItem('projects', JSON.stringify(window.projects || []));
    localStorage.setItem('tasks', JSON.stringify(window.tasks || []));
    localStorage.setItem('teamUsers', JSON.stringify(window.appUsers || []));
    if (data.team && data.team.name) localStorage.setItem('teamName', data.team.name);
  } catch (err) {
    console.warn('Failed to persist team data', err);
  }
}

// PERSONAL SYNC — NOW SAFE
async function syncData() {
  if (!window.teamId) return;
  try {
    // Only sync current team’s projects/tasks
    const teamProjects = (window.projects || []).filter(p => String(p.team_id) === String(window.teamId));
    const teamTasks = (window.tasks || []).filter(t => String(t.team_id) === String(window.teamId));

    // Preserve local-only fields (like comments) by capturing them before sync
    const localCommentsMap = {};
    teamTasks.forEach(t => {
      const key = String(t.id === undefined ? '' : t.id);
      if (Array.isArray(t.comments) && t.comments.length) localCommentsMap[key] = (t.comments || []).slice();
    });

    const res = await fetch('http://localhost:5000/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'team-id': window.teamId
      },
      body: JSON.stringify({
        projects: teamProjects,
        tasks: teamTasks
      })
    });

    // If server returned canonical lists, merge/apply them to local state and persist
    const data = await res.json().catch(() => null);
    if (data && data.success) {
      if (Array.isArray(data.projects)) {
        // Always use canonical server list, overwriting local
        window.projects = data.projects;
        try { localStorage.setItem('projects', JSON.stringify(window.projects)); } catch (err) {}
      }
      if (Array.isArray(data.tasks)) {
        // Always use canonical server list, overwriting local
        window.tasks = (data.tasks || []).map(t => {
          const task = Object.assign({}, t);
          // Deduplicate comments by user+text+time
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
        try { localStorage.setItem('tasks', JSON.stringify(window.tasks)); } catch (err) {}
      }
    }
  } catch (err) {
    console.warn('Sync failed (offline?)', err);
  }
}

// PERSONAL NOTIFICATIONS
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
      ? overdue.map(t => `<li><a class="dropdown-item text-danger small" href="project-detail.html?id=${t.projectId}">${t.title} overdue!</a></li>`).join('')
      : '<li><a class="dropdown-item text-muted">No overdue tasks</a></li>';
  }
}

// NAVBAR — INJECTED ON ALL PAGES
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
        ${window.userRole === 'manager' ? '<li class="nav-item"><a class="nav-link" href="reports.html">Reports</a></li><li class="nav-item"><a class="nav-link" href="users.html">Users</a></li>' : ''}
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

// Inject navbar on all pages except login/register
if (!location.pathname.includes('login.html') && !location.pathname.includes('register.html') && !location.pathname.includes('index.html')) {
  document.body.insertAdjacentHTML('afterbegin', navbarHTML);
  setTimeout(updatePersonalNotifications, 500);
  setInterval(updatePersonalNotifications, 10000);
}