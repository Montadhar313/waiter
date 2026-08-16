// ============================================
// 🍽️ تحميل المنيو الديناميكي - النسخة النهائية المُحسَّنة
// ============================================

// 🔑 الثوابت العامة
const PROCESSING_KEY = 'taloola_processing_order';
const BAN_KEY = 'taloola_ban_until';
const BAN_DATA_KEY = 'taloola_ban_data';
const ACTIVE_ORDER_KEY = 'taloola_active_order';

// متغيرات ديناميكية تُحدث من Firebase
let processingDurationMs = 5 * 60 * 1000;
let banDurationMs = 5 * 60 * 60 * 1000;
let cachedCategories = [];
let cachedMenuItems = null;
let isMenuInitialized = false;

// متغير لتخزين مرجع الاستماع للطلب النشط
let activeOrderListener = null;
let processingInterval = null;
let banCountdownInterval = null;

// ✅✅✅ جديد: متغيرات لإدارة الطاولات الذكية
let db = null;
let currentTableNumber = null;

// ============================================
// 🔄 إدارة الطلب النشط - دوال موحدة
// ============================================

function saveActiveOrder(orderData) {
    try {
        const activeOrder = {
            orderId: orderData.orderId || null,
            orderNumber: orderData.orderNumber || null,
            phone: orderData.phone,
            status: orderData.status || 'pending',
            timestamp: Date.now(),
            lastChecked: Date.now()
        };
        localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify(activeOrder));
        console.log('✅ تم حفظ الطلب النشط:', activeOrder);
        return true;
    } catch (e) {
        console.warn('⚠️ فشل حفظ الطلب النشط:', e);
        return false;
    }
}

function getActiveOrder() {
    try {
        const data = localStorage.getItem(ACTIVE_ORDER_KEY);
        if (!data) return null;
        const order = JSON.parse(data);
        
        const expiryTime = 24 * 60 * 60 * 1000;
        if ((Date.now() - order.timestamp) >= expiryTime) {
            clearActiveOrder();
            return null;
        }
        return order;
    } catch (e) {
        return null;
    }
}

function clearActiveOrder() {
    try {
        localStorage.removeItem(ACTIVE_ORDER_KEY);
        sessionStorage.removeItem('active_order_id');
        sessionStorage.removeItem('lastOrderNumber');
        console.log('🗑️ تم مسح الطلب النشط');
        return true;
    } catch (e) {
        console.warn('⚠️ فشل مسح الطلب النشط');
        return false;
    }
}

function isOrderActive(activeOrder = null) {
    const order = activeOrder || getActiveOrder();
    if (!order || !order.orderId) return false;
    
    const finalStatuses = ['completed', 'delivered', 'cancelled', 'rejected'];
    if (finalStatuses.includes(order.status)) {
        return false;
    }
    
    const activeStatuses = ['pending', 'preparing', 'ready', 'on_the_way'];
    return activeStatuses.includes(order.status);
}

// ✅✅✅ جديد: نظام إدارة الطاولات الذكي
async function checkAndClearTable(tableNumber) {
    if (!db || !tableNumber) {
        console.warn('⚠️ Firebase غير جاهز أو رقم الطاولة غير محدد');
        return;
    }

    try {
        const tableRef = db.ref(`tables/${tableNumber}`);
        const snapshot = await tableRef.once('value');
        const tableData = snapshot.val();

        if (!tableData) {
            showNotification('⚠️ الطاولة غير موجودة في النظام');
            return;
        }

        // ✅ التحقق من حالة الطاولة
        if (tableData.status === 'Available' || tableData.status === 'متاحة') {
            // الطاولة مفرغة بالفعل
            showNotification(`✅ الطاولة ${tableNumber} مفرغة بالفعل`);
            console.log(`ℹ️ الطاولة ${tableNumber} مفرغة بالفعل`);
        } else if (tableData.status === 'Occupied' || tableData.status === 'مشغولة') {
            // الطاولة مشغولة - نقوم بتفريغها
            await clearTable(tableNumber);
            showNotification(`✅ تم تفريغ الطاولة ${tableNumber} بنجاح`);
            console.log(`✅ تم تفريغ الطاولة ${tableNumber}`);
        } else {
            showNotification(`ℹ️ حالة الطاولة: ${tableData.status}`);
        }
    } catch (error) {
        console.error('❌ خطأ في فحص الطاولة:', error);
        showNotification('❌ فشل فحص حالة الطاولة');
    }
}

async function clearTable(tableNumber) {
    try {
        const tableRef = db.ref(`tables/${tableNumber}`);
        await tableRef.update({
            status: 'Available',
            currentOrderId: null,
            numberOfPersons: null,
            seatedAt: null,
            lastUpdated: Date.now(),
            activeOrdersCount: 0
        });
        console.log(`🟢 تم تفريغ الطاولة ${tableNumber} في Firebase`);
    } catch (error) {
        console.error('❌ فشل تفريغ الطاولة:', error);
        throw error;
    }
}

// ✅ دالة للحصول على رقم الطاولة من URL
function getTableNumberFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('table');
}

// ============================================
// 🛡️ دوال مساعدة آمنة
// ============================================

function safeLocalStorageGet(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    } catch (e) {
        console.warn(`⚠️ localStorage get: ${key}`);
        return defaultValue;
    }
}

function safeLocalStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.warn(`⚠️ localStorage set: ${key}`);
        return false;
    }
}

function safeLocalStorageRemove(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.warn(`⚠️ localStorage remove: ${key}`);
        return false;
    }
}

function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch (e) {
        return defaultValue;
    }
}

const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIiB2aWV3Qm94PSIwIDAgNDAwIDQwMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiNmNWY1ZjUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE4IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+8J+TuyDZhNmI2YXYryDYqtmC2LPYqSDYp9mE2YXYutmI2LHYqTwvdGV4dD48L3N2Zz4=';

// ============================================
// 📥 تحميل المنيو من Firebase
// ============================================

function loadMenuFromFirebase() {
    if (typeof firebase === 'undefined' || !firebase.database) {
        setTimeout(loadMenuFromFirebase, 500);
        return;
    }
    
    console.log('🔍 بدء تحميل المنيو من Firebase...');
    
    firebase.database().ref('categories').orderByChild('order').on('value', 
        (snapshot) => {
            const categories = snapshot.val();
            if (!categories) {
                console.warn('⚠️ لا توجد أقسام في Firebase');
                return;
            }
            
            cachedCategories = Object.keys(categories).map(key => ({
                id: key,
                ...categories[key]
            })).sort((a, b) => (a.order || 0) - (b.order || 0));
            
            console.log(`✅ تم تحميل ${cachedCategories.length} قسم`);
            rebuildMenuSections(cachedCategories);
            updateNavigationButtons(cachedCategories);
            
            if (cachedMenuItems) {
                populateMenuItems(cachedCategories, cachedMenuItems);
                setTimeout(() => {
                    if (smartImageLoader) smartImageLoader.observeAllImages();
                }, 200);
            }
        },
        (error) => {
            console.error('❌ خطأ في تحميل الأقسام:', error);
        }
    );
    
    firebase.database().ref('menu').on('value',
        (snapshot) => {
            cachedMenuItems = snapshot.val();
            if (!cachedMenuItems) {
                console.warn('⚠️ لا توجد أصناف في Firebase');
                return;
            }
            
            console.log(`✅ تم تحميل ${Object.keys(cachedMenuItems).length} صنف`);
            
            if (cachedCategories.length > 0) {
                populateMenuItems(cachedCategories, cachedMenuItems);
                setTimeout(() => {
                    if (smartImageLoader) smartImageLoader.observeAllImages();
                }, 200);
            }
        },
        (error) => {
            console.error('❌ خطأ في تحميل الأصناف:', error);
        }
    );
}

// ... (باقي الدوال من الملف الأصلي تبقى كما هي)

// ============================================
// 🚀 التهيئة عند تحميل الصفحة
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    document.addEventListener('touchstart', function(){}, {passive: true});
    
    const firebaseConfig = {
        apiKey: "AIzaSyD5mfdKg5MaKfnzOQNMumt0ZwL8QGeKMfU",
        authDomain: "talola-food.firebaseapp.com",
        databaseURL: "https://talola-food-default-rtdb.firebaseio.com",
        projectId: "talola-food",
        messagingSenderId: "440585170470",
        appId: "1:440585170470:web:d9a2ba4500d9738dcf00e7"
    };
    
    // تهيئة Firebase
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    console.log('✅ تم تهيئة Firebase بنجاح');
    
    // ✅✅✅ التحقق من رقم الطاولة في URL
    currentTableNumber = getTableNumberFromURL();
    if (currentTableNumber) {
        console.log(`🍽️ تم اكتشاف رقم الطاولة: ${currentTableNumber}`);
        // فحص وتفريغ الطاولة إذا لزم الأمر
        checkAndClearTable(currentTableNumber);
    }
    
    // تحميل المنيو
    loadMenuFromFirebase();
    
    // ... (باقي التهيئة من الملف الأصلي)
    
    updateCartUI();
    initLocationIcon();
    initializeLocationSystem();
    setupProductClickDelegation();
    setupProductModalHandlers();
    initSmartImageLoading();
});

// ✅ دالة لعرض الإشعارات
function showNotification(message) {
    const existing = document.querySelector('.cart-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
    notification.textContent = message;
    notification.style.display = 'block';
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideInDown 0.5s ease reverse';
        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, 500);
    }, 3000);
}
