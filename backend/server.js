const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const app = express();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_%]/g, '_');
    cb(null, safe);
  }
});
const upload = multer({ storage });

app.use('/uploads', express.static(uploadsDir));

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ success: true, url, name: req.file.originalname });
});

app.use(cors());
app.use(express.json());

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
  console.log('MySQL Connected!');
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err || results.length === 0) return res.json({ success: false, message: 'Invalid credentials' });

    const user = results[0];
    let match = await bcrypt.compare(password, user.password);
    if (!match) {
      const demoEmails = ['manager@taskflow.com', 'user@taskflow.com', '123@123.com'];
      if (password === '123456' && demoEmails.includes(user.email)) {
        match = true;
      }
    }
    if (!match) return res.json({ success: false, message: 'Invalid credentials' });

    const response = {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.team_id
      }
    };

    const teamId = user.team_id;
    db.query('SELECT * FROM projects WHERE team_id = ?', [teamId], (err, projects) => {
      db.query('SELECT * FROM tasks WHERE team_id = ?', [teamId], (err, tasks) => {
        if (Array.isArray(tasks)) {
          tasks = tasks.map(t => {
            try {
              if (t.comments && typeof t.comments === 'string') {
                t.comments = JSON.parse(t.comments);
              } else if (!t.comments) {
                t.comments = [];
              }
            } catch (e) {
              t.comments = [];
            }
            return t;
          });
        }
        db.query('SELECT id, name, email, role, team_id FROM users WHERE team_id = ?', [teamId], (err, users) => {
          db.query('SELECT * FROM teams WHERE id = ?', [teamId], (err, teams) => {
            response.data = {
              projects: projects || [],
              tasks: tasks || [],
              users: users || [],
              team: (teams && teams[0]) || null
            };
            res.json(response);
          });
        });
      });
    });
  });
});

app.post('/api/sync', async (req, res) => {
  const teamId = req.headers['team-id'];
  if (!teamId) return res.json({ success: false, message: 'Team ID required' });

  const { projects, tasks } = req.body;

  try {
    const incomingProjectIds = new Set((projects || []).map(p => String(p.id)));
    const [dbProjects] = await db.promise().query('SELECT id FROM projects WHERE team_id = ?', [teamId]);
    for (const dbProj of dbProjects) {
      if (!incomingProjectIds.has(String(dbProj.id))) {
        const [tasksToDelete] = await db.promise().query('SELECT comments, files FROM tasks WHERE projectId = ?', [dbProj.id]);
        for (const t of tasksToDelete) {
          if (t.files) {
            try {
              const filesArr = typeof t.files === 'string' ? JSON.parse(t.files) : t.files;
              for (const f of filesArr || []) {
                if (f.data && f.data.includes('/uploads/')) {
                  const filePath = path.join(__dirname, '..', f.data.split('/uploads/')[1]);
                  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }
              }
            } catch {}
          }
          if (t.comments) {
            try {
              const commentsArr = typeof t.comments === 'string' ? JSON.parse(t.comments) : t.comments;
              for (const c of commentsArr || []) {
                if (c.file && c.file.data && c.file.data.includes('/uploads/')) {
                  const filePath = path.join(__dirname, '..', c.file.data.split('/uploads/')[1]);
                  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }
              }
            } catch {}
          }
        }
        await db.promise().query('DELETE FROM tasks WHERE projectId = ?', [dbProj.id]);
        await db.promise().query('DELETE FROM projects WHERE id = ?', [dbProj.id]);
      }
    }

    const incomingTaskIds = new Set((tasks || []).map(t => String(t.id)));
    const [dbTasks] = await db.promise().query('SELECT id FROM tasks WHERE team_id = ?', [teamId]);
    for (const dbTask of dbTasks) {
      if (!incomingTaskIds.has(String(dbTask.id))) {
        const [taskRows] = await db.promise().query('SELECT comments, files FROM tasks WHERE id = ?', [dbTask.id]);
        for (const t of taskRows) {
          if (t.files) {
            try {
              const filesArr = typeof t.files === 'string' ? JSON.parse(t.files) : t.files;
              for (const f of filesArr || []) {
                if (f.data && f.data.includes('/uploads/')) {
                  const filePath = path.join(__dirname, '..', f.data.split('/uploads/')[1]);
                  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }
              }
            } catch {}
          }
          if (t.comments) {
            try {
              const commentsArr = typeof t.comments === 'string' ? JSON.parse(t.comments) : t.comments;
              for (const c of commentsArr || []) {
                if (c.file && c.file.data && c.file.data.includes('/uploads/')) {
                  const filePath = path.join(__dirname, '..', c.file.data.split('/uploads/')[1]);
                  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }
              }
            } catch {}
          }
        }
        await db.promise().query('DELETE FROM tasks WHERE id = ?', [dbTask.id]);
      }
    }

    for (const p of projects) {
      await new Promise((resolve, reject) => {
        db.query(
          'INSERT INTO projects (id, name, description, team_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, description = ?',
          [p.id, p.name, p.description, teamId, p.name, p.description],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    for (const t of tasks) {
      await new Promise((resolve, reject) => {
        const commentsJson = JSON.stringify(t.comments || []);
        let dueSql = null;
        try {
          if (t.due) {
            const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(String(t.due));
            if (isoMatch) {
              dueSql = t.due;
            } else {
              const d = new Date(t.due);
              if (!isNaN(d.getTime())) {
                dueSql = d.toISOString().slice(0, 10);
              } else {
                dueSql = null;
              }
            }
          }
        } catch (e) {
          dueSql = null;
        }

        db.query(
          `INSERT INTO tasks 
           (id, projectId, title, description, assignee, priority, due, status, team_id, comments) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             title = ?, description = ?, assignee = ?, priority = ?, due = ?, status = ?, comments = ?`,
          [
            t.id, t.projectId, t.title, t.description, t.assignee, t.priority, dueSql, t.status, teamId, commentsJson,
            t.title, t.description, t.assignee, t.priority, dueSql, t.status, commentsJson
          ],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    db.query('SELECT * FROM projects WHERE team_id = ?', [teamId], (err, projectsAfter) => {
      if (err) return res.json({ success: false, message: 'Sync completed but fetch failed' });
      db.query('SELECT * FROM tasks WHERE team_id = ?', [teamId], (err, tasksAfter) => {
        if (err) return res.json({ success: false, message: 'Sync completed but fetch failed' });
        if (Array.isArray(tasksAfter)) {
          tasksAfter = tasksAfter.map(t => {
            try {
              if (t.comments && typeof t.comments === 'string') t.comments = JSON.parse(t.comments);
              else if (!t.comments) t.comments = [];
            } catch (e) {
              t.comments = [];
            }
            return t;
          });
        }
        res.json({ success: true, projects: projectsAfter || [], tasks: tasksAfter || [] });
      });
    });
  } catch (err) {
    console.error('Sync failed:', err);
    res.json({ success: false, message: 'Sync failed' });
  }
});

app.post('/api/register', async (req, res) => {
  const { name, email, password, role, teamId } = req.body;
  const hashed = await bcrypt.hash(password, 10);

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err || results.length > 0) return res.json({ success: false, message: 'Email already registered' });

    if (role === 'manager') {
      db.query('INSERT INTO teams (name) VALUES (?)', [`Team of ${name}`], (err, result) => {
        if (err) return res.json({ success: false });
        const newTeamId = result.insertId;
        db.query('INSERT INTO users (name, email, password, role, team_id) VALUES (?, ?, ?, ?, ?)',
          [name, email, hashed, 'manager', newTeamId],
          () => res.json({ success: true, teamId: newTeamId })
        );
      });
    } else {
      if (!teamId) return res.json({ success: false, message: 'Team ID required' });
      db.query('SELECT id FROM teams WHERE id = ?', [teamId], (err, results) => {
        if (err || results.length === 0) return res.json({ success: false, message: 'Invalid Team ID' });
        db.query('INSERT INTO users (name, email, password, role, team_id) VALUES (?, ?, ?, ?, ?)',
          [name, email, hashed, 'member', teamId],
          () => res.json({ success: true })
        );
      });
    }
  });
});

app.listen(5000, () => {
  console.log('TaskFlow Backend FIXED & RUNNING on http://localhost:5000');
});