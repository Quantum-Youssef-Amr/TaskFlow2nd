// ========================================
// TaskFlow Backend Server (Node.js + Express)
// ========================================

const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Initialize Express app
const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Save files to 'uploads' folder
  },
  filename: (req, file, cb) => {
    // Generate safe, unique filename using timestamp + sanitized original name
    const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_%]/g, '_');
    cb(null, safeName);
  }
});

const upload = multer({ storage });

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// ========================================
// FILE UPLOAD ENDPOINT
// ========================================
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  // Construct public URL for the uploaded file
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  
  res.json({
    success: true,
    url: fileUrl,
    name: req.file.originalname
  });
});

// ========================================
// MIDDLEWARE SETUP
// ========================================
app.use(cors());                    // Allow cross-origin requests (for frontend)
app.use(express.json());            // Parse incoming JSON bodies

// ========================================
// DATABASE CONNECTION
// ========================================
const db = mysql.createConnection({
  host: 'localhost',
  user: 'taskflow',
  password: '123456',
  database: 'taskflow'
});

db.connect(err => {
  if (err) {
    console.error('MySQL Connection Failed:', err);
    process.exit(1);
  }
  console.log('MySQL Connected Successfully!');
});

// ========================================
// USER LOGIN ENDPOINT
// ========================================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err || results.length === 0) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    const user = results[0];
    let passwordMatch = await bcrypt.compare(password, user.password);

    // Demo account bypass (for testing only)
    const demoEmails = ['manager@taskflow.com', 'user@taskflow.com', '123@123.com'];
    if (!passwordMatch && password === '123456' && demoEmails.includes(email)) {
      passwordMatch = true;
    }

    if (!passwordMatch) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    const teamId = user.team_id;

    // Fetch all team-related data after successful login
    db.query('SELECT * FROM projects WHERE team_id = ?', [teamId], (err, projects) => {
      db.query('SELECT * FROM tasks WHERE team_id = ?', [teamId], (err, tasks) => {
        // Parse JSON fields (comments & files) stored as strings in DB
        if (Array.isArray(tasks)) {
          tasks = tasks.map(task => {
            try {
              task.comments = task.comments ? JSON.parse(task.comments) : [];
              task.files = task.files ? JSON.parse(task.files) : [];
            } catch (e) {
              task.comments = [];
              task.files = [];
            }
            return task;
          });
        }

        db.query('SELECT id, name, email, role, team_id FROM users WHERE team_id = ?', [teamId], (err, users) => {
          db.query('SELECT * FROM teams WHERE id = ?', [teamId], (err, teams) => {
            res.json({
              success: true,
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                teamId: user.team_id
              },
              data: {
                projects: projects || [],
                tasks: tasks || [],
                users: users || [],
                team: teams && teams.length > 0 ? teams[0] : null
              }
            });
          });
        });
      });
    });
  });
});

// ========================================
// DATA SYNC ENDPOINT (Offline-First Support)
// ========================================
app.post('/api/sync', async (req, res) => {
  const teamId = req.headers['team-id'];
  if (!teamId) return res.json({ success: false, message: 'Team ID required' });

  const { projects = [], tasks = [] } = req.body;

  try {
    // --- Step 1: Delete projects no longer present in client ---
    const incomingProjectIds = new Set(projects.map(p => String(p.id)));
    const [dbProjects] = await db.promise().query('SELECT id FROM projects WHERE team_id = ?', [teamId]);

    for (const proj of dbProjects) {
      if (!incomingProjectIds.has(String(proj.id))) {
        // Clean up associated task files before deleting
        const [taskFiles] = await db.promise().query('SELECT comments, files FROM tasks WHERE projectId = ?', [proj.id]);
        for (const t of taskFiles) {
          await deleteAssociatedFiles(t);
        }
        await db.promise().query('DELETE FROM tasks WHERE projectId = ?', [proj.id]);
        await db.promise().query('DELETE FROM projects WHERE id = ?', [proj.id]);
      }
    }

    // --- Step 2: Delete tasks no longer present in client ---
    const incomingTaskIds = new Set(tasks.map(t => String(t.id)));
    const [dbTasks] = await db.promise().query('SELECT id FROM tasks WHERE team_id = ?', [teamId]);

    for (const task of dbTasks) {
      if (!incomingTaskIds.has(String(task.id))) {
        const [taskData] = await db.promise().query('SELECT comments, files FROM tasks WHERE id = ?', [task.id]);
        for (const t of taskData) {
          await deleteAssociatedFiles(t);
        }
        await db.promise().query('DELETE FROM tasks WHERE id = ?', [task.id]);
      }
    }

    // --- Step 3: Upsert incoming projects ---
    for (const p of projects) {
      await db.promise().query(
        'INSERT INTO projects (id, name, description, team_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, description = ?',
        [p.id, p.name, p.description, teamId, p.name, p.description]
      );
    }

    // --- Step 4: Upsert incoming tasks ---
    for (const t of tasks) {
      const filesJson = JSON.stringify(Array.isArray(t.files) ? t.files : []);
      const commentsJson = JSON.stringify(t.comments || []);

      // Normalize due date to YYYY-MM-DD format
      let dueDate = null;
      if (t.due) {
        const isoFormat = /^\d{4}-\d{2}-\d{2}$/.test(String(t.due));
        if (isoFormat) {
          dueDate = t.due;
        } else {
          const date = new Date(t.due);
          if (!isNaN(date.getTime())) {
            dueDate = date.toISOString().slice(0, 10);
          }
        }
      }

      await db.promise().query(
        `INSERT INTO tasks 
         (id, projectId, title, description, assignee, priority, due, status, team_id, comments, files)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         title = ?, description = ?, assignee = ?, priority = ?, due = ?, status = ?, comments = ?, files = ?`,
        [
          t.id, t.projectId, t.title, t.description, t.assignee, t.priority, dueDate, t.status, teamId, commentsJson, filesJson,
          t.title, t.description, t.assignee, t.priority, dueDate, t.status, commentsJson, filesJson
        ]
      );
    }

    // --- Step 5: Return fresh data ---
    const [finalProjects] = await db.promise().query('SELECT * FROM projects WHERE team_id = ?', [teamId]);
    const [finalTasks] = await db.promise().query('SELECT * FROM tasks WHERE team_id = ?', [teamId]);

    const parsedTasks = finalTasks.map(task => {
      try {
        task.comments = task.comments ? JSON.parse(task.comments) : [];
        task.files = task.task.files ? JSON.parse(task.files) : [];
      } catch (e) {
        task.comments = [];
        task.files = [];
      }
      return task;
    });

    res.json({
      success: true,
      projects: finalProjects,
      tasks: parsedTasks
    });

  } catch (err) {
    console.error('Sync failed:', err);
    res.json({ success: false, message: 'Sync failed' });
  }
});

// Helper function to delete uploaded files when tasks/comments are removed
async function deleteAssociatedFiles(taskRow) {
  const deleteFile = (url) => {
    if (url && url.includes('/uploads/')) {
      const filePath = path.join(__dirname, url.split('/uploads/')[1]);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  };

  try {
    const files = typeof taskRow.files === 'string' ? JSON.parse(taskRow.files) : taskRow.files;
    files?.forEach(f => deleteFile(f.url));
  } catch (e) {}

  try {
    const comments = typeof taskRow.comments === 'string' ? JSON.parse(taskRow.comments) : taskRow.comments;
    comments?.forEach(c => c.file?.url && deleteFile(c.file.url));
  } catch (e) {}
}

// ========================================
// USER REGISTRATION ENDPOINT
// ========================================
app.post('/api/register', async (req, res) => {
  const { name, email, password, role, teamId } = req.body;

  // Check if email already exists
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err || results.length > 0) {
      return res.json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    if (role === 'manager') {
      // Manager creates a new team
      db.query('INSERT INTO teams (name) VALUES (?)', [`Team of ${name}`], (err, result) => {
        if (err) return res.json({ success: false, message: 'Team creation failed' });

        const newTeamId = result.insertId;
        db.query(
          'INSERT INTO users (name, email, password, role, team_id) VALUES (?, ?, ?, ?, ?)',
          [name, email, hashedPassword, 'manager', newTeamId],
          () => res.json({ success: true, teamId: newTeamId })
        );
      });
    } else {
      // Member joins existing team
      if (!teamId) return res.json({ success: false, message: 'Team ID required' });

      db.query('SELECT id FROM teams WHERE id = ?', [teamId], (err, results) => {
        if (err || results.length === 0) {
          return res.json({ success: false, message: 'Invalid Team ID' });
        }

        db.query(
          'INSERT INTO users (name, email, password, role, team_id) VALUES (?, ?, ?, ?, ?)',
          [name, email, hashedPassword, 'member', teamId],
          () => res.json({ success: true })
        );
      });
    }
  });
});

// ========================================
// START SERVER
// ========================================
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`TaskFlow Backend RUNNING on http://localhost:${PORT}`);
});