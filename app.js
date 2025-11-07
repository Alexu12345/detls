
const firebaseConfig = {
    apiKey: "AIzaSyBu_MfB_JXvzBFaKY-Yxze1JotejU--4as",
    authDomain: "worktrackerapp-a32af.firebaseapp.com",
    projectId: "worktrackerapp-a32af",
    storageBucket: "worktrackerapp-a32af.firebasestorage.app",
    messagingSenderId: "246595598451",
    appId: "1:246595598451:web:c6842f1618dffe765a5206"
};


// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// العناصر من DOM (تبقى كما هي)
const accountFilterEl = document.getElementById('account-filter');
const userFilterEl = document.getElementById('user-filter');
const applyBtn = document.getElementById('apply-filters-btn');
const tableBody = document.getElementById('data-table-body');
const resultsSection = document.getElementById('results-section');
const dateModeEl = document.getElementById('filter-date-mode');
const singleDateInputEl = document.getElementById('single-date-input');
const filterFromDateEl = document.getElementById('filter-from-date');
const filterToDateEl = document.getElementById('filter-to-date');

let accountsData = {}; // لحفظ بيانات الحسابات محليًا لمعادلة السعر

// =======================================================
// الوظائف المساعدة
// =======================================================

function formatTime(totalMinutes) {
    if (typeof totalMinutes !== 'number' || totalMinutes < 0) return '0h:0m';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h : ${minutes}m`;
}

function processRecord(record) {
    const totalMinutes = record.totalTime; 
    const accountId = record.accountId;
    const accountInfo = accountsData[accountId];
    
    // حساب الإجمالي بالجنيه
    const hoursDecimal = totalMinutes / 60;
    const pricePerHour = accountInfo ? (accountInfo.price || 0) : 0;
    const totalPrice = (hoursDecimal * pricePerHour).toFixed(2); 

    return {
        ...record,
        formattedTime: formatTime(totalMinutes),
        totalPrice: totalPrice,
        accountName: accountInfo ? accountInfo.name : 'حساب غير معروف'
    };
}

// **✅ وظيفة تنسيق التاريخ المُصححة (اليوم/الشهر فقط)**
function formatDateDM(timestampInSeconds) {
    // 🚨 الإصلاح الحاسم للسنة الغريبة: ضرب الـ timestamp في 1000
    const dateObj = new Date(timestampInSeconds * 1000); 
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
}


// =======================================================
// وظيفة موازنة التاريخ المبسطة (تبقى كما هي)
// =======================================================
function setupDateFilters() {
    dateModeEl.addEventListener('change', () => {
        const mode = dateModeEl.value;
        const useSingleDate = (mode === 'day' || mode === 'week' || mode === 'month');
        
        singleDateInputEl.disabled = !useSingleDate;
        filterFromDateEl.disabled = useSingleDate;
        filterToDateEl.disabled = useSingleDate;
        
        if (useSingleDate) {
            filterFromDateEl.value = '';
            filterToDateEl.value = '';
        } else {
            singleDateInputEl.value = '';
        }
    });
    
    const disableModeSelect = () => {
        const useRange = filterFromDateEl.value || filterToDateEl.value;
        dateModeEl.disabled = useRange;
        singleDateInputEl.disabled = useRange;
        
        if (useRange) {
            dateModeEl.value = 'all'; 
            singleDateInputEl.value = '';
        } else {
            dateModeEl.disabled = false;
            dateModeEl.dispatchEvent(new Event('change'));
        }
    };
    
    filterFromDateEl.addEventListener('change', disableModeSelect);
    filterToDateEl.addEventListener('change', disableModeSelect);
}


// =======================================================
// **✅ الوظيفة المُصححة: تجميع وفرز البيانات**
// =======================================================
function aggregateRecords(records, groupByField) {
    const aggregationMap = {};

    records.forEach(record => {
        let key;
        if (groupByField === 'date') {
            // استخدام التنسيق الجديد اليوم/الشهر كمفتاح للتجميع
            key = formatDateDM(record.timestamp); 
        } else {
            key = record[groupByField];
        }

        if (!aggregationMap[key]) {
            aggregationMap[key] = {
                keyName: key,
                totalTime: 0,
                totalPrice: 0,
            };
        }
        
        aggregationMap[key].totalTime += record.totalTime; 
        aggregationMap[key].totalPrice += parseFloat(record.totalPrice);
    });
    
    let aggregatedData = Object.values(aggregationMap).map(agg => ({
        ...agg,
        totalTime: agg.totalTime, // نحتاج القيمة الرقمية للفرز
        formattedTime: formatTime(agg.totalTime),
        totalPrice: agg.totalPrice.toFixed(2)
    }));

    // 🚨 فرز البيانات المجمعة لضمان ظهور 1 ثم 2 ثم 3 وهكذا
    if (groupByField === 'date') {
         aggregatedData.sort((a, b) => {
             const [dayA, monthA] = a.keyName.split('/').map(Number);
             const [dayB, monthB] = b.keyName.split('/').map(Number);
             
             // نفترض أن التواريخ ضمن نفس السنة
             if (monthA !== monthB) return monthA - monthB;
             return dayA - dayB;
         });
    }

    return aggregatedData;
}


// =======================================================
// ✅ وظيفة 1: جلب البيانات الأولية للمرشحات (تم التأكد من صحتها)
// =======================================================
async function populateInitialFilters() {
    setupDateFilters(); 

    // جلب الحسابات
    try {
        const accountsSnapshot = await db.collection('accounts').get();
        accountsSnapshot.forEach(doc => {
            const data = doc.data();
            accountsData[doc.id] = { name: data.name, price: data.defaultPricePerHour }; 
            
            const option = document.createElement('option');
            option.value = doc.id; 
            option.textContent = data.name;
            accountFilterEl.appendChild(option);
        });
    } catch (error) {
        console.error("خطأ في جلب الحسابات (يُرجى مراجعة قواعد الأمان):", error);
    }

    // جلب المستخدمين
    try {
        const usersSnapshot = await db.collection('users').where('role', '==', 'user').get();
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const option = document.createElement('option');
            option.value = data.name; 
            option.textContent = data.name;
            userFilterEl.appendChild(option);
        });
    } catch (error) {
        console.error("خطأ في جلب المستخدمين (يُرجى مراجعة قواعد الأمان):", error);
    }
}


// =======================================================
// ✅ وظيفة 3: تطبيق التصفية (إضافة الترتيب الضروري)
// =======================================================
applyBtn.addEventListener('click', async () => {
    // 1. Animation و مسح الجدول
    gsap.to(applyBtn, { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" });
    tableBody.innerHTML = '';
    resultsSection.classList.add('hidden');
    
    // 3. بناء الاستعلام
    let query = db.collection('workRecords');

    const selectedAccount = accountFilterEl.value;
    const selectedUser = userFilterEl.value;

    const filterScenario = 
        (selectedAccount !== 'all' && selectedUser !== 'all') ? 'AccountAndUser' :
        (selectedAccount !== 'all') ? 'AccountOnly' :
        (selectedUser !== 'all') ? 'UserOnly' :
        'None'; 

    // تطبيق فلتر الحساب والمستخدم
    if (selectedAccount !== 'all') {
        query = query.where('accountId', '==', selectedAccount);
    }
    if (selectedUser !== 'all') {
        query = query.where('userName', '==', selectedUser);
    }

    // 🚨 إضافة الترتيب لضمان سحب البيانات بالترتيب الزمني
    // (هذه الخطوة تتطلب إنشاء مؤشر مُركب في Firebase)
    query = query.orderBy('timestamp', 'asc'); 

    // تطبيق فلتر التاريخ (حساب الـ Timestamps)
    let fromTimestamp, toTimestamp;

    if (filterFromDateEl.value && filterToDateEl.value) {
        fromTimestamp = new Date(filterFromDateEl.value).setHours(0, 0, 0, 0) / 1000;
        toTimestamp = new Date(filterToDateEl.value).setHours(23, 59, 59, 999) / 1000;
    } 
    else if (singleDateInputEl.value && dateModeEl.value !== 'all') {
        const baseDate = new Date(singleDateInputEl.value);
        const mode = dateModeEl.value;

        if (mode === 'day') {
            fromTimestamp = baseDate.setHours(0, 0, 0, 0) / 1000;
            toTimestamp = baseDate.setHours(23, 59, 59, 999) / 1000;
        } else if (mode === 'week') {
            const startOfWeek = new Date(baseDate);
            startOfWeek.setDate(baseDate.getDate() - baseDate.getDay());
            fromTimestamp = startOfWeek.setHours(0, 0, 0, 0) / 1000;
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            toTimestamp = endOfWeek.setHours(23, 59, 59, 999) / 1000;
        } else if (mode === 'month') {
            fromTimestamp = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1).setHours(0, 0, 0, 0) / 1000;
            toTimestamp = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).setHours(23, 59, 59, 999) / 1000;
        }
    }
    
    if (fromTimestamp && toTimestamp) {
        query = query.where('timestamp', '>=', fromTimestamp).where('timestamp', '<=', toTimestamp);
    }

    // 4. جلب البيانات
    let recordsSnapshot;
    try {
        recordsSnapshot = await query.get();
    } catch (error) {
        console.error("🚨 خطأ في جلب سجلات العمل (يُرجي إنشاء Index):", error);
        alert("حدث خطأ أثناء جلب البيانات. المشكلة هي 'Invalid Query' وتتطلب إنشاء المؤشر المُركب في Firebase.");
        return;
    }

    const processedRecords = [];
    recordsSnapshot.forEach(doc => {
        processedRecords.push(processRecord(doc.data()));
    });
    
    // 5. المعالجة والتجميع
    let finalData = [];
    let tableHeaders = [];
    let grandTotalTime = 0;
    let grandTotalPrice = 0;

    if (filterScenario === 'AccountOnly' || (filterScenario === 'None' && processedRecords.length > 0)) {
        finalData = aggregateRecords(processedRecords, 'date');
        tableHeaders = ["اليوم", "إجمالي الوقت", "إجمالي التكلفة"];
    } else if (filterScenario === 'UserOnly') {
        finalData = aggregateRecords(processedRecords, 'accountName');
        tableHeaders = ["الحساب", "إجمالي الوقت", "إجمالي التكلفة"];
    } else if (filterScenario === 'AccountAndUser') {
        const totalTime = processedRecords.reduce((sum, rec) => sum + rec.totalTime, 0);
        const totalPrice = processedRecords.reduce((sum, rec) => sum + parseFloat(rec.totalPrice), 0);
        
        finalData = [{ 
            keyName: `${accountsData[selectedAccount]?.name} / ${selectedUser}`,
            formattedTime: formatTime(totalTime),
            totalPrice: totalPrice.toFixed(2)
        }];
        
        tableHeaders = ["ملخص الحساب والمستخدم", "إجمالي الوقت", "إجمالي التكلفة"];
    } else {
         tableHeaders = ["اليوم", "إجمالي الوقت", "إجمالي التكلفة"];
    }
    
    if (finalData.length > 0) {
        grandTotalTime = finalData.reduce((sum, item) => sum + (item.totalTime || 0), 0);
        grandTotalPrice = finalData.reduce((sum, item) => sum + parseFloat(item.totalPrice || 0), 0);
    }

    // 6. عرض النتائج بانيميشن
    displayAggregatedResultsWithAnimation(finalData, tableHeaders, grandTotalTime, grandTotalPrice, filterScenario);
});


// =======================================================
// وظيفة 4: عرض النتائج بـ GSAP (تبقى كما هي)
// =======================================================
function displayAggregatedResultsWithAnimation(data, headers, grandTotalTime, grandTotalPrice, scenario) {
    if (data.length === 0) {
        resultsSection.classList.remove('hidden');
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #ef4444; font-weight: bold;">لا توجد سجلات مطابقة لمعايير التصفية.</td></tr>';
        return;
    }
    
    gsap.fromTo(resultsSection, 
        { opacity: 0, y: 30, display: 'none' }, 
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", display: 'block' }
    );
    
    const tableHeaderRow = document.getElementById('data-table').querySelector('thead tr');
    tableHeaderRow.innerHTML = ''; 
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        tableHeaderRow.appendChild(th);
    });

    tableBody.innerHTML = ''; 

    data.forEach(item => {
        const row = tableBody.insertRow();
        
        row.insertCell().textContent = item.keyName || item.accountName; 
        row.insertCell().textContent = item.formattedTime;
        row.insertCell().textContent = `${item.totalPrice} ج.م`;

        gsap.set(row, { opacity: 0, y: 20 });
    });
    
    if (grandTotalTime > 0) {
        const totalRow = tableBody.insertRow();
        totalRow.classList.add('grand-total-row');
        
        const colCount = headers.length; 
        
        const firstCell = totalRow.insertCell();
        firstCell.textContent = 'الإجمالي الكلي للفترة:';
        firstCell.colSpan = colCount - 2; 

        totalRow.insertCell().textContent = formatTime(grandTotalTime);
        totalRow.insertCell().textContent = `${grandTotalPrice.toFixed(2)} ج.م`;

        gsap.set(totalRow, { opacity: 0, scaleY: 0 });
    }
    
    gsap.to(tableBody.querySelectorAll('tr'), {
        opacity: 1,
        y: 0,
        scaleY: 1,
        duration: 0.4,
        stagger: 0.08,
        ease: "back.out(1.2)"
    });
}


// =======================================================
// البدء
// =======================================================
populateInitialFilters();
