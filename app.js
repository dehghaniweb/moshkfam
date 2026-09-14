"use strict";

/* =========================================================
   MOSHKFAM FARs - app.js
   نسخه نهایی
   - ضد کش خودکار
   - سازگار با Web و Telegram WebApp
   - محصولات
   - جستجو و دسته‌بندی
   - احراز هویت تلگرام
   - پنل مدیریت
   - قیمت اختصاصی مشتری
   - ویدئو و فایل‌ها
========================================================= */

const WORKER_URL =
  "https://moshkfam-telegram-bot.dehghaniweb.workers.dev";

const tg =
  window.Telegram && window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;


/* =========================================================
   STATE
========================================================= */

let products = [];
let categories = [];
let activeCategory = "";
let currentUser = null;
let isAdmin = false;
let selectedCustomer = null;


/* =========================================================
   TELEGRAM INIT
========================================================= */

if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch (e) {
    console.warn("Telegram init:", e);
  }
}


/* =========================================================
   HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return "";
  }

  return new Intl.NumberFormat("fa-IR").format(n);
}

function formatDate(value) {
  if (!value) return "";

  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function getPriceText(product) {
  if (
    product &&
    product.base_price !== null &&
    product.base_price !== undefined &&
    product.base_price !== ""
  ) {
    return `
      <div class="price">
        ${formatNumber(product.base_price)}
        ${escapeHtml(product.base_currency || "تومان")}
      </div>
    `;
  }

  return `
    <div class="price private-price">
      برای اطلاع از قیمت تماس بگیرید.
    </div>
  `;
}


/* =========================================================
   API - AUTOMATIC NO CACHE
========================================================= */

function buildApiUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return (
    WORKER_URL +
    path +
    separator +
    "_nocache=" +
    Date.now()
  );
}

async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  // Telegram WebApp authentication header
  // Worker validates this signed initData before allowing admin/customer actions.
  if (tg && tg.initData) {
    headers["X-Telegram-Init-Data"] = tg.initData;
  }
  const sessionToken = getStoredToken();
  if (sessionToken) headers["Authorization"] = "Bearer " + sessionToken;

  const response = await fetch(buildApiUrl(path), {
    ...options,
    cache: "no-store",
    headers
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === "object" &&
      data.error
        ? data.error
        : `HTTP ${response.status}`;

    throw new Error(message);
  }

  return data;
}

async function get(path) {
  return apiRequest(path, {
    method: "GET"
  });
}

async function postJson(path, body) {
  return apiRequest(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body || {})
  });
}


/* =========================================================
   UI MESSAGE
========================================================= */

function showError(message) {
  const el = $("error");

  if (!el) return;

  el.textContent = message || "خطایی رخ داد.";
  el.classList.remove("hidden");
}

function hideError() {
  const el = $("error");

  if (el) {
    el.classList.add("hidden");
  }
}


/* =========================================================
   WEB / ANDROID LOGIN SESSION
========================================================= */
function getStoredToken(){try{return localStorage.getItem("moshkfam_session")||"";}catch{return "";}}
function setStoredToken(t){try{if(t)localStorage.setItem("moshkfam_session",t);else localStorage.removeItem("moshkfam_session");}catch{}}
async function loginWithUsernamePassword(){
  const username=$("loginUsername")?.value.trim()||"", password=$("loginPassword")?.value||"", msg=$("loginMessage");
  if(!username||!password){if(msg)msg.textContent="نام کاربری و رمز عبور را وارد کنید.";return;}
  if(msg)msg.textContent="در حال ورود...";
  try{const r=await postJson("/api/login",{username,password});setStoredToken(r.token);currentUser=r.user||null;isAdmin=false;if($("loginPassword"))$("loginPassword").value="";if(msg)msg.textContent="✅ ورود با موفقیت انجام شد.";updateAccountUI();await loadProducts();}catch(e){if(msg)msg.textContent=e.message||"ورود انجام نشد.";}
}
async function loadWebSession(){const t=getStoredToken();if(!t)return;try{const r=await apiRequest("/api/session",{method:"GET"});if(r?.authenticated&&r.user){currentUser=r.user;isAdmin=false;updateAccountUI();}else setStoredToken("");}catch{setStoredToken("");}}
async function logoutUser(){try{await apiRequest("/api/logout",{method:"POST"});}catch{}setStoredToken("");currentUser=null;isAdmin=false;updateAccountUI();await loadProducts();}
async function loadSiteSettings(){try{const r=await get("/api/site-settings"),st=r?.settings||{};if($("footerCompanyName"))$("footerCompanyName").textContent="🌱 "+(st.company_name||"مشکفام فارس");if($("footerText"))$("footerText").textContent=st.footer_text||"";if($("footerPhone"))$("footerPhone").textContent=st.phone?"☎️ "+st.phone:"";if($("footerAddress"))$("footerAddress").textContent=st.address?"📍 "+st.address:"";if($("settingCompanyName"))$("settingCompanyName").value=st.company_name||"مشکفام فارس";if($("settingFooterText"))$("settingFooterText").value=st.footer_text||"";if($("settingPhone"))$("settingPhone").value=st.phone||"";if($("settingAddress"))$("settingAddress").value=st.address||"";}catch(e){console.warn("Settings:",e);}}
async function saveSiteSettings(){try{await postJson("/api/admin/site-settings",{company_name:$("settingCompanyName")?.value.trim()||"مشکفام فارس",footer_text:$("settingFooterText")?.value||"",phone:$("settingPhone")?.value.trim()||"",address:$("settingAddress")?.value||""});await loadSiteSettings();alert("✅ اطلاعات پایین صفحه ذخیره شد.");}catch(e){alert("❌ ذخیره تنظیمات انجام نشد:\n"+e.message);}}
async function createProduct(){
  const p={
    name_fa:$("newProductNameFa")?.value.trim(),
    name_en:$("newProductNameEn")?.value.trim(),
    category:$("newProductCategory")?.value.trim(),
    package:$("newProductPackage")?.value.trim(),
    maker:$("newProductMaker")?.value.trim(),
    base_price:$("newProductPrice")?.value.trim() || null
  };
  if(!p.name_fa){alert("نام فارسی محصول را وارد کنید.");return;}
  try{
    const result = await postJson("/api/admin/create-product",p);
    if (!result?.ok) throw new Error(result?.error || "پاسخ نامعتبر از سرور");
    alert("✅ محصول جدید ایجاد شد.");
    ["newProductNameFa","newProductNameEn","newProductCategory","newProductPackage","newProductMaker","newProductPrice"].forEach(id=>{if($(id))$(id).value=""});
    await loadProducts(); await loadAdminProducts();
  }catch(e){alert("❌ افزودن محصول انجام نشد:\n"+(e?.message || "خطای نامشخص"));}
}
async function deleteProduct(id){if(!confirm("آیا از حذف کامل این محصول مطمئن هستید؟"))return;try{const result = await postJson("/api/admin/delete-product",{product_id:Number(id)}); if (!result?.ok) throw new Error(result?.error || "حذف انجام نشد"); alert("✅ محصول حذف شد.");await loadProducts();await loadAdminProducts();}catch(e){alert("❌ حذف محصول انجام نشد:\n"+e.message);}}
async function createCustomerUser(){const p={first_name:$("newUserFirstName")?.value.trim(),last_name:$("newUserLastName")?.value.trim(),username:$("newUserUsername")?.value.trim(),password:$("newUserPassword")?.value||""};try{await postJson("/api/admin/create-customer",p);alert("✅ نماینده اضافه شد.");["newUserFirstName","newUserLastName","newUserUsername","newUserPassword"].forEach(id=>{if($(id))$(id).value=""});await loadCustomers();}catch(e){alert("❌ افزودن نماینده انجام نشد:\n"+e.message);}}
async function deleteCustomerUser(id){
  if(!id) return alert("شناسه نماینده مشخص نیست.");
  if(!confirm("آیا از حذف این نماینده مطمئن هستید؟")) return;
  try{
    const result = await postJson("/api/admin/delete-customer",{customer_id:String(id)});
    if (!result?.ok) throw new Error(result?.error || "حذف انجام نشد");
    alert("✅ نماینده حذف شد.");
    await loadCustomers();
    await loadAdminDeleteCustomers();
  }catch(e){alert("❌ حذف نماینده انجام نشد:\n"+(e?.message || "خطای نامشخص"));}
}

async function updateCustomerUser(id){
  const p={
    customer_id:String(id),
    first_name:$("ufirst-"+id)?.value.trim()||"",
    last_name:$("ulast-"+id)?.value.trim()||"",
    username:$("uuser-"+id)?.value.trim()||"",
    status:$("ustatus-"+id)?.value||"active"
  };
  const pass=$("upass-"+id)?.value||"";
  if(pass) p.password=pass;
  try{
    const result=await postJson("/api/admin/customer-profile",p);
    if (!result?.ok) throw new Error(result?.error || "ذخیره انجام نشد");
    alert(pass ? "✅ اطلاعات نماینده و رمز عبور با موفقیت ذخیره شد." : "✅ اطلاعات نماینده ذخیره شد.");
    if ($( "upass-"+id )) $( "upass-"+id ).value="";
    await loadCustomers();
    await loadAdminDeleteCustomers();
  }catch(e){alert("❌ ویرایش نماینده انجام نشد:\n"+(e?.message || "خطای نامشخص"));}
}

async function loadCustomers() {
  const select = $("customerSelect");

  if (!select) return;

  try {
    const result =
      await postJson(
        "/api/admin/customers",
        {}
      );

    const customers =
      Array.isArray(result)
        ? result
        : Array.isArray(result?.customers)
          ? result.customers
          : [];

    select.innerHTML =
      `<option value="">انتخاب مشتری</option>`;

    customers.forEach(customer => {

      const name =
        [
          customer.first_name,
          customer.last_name
        ]
          .filter(Boolean)
          .join(" ") ||
        customer.username ||
        `مشتری ${customer.id}`;

      const option =
        document.createElement("option");

      option.value = customer.id;

      option.textContent =
        customer.username
          ? `${name} (@${customer.username})`
          : name;

      option.dataset.customer =
        JSON.stringify(customer);

      select.appendChild(option);
    });

  } catch (error) {
    console.error("Customers:", error);
  }
  const usersBox=$("adminUsers");
  if(usersBox){
    try{const r=await postJson("/api/admin/customers",{});const cs=Array.isArray(r?.customers)?r.customers:(Array.isArray(r)?r:[]);usersBox.innerHTML=cs.length?cs.map(c=>{const id=String(c.id);return `<div class="admin-user-row"><div class="admin-edit-grid"><label>نام<input id="ufirst-${id}" value="${escapeHtml(c.first_name||"")}"></label><label>نام خانوادگی<input id="ulast-${id}" value="${escapeHtml(c.last_name||"")}"></label><label>یوزر<input id="uuser-${id}" value="${escapeHtml(c.username||"")}"></label><label>رمز جدید<input id="upass-${id}" type="password" placeholder="بدون تغییر"></label><label>وضعیت<select id="ustatus-${id}"><option value="active" ${c.status!=="disabled"?"selected":""}>فعال</option><option value="disabled" ${c.status==="disabled"?"selected":""}>غیرفعال</option></select></label></div><button onclick="updateCustomerUser(${JSON.stringify(id)})">💾 ذخیره</button><button class="admin-danger" onclick="deleteCustomerUser(${JSON.stringify(id)})">🗑️ حذف</button></div>`}).join(""): `<div class="message">هنوز نماینده‌ای تعریف نشده است.</div>`;}catch(e){usersBox.innerHTML=`<div class="message error">خطا در دریافت کاربران.</div>`;}}
}

async function loadAdminDeleteCustomers() {
  const box = $("adminUsersDelete"); if (!box) return;
  try {
    const r = await postJson("/api/admin/customers", {});
    const cs = Array.isArray(r?.customers) ? r.customers : (Array.isArray(r) ? r : []);
    box.innerHTML = cs.length ? cs.map(c => { const id=String(c.id); const name=[c.first_name,c.last_name].filter(Boolean).join(" ") || c.username || "نماینده"; return `<div class="admin-user-row admin-delete-row"><div><strong>${escapeHtml(name)}</strong><small>${c.username ? "@"+escapeHtml(c.username) : ""}</small></div><button class="admin-danger" onclick="deleteCustomerUser(${JSON.stringify(id)})">🗑️ حذف نماینده</button></div>`; }).join("") : `<div class="message">هنوز نماینده‌ای تعریف نشده است.</div>`;
  } catch(e) { box.innerHTML=`<div class="message error">خطا در دریافت نماینده‌ها.</div>`; }
}

async function loadCustomerPrices(customerId) {
  const container = $("customerPrices");
  const info = $("customerInfo");
  if (!container) return;

  container.innerHTML = `<div class="message">در حال دریافت قیمت‌ها...</div>`;

  try {
    const result = await postJson("/api/admin/customer-prices", { customer_id: customerId });
    const prices = Array.isArray(result) ? result : (Array.isArray(result?.prices) ? result.prices : []);
    const priceMap = new Map(prices.map(item => [Number(item.product_id), item]));

    if (info) {
      const opt = $("customerSelect")?.selectedOptions?.[0];
      const customer = opt?.dataset?.customer ? JSON.parse(opt.dataset.customer) : null;
      info.innerHTML = customer ? `
        <strong>مشتری:</strong> ${escapeHtml([customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.username || "مشتری")}
        ${customer.telegram_user_id ? `<span> | Telegram ID: ${escapeHtml(customer.telegram_user_id)}</span>` : ""}
      ` : "";
      info.classList.remove("hidden");
    }

    if (!products.length) {
      container.innerHTML = `<div class="message">محصولی برای قیمت‌گذاری وجود ندارد.</div>`;
      return;
    }

    container.innerHTML = products.map(product => {
      const pid = Number(product.id);
      const item = priceMap.get(pid);
      return `
        <div class="customer-price-row">
          <div>${escapeHtml(product.name_fa || product.name_en || `محصول ${pid}`)}</div>
          <input type="number" id="customer-price-${pid}" value="${item?.price ?? ""}" placeholder="قیمت اختصاصی (خالی = حذف)">
          <button onclick="setCustomerPrice('${escapeHtml(customerId)}', ${pid})">ذخیره</button>
        </div>`;
    }).join("");
  } catch (error) {
    container.innerHTML = `<div class="message error">خطا در دریافت قیمت مشتری.</div>`;
  }
}

async function setCustomerPrice(
  customerId,
  productId
) {
  const input =
    $(
      `customer-price-${Number(productId)}`
    );

  if (!input) return;

  const value = input.value.trim();

  try {
    await postJson(
      "/api/admin/set-customer-price",
      {
        customer_id: customerId,
        product_id: Number(productId),
        price:
          value === ""
            ? null
            : Number(value),
        currency: "تومان"
      }
    );

    alert("✅ قیمت اختصاصی ذخیره شد.");

    await loadCustomerPrices(customerId);

  } catch (error) {
    alert(
      "❌ خطا در ذخیره قیمت مشتری:\n" +
      error.message
    );
  }
}


/* =========================================================
   CUSTOMER ORDER / NOTE
========================================================= */

function openCustomerRequest() {
  const modal = $("customerRequestModal");
  if (!modal) return;
  modal.classList.remove("hidden");
}

function closeCustomerRequest() {
  const modal = $("customerRequestModal");
  if (modal) modal.classList.add("hidden");
}

async function submitCustomerRequest() {
  const input = $("customerRequestText");
  const typeInput = $("customerRequestType");

  const text = input ? input.value.trim() : "";
  const type = typeInput?.value === "note" ? "note" : "order";

  if (!text) {
    alert("لطفاً متن سفارش یا یادداشت را بنویسید.");
    return;
  }

  try {
    await postJson("/api/customer/request", {
      type,
      text
    });

    if (input) {
      input.value = "";
    }

    closeCustomerRequest();

    // از tg.showPopup استفاده نمی‌کنیم؛ این متد در بعضی WebViewها
    // باعث خطای WebAppMethod Unsupported می‌شود.
    alert(
      type === "note"
        ? "✅ یادداشت شما با موفقیت ثبت شد."
        : "✅ سفارش شما با موفقیت ثبت شد."
    );

  } catch (error) {
    console.error("Customer request error:", error);

    alert(
      "❌ ثبت درخواست انجام نشد:\n" +
      (error?.message || "خطای نامشخص")
    );
  }
}

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
        </div>
      </div>`;
    }).join("");
  } catch (error) {
    container.innerHTML = `<div class="message error">خطا در دریافت سفارش‌ها و یادداشت‌ها.<br>${escapeHtml(error.message || "")}</div>`;
  }
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

    const customerButton = $("customerButton");
    if (customerButton) {
      customerButton.addEventListener("click", openCustomerRequest);
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

  if (app) app.style.visibility = "visible";

  if (loader) {
    loader.classList.add("hide");
    setTimeout(() => loader.remove(), 300);
  }
}

/* =========================================================
   INITIAL LOAD
========================================================= */

(async function init() {

  try {
    await authenticate();
  } catch (error) {
    console.error(
      "Authentication init:",
      error
    );
  }

  try {
    await loadCurrentUser();
    await loadWebSession();
  } catch (error) {
    console.error(
      "User init:",
      error
    );
  }

  try {
    await loadSiteSettings();
    await loadProducts();
  } finally {
    finishBootLoader();
  }

})();


/* =========================================================
   GLOBAL FUNCTIONS
   برای onclick های داخل HTML
========================================================= */

window.openProduct =
  openProduct;

window.closeModal =
  closeModal;

window.openAdmin =
  openAdmin;

window.closeAdmin =
  closeAdmin;

window.updateProductPrice = updateProductPrice;
window.uploadProductImage = uploadProductImage;
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
window.openCustomerRequest = openCustomerRequest;
window.closeCustomerRequest = closeCustomerRequest;
window.submitCustomerRequest = submitCustomerRequest;
window.updateCustomerRequestStatus = updateCustomerRequestStatus;
window.createProduct=createProduct;window.deleteProduct=deleteProduct;window.createCustomerUser=createCustomerUser;window.deleteCustomerUser=deleteCustomerUser;window.updateCustomerUser=updateCustomerUser;window.saveSiteSettings=saveSiteSettings;
