// ═══════════════════════════════════════════════════════════════
// 🍽️ نظام إدارة الطاولات الذكي - مطعم تعلولة
// الإصدار 2.0 - مع منطق التفريغ الذكي
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
let currentFilter = 'all';
let searchQuery = '';
let tablesListener = null;

// ═══════════════════════════════════════════════════════════════
// 🚀 التهيئة عند تحميل الصفحة
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 بدء تهيئة نظام إدارة الطاولات...');
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
        } else {
            console.error('❌ Firebase غير متاح');
            showNotification('error', 'خطأ', 'تعذر الاتصال بقاعدة البيانات');
        }
    } catch (error) {
        console.error('❌ خطأ في تهيئة Firebase:', error);
        showNotification('error', 'خطأ', 'فشل تهيئة قاعدة البيانات');
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎯 إعداد مستمعي الأحداث
// ═══════════════════════════════════════════════════════════════
function setupEventListeners() {
    // البحث
    document.getElementById('searchInput').addEventListener('input', (e) => {
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
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadTables();
        showNotification('info', 'تحديث', 'جاري تحديث البيانات...');
    });

    // إغلاق نافذة التفاصيل
    document.getElementById('closeDetailsBtn').addEventListener('click', () => {
        document.getElementById('tableDetailsModal').classList.remove('active');
    });

    // إغلاق النوافذ عند النقر خارجها
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
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

    // إيقاف المستمع القديم إن وجد
    if (tablesListener) {
        db.ref(TABLES_PATH).off('value', tablesListener);
    }

    // بدء الاستماع للتغييرات في الوقت الحقيقي
    tablesListener = db.ref(TABLES_PATH).on('value', (snapshot) => {
        const data = snapshot.val();
        tablesCache = [];

        if (data) {
            Object.keys(data).forEach(key => {
                const table = data[key];
                tablesCache.push({
                    id: key,
                    tableNumber: table.tableNumber || key,
                    status: table.status || STATUS_AVAILABLE,
                    area: table.area || 'صالة',
                    currentOrderId: table.currentOrderId || null,
                    numberOfPersons: table.numberOfPersons || null,
                    seatedAt: table.seatedAt || null,
                    activeOrdersCount: table.activeOrdersCount || 0,
                    lastUpdated: table.lastUpdated || null
                });
            });
        }

        // ترتيب الطاولات حسب الرقم
        tablesCache.sort((a, b) => {
            const numA = parseInt(a.tableNumber) || 999;
            const numB = parseInt(b.tableNumber) || 999;
            return numA - numB;
        });

        renderTables();
        updateStats();
        console.log(`✅ تم تحميل ${tablesCache.length} طاولة`);
    }, (error) => {
        console.error('❌ خطأ في تحميل الطاولات:', error);
        showNotification('error', 'خطأ', 'فشل تحميل الطاولات');
    });
}

// ═══════════════════════════════════════════════════════════════
// 🎨 عرض الطاولات في الواجهة
// ═══════════════════════════════════════════════════════════════
function renderTables() {
    const grid = document.getElementById('tablesGrid');
    
    // فلترة الطاولات
    let filteredTables = tablesCache;

    // فلترة حسب الحالة
    if (currentFilter === 'available') {
        filteredTables = filteredTables.filter(t => t.status === STATUS_AVAILABLE);
    } else if (currentFilter === 'occupied') {
        filteredTables = filteredTables.filter(t => t.status === STATUS_OCCUPIED);
    }

    // فلترة حسب البحث
    if (searchQuery) {
        filteredTables = filteredTables.filter(t => 
            t.tableNumber.toLowerCase().includes(searchQuery) ||
            t.area.toLowerCase().includes(searchQuery)
        );
    }

    // عرض النتيجة
    if (filteredTables.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
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
        ? `<p><i class="fas fa-user"></i> ${table.numberOfPersons} أشخاص</p>` 
        : '';
    
    const orderText = table.currentOrderId 
        ? `<p><i class="fas fa-receipt"></i> طلب #${table.currentOrderId}</p>` 
        : '';

    const seatedText = table.seatedAt 
        ? `<p><i class="fas fa-clock"></i> ${formatTime(table.seatedAt)}</p>` 
        : '';

    const actionButton = isOccupied
        ? `<button class="table-btn success" onclick="smartFreeTable('${table.id}', '${table.tableNumber}')">
               <i class="fas fa-door-open"></i> تفريغ الطاولة
           </button>`
        : `<button class="table-btn primary" onclick="showTableDetails('${table.id}')">
               <i class="fas fa-info-circle"></i> التفاصيل
           </button>`;

    return `
        <div class="table-card ${statusClass} fade-in" onclick="showTableDetails('${table.id}')">
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
// 🧠 عملية التفريغ الذكية (Smart Free Table)
// ═══════════════════════════════════════════════════════════════
/**
 * ✅✅✅ الدالة الذكية لتفريغ الطاولة
 * - إذا كانت الطاولة مفرغة بالفعل → يبلغ المستخدم
 * - إذا كانت الطاولة مشغولة → يقوم بتفريغها
 * - يتحقق من الحالة الحالية من Firebase قبل التنفيذ
 */
async function smartFreeTable(tableId, tableNumber) {
    console.log(`🧠 بدء عملية التفريغ الذكي للطاولة ${tableNumber}`);

    try {
        // 1️⃣ التحقق من الحالة الحالية من Firebase (مصدر الحقيقة)
        const snapshot = await db.ref(`${TABLES_PATH}/${tableId}`).once('value');
        const tableData = snapshot.val();

        if (!tableData) {
            showNotification('error', 'خطأ', `الطاولة ${tableNumber} غير موجودة في قاعدة البيانات`);
            return;
        }

        const currentStatus = tableData.status || STATUS_AVAILABLE;
        console.log(`📊 الحالة الحالية للطاولة ${tableNumber}: ${currentStatus}`);

        // 2️⃣ التحقق: هل الطاولة مفرغة بالفعل؟
        if (currentStatus === STATUS_AVAILABLE || currentStatus === STATUS_CLEANING) {
            // ✅ الطاولة مفرغة بالفعل - إبلاغ المستخدم
            showNotification(
                'warning',
                '🪑 الطاولة مفرغة بالفعل',
                `الطاولة رقم ${tableNumber} متاحة ولا تحتاج إلى تفريغ`,
                4000
            );
            console.log(`ℹ️ الطاولة ${tableNumber} مفرغة بالفعل - لا حاجة للتفريغ`);
            return;
        }

        // 3️⃣ الطاولة مشغولة - عرض نافذة التأكيد
        showConfirmModal(
            '✅ تفريغ الطاولة',
            `هل تريد تفريغ الطاولة رقم <strong>${tableNumber}</strong>؟<br>
             <small style="color: var(--gray);">سيتم إلغاء ربط الطلب الحالي وإعادة الطاولة للحالة المتاحة</small>`,
            async () => {
                await executeFreeTable(tableId, tableNumber, tableData);
            }
        );

    } catch (error) {
        console.error('❌ خطأ في عملية التفريغ الذكي:', error);
        showNotification('error', 'خطأ', `فشل التحقق من حالة الطاولة: ${error.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 تنفيذ عملية التفريغ
// ═══════════════════════════════════════════════════════════════
async function executeFreeTable(tableId, tableNumber, tableData) {
    try {
        console.log(`🔄 بدء تفريغ الطاولة ${tableNumber}...`);

        // إعداد بيانات التحديث
        const updateData = {
            status: STATUS_AVAILABLE,
            currentOrderId: null,
            numberOfPersons: null,
            personCount: null,
            seatedAt: null,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP,
            activeOrdersCount: 0
        };

        // تحديث Firebase
        await db.ref(`${TABLES_PATH}/${tableId}`).update(updateData);

        // ✅ نجاح العملية
        showNotification(
            'success',
            '✅ تم التفريغ بنجاح',
            `تم تفريغ الطاولة رقم ${tableNumber} وإعادتها للحالة المتاحة`,
            4000
        );

        console.log(`✅ تم تفريغ الطاولة ${tableNumber} بنجاح`);

        // إضافة تأثير بصري
        const tableCard = document.querySelector(`[onclick*="${tableId}"]`);
        if (tableCard) {
            tableCard.classList.add('pulse');
            setTimeout(() => tableCard.classList.remove('pulse'), 500);
        }

    } catch (error) {
        console.error('❌ فشل تفريغ الطاولة:', error);
        showNotification(
            'error',
            '❌ فشل التفريغ',
            `تعذر تفريغ الطاولة ${tableNumber}: ${error.message}`,
            5000
        );
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
        </div>
        ` : ''}
        ${table.currentOrderId ? `
        <div class="detail-row">
            <span class="detail-label">رقم الطلب:</span>
            <span class="detail-value">#${table.currentOrderId}</span>
        </div>
        ` : ''}
        ${table.activeOrdersCount > 0 ? `
        <div class="detail-row">
            <span class="detail-label">الطلبات النشطة:</span>
            <span class="detail-value">${table.activeOrdersCount}</span>
        </div>
        ` : ''}
        ${table.seatedAt ? `
        <div class="detail-row">
            <span class="detail-label">وقت الجلوس:</span>
            <span class="detail-value">${formatDateTime(table.seatedAt)}</span>
        </div>
        ` : ''}
        ${table.lastUpdated ? `
        <div class="detail-row">
            <span class="detail-label">آخر تحديث:</span>
            <span class="detail-value">${formatDateTime(table.lastUpdated)}</span>
        </div>
        ` : ''}
    `;

    document.getElementById('tableDetailsBody').innerHTML = detailsHtml;
    document.getElementById('tableDetailsModal').classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// 📊 تحديث الإحصائيات
// ═══════════════════════════════════════════════════════════════
function updateStats() {
    const available = tablesCache.filter(t => t.status === STATUS_AVAILABLE).length;
    const occupied = tablesCache.filter(t => t.status === STATUS_OCCUPIED).length;
    const total = tablesCache.length;

    document.getElementById('availableCount').textContent = available;
    document.getElementById('occupiedCount').textContent = occupied;
    document.getElementById('totalCount').textContent = total;
}

// ═══════════════════════════════════════════════════════════════
// 🔔 نظام الإشعارات
// ═══════════════════════════════════════════════════════════════
function showNotification(type, title, message, duration = 3000) {
    const container = document.getElementById('notificationContainer');
    
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

    // إزالة تلقائية بعد المدة المحددة
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideUp 0.4s ease';
            setTimeout(() => notification.remove(), 400);
        }
    }, duration);
}

// ═══════════════════════════════════════════════════════════════
// 🪟 نافذة التأكيد
// ═══════════════════════════════════════════════════════════════
function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').innerHTML = message;
    
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    // إزالة المستمعين القديمين
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // إضافة المستمعين الجدد
    newConfirmBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        onConfirm();
    });

    newCancelBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// 🕐 دوال تنسيق الوقت
// ═══════════════════════════════════════════════════════════════
function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ═══════════════════════════════════════════════════════════════
// 🧹 تنظيف عند مغادرة الصفحة
// ═══════════════════════════════════════════════════════════════
window.addEventListener('beforeunload', () => {
    if (tablesListener && db) {
        db.ref(TABLES_PATH).off('value', tablesListener);
    }
});