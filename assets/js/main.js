// GLOBAL DATA
window.projects = JSON.parse(localStorage.getItem('projects')) || [
  { id: 1, name: "Website Redesign", description: "Modern UI/UX" },
  { id: 2, name: "Mobile App v2", description: "New features" }
];

window.tasks = JSON.parse(localStorage.getItem('tasks')) || [
  { id: 1, projectId: 1, title: "Design Homepage", description: "Figma mockups", assignee: "Alex Johnson", priority: "high", due: "2025-12-05", status: "todo", comments: [], files: [] },
  { id: 2, projectId: 1, title: "Fix Login Bug", description: "API issue", assignee: "Mike Chen", priority: "critical", due: "2025-12-04", status: "in-progress", comments: [], files: [] }
];

window.appUsers = JSON.parse(localStorage.getItem('appUsers')) || [
  { name: "Admin Manager", email: "manager@taskflow.com", password: "123456", role: "manager" },
  { name: "Alex Johnson", email: "alex@taskflow.com", password: "123456", role: "member" },
  { name: "Mike Chen", email: "mike@taskflow.com", password: "123456", role: "member" },
  { name: "Lisa Park", email: "lisa@taskflow.com", password: "123456", role: "member" },
  { name: "Tom Wilson", email: "tom@taskflow.com", password: "123456", role: "member" }
];

function saveData() {
  localStorage.setItem('projects', JSON.stringify(window.projects));
  localStorage.setItem('tasks', JSON.stringify(window.tasks));
  localStorage.setItem('appUsers', JSON.stringify(window.appUsers));
}

// PERSONAL NOTIFICATIONS — ONLY YOUR OVERDUE TASKS
function updatePersonalNotifications() {
  const currentUserName = localStorage.getItem('user') || 'User';
  const overdueTasks = window.tasks.filter(t => 
    t.assignee === currentUserName && 
    new Date(t.due) < new Date() && 
    t.status !== 'done'
  );

  const badge = document.getElementById('notifBadge');
  const dropdown = document.getElementById('notifDropdown');

  if (badge) badge.textContent = overdueTasks.length || '0';
  if (dropdown) {
    if (overdueTasks.length > 0) {
      dropdown.innerHTML = overdueTasks.map(t => `
        <li><a class="dropdown-item text-danger small" href="project-detail.html?id=${t.projectId}">
          "${t.title}" is overdue! (Due: ${t.due})
        </a></li>
      `).join('');
    } else {
      dropdown.innerHTML = '<li><a class="dropdown-item text-muted">No overdue tasks</a></li>';
    }
  }
}

// NAVBAR WITH PERSONAL NOTIFICATIONS
const navbarHTML = `
<nav class="navbar navbar-expand-lg navbar-dark fixed-top">
  <div class="container-fluid">
    <a class="navbar-brand fw-bold fs-4" href="dashboard.html">TaskFlow</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navbarNav">
      <ul class="navbar-nav me-auto">
        <li class="nav-item"><a class="nav-link" href="dashboard.html">Dashboard</a></li>
        <li class="nav-item"><a class="nav-link" href="projects.html">Projects</a></li>
        ${localStorage.getItem('role') === 'manager' ? `
          <li class="nav-item"><a class="nav-link" href="reports.html">Reports</a></li>
          <li class="nav-item"><a class="nav-link" href="users.html">Users</a></li>
        ` : ''}
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

// Inject navbar + update notifications
if (!location.pathname.includes('login.html') && !location.pathname.includes('index.html')) {
  document.body.insertAdjacentHTML('afterbegin', navbarHTML);
  setTimeout(() => {
    updatePersonalNotifications();
    setInterval(updatePersonalNotifications, 10000); // Refresh every 10s
  }, 300);
}

// Export for other pages
window.updatePersonalNotifications = updatePersonalNotifications;
window.saveData = saveData;