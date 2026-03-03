// Enhanced Smart Attendance System - Fixed College Code Logic
const API_BASE = "http://127.0.0.1:5000";

// Global variables
let currentLocation = null;
let activeSession = null;
let currentUser = null;
let userRole = null;
let selectedStudents = new Set();
let selectedLoginRole = 'teacher'; // Default to teacher

// Multi-college data structure
let collegeData = {
  colleges: {},
  users: {},
  classes: {},
  departments: {},
  attendance: {},
  activities: {},
  settings: {}
};

// Initialize college codes and sample data
function initializeCollegeSystem() {
  // Sample colleges with codes
  collegeData.colleges = {
    'TECH2024': {
      code: 'TECH2024',
      name: 'Tech University',
      departments: ['Computer Science', 'Information Technology', 'Electronics'],
      classes: ['CS-1A', 'CS-2B', 'IT-3A', 'ECE-1B'],
      createdAt: Date.now() - 86400000
    },
    'MED2024': {
      code: 'MED2024', 
      name: 'Medical College',
      departments: ['Medicine', 'Nursing', 'Pharmacy'],
      classes: ['MED-1A', 'NUR-2B', 'PHM-1A'],
      createdAt: Date.now() - 86400000
    }
  };

  // Sample users - Admins don't have college codes initially
  collegeData.users = {
    // Admin users - no college code required during login
    'admin1': { 
      username: 'admin1', password: 'admin123', role: 'admin', 
      fullName: 'System Admin', email: 'admin@system.edu',
      collegeCode: null // Will be set after creating/joining college
    },
    'admin_tech': { 
      username: 'admin_tech', password: 'admin123', role: 'admin', 
      fullName: 'Tech Admin', email: 'admin@tech.edu',
      collegeCode: 'TECH2024' // Already has college
    },
    
    // Teacher users - need college code
    'teacher1': {
      username: 'teacher1', password: 'teacher123', role: 'teacher',
      fullName: 'Dr. John Smith', collegeCode: 'TECH2024',
      department: 'Computer Science', classes: ['CS-1A', 'CS-2B'],
      email: 'john@tech.edu'
    },
    'teacher_cs': {
      username: 'teacher_cs', password: 'teacher123', role: 'teacher',
      fullName: 'Dr. Sarah Johnson', collegeCode: 'TECH2024',
      department: 'Computer Science', classes: ['CS-1A', 'CS-2B'],
      email: 'sarah@tech.edu'
    },
    
    // Student users - need college code
    'student1': {
      username: 'student1', password: 'student123', role: 'student',
      fullName: 'Alice Johnson', collegeCode: 'TECH2024',
      department: 'Computer Science', class: 'CS-1A',
      email: 'alice@student.tech.edu'
    },
    'student_alice': {
      username: 'student_alice', password: 'student123', role: 'student',
      fullName: 'Alice Brown', collegeCode: 'TECH2024',
      department: 'Computer Science', class: 'CS-1A',
      email: 'alice2@student.tech.edu'
    }
  };

  // Sample classes and departments
  collegeData.classes = {
    'TECH2024': {
      'CS-1A': { name: 'CS-1A', department: 'Computer Science', year: 1, students: ['student1', 'student_alice'] },
      'CS-2B': { name: 'CS-2B', department: 'Computer Science', year: 2, students: [] },
      'IT-3A': { name: 'IT-3A', department: 'Information Technology', year: 3, students: [] }
    }
  };

  // Load from localStorage if available
  const savedData = localStorage.getItem('collegeSystemData');
  if (savedData) {
    try {
      collegeData = {...collegeData, ...JSON.parse(savedData)};
    } catch (e) {
      console.error('Error loading saved data:', e);
    }
  }
}

// Save data to localStorage
function saveCollegeData() {
  try {
    localStorage.setItem('collegeSystemData', JSON.stringify(collegeData));
  } catch (e) {
    console.error('Error saving data:', e);
  }
}

// Role selection for login
function selectRole(role) {
  selectedLoginRole = role;
  
  // Update UI
  document.querySelectorAll('.role-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-role="${role}"]`).classList.add('active');
  
  // Show/hide college code field based on role
  const collegeCodeField = document.getElementById('college_code_field');
  const collegeCodeInput = document.getElementById('college_code');
  
  if (role === 'admin') {
    collegeCodeField.classList.add('hidden');
    collegeCodeInput.removeAttribute('required');
  } else {
    collegeCodeField.classList.remove('hidden');
    collegeCodeInput.setAttribute('required', 'required');
  }
}

// Utility Functions
function showMessage(elementId, message, type = 'info') {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
      element.style.display = 'none';
    }, 5000);
  }
}

function generateUniqueCode(prefix = 'COL') {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `${prefix}${year}${random}`;
}

// Authentication System
document.addEventListener('DOMContentLoaded', function() {
  initializeCollegeSystem();
  
  // Check if user is logged in
  if (typeof(Storage) !== "undefined") {
    const savedUser = localStorage.getItem('currentUser');
    const savedRole = localStorage.getItem('userRole');
    
    if (savedUser && savedRole) {
      currentUser = JSON.parse(savedUser);
      userRole = savedRole;
      
      const currentPage = window.location.pathname.split('/').pop();
      if (currentPage === 'index.html' || currentPage === '') {
        redirectToDashboard();
        return;
      }
    }
  }
  
  setupEventListeners();
  initializePage();
  getCurrentLocation().then(updateLocationDisplay).catch(console.error);
});

function setupEventListeners() {
  // Authentication forms
  const loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  
  const signupForm = document.getElementById('signupForm');
  if (signupForm) signupForm.addEventListener('submit', handleSignup);
  
  // Teacher forms
  const qrForm = document.getElementById('qrForm');
  if (qrForm) qrForm.addEventListener('submit', handleQRGeneration);
  
  const activityForm = document.getElementById('activityForm');
  if (activityForm) activityForm.addEventListener('submit', handleAddActivity);
  
  // Admin forms
  const addClassForm = document.getElementById('addClassForm');
  if (addClassForm) addClassForm.addEventListener('submit', handleAddClass);
  
  const addDepartmentForm = document.getElementById('addDepartmentForm');
  if (addDepartmentForm) addDepartmentForm.addEventListener('submit', handleAddDepartment);
  
  const addActivityForm = document.getElementById('addActivityForm');
  if (addActivityForm) addActivityForm.addEventListener('submit', handleAdminAddActivity);
}

// Enhanced Login with role-based college code logic
async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('login_username').value.trim();
  const password = document.getElementById('login_password').value.trim();
  const collegeCode = document.getElementById('college_code').value.trim().toUpperCase();
  
  if (!username || !password) {
    showMessage('loginStatus', 'Please enter both username and password', 'error');
    return;
  }
  
  // For teacher and student, college code is required
  if ((selectedLoginRole === 'teacher' || selectedLoginRole === 'student') && !collegeCode) {
    showMessage('loginStatus', 'College code is required for teachers and students', 'error');
    return;
  }
  
  const user = collegeData.users[username];
  
  // Check if user exists and password matches
  if (!user || user.password !== password) {
    showMessage('loginStatus', 'Invalid credentials', 'error');
    return;
  }
  
  // Role-based validation
  if (selectedLoginRole === 'admin') {
    // Admin login - no college code required
    if (user.role !== 'admin') {
      showMessage('loginStatus', 'Invalid admin credentials', 'error');
      return;
    }
  } else {
    // Teacher/Student login - college code required and must match
    if (user.role !== selectedLoginRole) {
      showMessage('loginStatus', `Invalid ${selectedLoginRole} credentials`, 'error');
      return;
    }
    
    if (!collegeCode) {
      showMessage('loginStatus', 'College code is required', 'error');
      return;
    }
    
    // Verify college code exists
    if (!collegeData.colleges[collegeCode]) {
      showMessage('loginStatus', 'Invalid college code', 'error');
      return;
    }
    
    // Verify user belongs to this college
    if (user.collegeCode !== collegeCode) {
      showMessage('loginStatus', 'You are not registered with this college code', 'error');
      return;
    }
  }
  
  // Successful login
  currentUser = user;
  userRole = user.role;
  
  if (typeof(Storage) !== "undefined") {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('userRole', user.role);
  }
  
  showMessage('loginStatus', 'Login successful!', 'success');
  setTimeout(() => {
    redirectToDashboard();
  }, 1000);
}

// Enhanced Signup with college code logic
async function handleSignup(e) {
  e.preventDefault();
  
  const username = document.getElementById('signup_username').value.trim();
  const password = document.getElementById('signup_password').value.trim();
  const fullName = document.getElementById('signup_fullname').value.trim();
  const email = document.getElementById('signup_email').value.trim();
  const role = document.getElementById('signup_role').value;
  
  if (!username || !password || !fullName || !email || !role) {
    showMessage('signupStatus', 'Please fill in all required fields', 'error');
    return;
  }
  
  if (password.length < 6) {
    showMessage('signupStatus', 'Password must be at least 6 characters long', 'error');
    return;
  }
  
  // Check if username already exists
  if (collegeData.users[username]) {
    showMessage('signupStatus', 'Username already exists', 'error');
    return;
  }
  
  let newUser = {
    username, password, role, fullName, email,
    createdAt: Date.now()
  };
  
  if (role === 'admin') {
    // Admin creates new college
    const collegeName = document.getElementById('signup_college_name').value.trim();
    const department = document.getElementById('signup_department').value.trim();
    const address = document.getElementById('signup_college_address').value.trim();
    
    if (!collegeName) {
      showMessage('signupStatus', 'College name is required for admin registration', 'error');
      return;
    }
    
    // Generate unique college code
    const collegeCode = generateUniqueCode();
    
    // Create college
    collegeData.colleges[collegeCode] = {
      code: collegeCode,
      name: collegeName,
      admin: username,
      address: address,
      departments: [department || 'Administration'],
      classes: [],
      createdAt: Date.now()
    };
    
    newUser.collegeCode = collegeCode;
    newUser.department = department || 'Administration';
    
  } else {
    // Teacher/Student joins existing college
    const collegeCode = document.getElementById('signup_college_code').value.trim().toUpperCase();
    const department = document.getElementById('signup_department_ts').value.trim();
    const classYear = document.getElementById('signup_class_year').value.trim();
    
    if (!collegeCode) {
      showMessage('signupStatus', 'College code is required', 'error');
      return;
    }
    
    if (!collegeData.colleges[collegeCode]) {
      showMessage('signupStatus', 'Invalid college code. Please check with your admin.', 'error');
      return;
    }
    
    newUser.collegeCode = collegeCode;
    newUser.department = department || 'General';
    
    if (role === 'teacher') {
      newUser.classes = [];
    } else if (role === 'student') {
      newUser.class = classYear;
      // Add student to class if it exists
      if (classYear && collegeData.classes[collegeCode] && collegeData.classes[collegeCode][classYear]) {
        collegeData.classes[collegeCode][classYear].students.push(username);
      }
    }
  }
  
  collegeData.users[username] = newUser;
  saveCollegeData();
  
  showMessage('signupStatus', 'Account created successfully! Redirecting to login...', 'success');
  
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 2000);
}

function redirectToDashboard() {
  if (userRole === 'admin') {
    window.location.href = 'admin.html';
  } else if (userRole === 'teacher') {
    window.location.href = 'teacher.html';
  } else if (userRole === 'student') {
    window.location.href = 'student.html';
  }
}

// Admin Functions
function initializeAdminDashboard() {
  if (!currentUser || userRole !== 'admin') {
    window.location.href = 'index.html';
    return;
  }
  
  updateAdminInterface();
  loadCollegeCode();
  loadDepartments();
  loadClasses();
  refreshStats();
}

function updateAdminInterface() {
  const adminInfo = document.getElementById('adminInfo');
  if (adminInfo && currentUser) {
    const college = collegeData.colleges[currentUser.collegeCode];
    adminInfo.textContent = `${currentUser.fullName} - ${college ? college.name : 'No College Assigned'}`;
  }
}

function loadCollegeCode() {
  const codeDisplay = document.getElementById('collegeCodeValue');
  const createCollegeSection = document.getElementById('createCollegeSection');
  const collegeInfoSection = document.getElementById('collegeInfoSection');
  
  if (currentUser && currentUser.collegeCode) {
    // Admin has a college
    if (codeDisplay) codeDisplay.textContent = currentUser.collegeCode;
    if (createCollegeSection) createCollegeSection.style.display = 'none';
    if (collegeInfoSection) collegeInfoSection.style.display = 'block';
  } else {
    // Admin needs to create a college
    if (createCollegeSection) createCollegeSection.style.display = 'block';
    if (collegeInfoSection) collegeInfoSection.style.display = 'none';
  }
}

function createNewCollege() {
  const collegeName = document.getElementById('newCollegeName').value.trim();
  const address = document.getElementById('newCollegeAddress').value.trim();
  
  if (!collegeName) {
    showMessage('adminStatus', 'College name is required', 'error');
    return;
  }
  
  // Generate unique college code
  const collegeCode = generateUniqueCode();
  
  // Create college
  collegeData.colleges[collegeCode] = {
    code: collegeCode,
    name: collegeName,
    admin: currentUser.username,
    address: address,
    departments: ['Administration'],
    classes: [],
    createdAt: Date.now()
  };
  
  // Update admin user
  currentUser.collegeCode = collegeCode;
  collegeData.users[currentUser.username].collegeCode = collegeCode;
  
  saveCollegeData();
  
  showMessage('adminStatus', `College created successfully! Code: ${collegeCode}`, 'success');
  
  // Update UI
  loadCollegeCode();
  updateAdminInterface();
  
  // Clear form
  document.getElementById('newCollegeName').value = '';
  document.getElementById('newCollegeAddress').value = '';
}

function regenerateCollegeCode() {
  if (!currentUser || userRole !== 'admin' || !currentUser.collegeCode) return;
  
  const confirmed = confirm('Regenerating the college code will require all teachers and students to re-register. Are you sure?');
  if (!confirmed) return;
  
  const oldCode = currentUser.collegeCode;
  const newCode = generateUniqueCode();
  
  // Update college code
  collegeData.colleges[newCode] = {...collegeData.colleges[oldCode]};
  collegeData.colleges[newCode].code = newCode;
  delete collegeData.colleges[oldCode];
  
  // Update admin user
  currentUser.collegeCode = newCode;
  collegeData.users[currentUser.username].collegeCode = newCode;
  
  saveCollegeData();
  loadCollegeCode();
  
  alert(`New college code generated: ${newCode}\nShare this code with your teachers and students.`);
}

// Location and GPS functions
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        currentLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };
        resolve(currentLocation);
      },
      error => {
        console.error('GPS Error:', error);
        // Use default location for demo
        currentLocation = {
          lat: 19.0760,
          lng: 72.8777,
          accuracy: 100,
          timestamp: Date.now()
        };
        resolve(currentLocation);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
}

function updateLocationDisplay() {
  const locationText = document.getElementById('locationText');
  const studentLocationInfo = document.getElementById('studentLocationInfo');
  
  if (currentLocation) {
    const text = `${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)} (±${Math.round(currentLocation.accuracy)}m)`;
    
    if (locationText) locationText.textContent = text;
    if (studentLocationInfo) studentLocationInfo.textContent = text;
  } else {
    const text = 'Location not available';
    if (locationText) locationText.textContent = text;
    if (studentLocationInfo) studentLocationInfo.textContent = text;
  }
}

// Initialize page based on role
function initializePage() {
  const currentPage = window.location.pathname.split('/').pop();
  
  if (currentPage.includes('admin') && userRole === 'admin') {
    initializeAdminDashboard();
  } else if (currentPage.includes('teacher') && userRole === 'teacher') {
    initializeTeacherDashboard();
  } else if (currentPage.includes('student') && userRole === 'student') {
    initializeStudentDashboard();
  }
  
  updateUserInterface();
}

function initializeTeacherDashboard() {
  loadTeacherClasses();
  loadRecentActivities();
}

function initializeStudentDashboard() {
  loadAttendanceSummary();
  loadActiveSessions();
}

function updateUserInterface() {
  const userInfoElements = ['teacherInfo', 'studentInfo', 'adminInfo'];
  
  userInfoElements.forEach(elementId => {
    const element = document.getElementById(elementId);
    if (element && currentUser) {
      const college = collegeData.colleges[currentUser.collegeCode];
      element.textContent = `${currentUser.fullName} - ${college ? college.name : 'No College'}`;
    }
  });
}

function logout() {
  if (typeof(Storage) !== "undefined") {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');
  }
  window.location.href = 'index.html';
}

// Additional placeholder functions for other features
function loadTeacherClasses() { /* Implementation */ }
function loadRecentActivities() { /* Implementation */ }
function loadAttendanceSummary() { /* Implementation */ }
function loadActiveSessions() { /* Implementation */ }
function refreshStats() { /* Implementation */ }
function loadDepartments() { /* Implementation */ }
function loadClasses() { /* Implementation */ }
function handleQRGeneration(e) { /* Implementation */ }
function handleAddActivity(e) { /* Implementation */ }
function handleAddClass(e) { /* Implementation */ }
function handleAddDepartment(e) { /* Implementation */ }
function handleAdminAddActivity(e) { /* Implementation */ }