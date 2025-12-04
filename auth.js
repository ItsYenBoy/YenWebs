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

// إعدادات Cloudinary المحدثة
const CLOUDINARY_CLOUD_NAME = "ddipck32h";
const CLOUDINARY_UPLOAD_PRESET = "YenWeb"; // غيّر هذا بعد إنشاء preset جديد

let currentUser = null;
let isAdmin = false;
let currentSubject = null;
let currentFilter = "all";
let allMaterials = [];
let uploadedFiles = []; 
let fileCounter = 0;

const subjects = [
  "التفكير الابتكاري",
  "لغة اجنبية (1)",
  "مبادئ المحاسبة المالية",
  "مبادئ القانون",
  "مبادئ ادارة الاعمال"
];

function normalizeType(type) {
  if (!type) return "";
  type = type.toString().trim();
  const summaryList = ["summary", "ملخص", "ملخصات", "تلخيص"];
  const assignmentList = ["assignment", "تكليف", "تكاليف", "واجب"];
  if (summaryList.includes(type)) return "summary";
  if (assignmentList.includes(type)) return "assignment";
  return type;
}

function typeToArabic(type) {
  return type === "assignment" ? "تكليف" : "ملخص";
}

function typeToClass(type) {
  return type === "assignment" ? "badge-assignment" : "badge-summary";
}

function toggleNavMenu() {
  const navButtons = document.getElementById('navButtons');
  if (navButtons) navButtons.classList.toggle('active');
}

function handleFileSelect(event) {
  const files = event.target.files;
  const fileList = document.getElementById('fileList');
  if (!files.length) return;

  fileList.innerHTML = '';
  uploadedFiles = [];
  fileCounter = 0;

  Array.from(files).forEach(file => {
    const validTypes = ['image/jpeg','image/png','image/jpg','image/gif','application/pdf'];
    if (!validTypes.includes(file.type)) {
      alert(`${file.name} غير مدعوم`);
      return;
    }

    if (file.size > 10*1024*1024) {
      alert(`${file.name} كبير جداً (الحد الأقصى 10 ميجا)`);
      return;
    }

    const fileId = 'file-'+fileCounter++;
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.id = fileId;
    const fileIcon = file.type.includes('image') ? '🖼️':'📄';
    const fileSizeKB = (file.size/1024).toFixed(1);

    fileItem.innerHTML = `
      <span>${fileIcon} ${file.name} (${fileSizeKB} KB)</span>
      <button onclick="removeFile('${fileId}')" class="remove-file-btn">✕</button>
    `;
    fileList.appendChild(fileItem);
    uploadedFiles.push({id: fileId, file});
  });

  event.target.value = null;
}

function removeFile(fileId) {
  uploadedFiles = uploadedFiles.filter(f => f.id !== fileId);
  const element = document.getElementById(fileId);
  if (element) element.remove();
}

async function uploadFilesToCloudinary(files) {
  // التحقق من عدد الملفات
  if(files.length > 10) {
    alert("لا يمكن رفع أكثر من 10 ملفات في المرة الواحدة");
    return [];
  }
  
  // التحقق من الحجم الإجمالي
  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  if(totalSize > 50 * 1024 * 1024) { // 50 ميجا
    alert("الحجم الإجمالي للملفات كبير جداً (الحد الأقصى 50 ميجا)");
    return [];
  }

  const uploadedUrls = [];
  const progressContainer = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  progressContainer.style.display = 'block';

  for (let i=0; i<files.length; i++){
    const file = files[i].file;
    try{
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
        method:'POST', 
        body: formData
      });
      
      if(!res.ok) throw new Error('فشل رفع الملف');
      
      const data = await res.json();
      uploadedUrls.push({
        name: file.name,
        url: data.secure_url,
        type: file.type,
        size: file.size
      });
      
      const totalProgress = ((i+1)/files.length)*100;
      progressBar.style.width = totalProgress+'%';
      progressText.textContent = `تم رفع ${i+1} من ${files.length} ملفات`;
    } catch(err){
      console.error(err);
      alert(`فشل رفع الملف: ${file.name}`);
    }
  }

  progressContainer.style.display = 'none';
  progressBar.style.width = '0%';
  return uploadedUrls;
}

function switchTab(tab){
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const tabs = document.querySelectorAll(".tab-btn");
  
  if(tab === "login"){
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    tabs[0].classList.add("active");
    tabs[1].classList.remove("active");
  } else {
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    tabs[0].classList.remove("active");
    tabs[1].classList.add("active");
  }
}

async function handleLogin(){
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const errorEl = document.getElementById("loginError");
  
  if(!email || !password){
    errorEl.textContent = "الرجاء ملء جميع الحقول";
    return;
  }
  
  errorEl.textContent = "جاري التحقق...";

  try {
    // التحقق من الكود المباشر أولاً (للمسؤولين)
    const codesSnap = await db.collection("allowedCodes")
      .where("code", "==", email)
      .get();
      
    if(!codesSnap.empty) {
      const data = codesSnap.docs[0].data();
      currentUser = {name: data.name || "User", email};
      isAdmin = data.admin || false;
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userName", currentUser.name);
      localStorage.setItem("isAdmin", isAdmin);
      showMainApp();
      return;
    }

    // استخدام Firebase Auth للمستخدمين العاديين
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // جلب بيانات المستخدم من Firestore
    const userDoc = await db.collection("users")
      .where("email", "==", email)
      .get();
      
    if(!userDoc.empty) {
      const userData = userDoc.docs[0].data();
      currentUser = userData;
      isAdmin = userData.isAdmin || false;
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userName", userData.name);
      localStorage.setItem("isAdmin", isAdmin);
      showMainApp();
    } else {
      // إذا لم يوجد في Firestore، أنشئ السجل
      await db.collection("users").add({
        name: user.displayName || email.split('@')[0],
        email: email,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        uid: user.uid
      });
      currentUser = {name: email.split('@')[0], email, isAdmin: false};
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userName", currentUser.name);
      localStorage.setItem("isAdmin", false);
      showMainApp();
    }
    
  } catch(err) {
    console.error(err);
    if(err.code === 'auth/wrong-password') {
      errorEl.textContent = "كلمة المرور غير صحيحة";
    } else if(err.code === 'auth/user-not-found') {
      errorEl.textContent = "البريد الإلكتروني غير موجود";
    } else if(err.code === 'auth/invalid-email') {
      errorEl.textContent = "البريد الإلكتروني غير صالح";
    } else if(err.code === 'auth/too-many-requests') {
      errorEl.textContent = "محاولات كثيرة جداً. حاول لاحقاً";
    } else {
      errorEl.textContent = "خطأ في تسجيل الدخول";
    }
  }
}

async function handleRegister(){
  const name = document.getElementById("registerName").value.trim();
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value.trim();
  const errorEl = document.getElementById("registerError");
  
  if(!name || !email || !password){
    errorEl.textContent = "الرجاء ملء جميع الحقول";
    return;
  }
  
  if(password.length < 6){
    errorEl.textContent = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    return;
  }

  try {
    // إنشاء حساب في Firebase Auth
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // حفظ البيانات الإضافية في Firestore (بدون كلمة المرور!)
    await db.collection("users").add({
      name,
      email,
      isAdmin: false,
      createdAt: new Date().toISOString(),
      uid: user.uid
    });
    
    currentUser = {name, email, isAdmin: false};
    localStorage.setItem("userEmail", email);
    localStorage.setItem("userName", name);
    localStorage.setItem("isAdmin", false);
    
    alert("✅ تم إنشاء الحساب بنجاح!");
    showMainApp();
    
  } catch(err) {
    console.error(err);
    if(err.code === 'auth/email-already-in-use') {
      errorEl.textContent = "البريد الإلكتروني مستخدم بالفعل";
    } else if(err.code === 'auth/invalid-email') {
      errorEl.textContent = "البريد الإلكتروني غير صالح";
    } else if(err.code === 'auth/weak-password') {
      errorEl.textContent = "كلمة المرور ضعيفة جداً";
    } else {
      errorEl.textContent = "حدث خطأ: " + err.message;
    }
  }
}

function handleLogout(){
  auth.signOut(); // تسجيل خروج من Firebase Auth
  localStorage.clear();
  currentUser = null;
  isAdmin = false;
  document.getElementById("mainApp").classList.add("hidden");
  document.getElementById("loginPage").classList.remove("hidden");
}

function showMainApp(){
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("mainApp").classList.remove("hidden");
  document.getElementById("userName").textContent = currentUser.name || currentUser.email;
  
  if(isAdmin) {
    document.getElementById("adminBtn").style.display = "inline-block";
  } else {
    document.getElementById("adminBtn").style.display = "none";
  }
  
  loadDashboard();
}

function showPage(page){
  const pages = ["homePage","subjectsPage","materialsPage","announcementsPage","adminPage"];
  pages.forEach(p => document.getElementById(p).classList.add("hidden"));
  document.getElementById(page+"Page").classList.remove("hidden");
  
  const navButtons = document.getElementById('navButtons');
  if(navButtons && navButtons.classList.contains('active')) {
    navButtons.classList.remove('active');
  }
  
  if(page === "home") loadDashboard();
  if(page === "subjects") loadSubjects();
  if(page === "announcements") loadAnnouncements();
}

async function loadDashboard() {
  try {
    let usersCount = 0;
    const usersSnap = await db.collection("users").get();
    usersCount += usersSnap.size;
    const codesSnap = await db.collection("allowedCodes").get();
    usersCount += codesSnap.size;

    const materialsSnap = await db.collection("materials").get();
    let summariesCount = 0;
    let assignmentsCount = 0;
    materialsSnap.forEach((doc) => {
      const t = normalizeType(doc.data().type);
      if (t === "summary") summariesCount++;
      if (t === "assignment") assignmentsCount++;
    });

    const statsGrid = document.getElementById("statsGrid");
    statsGrid.innerHTML = `
      <div class="stat-card"><h3>${usersCount}</h3><p>مستخدم</p></div>
      <div class="stat-card"><h3>${summariesCount}</h3><p>ملخصات</p></div>
      <div class="stat-card"><h3>${assignmentsCount}</h3><p>تكاليف</p></div>
      <div class="stat-card"><h3>${materialsSnap.size}</h3><p>الاجمالي</p></div>
    `;

    const announcementsSnap = await db.collection("announcements")
      .orderBy("date", "desc")
      .limit(3)
      .get();
    const recentAnnouncements = document.getElementById("recentAnnouncements");
    recentAnnouncements.innerHTML = "";
    if (announcementsSnap.empty) {
      recentAnnouncements.innerHTML = `<p style="color:#94a3b8; text-align:center;">لا توجد إعلانات</p>`;
    } else {
      announcementsSnap.forEach((doc) => {
        const d = doc.data();
        const date = new Date(d.date).toLocaleDateString("ar-EG");
        recentAnnouncements.innerHTML += `
          <div style="background:#f3f4f6;padding:20px;border-radius:15px;margin-bottom:10px">
            <h4 style="font-size:1.2em; margin-bottom:5px; color:#1e293b; font-weight:700;">${d.title}</h4>
            <p style="font-size:1em; margin-bottom:10px; color:#475569;">${d.content}</p>
            <span style="display:block; font-size:0.9em;color:#94a3b8; text-align:left;">${date}</span>
          </div>
        `;
      });
    }
  } catch (err) {
    console.error("Error loading dashboard:", err);
  }
}

async function loadSubjects() {
  const snap = await db.collection("materials").get();
  const subjectsGrid = document.getElementById("subjectsGrid");
  subjectsGrid.innerHTML = "";
  subjects.forEach((subject) => {
    const list = snap.docs.filter((d) => d.data().subject === subject);
    const summaryCount = list.filter((d) => normalizeType(d.data().type) === "summary").length;
    const assignmentCount = list.filter((d) => normalizeType(d.data().type) === "assignment").length;
    subjectsGrid.innerHTML += `
      <div class="subject-card" onclick="loadMaterials('${subject}')">
        <h3>${subject}</h3>
        <div class="subject-stats">
          <span class="stat-badge summary">${summaryCount} ملخص</span>
          <span class="stat-badge assignment">${assignmentCount} تكليف</span>
        </div>
      </div>
    `;
  });
}

async function loadMaterials(subject) {
  currentSubject = subject;
  currentFilter = "all";
  const snap = await db.collection("materials").where("subject","==",subject).get();
  allMaterials = snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    type: normalizeType(doc.data().type)
  }));
  allMaterials.sort((a,b) => new Date(b.date) - new Date(a.date));
  
  document.getElementById("materialSubjectTitle").textContent = subject;
  document.getElementById("subjectsPage").classList.add("hidden");
  document.getElementById("materialsPage").classList.remove("hidden");

  document.getElementById("searchBox").value = "";
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.filter-btn')[0].classList.add('active');

  displayMaterials();
}

function displayMaterials() {
  let list = allMaterials;
  if(currentFilter !== "all") {
    list = list.filter(m => m.type === currentFilter);
  }
  
  const search = document.getElementById("searchBox").value.toLowerCase();
  if(search){
    list = list.filter(m =>
      (m.title || "").toLowerCase().includes(search) ||
      (m.desc || "").toLowerCase().includes(search)
    );
  }
  
  const container = document.getElementById("materialsList");
  container.innerHTML = "";
  
  if(list.length === 0){
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">📚</span>
        <p>لا توجد مواد مطابقة ${currentFilter !== "all" ? `لنوع ${typeToArabic(currentFilter)}` : ""} في هذا الموضوع.</p>
      </div>
    `;
    return;
  }
  
  list.forEach(m => {
    const date = new Date(m.date).toLocaleDateString("ar-EG");
    const filesCount = m.files ? m.files.length : 0;
    container.innerHTML += `
      <div class="material-card" onclick="openMaterialModal('${m.id}')">
        <span class="material-type-badge ${typeToClass(m.type)}">${typeToArabic(m.type)}</span>
        <h3 style="color:#1e293b;font-size:1.2em;font-weight:800;margin-bottom:10px;">${m.title}</h3>
        <p style="color:#475569;font-size:1em;margin-bottom:15px;">${m.desc || "لا يوجد وصف"}</p>
        <div style="font-size:0.9em;color:#94a3b8;display:flex;justify-content:space-between;flex-wrap:wrap">
          <span>👤 ${m.uploader}</span>
          <span>📅 ${date}</span>
          <span>📎 ${filesCount} ملف</span>
        </div>
      </div>
    `;
  });
}

function filterByType(type){
  currentFilter = type;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.filters button[onclick="filterByType('${type}')"]`).classList.add('active');
  displayMaterials();
}

function filterMaterials(){
  displayMaterials();
}

function openMaterialModal(id){
  const m = allMaterials.find(x => x.id === id);
  if(!m) return;
  
  const modal = document.getElementById("materialModal");
  document.getElementById("modalTitle").textContent = m.title;
  document.getElementById("modalDesc").textContent = m.desc || "لا يوجد وصف";
  document.getElementById("modalUploader").textContent = m.uploader;
  document.getElementById("modalDate").textContent = new Date(m.date).toLocaleDateString("ar-EG");
  
  const badge = document.getElementById("modalTypeBadge");
  badge.className = "material-type-badge " + typeToClass(m.type);
  badge.textContent = typeToArabic(m.type);

  const filesContainer = document.getElementById("modalFiles");
  filesContainer.innerHTML = "";
  
  if(m.files && m.files.length > 0){
    m.files.forEach(file => {
      const fileDiv = document.createElement('div');
      fileDiv.className = 'modal-file-item';
      const fileIcon = file.type.includes('image') ? '🖼️' : '📄';
      const fileSize = file.size ? `(${(file.size/1024).toFixed(1)} KB)` : '';
      fileDiv.innerHTML = `
        <span>${fileIcon} ${file.name} ${fileSize}</span>
        <a href="${file.url}" target="_blank" class="view-file-btn">عرض</a>
      `;
      filesContainer.appendChild(fileDiv);
    });
  } else {
    filesContainer.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px">لا توجد ملفات مرفقة</p>';
  }
  
  modal.style.display = "flex";
}

function closeModal(){
  document.getElementById("materialModal").style.display = "none";
}

window.onclick = function(e){
  if(e.target === document.getElementById("materialModal")) {
    closeModal();
  }
}

async function loadAnnouncements(){
  const snap = await db.collection("announcements").orderBy("date","desc").get();
  const list = document.getElementById("announcementsList");
  list.innerHTML = "";
  
  if(snap.empty){
    list.innerHTML = `
      <div class="empty-state" style="border:none;background:none;">
        <span class="empty-state-icon">📢</span>
        <p style="color:#94a3b8">لا توجد إعلانات حالياً</p>
      </div>
    `;
    return;
  }
  
  snap.forEach(d => {
    const a = d.data();
    const date = new Date(a.date).toLocaleDateString("ar-EG");
    list.innerHTML += `
      <div class="announcement-card">
        <h3>${a.title}</h3>
        <p>${a.content}</p>
        <span>${date}</span>
      </div>
    `;
  });
}

async function uploadMaterial(){
  if(!isAdmin) {
    alert("ليس لديك صلاحية الرفع");
    return;
  }
  
  const subject = document.getElementById("adminSubject").value;
  const type = normalizeType(document.getElementById("adminType").value);
  const title = document.getElementById("adminTitle").value.trim();
  const desc = document.getElementById("adminDesc").value.trim();
  
  if(!title) {
    alert("الرجاء إدخال عنوان المادة");
    return;
  }
  
  if(uploadedFiles.length === 0) {
    alert("الرجاء اختيار ملف واحد على الأقل");
    return;
  }

  try{
    const filesUrls = await uploadFilesToCloudinary(uploadedFiles);
    if(filesUrls.length === 0) {
      alert("فشل رفع الملفات");
      return;
    }

    await db.collection("materials").add({
      subject,
      type,
      title,
      desc,
      files: filesUrls,
      uploader: currentUser.name || currentUser.email,
      date: new Date().toISOString()
    });

    alert("✅ تم رفع المادة بنجاح!");
    loadDashboard();
    
    // تنظيف النموذج
    document.getElementById("adminTitle").value = "";
    document.getElementById("adminDesc").value = "";
    document.getElementById("adminFiles").value = "";
    document.getElementById("fileList").innerHTML = "";
    uploadedFiles = [];
    fileCounter = 0;
    
  } catch(err){
    console.error(err);
    alert("❌ خطأ في الرفع: " + err.message);
  }
}

// مراقبة حالة تسجيل الدخول
auth.onAuthStateChanged(async (user) => {
  if (user && !currentUser) {
    // المستخدم مسجل دخول في Firebase Auth
    try {
      const userDoc = await db.collection("users")
        .where("email", "==", user.email)
        .get();
        
      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        currentUser = userData;
        isAdmin = userData.isAdmin || false;
        localStorage.setItem("userEmail", user.email);
        localStorage.setItem("userName", userData.name);
        localStorage.setItem("isAdmin", isAdmin);
        
        if (document.getElementById("loginPage").classList.contains("hidden")) {
          showMainApp();
        }
      }
    } catch (err) {
      console.error("Error loading user data:", err);
    }
  }
});

// التحقق من الجلسة عند تحميل الصفحة
window.onload = async function(){
  const saved = localStorage.getItem("userEmail");
  if(!saved) return;
  
  try {
    // التحقق من أكواد الدخول المباشر
    const codesSnap = await db.collection("allowedCodes")
      .where("code", "==", saved)
      .get();
      
    if(!codesSnap.empty){
      const data = codesSnap.docs[0].data();
      currentUser = {name: data.name, email: saved};
      isAdmin = data.admin || false;
      showMainApp();
      return;
    }
    
    // التحقق من المستخدمين العاديين
    const usersSnap = await db.collection("users")
      .where("email", "==", saved)
      .get();
      
    if(!usersSnap.empty){
      currentUser = usersSnap.docs[0].data();
      isAdmin = currentUser.isAdmin || false;
      showMainApp();
      return;
    }
    
    // إذا لم يوجد المستخدم، امسح البيانات المحلية
    localStorage.clear();
  } catch (err) {
    console.error("Error loading session:", err);
    localStorage.clear();
  }
};