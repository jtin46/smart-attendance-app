from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from sqlalchemy import create_engine, text
from datetime import datetime, timedelta
import pytz
import os
import json
import uuid
import logging

app = Flask(__name__, static_folder=".", template_folder=".")
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# PostgreSQL connection with schema support
DATABASE_URL = "postgresql+psycopg2://postgres:jatin123@localhost:5432/smart_attendance"

try:
    engine = create_engine(
        DATABASE_URL, 
        echo=False,  # Set to True for SQL debugging
        connect_args={
            "options": "-csearch_path=attendance_schema"
        }
    )
except Exception as e:
    logger.error(f"Database connection failed: {e}")
    engine = None

def now_utc():
    return datetime.now(pytz.utc)

# Enhanced in-memory fallback storage with role-based logic
memory_storage = {
    'users': {
        # Admin users - no college code required during login
        'admin1': {
            'username': 'admin1', 'password': 'admin123', 'role': 'admin', 
            'fullName': 'System Administrator', 'id': 1, 
            'collegeCode': None, 'email': 'admin@system.edu'
        },
        'admin_tech': {
            'username': 'admin_tech', 'password': 'admin123', 'role': 'admin',
            'fullName': 'Tech Admin', 'id': 2, 
            'collegeCode': 'TECH2024', 'email': 'admin@tech.edu'
        },
        
        # Teacher users - require college code
        'teacher1': {
            'username': 'teacher1', 'password': 'teacher123', 'role': 'teacher',
            'fullName': 'Dr. John Smith', 'id': 3, 
            'collegeCode': 'TECH2024', 'department': 'Computer Science'
        },
        
        # Student users - require college code
        'student1': {
            'username': 'student1', 'password': 'student123', 'role': 'student',
            'fullName': 'Alice Brown', 'id': 4,
            'collegeCode': 'TECH2024', 'class': 'CS-1A'
        }
    },
    'colleges': {
        'TECH2024': {
            'code': 'TECH2024',
            'name': 'Tech University',
            'admin': 'admin_tech',
            'departments': ['Computer Science', 'Information Technology'],
            'classes': ['CS-1A', 'CS-2B', 'IT-3A']
        }
    },
    'sessions': {},
    'attendance': {}
}

# -------- Database Setup --------
def init_database():
    """Initialize database schema and tables if they don't exist"""
    if not engine:
        logger.warning("Database engine not available, using memory storage")
        return
    
    try:
        with engine.begin() as conn:
            # Create schema if it doesn't exist
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS attendance_schema"))
            
            # Set search path for this connection
            conn.execute(text("SET search_path TO attendance_schema"))
            
            # Create enhanced users table with college_code nullable for admins
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS attendance_schema.users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    role VARCHAR(20) CHECK (role IN ('admin', 'teacher', 'student')) NOT NULL,
                    full_name VARCHAR(100),
                    department VARCHAR(100),
                    college_code VARCHAR(20), -- Nullable for admins
                    email VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(50),
                    is_active BOOLEAN DEFAULT TRUE
                )
            """))
            
            # Create colleges table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS attendance_schema.colleges (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(200) NOT NULL,
                    code VARCHAR(20) UNIQUE NOT NULL,
                    admin_username VARCHAR(50),
                    address TEXT,
                    location_lat DECIMAL(10, 8),
                    location_lng DECIMAL(11, 8),
                    attendance_range INTEGER DEFAULT 100,
                    default_session_duration INTEGER DEFAULT 60,
                    min_attendance_percent INTEGER DEFAULT 75,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            
            # Insert sample data
            
            # Insert sample colleges
            conn.execute(text("""
                INSERT INTO attendance_schema.colleges (name, code, admin_username, address)
                VALUES ('Tech University', 'TECH2024', 'admin_tech', 'Tech Campus, Mumbai')
                ON CONFLICT (code) DO NOTHING
            """))
            
            # Insert sample admin users (no college code initially for some)
            sample_admins = [
                ('admin1', 'admin123', 'System Administrator', None, 'admin@system.edu'),
                ('admin_tech', 'admin123', 'Tech Admin', 'TECH2024', 'admin@tech.edu')
            ]
            
            for username, password, full_name, college_code, email in sample_admins:
                conn.execute(text("""
                    INSERT INTO attendance_schema.users (username, password, role, full_name, college_code, email)
                    VALUES (:u, :p, 'admin', :fn, :cc, :e)
                    ON CONFLICT (username) DO NOTHING
                """), {"u": username, "p": password, "fn": full_name, "cc": college_code, "e": email})
            
            # Insert sample teachers and students
            sample_users = [
                ('teacher1', 'teacher123', 'teacher', 'Dr. John Smith', 'Computer Science', 'TECH2024'),
                ('student1', 'student123', 'student', 'Alice Brown', 'Computer Science', 'TECH2024')
            ]
            
            for username, password, role, full_name, department, college_code in sample_users:
                conn.execute(text("""
                    INSERT INTO attendance_schema.users (username, password, role, full_name, department, college_code)
                    VALUES (:u, :p, :r, :fn, :d, :cc)
                    ON CONFLICT (username) DO NOTHING
                """), {"u": username, "p": password, "r": role, "fn": full_name, "d": department, "cc": college_code})
            
            logger.info("Database initialized successfully!")
            
    except Exception as e:
        logger.error(f"Database initialization error: {e}")

# Initialize database on startup
init_database()

# -------- Serve static files --------
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

# -------- Enhanced Authentication with Role-based Logic --------
@app.post("/api/login")
def login():
    try:
        data = request.get_json(force=True)
        username = data.get("username")
        password = data.get("password")
        role = data.get("role", "student")  # Default role
        college_code = data.get("college_code")

        if not username or not password:
            return jsonify({"message": "Username and password required"}), 400

        # Role-based validation
        if role in ['teacher', 'student'] and not college_code:
            return jsonify({"message": f"College code is required for {role}s"}), 400

        # Try database first
        if engine:
            try:
                with engine.begin() as conn:
                    conn.execute(text("SET search_path TO attendance_schema"))
                    
                    # Base query for user authentication
                    base_query = "SELECT * FROM users WHERE username = :u AND password = :p AND role = :r AND is_active = TRUE"
                    params = {"u": username, "p": password, "r": role}
                    
                    # Add college code validation for teachers and students
                    if role in ['teacher', 'student']:
                        base_query += " AND college_code = :cc"
                        params["cc"] = college_code
                        
                        # Verify college exists
                        college_exists = conn.execute(
                            text("SELECT code FROM colleges WHERE code = :cc"),
                            {"cc": college_code}
                        ).mappings().first()
                        
                        if not college_exists:
                            return jsonify({"message": "Invalid college code"}), 400
                    
                    user = conn.execute(text(base_query), params).mappings().first()

                    if user:
                        return jsonify({
                            "message": "Login successful",
                            "role": user["role"],
                            "id": user["id"],
                            "username": user["username"],
                            "full_name": user["full_name"],
                            "college_code": user["college_code"],
                            "department": user.get("department"),
                            "email": user.get("email")
                        }), 200
            except Exception as db_error:
                logger.error(f"Database login error: {db_error}")

        # Fallback to memory storage
        user = memory_storage['users'].get(username)
        if user and user['password'] == password and user['role'] == role:
            # Additional validation for teachers/students
            if role in ['teacher', 'student']:
                if not college_code:
                    return jsonify({"message": f"College code required for {role}s"}), 400
                if user.get('collegeCode') != college_code:
                    return jsonify({"message": "Invalid college code for this user"}), 400
                if college_code not in memory_storage['colleges']:
                    return jsonify({"message": "College not found"}), 400
            
            return jsonify({
                "message": "Login successful",
                "role": user["role"],
                "id": user["id"],
                "username": user["username"],
                "full_name": user.get("fullName", username),
                "college_code": user.get("collegeCode"),
                "department": user.get("department"),
                "email": user.get("email")
            }), 200

        return jsonify({"message": "Invalid credentials"}), 401
        
    except Exception as e:
        logger.error(f"Login error: {e}")
        return jsonify({"message": "Login failed"}), 500

@app.post("/api/signup")
def signup():
    try:
        data = request.get_json(force=True)
        username = data.get("username")
        password = data.get("password") 
        role = data.get("role")
        full_name = data.get("full_name", "")
        department = data.get("department", "")
        college_code = data.get("college_code")
        email = data.get("email", "")

        if not username or not password or not role:
            return jsonify({"message": "Missing required fields"}), 400

        if len(password) < 6:
            return jsonify({"message": "Password must be at least 6 characters long"}), 400

        # Role-based validation
        if role in ['teacher', 'student'] and not college_code:
            return jsonify({"message": f"College code is required for {role}s"}), 400

        # Try database first
        if engine:
            try:
                with engine.begin() as conn:
                    conn.execute(text("SET search_path TO attendance_schema"))
                    
                    existing = conn.execute(
                        text("SELECT * FROM users WHERE username = :u"),
                        {"u": username}
                    ).mappings().first()

                    if existing:
                        return jsonify({"message": "Username already exists"}), 400

                    # Validate college code for teachers/students
                    if role in ['teacher', 'student']:
                        college_exists = conn.execute(
                            text("SELECT code FROM colleges WHERE code = :cc"),
                            {"cc": college_code}
                        ).mappings().first()
                        
                        if not college_exists:
                            return jsonify({"message": "Invalid college code"}), 400

                    conn.execute(
                        text("""
                            INSERT INTO users (username, password, role, full_name, department, college_code, email) 
                            VALUES (:u, :p, :r, :fn, :d, :cc, :e)
                        """),
                        {
                            "u": username, 
                            "p": password, 
                            "r": role, 
                            "fn": full_name or username,
                            "d": department or "Not specified",
                            "cc": college_code if role != 'admin' else None,
                            "e": email
                        }
                    )
                return jsonify({"message": "User created successfully"}), 201
            except Exception as db_error:
                logger.error(f"Database signup error: {db_error}")
        
        # Fallback to memory storage
        if username in memory_storage['users']:
            return jsonify({"message": "Username already exists"}), 400
        
        # Validate college for teachers/students in memory storage
        if role in ['teacher', 'student']:
            if college_code not in memory_storage['colleges']:
                return jsonify({"message": "Invalid college code"}), 400
        
        user_id = len(memory_storage['users']) + 1
        memory_storage['users'][username] = {
            'id': user_id,
            'username': username,
            'password': password,
            'role': role,
            'fullName': full_name or username,
            'department': department or "Not specified",
            'collegeCode': college_code if role != 'admin' else None,
            'email': email
        }
        
        return jsonify({"message": "User created successfully"}), 201
        
    except Exception as e:
        logger.error(f"Signup error: {e}")
        return jsonify({"message": "Signup failed"}), 500

# -------- Admin College Management --------
@app.post("/api/admin/create_college")
def create_college():
    try:
        data = request.get_json(force=True)
        admin_username = data.get("admin_username")
        college_name = data.get("college_name")
        address = data.get("address", "")

        if not admin_username or not college_name:
            return jsonify({"message": "Admin username and college name required"}), 400

        # Generate unique college code
        import random
        import string
        year = datetime.now().year
        random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))
        college_code = f"COL{year}{random_part}"

        # Try database first
        if engine:
            try:
                with engine.begin() as conn:
                    conn.execute(text("SET search_path TO attendance_schema"))
                    
                    # Verify admin exists and has no college
                    admin = conn.execute(
                        text("SELECT * FROM users WHERE username = :u AND role = 'admin'"),
                        {"u": admin_username}
                    ).mappings().first()
                    
                    if not admin:
                        return jsonify({"message": "Admin not found"}), 404
                    
                    if admin["college_code"]:
                        return jsonify({"message": "Admin already has a college"}), 400
                    
                    # Create college
                    conn.execute(
                        text("""
                            INSERT INTO colleges (name, code, admin_username, address)
                            VALUES (:name, :code, :admin, :addr)
                        """),
                        {"name": college_name, "code": college_code, "admin": admin_username, "addr": address}
                    )
                    
                    # Update admin's college code
                    conn.execute(
                        text("UPDATE users SET college_code = :cc WHERE username = :u"),
                        {"cc": college_code, "u": admin_username}
                    )
                
                return jsonify({
                    "message": "College created successfully",
                    "college_code": college_code
                }), 201
            except Exception as db_error:
                logger.error(f"Database college creation error: {db_error}")
        
        # Fallback to memory storage
        if admin_username not in memory_storage['users']:
            return jsonify({"message": "Admin not found"}), 404
        
        if memory_storage['users'][admin_username]['role'] != 'admin':
            return jsonify({"message": "User is not an admin"}), 403
        
        if memory_storage['users'][admin_username].get('collegeCode'):
            return jsonify({"message": "Admin already has a college"}), 400
        
        # Create college in memory
        memory_storage['colleges'][college_code] = {
            'code': college_code,
            'name': college_name,
            'admin': admin_username,
            'address': address,
            'departments': ['Administration'],
            'classes': []
        }
        
        # Update admin
        memory_storage['users'][admin_username]['collegeCode'] = college_code
        
        return jsonify({
            "message": "College created successfully",
            "college_code": college_code
        }), 201
        
    except Exception as e:
        logger.error(f"Create college error: {e}")
        return jsonify({"message": "Failed to create college"}), 500

# -------- Session Management (unchanged) --------
@app.post("/api/attendance/create_session")
def create_session():
    try:
        data = request.get_json(force=True)
        
        session_id = data.get("session_id") or str(uuid.uuid4())
        teacher_id = data.get("teacher_id")
        subject = data.get("subject", "")
        class_name = data.get("class_name", "")
        duration = data.get("duration", 60)
        location_lat = data.get("location_lat")
        location_lng = data.get("location_lng")
        location_accuracy = data.get("location_accuracy")
        qr_data = data.get("qr_code", "")
        college_code = data.get("college_code", "DEFAULT")

        if not teacher_id:
            return jsonify({"message": "Teacher ID required"}), 400

        start_time = now_utc()
        expiry_time = start_time + timedelta(minutes=duration)

        # Try database first
        if engine:
            try:
                with engine.begin() as conn:
                    conn.execute(text("SET search_path TO attendance_schema"))
                    
                    conn.execute(
                        text("""
                            INSERT INTO sessions 
                            (session_id, teacher_id, subject, class_name, qr_code, location_lat, location_lng, 
                             location_accuracy, duration, start_time, expiry_time, college_code, course_id) 
                            VALUES (:sid, :tid, :subj, :class, :qr, :lat, :lng, :acc, :dur, :start, :expiry, :cc, 1)
                        """),
                        {
                            "sid": session_id, "tid": teacher_id, "subj": subject, "class": class_name,
                            "qr": qr_data, "lat": location_lat, "lng": location_lng, "acc": location_accuracy,
                            "dur": duration, "start": start_time, "expiry": expiry_time, "cc": college_code
                        }
                    )
                
                return jsonify({
                    "message": "Session created successfully",
                    "session_id": session_id,
                    "expiry_time": expiry_time.isoformat()
                }), 201
            except Exception as db_error:
                logger.error(f"Database session creation error: {db_error}")
        
        # Fallback to memory storage
        memory_storage['sessions'][session_id] = {
            'session_id': session_id,
            'teacher_id': teacher_id,
            'subject': subject,
            'class_name': class_name,
            'qr_code': qr_data,
            'location_lat': location_lat,
            'location_lng': location_lng,
            'location_accuracy': location_accuracy,
            'duration': duration,
            'start_time': start_time.isoformat(),
            'expiry_time': expiry_time.isoformat(),
            'college_code': college_code,
            'attendees': []
        }
        
        return jsonify({
            "message": "Session created successfully",
            "session_id": session_id,
            "expiry_time": expiry_time.isoformat()
        }), 201
        
    except Exception as e:
        logger.error(f"Create session error: {e}")
        return jsonify({"message": "Failed to create session"}), 500

# Health check endpoint
@app.get("/api/health")
def health_check():
    db_status = "connected" if engine else "disconnected"
    return jsonify({
        "status": "healthy",
        "database": db_status,
        "timestamp": datetime.now().isoformat()
    }), 200

if __name__ == "__main__":
    print("=" * 50)
    print("🎓 Smart QR Attendance System")
    print("=" * 50)
    print("🌐 Server starting on http://127.0.0.1:5000")
    print("📁 Serving files from current directory")
    print("🔗 Access the application at: http://127.0.0.1:5000")
    print("=" * 50)
    print("\n📋 Demo Credentials:")
    print("👨‍💼 Admin: admin1 / admin123 (no college code needed)")
    print("👨‍🏫 Teacher: teacher1 / teacher123 (Code: TECH2024)")
    print("👨‍🎓 Student: student1 / student123 (Code: TECH2024)")
    print("=" * 50)
    
    app.run(debug=True, host='127.0.0.1', port=5000)