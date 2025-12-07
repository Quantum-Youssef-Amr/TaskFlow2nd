const users = [
  { name: 'Alex', avatar: 'assets/images/avatar1.jpg' },
  { name: 'Mike', avatar: 'assets/images/avatar2.jpg' },
  { name: 'Lisa', avatar: 'assets/images/avatar3.jpg' },
  { name: 'Tom', avatar: 'assets/images/avatar4.jpg' }
];

let projects = [
  { id: 1, name: 'Website Redesign', desc: 'Revamp company website', tasks: [] },
  { id: 2, name: 'Mobile App v2', desc: 'Update mobile application', tasks: [] }
];

let tasks = [
  { id: 1, projectId: 1, title: 'Design Homepage', desc: 'Create mockups', status: 'todo', priority: 'high', assignee: 'Alex', due: '2025-12-10', files: [], comments: [] },
  { id: 2, projectId: 1, title: 'Fix API Bug', desc: 'Resolve login issue', status: 'in-progress', priority: 'critical', assignee: 'Mike', due: '2025-12-07', files: [], comments: [] },
  { id: 3, projectId: 2, title: 'User Testing', desc: 'Conduct tests', status: 'done', priority: 'medium', assignee: 'Lisa', due: '2025-12-05', files: [], comments: [] }
];

const activity = [
  { user: 'Mike', action: 'completed task "Fix API Bug"', time: '2 hours ago' },
  { user: 'Lisa', action: 'added comment to "Design Homepage"', time: '4 hours ago' },
  { user: 'Alex', action: 'assigned task "User Testing"', time: '6 hours ago' }
];

const reportData = {
  status: { todo: 5, 'in-progress': 3, done: 10 },
  members: { Alex: 8, Mike: 5, Lisa: 4, Tom: 1 },
  overdue: [2, 3, 1, 4, 2, 5, 3]
};

// Simulate local storage persistence
if (!localStorage.getItem('projects')) {
  localStorage.setItem('projects', JSON.stringify(projects));
}
if (!localStorage.getItem('tasks')) {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}