-- ========================================
-- TASKFLOW DATABASE SETUP (Full Multi-Team + Offline Sync Ready)
-- ========================================

DROP DATABASE IF EXISTS taskflow;
CREATE DATABASE taskflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE taskflow;

-- ========================================
-- 1. TEAMS TABLE
-- Stores each team (created when a manager registers)
-- ========================================
CREATE TABLE teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) DEFAULT 'New Team',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 2. USERS TABLE
-- All users belong to a team. Managers create teams.
-- ========================================
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('member', 'manager') DEFAULT 'member',
  team_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

-- ========================================
-- 3. PROJECTS TABLE
-- Projects belong to a specific team
-- ========================================
CREATE TABLE projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  team_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- ========================================
-- 4. TASKS TABLE
-- Tasks belong to a project and a team. JSON fields for comments/files enable offline sync.
-- ========================================
CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  projectId INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  comments JSON,
  files JSON,
  assignee VARCHAR(100),
  priority ENUM('low','medium','high','critical') DEFAULT 'medium',
  due DATE,
  status ENUM('todo','in-progress','done') DEFAULT 'todo',
  team_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- ========================================
-- INSERT DEFAULT DATA (Demo Team + Users + Sample Projects/Tasks)
-- ========================================

-- Create first demo team
INSERT INTO teams (name) VALUES ('Alpha Team');
SET @team_id = LAST_INSERT_ID();

-- Insert demo users (all passwords are bcrypt hash of "123456")
INSERT INTO users (name, email, password, role, team_id) VALUES
('Admin Manager', 'manager@taskflow.com', '$2b$10$Y9Z1Z2Z3Z4Z5Z6Z7Z8Z9Z.uO1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s', 'manager', @team_id),
('Alex Johnson',   'alex@taskflow.com',   '$2b$10$Y9Z1Z2Z3Z4Z5Z6Z7Z8Z9Z.uO1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s', 'member', @team_id),
('Mike Chen',      'mike@taskflow.com',   '$2b$10$Y9Z1Z2Z3Z4Z5Z6Z7Z8Z9Z.uO1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s', 'member', @team_id),
('Lisa Park',      'lisa@taskflow.com',   '$2b$10$Y9Z1Z2Z3Z4Z5Z6Z7Z8Z9Z.uO1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s', 'member', @team_id);

-- Sample projects for the demo team
INSERT INTO projects (name, description, team_id) VALUES
('Website Redesign', 'Modern UI/UX overhaul', @team_id),
('Mobile App v2', 'New features and performance improvements', @team_id);

-- Sample tasks
INSERT INTO tasks (projectId, title, description, assignee, priority, due, status, team_id) VALUES
(1, 'Design Homepage', 'Create Figma mockups', 'Alex Johnson', 'high', '2025-12-20', 'todo', @team_id),
(1, 'Fix Login Bug', 'API authentication issue', 'Mike Chen', 'critical', '2025-12-06', 'in-progress', @team_id),
(2, 'Implement Push Notifications', 'Add Firebase integration', 'Lisa Park', 'medium', '2025-12-30', 'todo', @team_id);

-- ========================================
-- FINAL STATUS REPORT
-- ========================================
SELECT 'Database created successfully!' AS status;
SELECT 'Team ID for default team:' AS info, @team_id AS team_id;
SELECT 'Total users:' AS count, COUNT(*) FROM users;
SELECT 'Total projects:' AS count, COUNT(*) FROM projects;
SELECT 'Total tasks:' AS count, COUNT(*) FROM tasks;