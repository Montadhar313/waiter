// ═══════════════════════════════════════════════════════════════
// 🍽️ نظام إدارة الطاولات الذكي - مطعم تعلولة
// الإصدار 3.0 - مع QR Scanner + إدخال يدوي + سجل تفريغ
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// 🔑 الثوابت والإعدادات
// ═══════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyD5mfdKg5MaKfnzOQNMumt0ZwL8QGeKMfU",
    authDomain: "talola-food.firebaseapp.com",
    databaseURL: "https://talola-food-default-rtdb.firebaseio.com",
    projectId: "talola-food",
    messagingSenderId: "440585170470",
    appId: "1:440585170470:web:d9a2ba4500d9738dcf00e7"
};

const TABLES_PATH = 'tables';
const STATUS_AVAILABLE = 'Available';
const STATUS_OCCUPIED = 'Occupied';
const STATUS_CLEANING = 'Cleaning';

// ═══════════════════════════════════════════════════════════════
// 📦 المتغيرات العامة
// ═══════════════════════════════════════════════════════════════
let db = null;
let tablesCache = [];
let tablesMap = {};          // خريطة سريعة للبحث بالمفتاح أو الرقم
let currentFilter = 'all';
let searchQuery = '';
let tablesListener = null;

// QR Scanner
let html5QrCode = null;
let isScanning = false;
let lastScannedCode = null;
let lastScanTime = 0;

// سجل التفريغ
let freedTablesLog = [];
let sessionFreedCount = 0;
let pendingTableToFree = null;

// ═══════════════════════════════════════════════════════════════
// 🚀 التهيئة عند تحميل الصفحة
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 بدء تهيئة نظام إدارة الطاولات v3.0...');
    initializeFirebase();
    setupEventListeners();
    loadTables();
});

// ═══════════════════════════════════════════════════════════════
// 🔥 تهيئة Firebase
// ═══════════════════════════════════════════════════════════════
function initializeFirebase() {
    try {
        if (typeof firebase !== 'undefined') {
            firebase.initializeApp(FIREBASE_CONFIG);
            db = firebase.database();
            console.log('✅ تم تهيئة Firebase بنجاح');
            setConnectionStatus(true);
        } else {
            console.error('❌ Firebase غير متاح');
            showNotification('error', 'خطأ', 'تعذر الاتصال بقاعدة البيانات');
            setConnectionStatus(false);
        }
    } catch (error) {
        console.error('❌ خطأ في تهيئة Firebase:', error);
        showNotification('error', 'خطأ', 'فشل تهيئة قاعدة البيانات');
        setConnectionStatus(false);
    }
}

// ═══════════════════════════════════════════════════════════════
// 📊 تحديث حالة الاتصال
// ═══════════════════════════════════════════════════════════════
function setConnectionStatus(connected) {
    const badge = document.getElementById('connectionStatus');
    const text = document.getElementById('connectionText');
    if (!badge || !text) return;
    
    if (connected) {
        badge.className = 'status-badge connected';
        text.textContent = 'متصل بـ Firebase';
    } else {
        badge.className = 'status-badge disconnected';
        text.textContent = 'غير متصل';
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎯 إعداد مستمعي الأحداث
// ═══════════════════════════════════════════════════════════════
function setupEventListeners() {
    // البحث
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderTables();
    });

    // الفلاتر
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.closest('.filter-btn').classList.add('active');
            currentFilter = e.target.closest('.filter-btn').dataset.filter;
            renderTables();
        });
    });

    // التحديث
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        loadTables();
        showNotification('info', 'تحديث', 'جاري تحديث البيانات...');
    });

    // إغلاق نوافذ التفاصيل
    document.getElementById('closeDetailsBtn')?.addEventListener('click', () => {
        document.getElementById('tableDetailsModal').classList.remove('active');
    });
    document.getElementById('closeDetailsBtn2')?.addEventListener('click', () => {
        document.getElementById('tableDetailsModal').classList.remove('active');
    });

    // Enter في حقل الإدخال اليدوي
    document.getElementById('manualTableInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') manualFreeTable();
    });

    // إغلاق النوافذ عند النقر خارجها
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// 📥 تحميل الطاولات من Firebase
// ═══════════════════════════════════════════════════════════════
function loadTables() {
    if (!db) {
        console.error('❌ Firebase غير مهيأ');
        return;
    }

    if (tablesListener) {
        db.ref(TABLES_PATH).off('value', tablesListener);
    }

    tablesListener = db.ref(TABLES_PATH).on('value', (snapshot) => {
        const data = snapshot.val();
        tablesCache = [];
        tablesMap = {};

        if (data) {
            Object.keys(data).forEach(key => {
                const table = data[key];
                const tableObj = {
                    id: key,
                    tableNumber: table.tableNumber || key,
                    status: table.status || STATUS_AVAILABLE,
                    area: table.area || 'صالة',
                    currentOrderId: table.currentOrderId || null,
                    numberOfPersons: table.numberOfPersons || null,
                    seatedAt: table.seatedAt || null,
                    activeOrdersCount: table.activeOrdersCount || 0,
                    lastUpdated: table.lastUpdated || null
                };
                tablesCache.push(tableObj);
                tablesMap[key] = tableObj;
                // أيضاً نخزن برقم الطاولة للوصول السريع
                if (table.tableNumber) {
                    tablesMap[table.tableNumber] = tableObj;
                }
            });
        }

        // ترتيب
        tablesCache.sort((a, b) => {
            const numA = parseInt(a.tableNumber) || 999;
            const numB = parseInt(b.tableNumber) || 999;
            return numA - numB;
        });

        renderTables();
        updateStats();
        setConnectionStatus(true);
        console.log(`✅ تم تحميل ${tablesCache.length} طاولة`);
    }, (error) => {
        console.error('❌ خطأ في تحميل الطاولات:', error);
        showNotification('error', 'خطأ', 'فشل تحميل الطاولات');
        setConnectionStatus(false);
    });
}

// ═══════════════════════════════════════════════════════════════
// 🎨 عرض الطاولات
// ═══════════════════════════════════════════════════════════════
function renderTables() {
    const grid = document.getElementById('tablesGrid');
    if (!grid) return;
    
    let filteredTables = [...tablesCache];

    if (currentFilter === 'available') {
        filteredTables = filteredTables.filter(t => t.status === STATUS_AVAILABLE);
    } else if (currentFilter === 'occupied') {
        filteredTables = filteredTables.filter(t => t.status === STATUS_OCCUPIED);
    }

    if (searchQuery) {
        filteredTables = filteredTables.filter(t => 
            t.tableNumber.toLowerCase().includes(searchQuery) ||
            t.area.toLowerCase().includes(searchQuery)
        );
    }

    if (filteredTables.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-chair"></i>
                <h3>لا توجد طاولات</h3>
                <p>لم يتم العثور على طاولات تطابق البحث</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredTables.map(table => createTableCard(table)).join('');
}

// ═══════════════════════════════════════════════════════════════
// 🪑 إنشاء بطاقة الطاولة
// ═══════════════════════════════════════════════════════════════
function createTableCard(table) {
    const isOccupied = table.status === STATUS_OCCUPIED;
    const statusClass = isOccupied ? 'occupied' : 'available';
    const statusText = isOccupied ? 'مشغولة' : 'متاحة';
    const statusIcon = isOccupied ? 'fa-users' : 'fa-check-circle';
    
    const personsText = table.numberOfPersons 
        ? `<p><i class="fas fa-user"></i> ${table.numberOfPersons} أشخاص</p>` : '';
    
    const orderText = table.currentOrderId 
        ? `<p><i class="fas fa-receipt"></i> طلب #${table.currentOrderId}</p>` : '';

    const seatedText = table.seatedAt 
        ? `<p><i class="fas fa-clock"></i> ${formatTime(table.seatedAt)}</p>` : '';

    const actionButton = isOccupied
        ? `<button class="table-btn success" onclick="event.stopPropagation(); smartFreeTable('${table.id}', '${table.tableNumber}')">
               <i class="fas fa-door-open"></i> تفريغ الطاولة
           </button>`
        : `<button class="table-btn primary" onclick="event.stopPropagation(); showTableDetails('${table.id}')">
               <i class="fas fa-info-circle"></i> التفاصيل
           </button>`;

    return `
        <div class="table-card ${statusClass} fade-in" onclick="showTableDetails('${table.id}')" data-id="${table.id}">
            <div class="table-card-header">
                <span class="table-number">${table.tableNumber}</span>
                <span class="table-status-badge">
                    <i class="fas ${statusIcon}"></i> ${statusText}
                </span>
            </div>
            <div class="table-info">
                <p><i class="fas fa-map-marker-alt"></i> ${table.area}</p>
                ${personsText}
                ${orderText}
                ${seatedText}
            </div>
            <div class="table-actions" onclick="event.stopPropagation()">
                ${actionButton}
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════
// 📷 إدارة ماسح QR
// ═══════════════════════════════════════════════════════════════
function startScanner() {
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const placeholder = document.getElementById('scannerPlaceholder');
    const overlay = document.getElementById('scannerOverlay');
    
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    placeholder.style.display = 'none';
    overlay.style.display = 'flex';

    html5QrCode = new Html5Qrcode("reader");
    
    const config = {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.0,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
    };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
    ).then(() => {
        isScanning = true;
        showToast('📷 الكاميرا جاهزة - وجّهها نحو رمز QR', 'success');
    }).catch((err) => {
        console.error('فشل تشغيل الكاميرا:', err);
        showToast('❌ فشل تشغيل الكاميرا. تأكد من الإذن.', 'error');
        resetScannerUI();
    });
}

function stopScanner() {
    if (html5QrCode && isScanning) {
        html5QrCode.stop().then(() => {
            html5QrCode.clear();
            isScanning = false;
            resetScannerUI();
        }).catch(err => {
            console.error('خطأ في إيقاف الكاميرا:', err);
            resetScannerUI();
        });
    }
}

function resetScannerUI() {
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const placeholder = document.getElementById('scannerPlaceholder');
    const overlay = document.getElementById('scannerOverlay');
    
    if (startBtn) startBtn.style.display = 'flex';
    if (stopBtn) stopBtn.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (overlay) overlay.style.display = 'none';
    isScanning = false;
}

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    if (decodedText === lastScannedCode && (now - lastScanTime) < 3000) return;
    
    lastScannedCode = decodedText;
    lastScanTime = now;
    
    console.log('📱 تم مسح QR:', decodedText);
    
    if (navigator.vibrate) navigator.vibrate(50);
    
    processQRCode(decodedText);
}

function onScanFailure(error) {
    // تجاهل الأخطاء المتكررة
}

// ═══════════════════════════════════════════════════════════════
// 🔄 معالجة رمز QR
// ═══════════════════════════════════════════════════════════════
function processQRCode(qrData) {
    let tableNumber = null;
    
    // الصيغة 1: table_X
    const tableMatch = qrData.match(/table[_\-]?(\d+)/i);
    if (tableMatch) tableNumber = tableMatch[1];
    
    // الصيغة 2: رقم مباشر
    if (!tableNumber && /^\d+$/.test(qrData.trim())) {
        tableNumber = qrData.trim();
    }
    
    // الصيغة 3: JSON
    if (!tableNumber) {
        try {
            const parsed = JSON.parse(qrData);
            if (parsed.tableNumber) tableNumber = parsed.tableNumber;
            else if (parsed.table) tableNumber = parsed.table;
            else if (parsed.id) tableNumber = parsed.id.toString();
        } catch(e) {}
    }
    
    // الصيغة 4: URL
    if (!tableNumber) {
        const urlMatch = qrData.match(/[?&]table[_\-]?(\d+)/i) || qrData.match(/\/(\d+)$/);
        if (urlMatch) tableNumber = urlMatch[1];
    }

    if (!tableNumber) {
        showResult('error', '❌', 'رمز غير معروف', 
            'لم يتم التعرف على رقم الطاولة من الرمز الممسوح.<br>الرجاء استخدام التفريغ اليدوي.');
        return;
    }

    checkAndFreeTable(tableNumber);
}

// ═══════════════════════════════════════════════════════════════
// ⌨️ التفريغ اليدوي
// ═══════════════════════════════════════════════════════════════
function manualFreeTable() {
    const input = document.getElementById('manualTableInput');
    const tableNumber = input.value.trim();
    
    if (!tableNumber) {
        showToast('⚠️ الرجاء إدخال رقم الطاولة', 'warning');
        input.focus();
        return;
    }
    
    if (!/^\d+$/.test(tableNumber) || parseInt(tableNumber) <= 0) {
        showToast('⚠️ رقم الطاولة يجب أن يكون رقماً صحيحاً موجباً', 'warning');
        input.focus();
        return;
    }
    
    checkAndFreeTable(tableNumber);
    input.value = '';
}

// ═══════════════════════════════════════════════════════════════
// ✅ فحص وتأكيد تفريغ الطاولة (الدالة الذكية)
// ═══════════════════════════════════════════════════════════════
async function checkAndFreeTable(tableNumber) {
    console.log(`🔍 فحص الطاولة: ${tableNumber}`);
    
    // البحث عن الطاولة في الخريطة أو الكاش
    let table = tablesMap[tableNumber] || 
                tablesCache.find(t => t.tableNumber === tableNumber || t.id === tableNumber);
    
    if (!table) {
        showResult('warning', '⚠️', 'طاولة غير موجودة', 
            `الطاولة رقم <strong>${tableNumber}</strong> غير مسجلة في النظام.<br>تأكد من رقم الطاولة.`);
        showToast(`⚠️ الطاولة ${tableNumber} غير موجودة`, 'warning');
        return;
    }
    
    // التحقق من Firebase مباشرة (مصدر الحقيقة)
    try {
        const snapshot = await db.ref(`${TABLES_PATH}/${table.id}`).once('value');
        const tableData = snapshot.val();
        
        if (!tableData) {
            showResult('error', '❌', 'خطأ', 'الطاولة غير موجودة في قاعدة البيانات');
            return;
        }
        
        const currentStatus = tableData.status || STATUS_AVAILABLE;
        
        if (currentStatus === STATUS_AVAILABLE || currentStatus === STATUS_CLEANING) {
            showResult('warning', '🪑', 'الطاولة مفرغة بالفعل', 
                `الطاولة رقم <strong>${tableNumber}</strong> متاحة ولا تحتاج تفريغ.`, 
                tableNumber);
            showToast(`ℹ️ الطاولة ${tableNumber} مفرغة بالفعل`, 'info');
            return;
        }
        
        // الطاولة مشغولة - عرض تأكيد
        pendingTableToFree = { id: table.id, number: tableNumber };
        
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const freeBtn = document.getElementById('modalConfirmBtn');
        
        if (modalTitle) modalTitle.textContent = `✅ تفريغ الطاولة رقم ${tableNumber}`;
        if (modalMessage) modalMessage.innerHTML = `
            الطاولة <strong>مشغولة حالياً</strong><br>
            ${table.activeOrdersCount > 0 ? `📋 عدد الطلبات النشطة: ${table.activeOrdersCount}<br>` : ''}
            ${table.numberOfPersons ? `👥 عدد الأشخاص: ${table.numberOfPersons}<br>` : ''}
            <small style="color: var(--gray);">سيتم إعادة تعيين الطاولة للحالة "متاحة"</small>
        `;
        if (freeBtn) freeBtn.textContent = '✅ نعم، فرّغ الطاولة';
        
        document.getElementById('confirmModal')?.classList.add('active');
        
    } catch (error) {
        console.error('❌ خطأ في فحص الطاولة:', error);
        showResult('error', '❌', 'خطأ في الاتصال', 
            `تعذر التحقق من حالة الطاولة: ${error.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// 🧠 التفريغ الذكي من البطاقة مباشرة
// ═══════════════════════════════════════════════════════════════
async function smartFreeTable(tableId, tableNumber) {
    checkAndFreeTable(tableNumber);
}

// ═══════════════════════════════════════════════════════════════
// 🟢 تنفيذ التفريغ
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('modalConfirmBtn')?.addEventListener('click', async () => {
        if (!pendingTableToFree) return;
        
        document.getElementById('confirmModal')?.classList.remove('active');
        await executeFreeTable(pendingTableToFree.id, pendingTableToFree.number);
        pendingTableToFree = null;
    });
    
    document.getElementById('modalCancelBtn')?.addEventListener('click', () => {
        document.getElementById('confirmModal')?.classList.remove('active');
        pendingTableToFree = null;
    });
});

async function executeFreeTable(tableId, tableNumber) {
    try {
        console.log(`🔄 بدء تفريغ الطاولة ${tableNumber}...`);

        const updateData = {
            status: STATUS_AVAILABLE,
            currentOrderId: null,
            numberOfPersons: null,
            personCount: null,
            seatedAt: null,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP,
            activeOrdersCount: 0
        };

        await db.ref(`${TABLES_PATH}/${tableId}`).update(updateData);

        // نجاح
        sessionFreedCount++;
        const freedEl = document.getElementById('freedCount');
        if (freedEl) freedEl.textContent = sessionFreedCount;
        
        addToHistory(tableNumber);
        showResult('success', '✅', 'تم تفريغ الطاولة بنجاح!', 
            `الطاولة رقم ${tableNumber} جاهزة لاستقبال زبائن جدد`,
            tableNumber);
        
        playSuccessSound();
        
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        showToast(`✅ تم تفريغ الطاولة ${tableNumber}`, 'success');

        // تأثير بصري
        const tableCard = document.querySelector(`[data-id="${tableId}"]`);
        if (tableCard) {
            tableCard.classList.add('pulse');
            setTimeout(() => tableCard.classList.remove('pulse'), 500);
        }

        console.log(`✅ تم تفريغ الطاولة ${tableNumber} بنجاح`);

    } catch (error) {
        console.error('❌ فشل تفريغ الطاولة:', error);
        showResult('error', '❌', 'فشل التفريغ', 
            `تعذر تفريغ الطاولة ${tableNumber}: ${error.message}`);
        showToast('❌ فشل تفريغ الطاولة', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// 📋 عرض تفاصيل الطاولة
// ═══════════════════════════════════════════════════════════════
function showTableDetails(tableId) {
    const table = tablesCache.find(t => t.id === tableId);
    if (!table) return;

    const isOccupied = table.status === STATUS_OCCUPIED;
    const statusClass = isOccupied ? 'status-occupied' : 'status-available';
    const statusText = isOccupied ? 'مشغولة' : 'متاحة';

    const detailsHtml = `
        <div class="detail-row">
            <span class="detail-label">رقم الطاولة:</span>
            <span class="detail-value">${table.tableNumber}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">الحالة:</span>
            <span class="detail-value ${statusClass}">${statusText}</span>
        </div>
        <div class="detail-row">
            <span class="detail-label">المنطقة:</span>
            <span class="detail-value">${table.area}</span>
        </div>
        ${table.numberOfPersons ? `
        <div class="detail-row">
            <span class="detail-label">عدد الأشخاص:</span>
            <span class="detail-value">${table.numberOfPersons}</span>
        </div>` : ''}
        ${table.currentOrderId ? `
        <div class="detail-row">
            <span class="detail-label">رقم الطلب:</span>
            <span class="detail-value">#${table.currentOrderId}</span>
        </div>` : ''}
        ${table.activeOrdersCount > 0 ? `
        <div class="detail-row">
            <span class="detail-label">الطلبات النشطة:</span>
            <span class="detail-value">${table.activeOrdersCount}</span>
        </div>` : ''}
        ${table.seatedAt ? `
        <div class="detail-row">
            <span class="detail-label">وقت الجلوس:</span>
            <span class="detail-value">${formatDateTime(table.seatedAt)}</span>
        </div>` : ''}
        ${table.lastUpdated ? `
        <div class="detail-row">
            <span class="detail-label">آخر تحديث:</span>
            <span class="detail-value">${formatDateTime(table.lastUpdated)}</span>
        </div>` : ''}
    `;

    const body = document.getElementById('tableDetailsBody');
    const freeBtn = document.getElementById('freeFromDetailsBtn');
    
    if (body) body.innerHTML = detailsHtml;
    if (freeBtn) {
        freeBtn.style.display = isOccupied ? 'flex' : 'none';
        freeBtn.onclick = () => {
            document.getElementById('tableDetailsModal').classList.remove('active');
            smartFreeTable(table.id, table.tableNumber);
        };
    }
    
    document.getElementById('tableDetailsModal')?.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// 📊 تحديث الإحصائيات
// ═══════════════════════════════════════════════════════════════
function updateStats() {
    const available = tablesCache.filter(t => t.status === STATUS_AVAILABLE).length;
    const occupied = tablesCache.filter(t => t.status === STATUS_OCCUPIED).length;
    const total = tablesCache.length;

    const el = (id) => document.getElementById(id);
    if (el('availableCount')) el('availableCount').textContent = available;
    if (el('occupiedCount')) el('occupiedCount').textContent = occupied;
    if (el('totalCount')) el('totalCount').textContent = total;
}

// ═══════════════════════════════════════════════════════════════
// 📋 سجل التفريغ
// ═══════════════════════════════════════════════════════════════
function addToHistory(tableNumber) {
    freedTablesLog.unshift({
        tableNumber: tableNumber,
        time: new Date()
    });
    
    if (freedTablesLog.length > 20) freedTablesLog.pop();
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    
    if (freedTablesLog.length === 0) {
        list.innerHTML = '<li class="history-empty">لم يتم تفريغ أي طاولة بعد</li>';
        return;
    }
    
    list.innerHTML = freedTablesLog.map(item => `
        <li class="history-item">
            <div class="table-badge">✅ ${item.tableNumber}</div>
            <div class="info">
                <div class="table-name">طاولة ${item.tableNumber} - تم تفريغها</div>
                <div class="time">${item.time.toLocaleTimeString('ar-IQ', { 
                    hour: '2-digit', minute: '2-digit', second: '2-digit' 
                })}</div>
            </div>
        </li>
    `).join('');
}

// ═══════════════════════════════════════════════════════════════
// 🎨 عرض النتيجة
// ═══════════════════════════════════════════════════════════════
function showResult(type, icon, title, message, tableNumber = null) {
    const card = document.getElementById('resultCard');
    if (!card) return;
    
    card.className = `result-card ${type} show`;
    
    const el = (id) => document.getElementById(id);
    if (el('resultIcon')) el('resultIcon').textContent = icon;
    if (el('resultTitle')) el('resultTitle').textContent = title;
    if (el('resultMessage')) el('resultMessage').innerHTML = message;
    
    const tableEl = el('resultTableNumber');
    if (tableEl) {
        if (tableNumber) {
            tableEl.textContent = `طاولة ${tableNumber}`;
            tableEl.style.display = 'inline-block';
        } else {
            tableEl.style.display = 'none';
        }
    }
    
    if (el('resultTime')) {
        el('resultTime').textContent = 
            `🕐 ${new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    setTimeout(() => card.classList.remove('show'), 8000);
}

// ═══════════════════════════════════════════════════════════════
// 🔔 نظام الإشعارات
// ═══════════════════════════════════════════════════════════════
function showNotification(type, title, message, duration = 3000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${icons[type]}"></i>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(notification);

    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideUp 0.4s ease';
            setTimeout(() => notification.remove(), 400);
        }
    }, duration);
}

// ═══════════════════════════════════════════════════════════════
// 🍞 Toast
// ═══════════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    
    const iconEl = document.getElementById('toastIcon');
    const msgEl = document.getElementById('toastMessage');
    
    if (iconEl) iconEl.textContent = icons[type] || 'ℹ️';
    if (msgEl) msgEl.textContent = message;
    
    toast.className = `toast ${type} show`;
    
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════════════════════
// 🔊 صوت النجاح
// ═══════════════════════════════════════════════════════════════
function playSuccessSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const playTone = (freq, startTime, duration) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            
            oscillator.frequency.value = freq;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        };
        
        const now = audioCtx.currentTime;
        playTone(800, now, 0.15);
        playTone(1200, now + 0.15, 0.2);
    } catch(e) {
        // تجاهل
    }
}

// ═══════════════════════════════════════════════════════════════
// 🕐 دوال تنسيق الوقت
// ═══════════════════════════════════════════════════════════════
function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('ar-IQ', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

// ═══════════════════════════════════════════════════════════════
// 🧹 تنظيف عند مغادرة الصفحة
// ═══════════════════════════════════════════════════════════════
window.addEventListener('beforeunload', () => {
    if (tablesListener && db) {
        db.ref(TABLES_PATH).off('value', tablesListener);
    }
    if (html5QrCode && isScanning) {
        html5QrCode.stop().catch(() => {});
    }
});
