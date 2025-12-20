// ==================== Firebase Config ====================
const firebaseConfig = {
  apiKey: "AIzaSyBC8_X5D_7poZiEj7C6eLq9y1GDBN0_Afo",
  authDomain: "yenwebs.firebaseapp.com",
  projectId: "yenwebs",
  storageBucket: "yenwebs.firebasestorage.app",
  messagingSenderId: "485547247686",
  appId: "1:485547247686:web:332211bc2b7389ac36e247",
  measurementId: "G-MEGRXVCMS9"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ==================== Cloudinary Config ====================
const CLOUDINARY_CLOUD_NAME = "ddipck32h";
const CLOUDINARY_UPLOAD_PRESET = "YenWeb"; 

// ==================== Globals ====================
let currentUser = null;
let isAdmin = false;
let isOwner = false;
let currentSubject = null;
let currentFilter = "all";
let allMaterials = [];
let uploadedFiles = []; 
let fileCounter = 0;

// *** IMPORTANT: YOUR EMAIL ***
const OWNER_EMAIL = "itsyenboy@gmail.com"; 

// Theme Globals
const themes = ["default", "light", "midnight"];
let currentThemeIndex = 0;

// Dynamic Subjects (Loaded from DB)
let subjects = ["التقكير الابتكاري", "لغه اجنبيه 1", "مبادء المحاسبه الماليه", "مبادء القانون", "مبادء اداره الاعمال"];

// ==================== SYSTEM CHECKS (God Mode & Kill Switch) ====================
async function checkSiteStatus() {
    try {
        const doc = await db.collection("settings").doc("global").get();
        if (!doc.exists) return false;
        
        const data = doc.data();

        // 1. KILL SWITCH CHECK
        if (data.isShutdown === true) {
            document.getElementById("mainContainer").style.display = "none";
            document.getElementById("shutdownOverlay").classList.remove("hidden");
            return true; // Site is down
        }

        // 2. BROADCAST CHECK (God Mode)
        if (data.broadcastMsg) {
            const banner = document.getElementById("globalBroadcast");
            const text = document.getElementById("broadcastText");
            if(banner && text) {
                text.textContent = data.broadcastMsg;
                banner.classList.remove("hidden");
            }
        } else {
            document.getElementById("globalBroadcast")?.classList.add("hidden");
        }

        // 3. THEME STUDIO CHECK (God Mode)
        if (data.accentColor) {
            document.documentElement.style.setProperty('--accent', data.accentColor);
            document.documentElement.style.setProperty('--glass', hexToRgba(data.accentColor, 0.1));
            document.documentElement.style.setProperty('--border', hexToRgba(data.accentColor, 0.2));
        }

    } catch (e) { console.error("Config Check Fail", e); }
    return false; // Site is up
}

// Helper: Hex to RGBA
function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Unlock Logic (Fake 404)
let unlockClicks = 0;
document.getElementById("shutdownTrigger").addEventListener("click", () => {
    unlockClicks++;
    if (unlockClicks >= 3) {
        document.getElementById("unlockBox").classList.remove("hidden");
    }
});

async function attemptUnlock() {
    const pass = document.getElementById("unlockPass").value;
    if (pass === "yenwebs123") { 
        await db.collection("settings").doc("global").set({ isShutdown: false }, { merge: true });
        location.reload();
    } else {
        alert("Wrong Password");
    }
}

// ==================== Helpers ====================
function getSubjectIcon(subject) {
    const icons = {
        "التقكير الابتكاري": "fa-solid fa-chart-line",
        "لغه اجنبيه 1": "fa-solid fa-language",
        "مبادء المحاسبه الماليه": "fa-solid fa-calculator",
        "مبادء القانون": "fa-solid fa-scale-balanced",
        "مبادء اداره الاعمال": "fa-solid fa-briefcase",
        "English Course": "fa-solid fa-language" 
    };
    return icons[subject] || "fa-solid fa-book-open";
}

function normalizeType(type) {
  if (!type) return "";
  type = type.toString().trim().toLowerCase();
  
  if (["summary", "ملخص", "ملخصات"].includes(type)) return "summary";
  if (["assignment", "تكليف", "تكاليف"].includes(type)) return "assignment";
  
  // English Course Types
  if (["course", "شرح", "video", "videos"].includes(type)) return "course";
  if (["quiz", "quizzes", "كويز", "اختبار", "اختبارات"].includes(type)) return "quiz";
  
  return type;
}

function typeToArabic(type) { 
    switch(type) {
        case "assignment": return "تكليف";
        case "summary": return "ملخص";
        case "course": return "شرح";
        case "quiz": return "كويز";
        default: return type;
    }
}

function typeToClass(type) { 
    switch(type) {
        case "assignment": return "badge-assignment";
        case "summary": return "badge-summary";
        case "course": return "badge-course";
        case "quiz": return "badge-quiz";
        default: return "badge-summary";
    }
}

function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-msg">${message}</span><span class="toast-icon">ℹ</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
}

// ==================== Theme Logic ====================
function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('selectedTheme', themeName);
    const icon = document.getElementById('themeIcon');
    if(icon) {
        if(themeName === 'light') icon.className = "fa-solid fa-sun";
        else if(themeName === 'midnight') icon.className = "fa-solid fa-moon";
        else icon.className = "fa-solid fa-palette"; 
    }
}
function cycleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    applyTheme(themes[currentThemeIndex]);
}

// ==================== File Upload (Admin) ====================
function handleFileSelect(event) {
  const files = event.target.files;
  const fileList = document.getElementById('fileList');
  if (!files.length) return;

  Array.from(files).forEach(file => {
    const isDuplicate = uploadedFiles.some(f => f.file.name === file.name && f.file.size === file.size);
    if(isDuplicate) return;
    if (file.size > 10*1024*1024) { alert(`تنبيه: الملف ${file.name} كبير جداً`); return; }

    const fileId = 'file-' + fileCounter++;
    const fileSizeKB = (file.size/1024).toFixed(1);
    
    const item = document.createElement('div');
    item.className = 'file-item';
    item.id = fileId;
    item.style.marginBottom = "5px";
    item.innerHTML = `<span>📄 ${file.name} (${fileSizeKB} KB)</span><button onclick="removeFile('${fileId}')" class="remove-file-btn" style="color:red; margin-left:10px;">✕</button>`;
    
    fileList.appendChild(item); 
    uploadedFiles.push({id: fileId, file}); 
  });
  event.target.value = null;
}

function removeFile(fileId) {
  uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
  const el = document.getElementById(fileId);
  if (el) el.remove();
}

async function uploadFilesToCloudinary(files) {
  const urls = [];
  const prog = document.getElementById('uploadProgress');
  if(prog) prog.style.display = 'block';

  for (let i=0; i<files.length; i++){
    const file = files[i].file;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
      
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {method:'POST', body: formData});
      if(!res.ok) throw new Error('فشل رفع الملف');
      const data = await res.json();
      urls.push({name:file.name, url:data.secure_url, type:file.type, size:file.size});
      
      const bar = document.getElementById('progressBar');
      if(bar) bar.style.width = (((i+1)/files.length)*100)+'%';
    } catch(err){ console.error(err); alert(`فشل: ${file.name}`); }
  }
  if(prog) prog.style.display = 'none';
  return urls;
}

// ==================== Auth & Session ====================
function switchTab(tab){
  if(tab==="login"){
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("registerForm").classList.add("hidden");
    document.querySelectorAll(".tab-btn")[0].classList.add("active");
    document.querySelectorAll(".tab-btn")[1].classList.remove("active");
  }else{
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("registerForm").classList.remove("hidden");
    document.querySelectorAll(".tab-btn")[0].classList.remove("active");
    document.querySelectorAll(".tab-btn")[1].classList.add("active");
  }
}

async function handleLogin(){
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const errorEl = document.getElementById("loginError");
  if(!email || !password){ errorEl.textContent = "أدخل البيانات"; return; }
  errorEl.textContent = "جاري التحقق...";

  try {
    if (email === OWNER_EMAIL) { 
       await auth.signInWithEmailAndPassword(email, password);
       setupSession(email, "Owner", true, true);
       return;
    }

    const codesSnap = await db.collection("allowedCodes").where("code", "==", email).get();
    if(!codesSnap.empty) {
        const data = codesSnap.docs[0].data();
        setupSession(email, data.name || "Admin", true, false);
        return;
    }

    await auth.signInWithEmailAndPassword(email, password);
    const usersSnap = await db.collection("users").where("email", "==", email).limit(1).get();
    let uName = email.split('@')[0];
    if(!usersSnap.empty) uName = usersSnap.docs[0].data().name;
    
    setupSession(email, uName, false, false);
    
  } catch(err) {
    console.error(err);
    errorEl.textContent = "بيانات الدخول غير صحيحة";
  }
}

async function handleRegister(){
  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value.trim();
  
  if(!name || !email || !password) return alert("أكمل البيانات");
  if(password.length < 6) return alert("كلمة المرور قصيرة");

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({displayName: name});
    await db.collection("users").add({name, email, uid: cred.user.uid, isAdmin: false, createdAt: new Date().toISOString()});
    setupSession(email, name, false, false);
    alert("تم التسجيل!");
  } catch(err) { alert("خطأ: " + err.message); }
}

function setupSession(email, name, admin, owner) {
    currentUser = { name, email };
    isAdmin = admin;
    isOwner = owner; 
    
    localStorage.setItem("userEmail", email);
    localStorage.setItem("userName", name);
    localStorage.setItem("isAdmin", admin);
    localStorage.setItem("isOwner", owner);
    
    showMainApp();
}

function handleLogout(){
  auth.signOut();
  localStorage.clear();
  location.reload(); 
}

function showMainApp(){
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("mainApp").classList.remove("hidden");
  document.getElementById("userName").textContent = currentUser.name;
  
  const adminBtn = document.getElementById("adminBtn");
  adminBtn.style.display = (isAdmin || isOwner) ? "inline-block" : "none";
  if(isAdmin || isOwner) adminBtn.classList.remove("hidden");

  const ownerBtn = document.getElementById("ownerBtn");
  ownerBtn.style.display = isOwner ? "inline-block" : "none";
  if(isOwner) ownerBtn.classList.remove("hidden");
  
  loadDashboard();
}

// ==================== Data Loading ====================
async function loadSubjectsFromDB() {
    try {
        const subDoc = await db.collection("settings").doc("subjects").get();
        if (subDoc.exists && subDoc.data().list) {
            subjects = subDoc.data().list;
        } else {
            await db.collection("settings").doc("subjects").set({ list: subjects });
        }
    } catch(e) { console.log("Using default subjects"); }
}

async function loadDashboard() {
    await loadSubjectsFromDB();

  try {
    const [usersSnap, codesSnap, materialsSnap, announcementsSnap] = await Promise.all([
        db.collection("users").get(),
        db.collection("allowedCodes").get(),
        db.collection("materials").where("status", "==", "approved").get(),
        db.collection("announcements").orderBy("date", "desc").limit(3).get()
    ]);

    let sumCount=0, assignCount=0;
    materialsSnap.forEach(d => {
        const t = normalizeType(d.data().type);
        if(t==="summary") sumCount++;
        if(t==="assignment") assignCount++;
    });

    const grid = document.getElementById("statsGrid");
    if(grid) {
        grid.innerHTML = `
        <div class="stat-card animate-card"><h3>${usersSnap.size + codesSnap.size}</h3><p>الطلاب</p></div>
        <div class="stat-card animate-card"><h3>${sumCount}</h3><p>ملخصات</p></div>
        <div class="stat-card animate-card"><h3>${assignCount}</h3><p>تكاليف</p></div>
        <div class="stat-card animate-card"><h3>${materialsSnap.size}</h3><p>الإجمالي</p></div>`;
    }

    const recent = document.getElementById("recentAnnouncements");
    if(recent) {
        recent.innerHTML = "";
        if(announcementsSnap.empty) recent.innerHTML = "<p>لا توجد إعلانات</p>";
        else {
            let delay = 0.5;
            announcementsSnap.forEach(doc => {
                const d = doc.data();
                recent.innerHTML += `
                <div class="animate-card" style="animation-delay: ${delay}s; background:var(--card-bg); border:1px solid var(--border); padding:15px; border-radius:10px; margin-bottom:10px">
                    <h4 style="color:var(--text-primary); margin-bottom:5px;">${d.title}</h4>
                    <p style="color:var(--text-secondary); font-size:0.9em;">${d.content}</p>
                    <span style="color:var(--accent); font-size:0.8em;">${new Date(d.date).toLocaleDateString('ar-EG')}</span>
                </div>`;
                delay += 0.1;
            });
        }
    }
  } catch(err) { console.error("Dash Error:", err); }
}

function showPage(page) {
  ["homePage", "subjectsPage", "materialsPage", "announcementsPage", "adminPage", "userPage", "ownerPage"].forEach(p => {
    const el = document.getElementById(p);
    if(el) el.classList.add("hidden");
  });

  const target = document.getElementById(page + "Page");
  if(target) target.classList.remove("hidden");
  
  if(page === "home") loadDashboard();
  if(page === "subjects") loadSubjects();
  if(page === "announcements") loadAnnouncements();
  if(page === "user") loadUserPage();
  if(page === "owner") loadOwnerPage(); 
}

// ==================== OWNER FUNCTIONS ====================
async function loadOwnerPage() {
    if(!isOwner) return;
    
    // Auto Init Database
    try {
        const globalDoc = await db.collection("settings").doc("global").get();
        if (!globalDoc.exists) await db.collection("settings").doc("global").set({ isShutdown: false });
        
        const subDoc = await db.collection("settings").doc("subjects").get();
        if (!subDoc.exists) await db.collection("settings").doc("subjects").set({ list: subjects });
    } catch(e) {}

    // Status
    const doc = await db.collection("settings").doc("global").get();
    const isDown = doc.exists && doc.data().isShutdown;
    const statusText = document.getElementById("shutdownStatus");
    const btn = document.getElementById("killSwitchBtn");
    
    if(isDown) {
        statusText.textContent = "Status: OFFLINE (404 Mode)";
        statusText.style.color = "red";
        btn.textContent = "🟢 TURN ON WEBSITE";
        btn.style.background = "#10b981";
    } else {
        statusText.textContent = "Status: ONLINE";
        statusText.style.color = "#10b981";
        btn.textContent = "🔴 SHUT DOWN WEBSITE";
        btn.style.background = "#f43f5e";
    }

    // Load Lists
    loadSubjectsListForOwner();
    loadAllUsers(); // Simplified
    loadAdminsList();
}

async function toggleSiteShutdown() {
    if(!confirm("Are you sure you want to toggle the website status?")) return;
    const doc = await db.collection("settings").doc("global").get();
    const currentStatus = doc.exists ? doc.data().isShutdown : false;
    await db.collection("settings").doc("global").set({ isShutdown: !currentStatus }, { merge: true });
    loadOwnerPage();
    alert("Updated!");
}

// --- OWNER: THEME STUDIO ---
function previewThemeColor(color) {
    document.getElementById("themeColorText").value = color;
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--glass', hexToRgba(color, 0.1));
    document.documentElement.style.setProperty('--border', hexToRgba(color, 0.2));
}

async function saveGlobalTheme() {
    const color = document.getElementById("themeColorText").value;
    if(!color.startsWith("#")) return alert("Invalid Color Hex");
    await db.collection("settings").doc("global").set({ accentColor: color }, { merge: true });
    showToast("Global Theme Updated! 🎨", "success");
}

async function resetGlobalTheme() {
    await db.collection("settings").doc("global").update({
        accentColor: firebase.firestore.FieldValue.delete()
    });
    location.reload();
}

// --- OWNER: BROADCAST ---
async function setBroadcast() {
    const msg = document.getElementById("broadcastMessage").value;
    if(!msg) return;
    await db.collection("settings").doc("global").set({ broadcastMsg: msg }, { merge: true });
    showToast("Broadcast Live! 📢", "success");
    checkSiteStatus(); 
}

async function clearBroadcast() {
    await db.collection("settings").doc("global").update({
        broadcastMsg: firebase.firestore.FieldValue.delete()
    });
    showToast("Broadcast Ended", "info");
    document.getElementById("globalBroadcast").classList.add("hidden");
    document.getElementById("broadcastMessage").value = "";
}

// --- SUBJECT MANAGEMENT ---
async function loadSubjectsListForOwner() {
    const listDiv = document.getElementById("ownerSubjectsList");
    if(!listDiv) return;
    listDiv.innerHTML = "";
    
    subjects.forEach(sub => {
        const div = document.createElement("div");
        div.className = "file-item"; 
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.innerHTML = `
            <span>${sub}</span>
            <button onclick="deleteSubject('${sub}')" style="color:red; background:none; border:none; cursor:pointer;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        listDiv.appendChild(div);
    });
}

async function addNewSubject() {
    const name = document.getElementById("newSubjectName").value.trim();
    if(!name) return;
    if(subjects.includes(name)) return alert("موجودة بالفعل");
    
    subjects.push(name);
    await db.collection("settings").doc("subjects").set({ list: subjects });
    
    document.getElementById("newSubjectName").value = "";
    loadSubjectsListForOwner(); 
    populateAdminSubjects();    
    showToast("Added Subject: " + name, "success");
}

async function deleteSubject(name) {
    if(!confirm(`هل أنت متأكد من حذف مادة "${name}"؟`)) return;
    
    subjects = subjects.filter(s => s !== name);
    await db.collection("settings").doc("subjects").set({ list: subjects });
    
    loadSubjectsListForOwner();
    populateAdminSubjects();
    showToast("تم الحذف", "error");
}

// --- USER MANAGEMENT (Simplified) ---
async function loadAllUsers() {
    if(!isOwner) return;
    
    const list = document.getElementById("allUsersList");
    const badge = document.getElementById("userCountBadge");
    
    list.innerHTML = `<div style="padding:20px; text-align:center; opacity:0.6"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>`;
    
    try {
        const snap = await db.collection("users").orderBy("createdAt", "desc").limit(100).get();
        
        if(snap.empty) {
            list.innerHTML = `<div style="padding:20px; text-align:center; opacity:0.6">لا يوجد طلاب.</div>`;
            if(badge) badge.textContent = "0";
            return;
        }

        if(badge) badge.textContent = snap.size;
        list.innerHTML = ""; 

        snap.forEach(doc => {
            const u = doc.data();
            const firstLetter = (u.name || "?").charAt(0).toUpperCase();
            
            list.innerHTML += `
            <div class="user-row">
                <div class="user-info">
                    <div class="user-avatar">${firstLetter}</div>
                    <div class="user-details">
                        <strong>${u.name}</strong>
                        <span>${u.email}</span>
                    </div>
                </div>
                <button onclick="deleteUser('${doc.id}', '${u.name}')" class="delete-user-btn" title="حذف">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>`;
        });

    } catch(e) { 
        console.error(e); 
        list.innerHTML = `<div style="padding:20px; text-align:center; color:#ef4444">حدث خطأ</div>`; 
    }
}

async function deleteUser(id, name) {
    if(!confirm(`حذف الطالب ${name}؟ سيتم منعه من الدخول.`)) return;
    await db.collection("users").doc(id).delete();
    loadAllUsers(); 
}

// --- ADMIN MANAGEMENT ---
async function addNewAdmin() {
    const name = document.getElementById("newAdminName").value.trim();
    const email = document.getElementById("newAdminEmail").value.trim();
    if(!name || !email) return alert("Fill info");
    
    await db.collection("allowedCodes").add({ name, code: email, admin: true });
    document.getElementById("newAdminName").value = "";
    document.getElementById("newAdminEmail").value = "";
    loadAdminsList();
    showToast("Admin Added");
}

async function loadAdminsList() {
    const list = document.getElementById("adminsList");
    list.innerHTML = "Loading...";
    const snap = await db.collection("allowedCodes").get();
    list.innerHTML = "";
    snap.forEach(doc => {
        const d = doc.data();
        list.innerHTML += `
        <div class="admin-list-item">
            <div><strong>${d.name}</strong> (${d.code})</div>
            <button onclick="removeAdmin('${doc.id}')" style="color:red; background:none; border:none;"><i class="fa-solid fa-trash"></i></button>
        </div>`;
    });
}

async function removeAdmin(id) {
    if(!confirm("Remove admin?")) return;
    await db.collection("allowedCodes").doc(id).delete();
    loadAdminsList();
}

// ==================== Main Logic ====================

async function loadSubjects() {
  await loadSubjectsFromDB(); 
  const snap = await db.collection("materials").where("status", "==", "approved").get();
  const grid = document.getElementById("subjectsGrid");
  grid.innerHTML = "";
  
  let delay = 0.1;

  subjects.forEach(subject => {
    const list = snap.docs.filter(d => d.data().subject === subject);
    const sCount = list.filter(d => normalizeType(d.data().type) === "summary").length;
    const aCount = list.filter(d => normalizeType(d.data().type) === "assignment").length;
    
    grid.innerHTML += `
      <div class="subject-card animate-card" style="animation-delay: ${delay}s" onclick="loadMaterials('${subject}')">
        <i class="${getSubjectIcon(subject)} subject-icon"></i>
        <h3>${subject}</h3>
        <div class="subject-stats">
          <span class="stat-badge summary">${sCount} ملخص</span>
          <span class="stat-badge assignment">${aCount} تكليف</span>
        </div>
      </div>
    `;
    delay += 0.1;
  });
}

async function loadMaterials(subject) {
  currentSubject = subject;
  currentFilter = "all";
  
  document.getElementById("materialSubjectTitle").textContent = subject;
  
  ["homePage", "subjectsPage", "announcementsPage", "adminPage", "ownerPage", "userPage"].forEach(p => {
     const el = document.getElementById(p);
     if(el) el.classList.add("hidden");
  });
  document.getElementById("materialsPage").classList.remove("hidden");

  // === DYNAMIC FILTER LOGIC ===
  const stdFilters = document.getElementById("standardFilters");
  const engFilters = document.getElementById("englishFilters");

  if (subject === "English Course") {
      stdFilters.classList.add("hidden");
      engFilters.classList.remove("hidden");
  } else {
      engFilters.classList.add("hidden");
      stdFilters.classList.remove("hidden");
  }

  // Reset active buttons
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  // Set "All" as active
  if(subject === "English Course") engFilters.firstElementChild.classList.add("active");
  else stdFilters.firstElementChild.classList.add("active");

  const snap = await db.collection("materials")
    .where("subject", "==", subject)
    .where("status", "==", "approved")
    .get();

  allMaterials = snap.docs.map(doc => ({id:doc.id, ...doc.data(), type:normalizeType(doc.data().type)}));
  allMaterials.sort((a,b) => new Date(b.date) - new Date(a.date));
  
  const sBox = document.getElementById("searchBox");
  if(sBox) sBox.value = "";
  
  displayMaterials();
}

function displayMaterials() {
  let list = [...allMaterials];
  if(currentFilter !== "all") list = list.filter(m => m.type === currentFilter);
  
  const search = document.getElementById("searchBox").value.toLowerCase();
  if(search) list = list.filter(m => (m.title||"").toLowerCase().includes(search));

  const sortBy = document.getElementById("sortMaterialsBy") ? document.getElementById("sortMaterialsBy").value : 'date-desc';
  list.sort((a, b) => {
    switch (sortBy) {
        case 'downloads-desc': return (b.downloadCount || 0) - (a.downloadCount || 0);
        case 'views-desc': return (b.viewCount || 0) - (a.viewCount || 0);
        case 'date-asc': return new Date(a.date) - new Date(b.date);
        case 'date-desc': default: return new Date(b.date) - new Date(a.date);
    }
  });

  const container = document.getElementById("materialsList");
  if(list.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>لا توجد مواد</p></div>`;
      return;
  }

  let html = "";
  const now = new Date();
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
  let delay = 0.1;

  list.forEach(m => {
    const isNew = (now - new Date(m.date)) < threeDaysInMs;
    const badge = isNew ? `<span class="badge-new" style="background:#f43f5e; color:white; font-size:0.7rem; padding:2px 6px; border-radius:8px; margin-right:5px; display:inline-block;">جديد 🔥</span>` : "";
    
    let mainLink = (m.files && m.files.length) ? m.files[0].url : m.fileUrl;
    if(mainLink && mainLink.includes('/upload/') && !mainLink.includes('/raw/')) {
        mainLink = mainLink.replace('/upload/', '/upload/fl_attachment/');
    }
    
    const favHtml = getFavButtonHTML(m.id, m.title, m.desc, mainLink, m.type, (m.files?.length || 0));
    const deleteHtml = (isAdmin || isOwner) ? `<button onclick="deleteMaterial('${m.id}'); event.stopPropagation();" style="color:red; background:none; border:none;"><i class="fa-solid fa-trash"></i></button>` : "";

    let actionBtn = "";
    if(m.files && m.files.length > 1) {
       actionBtn = `<button onclick="openMaterialModal('${m.id}'); event.stopPropagation();" class="download-file-btn">تصفح (${m.files.length})</button>`;
    } else {
       actionBtn = `<a href="${mainLink}" class="download-file-btn" onclick="event.stopPropagation();">تحميل</a>`;
    }

    html += `
      <div class="material-card animate-card" style="animation-delay: ${delay}s" onclick="openMaterialModal('${m.id}')">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px">
           <div><span class="material-type-badge ${typeToClass(m.type)}">${typeToArabic(m.type)}</span>${badge}</div>
           <span class="download-counter">${m.viewCount||0} 👁️</span>
        </div>
        <h3>${m.title}</h3>
        <p style="font-size:0.9em; color:var(--text-secondary)">${m.desc||""}</p>
        <div class="card-actions" style="display:flex; justify-content:space-between; align-items:center; margin-top:15px">
           ${actionBtn}
           <div style="display:flex; gap:10px">
             ${favHtml}
             ${deleteHtml}
           </div>
        </div>
      </div>`;
      delay += 0.05;
  });
  container.innerHTML = html;
}

function filterByType(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    // Find button in correct container
    const btn = document.querySelector(`.filters:not(.hidden) button[onclick="filterByType('${type}')"]`);
    if(btn) btn.classList.add('active'); 
    displayMaterials();
}

// ==================== Modal ====================
function openMaterialModal(id) {
    const m = allMaterials.find(x => x.id === id);
    if(!m) return;
    incrementViews(id);
    const modal = document.getElementById("materialModal");
    document.getElementById("modalTitle").textContent = m.title;
    document.getElementById("modalDesc").textContent = m.desc || "";
    document.getElementById("modalUploader").textContent = m.uploader;
    document.getElementById("modalDate").textContent = new Date(m.date).toLocaleDateString("ar-EG");
    
    const fileCont = document.getElementById("modalFiles");
    fileCont.innerHTML = "";
    if(m.files) {
        m.files.forEach(f => {
            let dl = f.url;
            if (f.url.includes('/upload/') && !f.url.includes('/raw/')) {
                dl = f.url.replace('/upload/', '/upload/fl_attachment/');
            }
            fileCont.innerHTML += `
            <div class="modal-file-item">
               <span>${f.name}</span>
               <div class="file-actions-group">
                 <a href="${dl}" class="download-file-btn">تحميل</a>
                 <a href="${f.url}" target="_blank" class="view-file-btn">عرض</a>
               </div>
            </div>`;
        });
    }
    modal.style.display = "flex";
}
function closeModal() { document.getElementById("materialModal").style.display = "none"; }

// Favorites
let myFavorites = JSON.parse(localStorage.getItem('Favs')) || [];
window.toggleFav = function(btn, id, title, desc, link, type, filesCount) {
    if(event) event.stopPropagation();
    const isFav = myFavorites.some(i => i.id === id);
    if(!isFav) {
        myFavorites.push({id, title, desc, link, type, filesCount});
        btn.querySelector('i').classList.replace('far', 'fas');
        btn.classList.add('active');
    } else {
        myFavorites = myFavorites.filter(i => i.id !== id);
        btn.querySelector('i').classList.replace('fas', 'far');
        btn.classList.remove('active');
    }
    localStorage.setItem('Favs', JSON.stringify(myFavorites));
    updateFavoritesDisplay();
}

function updateFavoritesDisplay() {
    const grid = document.getElementById("favoritesGrid");
    const section = document.getElementById("favoritesSection");
    if(!grid || !section) return;
    if(myFavorites.length === 0) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    grid.innerHTML = "";
    myFavorites.forEach(item => {
        let action = item.filesCount > 1 
            ? `<button onclick="openMaterialModal('${item.id}')" class="download-file-btn">تصفح</button>`
            : `<a href="${item.link}" class="download-file-btn">تحميل</a>`;
        grid.innerHTML += `
        <div class="material-card">
           <h3 style="margin:0 0 5px 0;">${item.title}</h3>
           <div class="card-actions" style="display:flex; justify-content:space-between; align-items:center;">
              ${action}
              <button class="btn-fav active" onclick="toggleFav(this, '${item.id}')"><i class="fas fa-heart"></i></button>
           </div>
        </div>`;
    });
}
function getFavButtonHTML(id, title, desc, link, type, filesCount) {
    const isFav = myFavorites.some(i => i.id === id);
    const cls = isFav ? 'fas active' : 'far';
    const safeTitle = (title||"").replace(/'/g, "\\'");
    return `<button class="btn-fav ${isFav?'active':''}" onclick="toggleFav(this, '${id}', '${safeTitle}', '', '${link}', '${type}', ${filesCount})"><i class="${cls} fa-heart"></i></button>`;
}

async function incrementDownloads(id) { try { await db.collection("materials").doc(id).update({downloadCount: firebase.firestore.FieldValue.increment(1)}); } catch(e){} }
async function incrementViews(id) { try { await db.collection("materials").doc(id).update({viewCount: firebase.firestore.FieldValue.increment(1)}); } catch(e){} }
async function deleteMaterial(id) {
    if(!isAdmin && !isOwner) return;
    if(!confirm("حذف؟")) return;
    await db.collection("materials").doc(id).delete();
    allMaterials = allMaterials.filter(m => m.id !== id);
    displayMaterials();
}

async function loadUserPage() {
    if(currentUser) {
        document.getElementById("profileNameDisplay").textContent = currentUser.name;
        document.getElementById("profileEmailDisplay").textContent = currentUser.email;
    }
}
async function handlePasswordUpdate() {
    const currentPassword = document.getElementById("currentPassword").value.trim();
    const newPassword = document.getElementById("newPassword").value.trim();
    const confirmNewPassword = document.getElementById("confirmNewPassword").value.trim();
    const errorEl = document.getElementById("passwordError");
    if (!currentPassword || !newPassword || !confirmNewPassword) return errorEl.textContent = "أكمل البيانات";
    if (newPassword !== confirmNewPassword) return errorEl.textContent = "كلمة المرور غير متطابقة";
    try {
        const user = auth.currentUser;
        if (!user) return errorEl.textContent = "لا يمكن تغيير كلمة المرور للحسابات العامة";
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
        await user.reauthenticateWithCredential(credential);
        await user.updatePassword(newPassword);
        showToast("تم التحديث!", "success");
    } catch (error) { errorEl.textContent = "خطأ: تأكد من كلمة المرور الحالية"; }
}

async function uploadMaterial(){
  if(!isAdmin && !isOwner) return alert("للأدمن فقط");
  const subject = document.getElementById("adminSubject").value;
  const title = document.getElementById("adminTitle").value;
  if(!subject || !title || uploadedFiles.length === 0) return alert("أكمل البيانات");
  
  showToast("جاري الرفع...");
  try {
      const urls = await uploadFilesToCloudinary(uploadedFiles);
      await db.collection("materials").add({
          subject, title, type: document.getElementById("adminType").value,
          desc: document.getElementById("adminDesc").value,
          files: urls, status: "approved", uploader: currentUser.name, date: new Date().toISOString()
      });
      showToast("تم النشر!", "success");
      uploadedFiles = [];
      document.getElementById("fileList").innerHTML = "";
      loadDashboard();
  } catch(e) { console.error(e); showToast("خطأ", "error"); }
}

async function postAnnouncement() {
    if(!isAdmin && !isOwner) return;
    const title = document.getElementById('announcementTitle').value;
    const content = document.getElementById('announcementContent').value;
    if(!title) return;
    await db.collection("announcements").add({title, content, date: new Date().toISOString()});
    showToast("تم النشر");
    loadDashboard();
}

async function loadAnnouncements() {
    const snap = await db.collection("announcements").orderBy("date", "desc").get();
    const list = document.getElementById("announcementsList");
    list.innerHTML = "";
    snap.forEach(d => {
        const a = d.data();
        const del = (isAdmin || isOwner) ? `<button onclick="db.collection('announcements').doc('${d.id}').delete().then(loadAnnouncements)" style="color:red">🗑️</button>` : "";
        list.innerHTML += `<div class="announcement-card"><h3>${a.title} ${del}</h3><p>${a.content}</p></div>`;
    });
}

// ==================== Init ====================
function populateAdminSubjects() {
    const s = document.getElementById('adminSubject');
    if(!s) return;
    
    s.innerHTML = '<option value="">-- اختر المادة --</option>';
    // Always add English Course option
    s.innerHTML += `<option value="English Course">English Course (كورس الانجليزي)</option>`;
    
    subjects.forEach(sub => {
        if(sub !== "English Course") s.innerHTML += `<option value="${sub}">${sub}</option>`;
    });

    // SMART TYPE SWITCHER
    s.onchange = function() {
        const typeSelect = document.getElementById("adminType");
        if(this.value === "English Course") {
            typeSelect.innerHTML = `
                <option value="course">شرح (Course)</option>
                <option value="quiz">كويز (Quiz)</option>
            `;
        } else {
            typeSelect.innerHTML = `
                <option value="summary">ملخص (Summary)</option>
                <option value="assignment">تكليف (Assignment)</option>
            `;
        }
    };
}

window.onload = async function() {
    // 1. CHECK KILL SWITCH & GOD MODE THEME
    const isDown = await checkSiteStatus();
    if (isDown) return; 

    // 2. Load User
    const savedEmail = localStorage.getItem("userEmail");
    if(savedEmail) {
        let isCurrentOwner = (savedEmail === OWNER_EMAIL);
        
        currentUser = { name: localStorage.getItem("userName"), email: savedEmail };
        isAdmin = localStorage.getItem("isAdmin") === "true" || isCurrentOwner; 
        isOwner = localStorage.getItem("isOwner") === "true" || isCurrentOwner;

        if (isCurrentOwner) {
            localStorage.setItem("isOwner", "true");
            localStorage.setItem("isAdmin", "true");
        }

        showMainApp();
    }
    
    // 3. Populate
    await loadSubjectsFromDB();
    populateAdminSubjects();
    updateFavoritesDisplay();
    
    const theme = localStorage.getItem('selectedTheme') || "default";
    currentThemeIndex = themes.indexOf(theme);
    if(currentThemeIndex === -1) currentThemeIndex = 0;
    applyTheme(theme);
};