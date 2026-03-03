-- ========================
-- Create Database (Run this in psql or pgAdmin)
-- ========================
-- First, connect to PostgreSQL as superuser and create database
-- CREATE DATABASE smart_attendance;

-- Connect to the smart_attendance database
\c smart_attendance;

-- ========================
-- Create Schema
-- ========================
CREATE SCHEMA IF NOT EXISTS attendance_schema;

-- Set search path to use our schema
SET search_path TO attendance_schema;

-- ========================
-- Users (Admin, Teacher, Student)
-- ========================
CREATE TABLE IF NOT EXISTS attendance_schema.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('admin', 'teacher', 'student')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================
-- Courses
-- ========================
CREATE TABLE IF NOT EXISTS attendance_schema.courses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================
-- Sessions (Class sessions with QR code)
-- ========================
CREATE TABLE IF NOT EXISTS attendance_schema.sessions (
    id SERIAL PRIMARY KEY,
    course_id INT REFERENCES attendance_schema.courses(id) ON DELETE CASCADE,
    teacher_id INT REFERENCES attendance_schema.users(id) ON DELETE CASCADE,
    qr_code TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================
-- Attendance Records
-- ========================
CREATE TABLE IF NOT EXISTS attendance_schema.attendance (
    id SERIAL PRIMARY KEY,
    session_id INT REFERENCES attendance_schema.sessions(id) ON DELETE CASCADE,
    student_id INT REFERENCES attendance_schema.users(id) ON DELETE CASCADE,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    method VARCHAR(20) DEFAULT 'qr_gps' CHECK (method IN ('qr_gps', 'manual')),
    UNIQUE(session_id, student_id)  -- prevents duplicate attendance
);

-- ========================
-- Activities (Projects, Events, etc.)
-- ========================
CREATE TABLE IF NOT EXISTS attendance_schema.activities (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    due_date DATE,
    created_by INT REFERENCES attendance_schema.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================
-- Chatbot Queries (Optional logging)
-- ========================
CREATE TABLE IF NOT EXISTS attendance_schema.chatbot_logs (
    id SERIAL PRIMARY KEY,
    student_id INT REFERENCES attendance_schema.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    response TEXT,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================
-- Seed Data
-- ========================
-- Insert default admin user
INSERT INTO attendance_schema.users (username, password, role)
VALUES ('admin1', 'admin123', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Insert sample teacher
INSERT INTO attendance_schema.users (username, password, role)
VALUES ('teacher1', 'teacher123', 'teacher')
ON CONFLICT (username) DO NOTHING;

-- Insert sample students
INSERT INTO attendance_schema.users (username, password, role)
VALUES 
    ('student1', 'student123', 'student'),
    ('student2', 'student123', 'student'),
    ('student3', 'student123', 'student')
ON CONFLICT (username) DO NOTHING;

-- Insert sample courses
INSERT INTO attendance_schema.courses (name, description)
VALUES 
    ('Computer Science 101', 'Introduction to Computer Science'),
    ('Web Development', 'Full Stack Web Development Course'),
    ('Database Systems', 'Database Design and Management')
ON CONFLICT DO NOTHING;

-- ========================
-- Useful Views
-- ========================
CREATE OR REPLACE VIEW attendance_schema.session_summary AS
SELECT 
    s.id as session_id,
    s.qr_code,
    s.created_at as session_date,
    c.name as course_name,
    u.username as teacher_name,
    COUNT(a.id) as attendance_count
FROM attendance_schema.sessions s
JOIN attendance_schema.courses c ON s.course_id = c.id
JOIN attendance_schema.users u ON s.teacher_id = u.id
LEFT JOIN attendance_schema.attendance a ON s.id = a.session_id
GROUP BY s.id, s.qr_code, s.created_at, c.name, u.username
ORDER BY s.created_at DESC;

CREATE OR REPLACE VIEW attendance_schema.student_attendance_summary AS
SELECT 
    u.id as student_id,
    u.username as student_name,
    c.name as course_name,
    COUNT(a.id) as classes_attended,
    COUNT(s.id) as total_classes,
    ROUND((COUNT(a.id) * 100.0 / NULLIF(COUNT(s.id), 0)), 2) as attendance_percentage
FROM attendance_schema.users u
CROSS JOIN attendance_schema.courses c
CROSS JOIN attendance_schema.sessions s
LEFT JOIN attendance_schema.attendance a ON (a.student_id = u.id AND a.session_id = s.id)
WHERE u.role = 'student' AND s.course_id = c.id
GROUP BY u.id, u.username, c.name
ORDER BY u.username, c.name;

-- ========================
-- Useful Queries for Testing
-- ========================

-- 1. List all sessions with teacher names
-- SELECT s.id, s.qr_code, s.created_at, u.username AS teacher, c.name as course
-- FROM attendance_schema.sessions s
-- JOIN attendance_schema.users u ON s.teacher_id = u.id
-- JOIN attendance_schema.courses c ON s.course_id = c.id;

-- 2. List students who attended a specific session
-- SELECT u.username AS student, a.ts, a.method
-- FROM attendance_schema.attendance a
-- JOIN attendance_schema.users u ON a.student_id = u.id
-- WHERE a.session_id = 1;

-- 3. Student attendance records for a course
-- SELECT c.name AS course, s.id AS session_id, a.ts, a.method
-- FROM attendance_schema.attendance a
-- JOIN attendance_schema.sessions s ON a.session_id = s.id
-- JOIN attendance_schema.courses c ON s.course_id = c.id
-- WHERE a.student_id = 2;

-- 4. Attendance percentage of all students in a course
-- SELECT * FROM attendance_schema.student_attendance_summary WHERE course_name = 'Computer Science 101';

-- 5. Get session summary
-- SELECT * FROM attendance_schema.session_summary;

-- ========================
-- Indexes for Performance
-- ========================
CREATE INDEX IF NOT EXISTS idx_users_username ON attendance_schema.users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON attendance_schema.users(role);
CREATE INDEX IF NOT EXISTS idx_sessions_course ON attendance_schema.sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON attendance_schema.sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_schema.attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_schema.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_ts ON attendance_schema.attendance(ts);

-- ========================
-- Grant Permissions (if needed)
-- ========================
-- GRANT ALL PRIVILEGES ON SCHEMA attendance_schema TO postgres;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA attendance_schema TO postgres;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA attendance_schema TO postgres;

-- Set default search path for future connections
-- ALTER DATABASE smart_attendance SET search_path TO attendance_schema;