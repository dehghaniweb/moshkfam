/* =========================================================
   CUSTOMER ORDER / NOTE
   Note UI removed: letters are now the only message system.
========================================================= */

async function loadAdminRequests() {
  const container = $("adminRequests");
  if (!container) return;
  container.innerHTML = `<div class="message">در حال دریافت سفارش‌ها و یادداشت‌ها...</div>`;

  try {
    const result = await postJson("/api/admin/customer-requests", {});
    const requests = Array.isArray(result) ? result : (result?.requests || []);
    if (!requests.length) {
      container.innerHTML = `<div class="message">هنوز سفارش یا یادداشتی ثبت نشده است.</div>`;
      return;
    }

    const statusLabels = {new:"جدید",seen:"دیده شد",in_progress:"در حال بررسی",done:"انجام شد",cancelled:"لغو شد"};
    container.innerHTML = requests.map(r => {
      const c = r.customers || {};
      const name = [c.first_name,c.last_name].filter(Boolean).join(" ") || c.username || "مشتری";
      const username = c.username ? `@${escapeHtml(c.username)}` : "";
      const typeLabel = r.request_type === "note" ? "📝 یادداشت" : "🛒 سفارش";
      const date = r.created_at ? new Date(r.created_at).toLocaleString("fa-IR") : "";
      return `<div class="admin-request-card">
        <div class="admin-request-head"><strong>${typeLabel}</strong><span>${escapeHtml(date)}</span></div>
        <div class="admin-request-customer">👤 ${escapeHtml(name)} ${username ? `(${username})` : ""} <small>ID: ${escapeHtml(c.telegram_user_id || r.telegram_user_id || "-")}</small></div>
        <div class="admin-request-text">${escapeHtml(r.text || "")}</div>
        <div class="admin-request-actions">
          <select onchange="updateCustomerRequestStatus(${Number(r.id)}, this.value)">
            ${Object.entries(statusLabels).map(([key,label]) => `<option value="${key}" ${r.status===key?"selected":""}>${label}</option>`).join("")}
          </select>
          <button type="button" class="admin-danger" onclick="deleteCustomerRequest(${Number(r.id)})">🗑️ حذف</button>
        </div>
      </div>`;
    }).join("");
    await markAdminRequestsRead();
    await loadAdminInboxCount();
  } catch (error) {
    container.innerHTML = `<div class="message error">خطا در دریافت سفارش‌ها و یادداشت‌ها.<br>${escapeHtml(error.message || "")}</div>`;
  }
}

async function loadAdminInboxCount(){
  if(!isAdmin) return;
  try{
    const r=await postJson("/api/admin/unread-count",{});
    const n=Number(r?.count||0);
    setAdminCount("adminInboxCount",n);
    const badge=$("adminInboxCount");
    if(badge) badge.classList.toggle("has-unread",n>0);
  }catch{}
}
async function markAdminRequestsRead(){
  try{await postJson("/api/admin/mark-requests-read",{});}catch{}
}
let adminInboxTimer=null;
function startAdminInboxPolling(){
  if(adminInboxTimer) clearInterval(adminInboxTimer);
  if(!isAdmin) return;
  loadAdminInboxCount();
  adminInboxTimer=setInterval(()=>{ if(!document.hidden) loadAdminInboxCount(); },BADGE_POLL_MS);
  if(!window.__moshkfamAdminInboxVisibilityBound){
    window.__moshkfamAdminInboxVisibilityBound=true;
    document.addEventListener("visibilitychange",()=>{ if(!document.hidden && isAdmin) loadAdminInboxCount(); });
  }
}
async function loadOrderHistoryCount(){
  const badge=$("ordersCount");
  if(!badge) return;
  if(!currentUser){badge.textContent="۰";badge.classList.add("empty");return;}
  try{
    const r=await postJson("/api/customer/orders",{});
    const orders=Array.isArray(r?.orders)?r.orders:[];
    badge.textContent=formatNumber(orders.length);
    badge.classList.toggle("empty",orders.length===0);
  }catch{badge.textContent="۰";badge.classList.add("empty");}
}
async function openOrderHistory(){
  if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری خود شوید.");return;}
  const modal=$("orderHistoryModal"),box=$("orderHistoryItems");
  if(!modal||!box)return;
  modal.classList.remove("hidden");
  box.innerHTML='<div class="message">در حال دریافت سفارش‌های قبلی...</div>';
  try{
    const r=await postJson("/api/customer/orders",{});
    const orders=Array.isArray(r?.orders)?r.orders:[];
    if(!orders.length){box.innerHTML='<div class="message">هنوز سفارشی ثبت نشده است.</div>';return;}
    box.innerHTML=orders.map(o=>{
      const date=o.created_at?new Date(o.created_at).toLocaleString("fa-IR"):"";
      return `<div class="order-history-card"><div class="order-history-head"><strong>🛒 سفارش #${escapeHtml(o.id)}</strong><span>${escapeHtml(date)}</span></div><div class="order-history-text">${escapeHtml(o.text||"")}</div></div>`;
    }).join("");
  }catch(e){box.innerHTML=`<div class="message error">دریافت سفارش‌ها انجام نشد.<br>${escapeHtml(e.message||"")}</div>`;}
}
function closeOrderHistory(){$("orderHistoryModal")?.classList.add("hidden");}

async function deleteCustomerRequest(id){
  if(!(await appConfirm("آیا این سفارش/یادداشت حذف شود؟"))) return;
  try{ const r=await postJson("/api/admin/delete-request",{id:Number(id)}); if(!r?.ok)throw new Error(r?.error||"سرور تأیید نکرد."); await loadAdminRequests(); appAlert("✅ مورد با موفقیت حذف شد."); }
  catch(e){ appAlert("❌ حذف انجام نشد:\n"+(e.message||"خطای نامشخص")); }
}

async function updateCustomerRequestStatus(id, status) {
  try {
    await postJson("/api/admin/update-request-status", {id:Number(id), status});
    await loadAdminRequests();
    await loadSiteSettings();
  } catch (error) {
    alert("❌ تغییر وضعیت انجام نشد:\n" + error.message);
  }
}

/* =========================================================
   EVENTS
========================================================= */

document.addEventListener("click", function(event){
  const link = event.target.closest(".catalog-open");
  if (!link) return;
  event.preventDefault();
  openCatalog(link.getAttribute("data-catalog-url") || "", link.getAttribute("data-catalog-name") || "محصول");
});

function setupEvents() {
    const loginButton=$("loginButton"); if(loginButton)loginButton.addEventListener("click",loginWithUsernamePassword);
    [$("loginUsername"),$("loginPassword")].forEach(el=>{if(el)el.addEventListener("keydown",e=>{if(e.key==="Enter")loginWithUsernamePassword();});});
    const logoutButton=$("logoutButton"); if(logoutButton)logoutButton.addEventListener("click",logoutUser);

    const search =
      $("searchInput");

    if (search) {
      search.addEventListener(
        "input",
        () => {
          renderProducts();
        }
      );
    }

    const adminButton =
      $("adminButton");

    if (adminButton) {
      adminButton.addEventListener(
        "click",
        openAdmin
      );
    }

    const customerSelect =
      $("customerSelect");

    if (customerSelect) {
      customerSelect.addEventListener(
        "change",
        () => {

          selectedCustomer =
            customerSelect.value || null;

          if (selectedCustomer) {
            loadCustomerPrices(
              selectedCustomer
            );
          } else {

            const info =
              $("customerInfo");

            const prices =
              $("customerPrices");

            if (info) {
              info.classList.add("hidden");
            }

            if (prices) {
              prices.innerHTML = "";
            }
          }
        }
      );
    }

    /* Telegram Back Button */
    if (tg && tg.BackButton) {
      try {
        tg.BackButton.onClick(() => {
          const appDialog = $("appDialog");
          const catalogModal = $("catalogModal");

          if (appDialog && !appDialog.classList.contains("hidden")) {
            appDialogCancel();
            return;
          }

          if (catalogModal && !catalogModal.classList.contains("hidden")) {
            closeCatalog();
            return;
          }

          const modal = $("modal");
          const adminModal = $("adminModal");

          if (modal && !modal.classList.contains("hidden")) {
            closeModal();
            return;
          }

          if (adminModal && !adminModal.classList.contains("hidden")) {
            closeAdmin();
            try {
              tg.BackButton.hide();
            } catch (e) {}
          }
        });
      } catch (e) {
        console.warn("Telegram BackButton is not supported:", e);
      }
    }

}

setupEvents();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(e => console.warn("PWA:", e));
  });
}

function finishBootLoader() {
  const app = document.querySelector(".app");
  const loader = document.getElementById("bootLoader");

  // Keep the page locked while the startup overlay is being removed.
  // This prevents the brief scrollbar/reflow jump seen on some screens.
  if (app) app.style.visibility = "visible";

  if (loader) {
    loader.classList.add("hide");
    setTimeout(() => {
      loader.remove();
      document.body.classList.remove("booting");
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
    }, 300);
  } else {
    document.body.classList.remove("booting");
    document.documentElement.style.overflow = "";
    document.documentElement.style.height = "";
  }
}

/* =========================================================
   INITIAL LOAD
========================================================= */

// سقف انتظار صفحهٔ «لطفاً منتظر بمانید». اگر پل Google یا Worker کند بود، صفحه بعد از این مدت
// نمایش داده می‌شود و محصولات در پس‌زمینه بارگذاری می‌شوند (به‌جای ماندن بی‌پایان روی لودر).
const BOOT_LOADER_MAX_WAIT_MS = 8000;

(async function init() {
  bootDiag("INIT", "START");
  const bootLoaderCap = setTimeout(() => {
    bootDiag("BOOT LOADER", "TIMEOUT", "loader hidden after " + BOOT_LOADER_MAX_WAIT_MS + "ms; data keeps loading in background");
    finishBootLoader();
  }, BOOT_LOADER_MAX_WAIT_MS);

  try {
    bootDiag("AUTHENTICATE", "START");
    await authenticate();
    bootDiag("AUTHENTICATE", "OK");
  } catch (error) {
    bootDiagError("AUTHENTICATE", error);
    console.error("Authentication init:", error);
  }

  try {
    bootDiag("USER INIT", "START");
    await loadCurrentUser();
    bootDiag("CURRENT USER", "OK");
    await loadWebSession();
    bootDiag("WEB SESSION", "OK");
    loadCart();
    startAdminInboxPolling();
    bootDiag("USER INIT", "OK");
  } catch (error) {
    bootDiagError("USER INIT", error);
    console.error("User init:", error);
  }

  try {
    // تنظیمات سایت و محصولات هم‌زمان بارگذاری می‌شوند (قبلاً پشت‌سرهم بودند و هر کدام تا ۳۵ ثانیه معطل می‌شد).
    await Promise.all([
      loadSiteSettings().then(() => bootDiag("SITE SETTINGS", "DONE")),
      loadProducts().then(() => bootDiag("PRODUCTS", "DONE"))
    ]);
  } catch (error) {
    bootDiagError("DATA INIT", error);
    console.error("Data init:", error);
  } finally {
    clearTimeout(bootLoaderCap);
    bootDiag("BOOT FINALIZE", "START");
    finishBootLoader();
    bootDiag("BOOT FINALIZE", "OK");
  }
})();


/* =========================================================
   GLOBAL FUNCTIONS
   برای onclick های داخل HTML
========================================================= */

window.openProduct =
  openProduct;
window.openSalesReports=openSalesReports;
window.openCart=openCart;
window.closeCart=closeCart;
window.openOrderHistory=openOrderHistory;
window.closeOrderHistory=closeOrderHistory;
window.openLetterInbox=openLetterInbox;window.closeLetterInbox=closeLetterInbox;window.openLetterCompose=openLetterCompose;window.closeLetterCompose=closeLetterCompose;window.loadLetterInbox=loadLetterInbox;window.openLetterThread=openLetterThread;window.showLetterList=showLetterList;window.sendLetterReply=sendLetterReply;window.sendNewLetter=sendNewLetter;window.resetLetterFilters=resetLetterFilters;window.showAllLetters=showAllLetters;window.toggleLetterRecipientPicker=toggleLetterRecipientPicker;window.selectLetterRecipient=selectLetterRecipient;window.filterLetterRecipients=filterLetterRecipients;
window.toggleCustomerPicker=toggleCustomerPicker;
window.selectCustomerPicker=selectCustomerPicker;
window.searchCustomerPriceCustomer=searchCustomerPriceCustomer;
window.addToCart=addToCart;
window.changeCartQty=changeCartQty;
window.removeFromCart=removeFromCart;
window.submitCartOrder=submitCartOrder;
window.setCustomerPrice=setCustomerPrice;
window.resetCustomerPrices=resetCustomerPrices;
window.formatCustomerPriceInput=formatCustomerPriceInput;
window.deleteCustomerRequest=deleteCustomerRequest;

window.closeModal =
  closeModal;
window.openCatalog = openCatalog;
window.closeCatalog = closeCatalog;
window.appDialogOk = appDialogOk;
window.appDialogCancel = appDialogCancel;


/* =========================================================
   ADMIN SECTION NAVIGATION
   فقط برای هماهنگی با منوی بخش‌بندی‌شده پنل مدیریت
========================================================= */

async function loadServiceLimits(){
  const panel=$("serviceLimitsPanel"); if(!panel)return;
  panel.innerHTML='<div class="limits-loading">⏳ در حال دریافت گزارش واقعی سامانه...</div>';
  try{
    const r=await postJson('/api/admin/service-limits',{});
    const services=Array.isArray(r?.services)?r.services:[];
    const routes=Array.isArray(r?.routes)?r.routes:[];
    const cards=services.map(x=>{
      const pct=Number.isFinite(Number(x.percentage))?Math.max(0,Math.min(100,Number(x.percentage))):0;
      const recorded=x.recorded===true;
      return `<div class="limit-service-card"><h4>${escapeHtml(x.icon||'◉')} ${escapeHtml(x.name||'سرویس')}</h4><div class="limit-metric"><span>وضعیت</span><b>${escapeHtml(x.today_display||'—')}</b></div><div class="limit-metric"><span>اطلاعات ثبت‌شده</span><b>${escapeHtml(x.cap_display||'—')}</b></div>${recorded?`<div class="limit-progress"><span style="width:${pct}%"></span></div><div class="limit-metric"><span>درصد</span><b>${escapeHtml(String(pct))}%</b></div>`:''}<span class="limit-status ${recorded?'recorded':''}">${recorded?'✓ داده واقعی':'ℹ️ وضعیت سرویس'}</span>${x.note?`<p>${escapeHtml(x.note)}</p>`:''}</div>`;
    }).join('');
    const routeHtml=routes.length?`<div class="limit-service-card limit-routes"><h4>🔝 مسیرهای ثبت‌شده</h4>${routes.slice(0,10).map((x,i)=>`<div class="limit-route-row"><span>${escapeHtml(faDigits(i+1))}. ${escapeHtml(x.route||'—')}</span><b>${escapeHtml(x.count_display||'—')}</b></div>`).join('')}</div>`:'';
    panel.innerHTML=(cards+routeHtml)||'<div class="limits-loading">گزارش واقعی در دسترس نیست.</div>';
  }catch(e){panel.innerHTML=`<div class="message error">دریافت گزارش محدودیت‌ها انجام نشد.<br>${escapeHtml(e.message||'خطای نامشخص')}</div>`;}
}

function showAdminHome() {
  const home = $("adminHome");
  const sections = document.querySelectorAll("[id^='adminSection-']");

  sections.forEach(section => section.classList.add("hidden"));
  if (home) home.classList.remove("hidden");
}

async function showAdminSection(sectionName) {
  const permissionMap={products:"products","edit-products":"products",customers:"customers","edit-customers":"customers",prices:"prices",requests:"requests",footer:"footer",admins:"admins",limits:"limits",archives:"products"};
  const needed=permissionMap[sectionName];
  const roleNow=String(currentUser?.role||"").toLowerCase();
  const isSoftwareAdmin=roleNow==="super_admin" || isAdmin && roleNow==="admin";
  const salesCanViewReports = false;
  const primaryNow = !!isAdmin || roleNow === "super_admin";
  if(sectionName==="cleanup" && !primaryNow){
    appAlert("❌ این بخش فقط برای مدیر نرم‌افزار است.");
    return;
  }
  if(needed && !(salesCanViewReports || adminPermissions.includes(needed) || adminPermissions.includes("admins") && needed==="admins" || isAdmin)){
    appAlert("❌ سطح دسترسی این بخش برای شما فعال نیست.");
    return;
  }
  const home = $("adminHome");
  const sections = document.querySelectorAll("[id^='adminSection-']");

  if (home) home.classList.add("hidden");
  sections.forEach(section => section.classList.add("hidden"));

  const section = $("adminSection-" + sectionName);
  if (!section) return;
  section.classList.remove("hidden");

  try {
    if (sectionName === "products" || sectionName === "edit-products") {
      await loadAdminProducts();
    }

    if (sectionName === "customers" || sectionName === "edit-customers" || sectionName === "prices") {
      await loadCustomers();
    }

    if (sectionName === "requests") {
      await loadAdminRequests();
      await loadAdminInboxCount();
    }

    if (sectionName === "admins") {
      await loadAdminUsers();
    }

    if (sectionName === "footer") {
      await loadSiteSettings();
    }
    if (sectionName === "archives") {
      await loadImageArchives();
    }
    if (sectionName === "limits") {
      await loadServiceLimits();
    }
    if (sectionName === "cleanup") {
      await loadCleanupCustomers();
      await refreshAdminTestDataStats();
    }
  } catch (error) {
    console.error("Admin section:", error);
  }
}

function searchAdminItems(inputId, containerId) {
  const input = $(inputId);
  const container = $(containerId);
  if (!input || !container) return;

  const query = input.value.trim().toLocaleLowerCase("fa-IR");
  container.querySelectorAll(":scope > div").forEach(item => {
    const text = (item.textContent || "").toLocaleLowerCase("fa-IR");
    item.style.display = !query || text.includes(query) ? "" : "none";
  });
}

async function refreshAdminTestDataStats(){
  const box=$("adminTestDataStats"); if(!box)return;
  box.innerHTML='<div class="limits-loading">⏳ در حال دریافت آمار داده‌های تست...</div>';
  try{
    const r=await postJson('/api/admin/cleanup-stats',{});
    if(!r?.ok)throw new Error(r?.error||'دریافت آمار انجام نشد.');
    box.innerHTML=`<div class="cleanup-stat-line"><span>✉️ نامه‌ها و پیام‌ها</span><b>${formatNumber(r.messages||0)}</b></div><div class="cleanup-stat-line"><span>🛒 سفارش‌های خرید</span><b>${formatNumber(r.orders||0)}</b></div><div class="cleanup-stat-line total"><span>📊 مجموع داده‌های قابل پاک‌سازی</span><b>${formatNumber((r.messages||0)+(r.orders||0))}</b></div>`;
    const messagesCount=$("cleanupMessagesCount"); if(messagesCount) messagesCount.textContent=formatNumber(r.messages||0);
    const ordersCount=$("cleanupOrdersCount"); if(ordersCount) ordersCount.textContent=formatNumber(r.orders||0);
  }catch(e){box.innerHTML=`<div class="message error">دریافت آمار انجام نشد.<br>${escapeHtml(e.message||'')}</div>`;}
}
async function cleanupAllTestData(){
  const s=await postJson('/api/admin/cleanup-stats',{}).catch(()=>null);
  const messages=Number(s?.messages||0);
  const orders=Number(s?.orders||0);
  const total=messages+orders;
  if(!total){appAlert('ℹ️ در حال حاضر نامه یا سفارش ثبت‌شده‌ای برای پاک‌سازی وجود ندارد.');return;}

  // Two separate confirmations are intentional to prevent an accidental destructive action.
  const first=await appConfirm(`⚠️ مرحله اول تأیید\n\nنامه‌ها و سفارش‌های خرید حذف شوند؟\n✉️ نامه‌ها: ${formatNumber(messages)}\n🛒 سفارش‌ها: ${formatNumber(orders)}\n\nاین عملیات قابل بازگشت نیست.`);
  if(!first)return;

  const second=await appConfirm(`🚨 مرحله دوم تأیید\n\nآخرین هشدار: واقعاً می‌خواهید داده‌های تست را حذف کنید؟\n\nمحصولات، نمایندگان و حساب‌های کاربری حذف نخواهند شد.`);
  if(!second)return;

  try{
    const r=await postJson('/api/admin/cleanup-test-data',{confirm:true});
    if(!r?.ok)throw new Error(r?.error||'سرور تأیید نکرد.');
    appAlert(`✅ پاک‌سازی انجام شد.\n✉️ نامه‌ها: ${formatNumber(r.messages||0)}\n🛒 سفارش‌ها: ${formatNumber(r.orders||0)}`);
    await refreshAdminTestDataStats();
    loadLetterUnreadCount();
  }catch(e){appAlert('❌ پاک‌سازی انجام نشد:\n'+(e.message||'خطای نامشخص'));}
}

async function loadCleanupCustomers(){
  const select=$("cleanupCustomerSelect");
  if(!select)return;
  select.innerHTML='<option value="">در حال دریافت نماینده‌ها...</option>';
  try{
    const r=await postJson("/api/admin/customers",{});
    const customers=Array.isArray(r?.customers)?r.customers:[];
    const reps=customers.filter(c=>["customer","representative","rep"].includes(String(c?.role||"customer").toLowerCase()));
    select.innerHTML='<option value="">انتخاب نماینده</option>'+reps.map(c=>{
      const name=[c.first_name,c.last_name].filter(Boolean).join(" ")||c.username||"نماینده";
      return `<option value="${escapeHtml(c.id)}">${escapeHtml(name)}${c.username?` (@${escapeHtml(c.username)})`:""}</option>`;
    }).join("");
    select.onchange=()=>{
      const c=reps.find(x=>String(x.id)===String(select.value));
      const info=$("cleanupCustomerInfo");
      if(!info)return;
      if(!c){info.classList.add("hidden");info.innerHTML="";return;}
      info.classList.remove("hidden");
      info.innerHTML=`<strong>نماینده:</strong> ${escapeHtml([c.first_name,c.last_name].filter(Boolean).join(" ")||c.username||"-")} ${c.username?` · @${escapeHtml(c.username)}`:""}`;
    };
  }catch(e){select.innerHTML='<option value="">خطا در دریافت نماینده‌ها</option>';appAlert("❌ دریافت نماینده‌ها انجام نشد:\n"+(e.message||""));}
}
function getCleanupCustomerId(){const id=$("cleanupCustomerSelect")?.value||"";if(!id)appAlert("⚠️ ابتدا یک نماینده را انتخاب کنید.");return id;}
async function deleteSelectedCustomerOrders(){
  const id=getCleanupCustomerId(); if(!id)return;
  if(!(await appConfirm("آیا همه سفارش‌های ثبت‌شده این نماینده حذف شود؟")))return;
  try{const r=await postJson("/api/admin/delete-customer-orders",{customer_id:id});if(!r?.ok)throw new Error(r?.error||"سرور تأیید نکرد.");appAlert(`✅ ${formatNumber(r.deleted||0)} سفارش ثبت‌شده حذف شد.`);}catch(e){appAlert("❌ حذف سفارش‌ها انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}
async function deleteSelectedCustomerLetters(){
  const id=getCleanupCustomerId(); if(!id)return;
  if(!(await appConfirm("آیا همه نامه‌ها و مکاتبات این نماینده حذف شود؟")))return;
  try{const r=await postJson("/api/admin/delete-customer-letters",{customer_id:id});if(!r?.ok)throw new Error(r?.error||"سرور تأیید نکرد.");appAlert(`✅ ${formatNumber(r.deleted||0)} پیام و مکاتبه حذف شد.`);}catch(e){appAlert("❌ حذف نامه‌ها انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}

// حذف نماینده با event delegation؛ مستقل از onclick های HTML و مقاوم در برابر رندر مجدد
document.addEventListener("click", function(event){
  const updateAdminButton = event.target.closest("[data-update-admin]");
  if (updateAdminButton) {
    event.preventDefault(); event.stopPropagation();
    const id=updateAdminButton.getAttribute("data-update-admin") || "";
    updateAdminButton.disabled=true;
    updateAdminButton.textContent="⏳ در حال ذخیره...";
    updateAdminUser(id).finally(()=>{if(updateAdminButton.isConnected){updateAdminButton.disabled=false;updateAdminButton.textContent="💾 ذخیره مدیر";}});
    return;
  }
  const deleteAdminButton = event.target.closest("[data-delete-admin]");
  if (deleteAdminButton) {
    event.preventDefault(); event.stopPropagation();
    deleteAdminUser(deleteAdminButton.getAttribute("data-delete-admin") || "");
    return;
  }
  const deleteButton = event.target.closest("[data-delete-customer]");
  if (deleteButton) {
    event.preventDefault(); event.stopPropagation();
    deleteCustomerUser(deleteButton.getAttribute("data-delete-customer") || "");
    return;
  }
  const saveButton = event.target.closest("[data-update-customer]");
  if (saveButton) {
    event.preventDefault(); event.stopPropagation();
    const id = saveButton.getAttribute("data-update-customer") || "";
    saveButton.disabled = true;
    saveButton.textContent = "⏳ در حال ذخیره...";
    updateCustomerUser(id).finally(() => {
      if (saveButton.isConnected) { saveButton.disabled=false; saveButton.textContent="💾 ذخیره"; }
    });
  }
}, true);

window.toggleAdminAccordion = toggleAdminAccordion;
window.showAdminSection = showAdminSection;
window.showAdminHome = showAdminHome;
window.searchAdminItems = searchAdminItems;
window.createAdminUser = createAdminUser;
window.deleteAdminUser = deleteAdminUser;
window.updateAdminUser = updateAdminUser;
window.loadAdminUsers = loadAdminUsers;
window.loadCleanupCustomers = loadCleanupCustomers;
window.deleteSelectedCustomerOrders = deleteSelectedCustomerOrders;
window.deleteSelectedCustomerLetters = deleteSelectedCustomerLetters;

window.openAdmin =
  openAdmin;

window.closeAdmin =
  closeAdmin;

window.updateProductPrice = updateProductPrice;
window.uploadProductImage = uploadProductImage;
window.loadAdminProductGallery = loadAdminProductGallery;
window.uploadAdminProductGalleryImage = uploadAdminProductGalleryImage;
window.saveAdminProductGalleryCaption = saveAdminProductGalleryCaption;
window.replaceAdminProductGalleryImage = replaceAdminProductGalleryImage;
window.deleteAdminProductGalleryImage = deleteAdminProductGalleryImage;
window.loadImageArchives = loadImageArchives;
window.restoreArchivedImage = restoreArchivedImage;
window.removeProductImage = removeProductImage;
window.uploadProductCatalog = uploadProductCatalog;
window.removeProductCatalog = removeProductCatalog;

window.uploadProductVideo =
  uploadProductVideo;

window.removeProductVideo =
  removeProductVideo;

window.loadCustomerPrices =
  loadCustomerPrices;

window.setCustomerPrice =
  setCustomerPrice;
window.updateCustomerRequestStatus = updateCustomerRequestStatus;
window.createProduct=createProduct;window.deleteProduct=deleteProduct;window.createCustomerUser=createCustomerUser;window.deleteCustomerUser=deleteCustomerUser;window.updateCustomerUser=updateCustomerUser;window.saveSiteSettings=saveSiteSettings;window.saveSalesSettings=saveSalesSettings;
