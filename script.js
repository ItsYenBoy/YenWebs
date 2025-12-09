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
let currentSubject = null;
let currentFilter = "all";
let allMaterials = [];
let uploadedFiles = []; 
let fileCounter = 0;

// Defined Subjects
const subjects = [
  "Subject N1",
  "Subject N2",
  "Subject N3",
  "Subject N4",
  "Subject N5"
];

// ==================== Helpers ====================

function getSubjectIcon(subject) {
    const icons = {
        "Subject N1": "fa-solid fa-chart-line",
        "Subject N2": "fa-solid fa-language",
        "Subject N3": "fa-solid fa-calculator",
        "Subject N4": "fa-solid fa-scale-balanced",
        "Subject N5": "fa-solid fa-briefcase" 
    };
    return icons[subject] || "fa-solid fa-book-open";
}

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

// ==================== File Upload (Admin Only) ====================
function handleFileSelect(event) {
  const files = event.target.files;
  const fileList = document.getElementById('fileList');
  if (!files.length) return;

  fileList.innerHTML = '';
  uploadedFiles = [];
  fileCounter = 0;
  
  Array.from(files).forEach(file => {
    // Warn on large files > 10MB
    if (file.size > 10*1024*1024) alert(`تنبيه: الملف ${file.name} كبير جداً`);

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
  const uploadedUrls = [];
  const progressContainer = document.getElementById('uploadProgress');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  
  if(progressContainer) progressContainer.style.display = 'block';

  for (let i=0; i<files.length; i++){
    const file = files[i].file;
    try{
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);
      
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {method:'POST', body: formData});
      if(!res.ok) throw new Error('فشل رفع الملف');
      
      const data = await res.json();
      uploadedUrls.push({name:file.name, url:data.secure_url, type:file.type, size:file.size});
      
      const totalProgress = ((i+1)/files.length)*100;
      if(progressBar) progressBar.style.width = totalProgress+'%';
      if(progressText) progressText.textContent = `تم رفع ${i+1} من ${files.length} ملفات`;
    
    } catch(err){
      console.error(err);
      alert(`فشل رفع الملف: ${file.name}`);
    }
  }

  if(progressContainer) progressContainer.style.display = 'none';
  if(progressBar) progressBar.style.width = '0%';
  return uploadedUrls;
}

// ==================== Auth & Name Fix ====================
function switchTab(tab){
  const loginForm=document.getElementById("loginForm");
  const registerForm=document.getElementById("registerForm");
  const tabs=document.querySelectorAll(".tab-btn");
  if(tab==="login"){
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    tabs[0].classList.add("active");
    tabs[1].classList.remove("active");
  }else{
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
    tabs[0].classList.remove("active");
    tabs[1].classList.add("active");
  }
}

async function handleLogin(){
  const email=document.getElementById("loginEmail").value.trim();
  const password=document.getElementById("loginPassword").value.trim();
  const errorEl=document.getElementById("loginError");
  
  if(!email||!password){errorEl.textContent="الرجاء ملء جميع الحقول"; return;}
  errorEl.textContent="جاري التحقق...";

  try{
    // 1. Check if it's an Allowed Code (Admin/Special User)
    const codesSnap=await db.collection("allowedCodes").where("code","==",email).get();
    if(!codesSnap.empty){
      const data=codesSnap.docs[0].data();
      const userName = data.name || data.code || "User";
      
      currentUser={ name: userName, email: email };
      isAdmin = data.admin || false;
      
      localStorage.setItem("userEmail", email);
      localStorage.setItem("userName", userName);
      localStorage.setItem("isAdmin", isAdmin);
      
      showMainApp(); 
      return;
    }

    // 2. Check if it's a Registered User
    const usersSnap=await db.collection("users").where("email","==",email).get();
    if(!usersSnap.empty){
      const data=usersSnap.docs[0].data();
      if(data.password === password){
        currentUser = data;
        isAdmin = data.isAdmin || false;
        
        localStorage.setItem("userEmail", email);
        localStorage.setItem("userName", data.name);
        localStorage.setItem("isAdmin", isAdmin);
        
        showMainApp(); 
        return;
      } else {
        errorEl.textContent="كلمة المرور غير صحيحة";
      }
      return;
    }
    errorEl.textContent="البريد الإلكتروني غير موجود";
  } catch(err){
    errorEl.textContent="خطأ في الاتصال: "+err.message;
  }
}

async function handleRegister(){
  const name=document.getElementById("registerName").value.trim();
  const email=document.getElementById("registerEmail").value.trim();
  const password=document.getElementById("registerPassword").value.trim();
  const errorEl=document.getElementById("registerError");
  
  if(!name||!email||!password){errorEl.textContent="الرجاء ملء جميع الحقول"; return;}

  try{
    const exists=await db.collection("users").where("email","==",email).get();
    if(!exists.empty){errorEl.textContent="البريد الإلكتروني مستخدم بالفعل"; return;}
    
    await db.collection("users").add({name,email,password,isAdmin:false,createdAt:new Date().toISOString()});
    
    localStorage.setItem("userEmail",email);
    localStorage.setItem("userName",name);
    localStorage.setItem("isAdmin",false);
    
    currentUser = { name, email, isAdmin: false };
    
    alert("تم إنشاء الحساب بنجاح!");
    showMainApp();
  }catch(err){errorEl.textContent="حدث خطأ أثناء إنشاء الحساب";}
}

function handleLogout(){
  localStorage.clear();
  currentUser=null;
  isAdmin=false;
  location.reload(); 
}

function showMainApp(){
  document.getElementById("loginPage").classList.add("hidden");
  document.getElementById("mainApp").classList.remove("hidden");
  
  const nameDisplay = document.getElementById("userName");
  if(currentUser && currentUser.name) {
    nameDisplay.textContent = currentUser.name;
  }
  
  const adminBtn = document.getElementById("adminBtn");
  if(isAdmin) {
    adminBtn.style.display = "inline-block";
    adminBtn.classList.remove("hidden");
  } else {
    adminBtn.style.display = "none";
    adminBtn.classList.add("hidden");
  }
  
  loadDashboard();
}

// ==================== Navigation ====================
function showPage(page) {
  const pages = ["homePage", "subjectsPage", "materialsPage", "announcementsPage", "adminPage"];
  pages.forEach(p => document.getElementById(p).classList.add("hidden"));
  
  const target = document.getElementById(page + "Page");
  if(target) target.classList.remove("hidden");
  
  const navButtons = document.getElementById('navButtons');
  if (navButtons && navButtons.classList.contains('active')) navButtons.classList.remove('active');

  if (page === "home") loadDashboard();
  if (page === "subjects") loadSubjects();
  if (page === "announcements") loadAnnouncements();
}

// ==================== Dashboard ====================
async function loadDashboard() {
  try {
    const [usersSnap, codesSnap, materialsSnap, announcementsSnap] = await Promise.all([
        db.collection("users").get(),
        db.collection("allowedCodes").get(),
        db.collection("materials").where("status", "==", "approved").get(),
        db.collection("announcements").orderBy("date", "desc").limit(3).get()
    ]);

    let usersCount = usersSnap.size + codesSnap.size;
    let summariesCount = 0;
    let assignmentsCount = 0;

    materialsSnap.forEach((doc) => {
      const t = normalizeType(doc.data().type);
      if (t === "summary") summariesCount++;
      if (t === "assignment") assignmentsCount++;
    });

    const statsGrid = document.getElementById("statsGrid");
    if(statsGrid) {
        statsGrid.innerHTML = `
        <div class="stat-card"><h3>${usersCount}</h3><p><i class="fa-solid fa-user-group"></i> الطلاب</p></div>
        <div class="stat-card"><h3>${summariesCount}</h3><p>ملخصات</p></div>
        <div class="stat-card"><h3>${assignmentsCount}</h3><p>تكاليف</p></div>
        <div class="stat-card"><h3>${materialsSnap.size}</h3><p>الإجمالي</p></div>
        `;
    }

    const recentAnnouncements = document.getElementById("recentAnnouncements");
    if(recentAnnouncements) {
        recentAnnouncements.innerHTML = "";
        if (announcementsSnap.empty) {
        recentAnnouncements.innerHTML = `<p style="color:#94a3b8; text-align:center;">لا توجد إعلانات</p>`;
        } else {
        announcementsSnap.forEach((doc) => {
            const d = doc.data();
            const date = new Date(d.date).toLocaleDateString("ar-EG");
            recentAnnouncements.innerHTML += `
            <div style="background:var(--card-bg); border:1px solid var(--border); padding:20px; border-radius:15px; margin-bottom:10px">
                <h4 style="font-size:1.2em; margin-bottom:5px; color:var(--text-primary); font-weight:700;">${d.title}</h4>
                <p style="font-size:1em; margin-bottom:10px; color:var(--text-secondary);">${d.content}</p>
                <span style="display:block; font-size:0.9em;color:var(--accent); text-align:left;">${date}</span>
            </div>
            `;
        });
        }
    }
  } catch (err) {
    console.error("Error loading dashboard:", err);
  }
}

// ==================== Subjects ====================
async function loadSubjects() {
  const snap = await db.collection("materials")
      .where("status", "==", "approved") 
      .get();

  const subjectsGrid = document.getElementById("subjectsGrid");
  subjectsGrid.innerHTML = "";
  
  subjects.forEach((subject) => {
    const list = snap.docs.filter((d) => d.data().subject === subject);
    const summaryCount = list.filter((d) => normalizeType(d.data().type) === "summary").length;
    const assignmentCount = list.filter((d) => normalizeType(d.data().type) === "assignment").length;
    
    const iconClass = getSubjectIcon(subject);

    subjectsGrid.innerHTML += `
      <div class="subject-card" onclick="loadMaterials('${subject}')">
        <i class="${iconClass} subject-icon"></i>
        <h3>${subject}</h3>
        <div class="subject-stats">
          <span class="stat-badge summary">${summaryCount} ملخص</span>
          <span class="stat-badge assignment">${assignmentCount} تكليف</span>
        </div>
      </div>
    `;
  });
}

// ==================== Materials Display ====================
async function loadMaterials(subject) {
  currentSubject = subject;
  currentFilter = "all";
  
  const snap = await db.collection("materials")
    .where("subject", "==", subject)
    .where("status", "==", "approved")
    .get();

  allMaterials = snap.docs.map((doc) => ({id:doc.id,...doc.data(),type:normalizeType(doc.data().type)}));
  allMaterials.sort((a,b)=>new Date(b.date)-new Date(a.date));
  
  document.getElementById("materialSubjectTitle").textContent = subject;
  document.getElementById("subjectsPage").classList.add("hidden");
  document.getElementById("materialsPage").classList.remove("hidden");

  // Search Logic
  const searchBox = document.getElementById("searchBox");
  if(searchBox) {
      searchBox.value = "";
      const newSearch = searchBox.cloneNode(true);
      searchBox.parentNode.replaceChild(newSearch, searchBox);
      
      let debounceTimer;
      newSearch.addEventListener('input', (e) => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
              displayMaterials();
          }, 300);
      });
  }

  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.filter-btn')[0].classList.add('active');
  displayMaterials();
}

async function incrementDownloads(id) {
    try {
        await db.collection("materials").doc(id).update({
            downloadCount: firebase.firestore.FieldValue.increment(1)
        });
    } catch (err) { console.error(err); }
}

async function incrementViews(id) {
    try {
        await db.collection("materials").doc(id).update({
            viewCount: firebase.firestore.FieldValue.increment(1)
        });
    } catch (err) { console.error(err); }
}

function displayMaterials() {
  let list = allMaterials;
  if(currentFilter !== "all") list = list.filter(m => m.type === currentFilter);
  
  const sBox = document.getElementById("searchBox");
  const search = sBox ? sBox.value.toLowerCase() : "";
  if(search){
    list = list.filter(m => 
      (m.title || "").toLowerCase().includes(search) || 
      (m.desc || "").toLowerCase().includes(search)
    );
  }

  const container = document.getElementById("materialsList");
  
  if(list.length === 0){
    container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📚</span><p>لا توجد مواد</p></div>`;
    return;
  }

  let htmlContent = "";
  list.forEach(m => {
    const date = new Date(m.date).toLocaleDateString("ar-EG");
    
    let filesCount = 0;
    let mainLink = "#";

    if (m.files && m.files.length > 0) {
        filesCount = m.files.length;
        mainLink = m.files[0].url;
    } else if (m.fileUrl) {
        filesCount = 1;
        mainLink = m.fileUrl;
    }

    if (mainLink !== "#" && mainLink.includes('/upload/')) {
        mainLink = mainLink.replace('/upload/', '/upload/fl_attachment/');
    }

    const downloads = m.downloadCount || 0;
    const views = m.viewCount || 0;

    let actionBtnHTML = "";
    if (filesCount > 1) {
        actionBtnHTML = `
            <button onclick="incrementDownloads('${m.id}'); openMaterialModal('${m.id}'); event.stopPropagation();" class="download-file-btn" style="background: var(--gradient-3);">
                تصفح (${filesCount}) <i class="fa-solid fa-folder-open"></i>
            </button>
        `;
    } else if (filesCount === 1) {
        actionBtnHTML = `
            <a href="${mainLink}" class="download-file-btn" onclick="incrementDownloads('${m.id}'); event.stopPropagation();">
                تحميل <i class="fa-solid fa-download"></i>
            </a>
        `;
    } else {
        actionBtnHTML = `<button disabled class="download-file-btn" style="opacity:0.5; cursor:not-allowed;">فارغ</button>`;
    }

    // Only Admin can delete
    let deleteBtnHTML = "";
    if (isAdmin) {
        deleteBtnHTML = `
            <button onclick="deleteMaterial('${m.id}'); event.stopPropagation();"
            class="action-btn" title="حذف" style="color:#dc2626; border-color:#dc2626;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
    }

    let linkToShare = mainLink;
    let textToShare = m.desc;
    if (filesCount > 1) {
        linkToShare = window.location.href;
        textToShare = `ملخص: ${m.title} (${filesCount} ملفات)`;
    }

    const shareBtnHTML = `
        <button onclick="shareMaterial('${m.title}', '${textToShare}', '${linkToShare}'); event.stopPropagation();"
        class="action-btn" title="مشاركة">
            <i class="fa-solid fa-share-nodes"></i>
        </button>
    `;
    
    // Favorites
    const favBtnHTML = getFavButtonHTML(m.id, m.title, m.desc, mainLink, m.type, filesCount);

    htmlContent += `
      <div class="material-card" onclick="openMaterialModal('${m.id}')">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
            <span class="material-type-badge ${typeToClass(m.type)}" style="position:static;">${typeToArabic(m.type)}</span>
            <div style="display:flex; gap:8px;">
                <span class="download-counter" style="color:#aaa; border-color:#444; background:rgba(255,255,255,0.05);">
                    ${views} <i class="fa-solid fa-eye"></i>
                </span>
                <span class="download-counter">
                    ${downloads} <i class="fa-solid fa-cloud-arrow-down"></i>
                </span>
            </div>
        </div>
        
        <h3 style="color:var(--text-primary); font-size:1.2em; font-weight:800; margin:10px 0;">${m.title}</h3>
        <p style="color:var(--text-secondary); font-size:1em; margin-bottom:15px;">${m.desc || "..."}</p>
        
        <div style="font-size:0.9em;color:var(--text-secondary); display:flex; justify-content:space-between; margin-bottom:15px;">
          <span><i class="fa-regular fa-user"></i> ${m.uploader}</span>
          <span><i class="fa-regular fa-calendar"></i> ${date}</span>
        </div>

        <div class="card-actions">
            ${actionBtnHTML}
            <div style="display:flex; gap:8px;" onclick="event.stopPropagation()">
                ${shareBtnHTML}
                ${favBtnHTML}
                ${deleteBtnHTML}
            </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = htmlContent;
}

function filterByType(type){
  currentFilter=type;
  document.querySelectorAll('.filter-btn').forEach(btn=>btn.classList.remove('active'));
  document.querySelector(`.filters button[onclick="filterByType('${type}')"]`).classList.add('active');
  displayMaterials();
}

function filterMaterials(){displayMaterials();}

// ==================== Material Modal ====================
function openMaterialModal(id){
  const m=allMaterials.find(x=>x.id===id);
  if(!m) return;
  incrementViews(id);
  const modal=document.getElementById("materialModal");
  document.getElementById("modalTitle").textContent=m.title;
  document.getElementById("modalDesc").textContent=m.desc||"لا يوجد وصف";
  document.getElementById("modalUploader").textContent=m.uploader;
  document.getElementById("modalDate").textContent=new Date(m.date).toLocaleDateString("ar-EG");
  const badge=document.getElementById("modalTypeBadge");
  badge.className="material-type-badge "+typeToClass(m.type);
  badge.textContent=typeToArabic(m.type);

  const filesContainer=document.getElementById("modalFiles");
  filesContainer.innerHTML="";
  if(m.files && m.files.length>0){
    m.files.forEach(file=>{
      const fileDiv=document.createElement('div');
      fileDiv.className='modal-file-item';
      const fileIcon=file.type.includes('image')?'':'';
      const fileSize=file.size?`(${(file.size/1024).toFixed(1)} KB)`:'';
      let downloadUrl = file.url;
      if (file.url.includes('/upload/')) {
        downloadUrl = file.url.replace('/upload/', '/upload/fl_attachment/');
      }
      fileDiv.innerHTML=`
        <span>${fileIcon} ${file.name} ${fileSize}</span>
        <div class="file-actions-group">
           <a href="${downloadUrl}" class="download-file-btn" download><i class="fa-solid fa-download"></i></a>
           <a href="${file.url}" target="_blank" class="view-file-btn"><i class="fa-solid fa-eye"></i> </a>
        </div>
      `;
      filesContainer.appendChild(fileDiv);
    });
  } else {
      filesContainer.innerHTML='<p style="color:#94a3b8;text-align:center;padding:20px">لا توجد ملفات مرفقة</p>';
  }
  
  modal.style.display="flex";
}

function closeModal(){document.getElementById("materialModal").style.display="none";}
window.onclick=function(e){if(e.target===document.getElementById("materialModal")) closeModal();}

// ==================== Announcements Logic (UPDATED) ====================

// 1. Post Announcement (Admin Only)
async function postAnnouncement() {
  if(!isAdmin) return alert("هذه الميزة للمشرفين فقط");
  
  const title = document.getElementById('announcementTitle').value.trim();
  const content = document.getElementById('announcementContent').value.trim();

  if (!title || !content) {
    return alert("⚠️ الرجاء كتابة عنوان ومحتوى للإعلان");
  }

  try {
    await db.collection("announcements").add({
      title: title,
      content: content,
      date: new Date().toISOString()
    });

    showToast("✅ تم نشر الإعلان بنجاح", "success");
    
    document.getElementById('announcementTitle').value = "";
    document.getElementById('announcementContent').value = "";
    
    loadAnnouncements();
    loadDashboard(); 

  } catch (error) {
    console.error(error);
    showToast("❌ حدث خطأ أثناء النشر", "error");
  }
}

// 2. Delete Announcement (Admin Only)
async function deleteAnnouncement(id) {
    if(!isAdmin) return;
    if(!confirm("⚠️ هل أنت متأكد من حذف هذا الإعلان؟")) return;

    try {
        await db.collection("announcements").doc(id).delete();
        showToast("🗑️ تم حذف الإعلان", "success");
        loadAnnouncements(); 
        loadDashboard();
    } catch (error) {
        console.error(error);
        showToast("❌ حدث خطأ في الحذف", "error");
    }
}

// 3. Load Announcements (Read + Delete Button)
async function loadAnnouncements(){
  const snap = await db.collection("announcements").orderBy("date","desc").get();
  const list = document.getElementById("announcementsList");
  list.innerHTML = "";
  
  if(snap.empty){
    list.innerHTML = `<div class="empty-state" style="border:none;background:none;"><span class="empty-state-icon">📢</span><p style="color:var(--text-secondary)">لا توجد إعلانات حالياً</p></div>`;
    return;
  }

  snap.forEach(d => {
    const a = d.data();
    const date = new Date(a.date).toLocaleDateString("ar-EG");
    
    // Create Delete Button HTML only if user is Admin
    let deleteBtn = "";
    if(isAdmin) {
        deleteBtn = `<button onclick="deleteAnnouncement('${d.id}')" style="float:left; background:none; border:none; color:#ef4444; cursor:pointer; font-size:1.1rem;" title="حذف الإعلان"><i class="fa-solid fa-trash"></i></button>`;
    }

    list.innerHTML += `
      <div class="announcement-card" style="background:var(--bg-color); padding:15px; border-radius:8px; margin-bottom:10px; border:1px solid var(--border);">
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <h3 style="color:var(--accent); margin-bottom:5px;">${a.title}</h3>
            ${deleteBtn}
        </div>
        <p style="color:var(--text-primary); margin-bottom:10px; white-space: pre-wrap;">${a.content}</p>
        <span style="font-size:0.85em; color:var(--text-secondary);"><i class="fa-regular fa-clock"></i> ${date}</span>
      </div>
    `;
  });
}

// ==================== Admin: Upload Material (Direct Approve) ====================
async function uploadMaterial(){
  if(!isAdmin) return alert("ليس لديك صلاحية الرفع");
  
  const subject = document.getElementById("adminSubject").value;
  const typeVal = document.getElementById("adminType").value;
  const type = normalizeType(typeVal); 
  
  const title = document.getElementById("adminTitle").value.trim();
  const desc = document.getElementById("adminDesc").value.trim();
  
  if(!title) return alert("الرجاء إدخال عنوان المادة");
  if(uploadedFiles.length === 0) return alert("الرجاء اختيار ملف واحد على الأقل");
  
  try{
    showToast("جاري رفع الملفات...", "info");
    
    const filesUrls = await uploadFilesToCloudinary(uploadedFiles);
    if(filesUrls.length === 0) return alert("فشل رفع الملفات");
    
    // Status is immediately approved
    await db.collection("materials").add({
      subject,
      type,
      title,
      desc,
      files: filesUrls,
      uploader: currentUser.name || "Admin",
      date: new Date().toISOString(),
      status: "approved" 
    });
    
    showToast("✅ تم النشر بنجاح!", "success");
    
    // Reset Form
    document.getElementById("adminTitle").value = "";
    document.getElementById("adminDesc").value = "";
    document.getElementById("adminFiles").value = "";
    document.getElementById("fileList").innerHTML = "";
    uploadedFiles = [];
    fileCounter = 0;
    
    loadDashboard();
  } catch(err){
    console.error(err);
    showToast("❌ خطأ: " + err.message, "error");
  }
}

async function deleteMaterial(id) {
    if(!isAdmin) return alert("عفواً، هذا الإجراء للمشرفين فقط");
    if(!confirm("هل أنت متأكد من حذف هذا الملف نهائياً؟ ⚠️")) return;
    try {
        await db.collection("materials").doc(id).delete();
        showToast("تم حذف الملف بنجاح 🗑️", "success");
        allMaterials = allMaterials.filter(m => m.id !== id);
        displayMaterials(); 
    } catch(err) {
        console.error(err);
        showToast("حدث خطأ أثناء الحذف", "error");
    }
}

// ==================== Theme Logic ====================
const themes = ["default", "light", "midnight"];
let currentThemeIndex = 0;

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

// ==================== Auto Login & Init ====================
window.onload = async function() {
    // 1. Load Theme
    const savedTheme = localStorage.getItem('selectedTheme') || "default";
    currentThemeIndex = themes.indexOf(savedTheme);
    if(currentThemeIndex === -1) currentThemeIndex = 0;
    applyTheme(savedTheme);

    // 2. Load User Session
    const savedEmail = localStorage.getItem("userEmail");
    const savedName = localStorage.getItem("userName");
    const savedAdmin = localStorage.getItem("isAdmin") === "true";

    if(savedEmail){
       currentUser = { name: savedName || "User", email: savedEmail };
       isAdmin = savedAdmin;
       showMainApp();
    }
};

function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    let icon = '';
    if (type === 'success') icon = '✔';
    else if (type === 'error') icon = '✖';
    else icon = 'ℹ';

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-msg">${message}</span>
        <span class="toast-icon">${icon}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); 
    }, 3000);
}

// ==================== Sharing ====================
async function shareMaterial(title, text, url) {
    const finalUrl = (url && url !== "#") ? url : window.location.href;
    const shareData = {
        title: title,
        text: text,
        url: finalUrl
    };
    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(finalUrl);
            showToast("تم نسخ رابط الملف! 📋", "success");
        }
    } catch (err) {
        console.log("Error sharing:", err);
    }
}

// ==================== Favorites ====================
let myFavorites = JSON.parse(localStorage.getItem('Favs')) || [];
document.addEventListener('DOMContentLoaded', updateFavoritesDisplay);

window.toggleFav = function(btn, id, title, desc, link, type, filesCount) {
    if(event) event.stopPropagation();
    filesCount = filesCount || 0;
    const icon = btn.querySelector('i');
    const isActive = btn.classList.contains('active');
    
    if (!isActive) {
        btn.classList.add('active');
        icon.classList.remove('far');
        icon.classList.add('fas');
        if (!myFavorites.some(item => item.id === id)) {
            myFavorites.push({ id, title, desc, link, type, filesCount });
        }
    } else {
        btn.classList.remove('active');
        icon.classList.remove('fas');
        icon.classList.add('far');
        myFavorites = myFavorites.filter(item => item.id !== id);
    }

    localStorage.setItem('Favs', JSON.stringify(myFavorites));
    updateFavoritesDisplay();
};

function updateFavoritesDisplay() {
    const favSection = document.getElementById('favoritesSection');
    const favGrid = document.getElementById('favoritesGrid');
    if (!favSection || !favGrid) return;
    if (myFavorites.length === 0) {
        favSection.classList.add('hidden');
        return;
    }

    favSection.classList.remove('hidden');
    favGrid.innerHTML = '';

    myFavorites.forEach(item => {
        let actionBtn = "";
        
        if (item.filesCount > 1) {
            actionBtn = `
            <button onclick="openMaterialModal('${item.id}')" class="download-file-btn" style="background: var(--gradient-3); width: 100px;">
               عرض (${item.filesCount}) <i class="fa-solid fa-folder-open"></i>
            </button>`;
        } 
        else {
            actionBtn = `
            <a href="${item.link}" target="_blank" class="download-file-btn" style="width: 100px;">
               تحميل <i class="fas fa-download"></i>
            </a>`;
        }

        favGrid.innerHTML += `
            <div class="material-card" style="border-color: #ff5e62;">
                <span class="material-type-badge ${item.type === 'summary' ? 'badge-summary' : 'badge-assignment'}">
                   ${item.type === 'summary' ? 'ملخص' : 'تكليف'}
                </span>
                <h3 style="color:white; margin-top:10px;">${item.title}</h3>
                <div class="card-actions" style="margin-top:15px; display:flex; gap:10px; align-items:center;">
                    ${actionBtn}
                    <button class="btn-fav active" onclick="toggleFav(this, '${item.id}')">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

window.getFavButtonHTML = function(id, title, desc, link, type, filesCount) {
    const safeTitle = (title || "").replace(/'/g, "\\'");
    const safeDesc = (desc || "").replace(/'/g, "\\'");
    const isFav = myFavorites.some(item => item.id === id);
    const activeClass = isFav ? 'active' : '';
    const iconClass = isFav ? 'fas' : 'far';
    return `
    <button class="btn-fav ${activeClass}" 
            onclick="toggleFav(this, '${id}', '${safeTitle}', '${safeDesc}', '${link}', '${type}', ${filesCount})">
        <i class="${iconClass} fa-heart"></i>
    </button>
    `;
};