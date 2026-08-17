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
// 🪑 إنشاء بطاقة الطاولة المحسّنة - تتعامل مع جميع المتغيرات
// ═══════════════════════════════════════════════════════════════
function createTableCard(table) {
    // تحديد الحالة والأسلوب
    const statusConfig = getStatusConfig(table.status);
    const isOccupied = table.status === STATUS_OCCUPIED;
    const isCleaning = table.status === STATUS_CLEANING;
    const isReserved = table.status === 'Reserved';
    const isAvailable = table.status === STATUS_AVAILABLE;
    
    // حساب الوقت المنقضي منذ الجلوس
    const elapsedTime = table.seatedAt ? calculateElapsedTime(table.seatedAt) : null;
    
    // بناء معلومات الطاولة
    const infoItems = [];
    
    // المنطقة
    if (table.area) {
        infoItems.push(`<div class="info-row"><i class="fas fa-map-marker-alt"></i> ${table.area}</div>`);
    }
    
    // عدد الأشخاص
    const persons = table.numberOfPersons || table.personCount;
    if (persons && persons > 0) {
        infoItems.push(`<div class="info-row"><i class="fas fa-users"></i> ${persons} أشخاص</div>`);
    }
    
    // عدد الطلبات النشطة
    if (table.activeOrdersCount && table.activeOrdersCount > 0) {
        infoItems.push(`<div class="info-row highlight"><i class="fas fa-receipt"></i> ${table.activeOrdersCount} طلب نشط</div>`);
    } else if (table.currentOrderId) {
        infoItems.push(`<div class="info-row"><i class="fas fa-receipt"></i> طلب #${table.currentOrderId}</div>`);
    }
    
    // الوقت المنقضي
    if (elapsedTime && isOccupied) {
        const timeClass = elapsedTime.minutes > 60 ? 'warning' : '';
        infoItems.push(`<div class="info-row ${timeClass}"><i class="fas fa-clock"></i> ${elapsedTime.text}</div>`);
    }
    
    // وقت الجلوس
    if (table.seatedAt) {
        infoItems.push(`<div class="info-row small"><i class="fas fa-chair"></i> ${formatTime(table.seatedAt)}</div>`);
    }
    
    // آخر تحديث
    if (table.lastUpdated && !isAvailable) {
        infoItems.push(`<div class="info-row small"><i class="fas fa-sync"></i> ${formatTimeAgo(table.lastUpdated)}</div>`);
    }
    
    // حالة التنظيف
    if (isCleaning) {
        infoItems.push(`<div class="info-row cleaning"><i class="fas fa-broom"></i> جاري التنظيف</div>`);
    }
    
    // حالة الحجز
    if (isReserved) {
        infoItems.push(`<div class="info-row reserved"><i class="fas fa-bookmark"></i> محجوزة</div>`);
    }
    
    // بناء أزرار الإجراءات حسب الحالة
    let actionButtons = '';
    
    if (isOccupied) {
        actionButtons = `
            <button class="table-action-pro free-btn" onclick="event.stopPropagation(); smartFreeTable('${table.id}', '${table.tableNumber}')">
                <i class="fas fa-door-open"></i> تفريغ
            </button>
            <button class="table-action-pro details-btn" onclick="event.stopPropagation(); showTableDetails('${table.id}')">
                <i class="fas fa-info-circle"></i> تفاصيل
            </button>
        `;
    } else if (isCleaning) {
        actionButtons = `
            <button class="table-action-pro ready-btn" onclick="event.stopPropagation(); markTableReady('${table.id}', '${table.tableNumber}')">
                <i class="fas fa-check"></i> جاهزة
            </button>
        `;
    } else if (isReserved) {
        actionButtons = `
            <button class="table-action-pro cancel-reserve-btn" onclick="event.stopPropagation(); cancelReservation('${table.id}', '${table.tableNumber}')">
                <i class="fas fa-times"></i> إلغاء الحجز
            </button>
            <button class="table-action-pro details-btn" onclick="event.stopPropagation(); showTableDetails('${table.id}')">
                <i class="fas fa-info-circle"></i> تفاصيل
            </button>
        `;
    } else {
        // متاحة
        actionButtons = `
            <button class="table-action-pro details-btn" onclick="event.stopPropagation(); showTableDetails('${table.id}')">
                <i class="fas fa-info-circle"></i> التفاصيل
            </button>
        `;
    }
    
    // شارة الحالة
    const statusBadge = `
        <span class="table-status-pro ${statusConfig.class}">
            <i class="fas ${statusConfig.icon}"></i>
            ${statusConfig.text}
        </span>
    `;
    
    // مؤشر الطلبات المتعددة
    const multiOrderBadge = table.activeOrdersCount > 1 
        ? `<span class="multi-order-badge">${table.activeOrdersCount} طلبات</span>` 
        : '';
    
    // مؤشر الوقت الطويل
    const longStayBadge = elapsedTime && elapsedTime.minutes > 90 
        ? `<span class="long-stay-badge"><i class="fas fa-exclamation-triangle"></i></span>` 
        : '';

    return `
        <div class="table-card-pro ${statusConfig.cardClass} fade-in" 
             onclick="showTableDetails('${table.id}')" 
             data-id="${table.id}"
             data-status="${table.status}">
            <div class="table-card-header-pro">
                <div class="table-number-pro">${table.tableNumber}</div>
                ${statusBadge}
                ${multiOrderBadge}
                ${longStayBadge}
            </div>
            <div class="table-info-pro">
                ${infoItems.join('')}
            </div>
            <div class="table-actions-pro" onclick="event.stopPropagation()">
                ${actionButtons}
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════════════════
// 🎨 إعدادات الحالة
// ═══════════════════════════════════════════════════════════════
function getStatusConfig(status) {
    const configs = {
        'Available': {
            class: 'status-available',
            cardClass: 'available',
            icon: 'fa-check-circle',
            text: 'متاحة'
        },
        'Occupied': {
            class: 'status-occupied',
            cardClass: 'occupied',
            icon: 'fa-users',
            text: 'مشغولة'
        },
        'Cleaning': {
            class: 'status-cleaning',
            cardClass: 'cleaning',
            icon: 'fa-broom',
            text: 'تنظيف'
        },
        'Reserved': {
            class: 'status-reserved',
            cardClass: 'reserved',
            icon: 'fa-bookmark',
            text: 'محجوزة'
        }
    };
    return configs[status] || configs['Available'];
}


// ═══════════════════════════════════════════════════════════════
// ⏱️ حساب الوقت المنقضي
// ═══════════════════════════════════════════════════════════════
function calculateElapsedTime(seatedAt) {
    const now = Date.now();
    const seated = new Date(seatedAt).getTime();
    const diffMs = now - seated;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const remainMins = diffMins % 60;
    
    let text = '';
    if (diffHours > 0) {
        text = `${diffHours}س ${remainMins}د`;
    } else {
        text = `${diffMins} دقيقة`;
    }
    
    return {
        minutes: diffMins,
        hours: diffHours,
        text: text
    };
}

// ═══════════════════════════════════════════════════════════════
// 🕐 تنسيق الوقت المنقضي
// ═══════════════════════════════════════════════════════════════
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffMins < 1) return 'الآن';
    if (diffMins < 60) return `منذ ${diffMins} د`;
    if (diffHours < 24) return `منذ ${diffHours} س`;
    return formatDateTime(timestamp);
}

// ═══════════════════════════════════════════════════════════════
// ✅ تعليم الطاولة كجاهزة (بعد التنظيف)
// ═══════════════════════════════════════════════════════════════
async function markTableReady(tableId, tableNumber) {
    try {
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
        showToast(`✅ الطاولة ${tableNumber} جاهزة للاستخدام`, 'success');
        addToHistory(tableNumber, 'تنظيف');
    } catch (error) {
        console.error('❌ فشل تحديث حالة الطاولة:', error);
        showToast('❌ فشل تحديث الحالة', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// ❌ إلغاء الحجز
// ═══════════════════════════════════════════════════════════════
async function cancelReservation(tableId, tableNumber) {
    if (!confirm(`هل تريد إلغاء حجز الطاولة ${tableNumber}؟`)) return;
    
    try {
        const updateData = {
            status: STATUS_AVAILABLE,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        };
        
        await db.ref(`${TABLES_PATH}/${tableId}`).update(updateData);
        showToast(`✅ تم إلغاء حجز الطاولة ${tableNumber}`, 'success');
    } catch (error) {
        console.error('❌ فشل إلغاء الحجز:', error);
        showToast('❌ فشل إلغاء الحجز', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
// 📋 عرض تفاصيل الطاولة المحسّنة
// ═══════════════════════════════════════════════════════════════
function showTableDetails(tableId) {
    const table = tablesCache.find(t => t.id === tableId);
    if (!table) return;

    const statusConfig = getStatusConfig(table.status);
    const elapsedTime = table.seatedAt ? calculateElapsedTime(table.seatedAt) : null;
    const persons = table.numberOfPersons || table.personCount;

    const detailsHtml = `
        <div class="details-header-pro">
            <div class="details-table-number">${table.tableNumber}</div>
            <span class="table-status-pro ${statusConfig.class}">
                <i class="fas ${statusConfig.icon}"></i>
                ${statusConfig.text}
            </span>
        </div>
        
        <div class="details-section-pro">
            <h4><i class="fas fa-info-circle"></i> المعلومات الأساسية</h4>
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-hashtag"></i> رقم الطاولة:</span>
                <span class="detail-value-pro">${table.tableNumber}</span>
            </div>
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-map-marker-alt"></i> المنطقة:</span>
                <span class="detail-value-pro">${table.area || 'غير محدد'}</span>
            </div>
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-flag"></i> الحالة:</span>
                <span class="detail-value-pro ${statusConfig.class}">${statusConfig.text}</span>
            </div>
        </div>
        
        ${table.status === STATUS_OCCUPIED ? `
        <div class="details-section-pro">
            <h4><i class="fas fa-users"></i> معلومات الإشغال</h4>
            ${persons ? `
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-user-friends"></i> عدد الأشخاص:</span>
                <span class="detail-value-pro">${persons}</span>
            </div>` : ''}
            ${table.seatedAt ? `
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-clock"></i> وقت الجلوس:</span>
                <span class="detail-value-pro">${formatDateTime(table.seatedAt)}</span>
            </div>
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-hourglass-half"></i> المدة:</span>
                <span class="detail-value-pro ${elapsedTime.minutes > 60 ? 'warning-text' : ''}">${elapsedTime.text}</span>
            </div>` : ''}
            ${table.currentOrderId ? `
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-receipt"></i> رقم الطلب:</span>
                <span class="detail-value-pro">#${table.currentOrderId}</span>
            </div>` : ''}
            ${table.activeOrdersCount > 0 ? `
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-layer-group"></i> الطلبات النشطة:</span>
                <span class="detail-value-pro highlight">${table.activeOrdersCount}</span>
            </div>` : ''}
        </div>` : ''}
        
        ${table.lastUpdated ? `
        <div class="details-section-pro">
            <h4><i class="fas fa-history"></i> السجل</h4>
            <div class="detail-row-pro">
                <span class="detail-label-pro"><i class="fas fa-sync"></i> آخر تحديث:</span>
                <span class="detail-value-pro">${formatDateTime(table.lastUpdated)}</span>
            </div>
        </div>` : ''}
        
        ${table.qrCodeData ? `
        <div class="details-section-pro">
            <h4><i class="fas fa-qrcode"></i> رمز QR</h4>
            <div class="qr-code-display">
                <code>${table.qrCodeData}</code>
            </div>
        </div>` : ''}
    `;

    const body = document.getElementById('tableDetailsBody');
    const freeBtn = document.getElementById('freeFromDetailsBtn');
    
    if (body) body.innerHTML = detailsHtml;
    if (freeBtn) {
        if (table.status === STATUS_OCCUPIED) {
            freeBtn.style.display = 'flex';
            freeBtn.innerHTML = '<i class="fas fa-door-open"></i> تفريغ الطاولة';
            freeBtn.onclick = () => {
                document.getElementById('tableDetailsModal').classList.remove('active');
                smartFreeTable(table.id, table.tableNumber);
            };
        } else if (table.status === STATUS_CLEANING) {
            freeBtn.style.display = 'flex';
            freeBtn.innerHTML = '<i class="fas fa-check"></i> تعليم كجاهزة';
            freeBtn.onclick = () => {
                document.getElementById('tableDetailsModal').classList.remove('active');
                markTableReady(table.id, table.tableNumber);
            };
        } else {
            freeBtn.style.display = 'none';
        }
    }
    
    document.getElementById('tableDetailsModal')?.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// 📊 تحديث الإحصائيات المحسّنة
// ═══════════════════════════════════════════════════════════════
function updateStats() {
    const available = tablesCache.filter(t => t.status === STATUS_AVAILABLE).length;
    const occupied = tablesCache.filter(t => t.status === STATUS_OCCUPIED).length;
    const cleaning = tablesCache.filter(t => t.status === STATUS_CLEANING).length;
    const reserved = tablesCache.filter(t => t.status === 'Reserved').length;
    const total = tablesCache.length;
    const activeOrders = tablesCache.reduce((sum, t) => sum + (t.activeOrdersCount || 0), 0);

    const el = (id) => document.getElementById(id);
    if (el('availableCount')) el('availableCount').textContent = available;
    if (el('occupiedCount')) el('occupiedCount').textContent = occupied;
    if (el('totalCount')) el('totalCount').textContent = total;
    if (el('freedCount')) el('freedCount').textContent = sessionFreedCount;
    
    // إضافة إحصائيات إضافية إذا كانت العناصر موجودة
    if (el('cleaningCount')) el('cleaningCount').textContent = cleaning;
    if (el('reservedCount')) el('reservedCount').textContent = reserved;
    if (el('activeOrdersCount')) el('activeOrdersCount').textContent = activeOrders;
}

// ═══════════════════════════════════════════════════════════════
// 📋 سجل التفريغ المحسّن
// ═══════════════════════════════════════════════════════════════
function addToHistory(tableNumber, action = 'تفريغ') {
    freedTablesLog.unshift({
        tableNumber: tableNumber,
        action: action,
        time: new Date()
    });
    
    if (freedTablesLog.length > 30) freedTablesLog.pop();
    renderHistory();
    
    // تحديث العداد
    const countEl = document.getElementById('historyCount');
    if (countEl) countEl.textContent = freedTablesLog.length;
}

function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    
    if (freedTablesLog.length === 0) {
        list.innerHTML = '<li class="history-empty"><i class="fas fa-inbox"></i><p>لم يتم تفريغ أي طاولة بعد</p></li>';
        return;
    }
    
    list.innerHTML = freedTablesLog.map(item => `
        <li class="history-item-pro">
            <div class="history-badge-pro">
                <i class="fas ${item.action === 'تفريغ' ? 'fa-door-open' : 'fa-check'}"></i>
            </div>
            <div class="history-info-pro">
                <div class="history-name-pro">طاولة ${item.tableNumber} - ${item.action}</div>
                <div class="history-time-pro">${item.time.toLocaleTimeString('ar-IQ', { 
                    hour: '2-digit', minute: '2-digit', second: '2-digit' 
                })}</div>
            </div>
        </li>
    `).join('');
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
