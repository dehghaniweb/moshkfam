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

/* =========================================================
   MOSHKFAM - FORCE CACHE CLEAR (App.js only)
   ========================================================= */
(async function forceClearCacheFromApp() {
  try {
    const version = "moshkfam-app-20260916-01";
    const flag = "moshkfam_cache_cleared_" + version;

    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, "1");

    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }

    // اجرای دوباره App.js از نسخه تازه
    window.location.reload();
  } catch (e) {
    console.warn("Cache clear:", e);
  }
})();

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
let cartItems = {};


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

function getEffectivePrice(product) {
  if (product?.custom_price !== null && product?.custom_price !== undefined && product?.custom_price !== "") {
    return Number(product.custom_price);
  }
  return (product?.base_price !== null && product?.base_price !== undefined && product?.base_price !== "") ? Number(product.base_price) : null;
}

function getPriceText(product) {
  const publicPrice = Number(product?.base_price);
  const customPrice = product?.custom_price !== null && product?.custom_price !== undefined && product?.custom_price !== "" ? Number(product.custom_price) : null;
  const hasPublic = Number.isFinite(publicPrice);
  const hasCustom = Number.isFinite(customPrice);
  if (hasCustom && (!hasPublic || customPrice !== publicPrice)) {
    return `<div class="price price-custom-wrap"><span class="public-price-old">${formatNumber(publicPrice)} ${escapeHtml(product.base_currency || "تومان")}</span><span class="custom-price-current">${formatNumber(customPrice)} ${escapeHtml(product.base_currency || "تومان")}</span></div>`;
  }
  if (hasPublic) return `<div class="price">${formatNumber(publicPrice)} ${escapeHtml(product.base_currency || "تومان")}</div>`;
  return `<div class="price private-price">برای اطلاع از قیمت تماس بگیرید.</div>`;
}

function cartStorageKey(){
  const id = currentUser?.id || currentUser?.telegram_user_id || currentUser?.username || "guest";
  return "moshkfam_cart_" + String(id);
}
function loadCart(){ try { cartItems = JSON.parse(localStorage.getItem(cartStorageKey()) || "{}"); } catch { cartItems = {}; } updateCartBadge(); }
function saveCart(){ try { localStorage.setItem(cartStorageKey(), JSON.stringify(cartItems)); } catch {} updateCartBadge(); }
function updateCartBadge(){ const badge=$("cartCount"); if(!badge)return; const n=Object.values(cartItems).reduce((a,x)=>a+(Number(x.quantity)||0),0); badge.textContent=formatNumber(n); badge.classList.toggle("empty", n===0); }
function addToCart(productId,event){
  if(event){ event.preventDefault(); event.stopPropagation(); }
  if(!currentUser){ appAlert("⚠️ ابتدا وارد حساب کاربری خود شوید."); return; }
  const product=products.find(p=>Number(p.id)===Number(productId));
  if(!product){ appAlert("❌ محصول پیدا نشد."); return; }
  const price=getEffectivePrice(product);
  if(!Number.isFinite(price)){ appAlert("⚠️ این محصول هنوز قیمت مشخصی ندارد."); return; }
  const key=String(productId);
  if(!cartItems[key]) cartItems[key]={productId:Number(productId),quantity:0};
  cartItems[key].quantity++;
  saveCart();
  appAlert("✅ محصول به سبد خرید اضافه شد.");
}
function changeCartQty(productId,delta){ const key=String(productId); if(!cartItems[key])return; cartItems[key].quantity=Math.max(0,(Number(cartItems[key].quantity)||0)+delta); if(cartItems[key].quantity===0)delete cartItems[key]; saveCart(); renderCart(); }
function removeFromCart(productId){ delete cartItems[String(productId)]; saveCart(); renderCart(); appAlert("✅ کالا از سبد خرید حذف شد."); }
function openCart(){ if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری خود شوید.");return;} loadCart(); renderCart(); $("cartModal")?.classList.remove("hidden"); }
function closeCart(){ $("cartModal")?.classList.add("hidden"); }
function renderCart(){
  const box=$("cartItems"); const totalEl=$("cartTotal"); if(!box)return;
  const rows=Object.values(cartItems).filter(x=>(Number(x.quantity)||0)>0).map(item=>{
    const p=products.find(x=>Number(x.id)===Number(item.productId)); if(!p)return "";
    const price=getEffectivePrice(p); const total=price*(Number(item.quantity)||0);
    return `<div class="cart-row"><div class="cart-row-info"><strong>${escapeHtml(p.name_fa||p.name_en||"محصول")}</strong><span>${formatNumber(price)} ${escapeHtml(p.base_currency||"تومان")}</span></div><div class="cart-qty"><button type="button" onclick="changeCartQty(${Number(p.id)},-1)">−</button><b>${formatNumber(item.quantity)}</b><button type="button" onclick="changeCartQty(${Number(p.id)},1)">+</button></div><strong class="cart-line-total">${formatNumber(total)} تومان</strong><button type="button" class="cart-remove" onclick="removeFromCart(${Number(p.id)})">🗑️</button></div>`;
  }).filter(Boolean);
  box.innerHTML=rows.length?rows.join(""):"<div class=\"message\">سبد خرید خالی است.</div>";
  const total=Object.values(cartItems).reduce((sum,item)=>{const p=products.find(x=>Number(x.id)===Number(item.productId));const price=getEffectivePrice(p);return sum+(Number.isFinite(price)?price*(Number(item.quantity)||0):0)},0);
  if(totalEl) totalEl.textContent=formatNumber(total)+" تومان";
}
async function submitCartOrder(){
  if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری شوید.");return;}
  const entries=Object.values(cartItems).filter(x=>(Number(x.quantity)||0)>0); if(!entries.length){appAlert("⚠️ سبد خرید خالی است.");return;}
  const lines=entries.map(item=>{const p=products.find(x=>Number(x.id)===Number(item.productId));const price=getEffectivePrice(p);return `${p?.name_fa||p?.name_en||"محصول"} × ${item.quantity} = ${formatNumber(price*(Number(item.quantity)||0))} تومان`;});
  const total=entries.reduce((sum,item)=>{const p=products.find(x=>Number(x.id)===Number(item.productId));const price=getEffectivePrice(p);return sum+(Number.isFinite(price)?price*(Number(item.quantity)||0):0)},0);
  try{ await postJson("/api/customer/request",{type:"order",text:"🛒 سفارش سبد خرید\n"+lines.join("\n")+`\nمجموع: ${formatNumber(total)} تومان`}); cartItems={}; saveCart(); renderCart(); closeCart(); appAlert("✅ سفارش سبد خرید با موفقیت ثبت شد."); }catch(e){appAlert("❌ ثبت سفارش انجام نشد:\n"+(e.message||"خطای نامشخص"));}
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
    const details =
      data && typeof data === "object" && data.details
        ? `\n${typeof data.details === "string" ? data.details : JSON.stringify(data.details)}`
        : "";
    throw new Error(message + details);
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
  try{const r=await postJson("/api/login",{username,password});setStoredToken(r.token);currentUser=r.user||null;isAdmin=String(r.user?.role||"").toLowerCase()==="admin" || String(r.user?.role||"").toLowerCase()==="super_admin";if($("loginPassword"))$("loginPassword").value="";if(msg)msg.textContent="✅ ورود با موفقیت انجام شد.";updateAccountUI();loadCart();await loadProducts();}catch(e){if(msg)msg.textContent=e.message||"ورود انجام نشد.";}
}
async function loadWebSession(){const t=getStoredToken();if(!t)return;try{const r=await apiRequest("/api/session",{method:"GET"});if(r?.authenticated&&r.user){currentUser=r.user;isAdmin=String(r.user.role||"").toLowerCase()==="admin" || String(r.user.role||"").toLowerCase()==="super_admin";updateAccountUI();loadCart();}else setStoredToken("");}catch{setStoredToken("");}}
async function logoutUser(){try{await apiRequest("/api/logout",{method:"POST"});}catch{}setStoredToken("");currentUser=null;isAdmin=false;cartItems={};updateCartBadge();updateAccountUI();await loadProducts();}
async function loadSiteSettings(){try{const r=await get("/api/site-settings"),st=r?.settings||{};if($("footerCompanyName"))$("footerCompanyName").textContent="🌱 "+(st.company_name||"مشکفام فارس");if($("footerText"))$("footerText").textContent=st.footer_text||"";if($("footerPhone"))$("footerPhone").textContent=st.phone?"☎️ "+st.phone:"";if($("footerAddress"))$("footerAddress").textContent=st.address?"📍 "+st.address:"";if($("settingCompanyName"))$("settingCompanyName").value=st.company_name||"مشکفام فارس";if($("settingFooterText"))$("settingFooterText").value=st.footer_text||"";if($("settingPhone"))$("settingPhone").value=st.phone||"";if($("settingAddress"))$("settingAddress").value=st.address||"";}catch(e){console.warn("Settings:",e);}}
async function saveSiteSettings(){try{await postJson("/api/admin/site-settings",{company_name:$("settingCompanyName")?.value.trim()||"مشکفام فارس",footer_text:$("settingFooterText")?.value||"",phone:$("settingPhone")?.value.trim()||"",address:$("settingAddress")?.value||""});await loadSiteSettings();alert("✅ اطلاعات پایین صفحه ذخیره شد.");}catch(e){alert("❌ ذخیره تنظیمات انجام نشد:\n"+e.message);}}
async function createProduct(){
  const fa = $("newProductNameFa")?.value.trim() || "";
  const toNumber = v => {
    const raw=String(v??"").trim().replace(/[٬,\s]/g,"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
    return raw==="" ? null : Number(raw);
  };
  const p={name_fa:fa,name_en:$("newProductNameEn")?.value.trim()||"",category:$("newProductCategory")?.value.trim()||"",package:$("newProductPackage")?.value.trim()||"",maker:$("newProductMaker")?.value.trim()||"",base_price:toNumber($("newProductPrice")?.value),base_currency:"تومان",active:true};
  if(!p.name_fa){alert("نام فارسی محصول را وارد کنید.");return;}
  try{
    const result=await postJson("/api/admin/create-product",p);
    if(!result?.product?.id) throw new Error("سرور محصول جدید را ثبت نکرد.");
    alert("✅ محصول جدید ایجاد شد.");
    ["newProductNameFa","newProductNameEn","newProductCategory","newProductPackage","newProductMaker","newProductPrice"].forEach(id=>{if($(id))$(id).value=""});
    await loadProducts(); await loadAdminProducts();
  }catch(e){console.error("Create product:",e);alert("❌ افزودن محصول انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}
async function deleteProduct(id){if(!(await appConfirm("آیا از حذف کامل این محصول مطمئن هستید؟")))return;try{await postJson("/api/admin/delete-product",{product_id:Number(id)});alert("✅ محصول حذف شد.");await loadProducts();await loadAdminProducts();}catch(e){alert("❌ حذف محصول انجام نشد:\n"+e.message);}}
async function createCustomerUser(){const p={first_name:$("newUserFirstName")?.value.trim(),last_name:$("newUserLastName")?.value.trim(),username:$("newUserUsername")?.value.trim(),password:$("newUserPassword")?.value||""};try{await postJson("/api/admin/create-customer",p);alert("✅ نماینده اضافه شد.");["newUserFirstName","newUserLastName","newUserUsername","newUserPassword"].forEach(id=>{if($(id))$(id).value=""});await loadCustomers();}catch(e){alert("❌ افزودن نماینده انجام نشد:\n"+e.message);}}
function showDeleteDebug(title, data, isError=false){
  const el=$("customerDeleteDebug");
  if(!el)return;
  el.classList.remove("hidden");
  el.classList.toggle("error", !!isError);
  el.textContent=title+"\n"+(typeof data === "string" ? data : JSON.stringify(data,null,2));
}
async function deleteCustomerUser(id){
  const customerId=String(id||"").trim();
  if(!customerId){showDeleteDebug("❌ شناسه نماینده خالی است.","customer_id خالی است.",true);return false;}
  showDeleteDebug("⏳ کلیک دریافت شد؛ در حال حذف نماینده...", {customer_id:customerId});
  try{
    const result=await postJson("/api/admin/delete-customer",{customer_id:customerId});
    showDeleteDebug("✅ خروجی حذف نماینده",result,false);
    alert("✅ نماینده با موفقیت حذف شد.");
    await loadCustomers();
  }catch(e){
    const detail=e?.message||String(e||"خطای نامشخص");
    showDeleteDebug("❌ خروجی خطای حذف نماینده",detail,true);
    alert("❌ حذف نماینده انجام نشد:\n"+detail);
  }
  return false;
}

async function updateCustomerUser(id){
  const cid=String(id||"").trim();
  if(!cid){alert("❌ شناسه نماینده مشخص نیست.");return false;}
  const first=adminVisibleElement("ufirst-"+cid);
  const last=adminVisibleElement("ulast-"+cid);
  const user=adminVisibleElement("uuser-"+cid);
  const status=adminVisibleElement("ustatus-"+cid);
  const passEl=adminVisibleElement("upass-"+cid);
  const p={customer_id:cid,first_name:first?.value.trim()||"",last_name:last?.value.trim()||"",username:user?.value.trim()||"",status:status?.value||"active"};
  const pass=passEl?.value||"";
  if(pass)p.password=pass;
  try{
    const result=await postJson("/api/admin/customer-profile",p);
    if(!result || result.ok===false) throw new Error(result?.details||result?.error||"سرور تغییرات را تأیید نکرد.");
    alert("✅ اطلاعات نماینده ذخیره شد.");
    await loadCustomers();
  }catch(e){
    console.error("Update customer:",e);
    alert("❌ ویرایش نماینده انجام نشد:\n"+(e?.message||String(e)));
  }
  return false;
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function authenticate() {
  if (!tg || !tg.initData) {
    return;
  }

  try {
    const result = await postJson("/api/telegram-auth", {
      initData: tg.initData
    });

    if (result && result.user) {
      currentUser = result.user;
    }

    if (result && result.isAdmin) {
      isAdmin = true;
    }

    updateAccountUI();

  } catch (error) {
    console.warn("Telegram authentication failed:", error);
  }
}

async function loadCurrentUser() {
  if (!tg || !tg.initData) {
    return;
  }

  try {
    const result = await postJson("/api/whoami", {
      initData: tg.initData
    });

    if (result && result.user) {
      currentUser = result.user;
    }

    if (result && typeof result.isAdmin === "boolean") {
      isAdmin = result.isAdmin;
    }

    updateAccountUI();

  } catch (error) {
    console.warn("whoami:", error);
  }
}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI() {
  const account = $("account");
  const adminButton = $("adminButton");
  const loginBox = $("loginBox");
  const logoutButton = $("logoutButton");

  if (!currentUser) {
    if(loginBox) loginBox.classList.remove("hidden");
    if(logoutButton) logoutButton.classList.add("hidden");
    if (account) {
      account.classList.add("hidden");
    }

    if (adminButton) {
      adminButton.classList.add("hidden");
    }

    return;
  }

  if (account) {
    account.classList.remove("hidden");
  }

  const name =
    [
      currentUser.first_name,
      currentUser.last_name
    ]
      .filter(Boolean)
      .join(" ") ||
    currentUser.username ||
    "کاربر";

  const username =
    currentUser.username
      ? "@" + currentUser.username
      : "";

  if ($("accountName")) {
    $("accountName").textContent = name;
  }

  if ($("accountUser")) {
    $("accountUser").textContent = username;
  }

  if ($("accountInfo")) {
    $("accountInfo").textContent =
      isAdmin || currentUser.role === "admin"
        ? "مدیر سیستم"
        : "مشتری";
  }

  const customerButton = $("customerButton");
  if(loginBox) loginBox.classList.add("hidden");
  if(logoutButton) logoutButton.classList.remove("hidden");

  if (adminButton) {
    if (isAdmin) {
      adminButton.classList.remove("hidden");
    } else {
      adminButton.classList.add("hidden");
    }
  }

  if (customerButton) {
    if (isAdmin) {
      customerButton.classList.add("hidden");
    } else {
      customerButton.classList.remove("hidden");
    }
  }
}


/* =========================================================
   PRODUCTS
========================================================= */

async function loadProducts() {
  const loading = $("loading");

  if (loading) {
    loading.classList.remove("hidden");
    loading.textContent = "در حال دریافت محصولات...";
  }

  hideError();

  try {
    const result = await get("/api/products");

    if (Array.isArray(result)) {
      products = result;
    } else if (
      result &&
      Array.isArray(result.products)
    ) {
      products = result.products;
    } else {
      products = [];
    }

    buildCategories();
    renderCategories();
    renderProducts();

  } catch (error) {
    console.error("Products error:", error);

    products = [];

    showError(
      "❌ دریافت محصولات انجام نشد. اتصال اینترنت یا سرور را بررسی کنید."
    );

  } finally {
    if (loading) {
      loading.classList.add("hidden");
    }
  }
}


/* =========================================================
   CATEGORIES
========================================================= */

function buildCategories() {
  const set = new Set();

  products.forEach(product => {
    if (product.category) {
      set.add(String(product.category).trim());
    }
  });

  categories = Array.from(set);
}

function renderCategories() {
  const container = $("categories");

  if (!container) return;

  let html = `
    <button
      class="category-circle ${
        activeCategory === "" ? "active" : ""
      }"
      data-category=""
    >
      همه
    </button>
  `;

  categories.forEach(category => {
    html += `
      <button
        class="category-circle ${
          activeCategory === category ? "active" : ""
        }"
        data-category="${escapeHtml(category)}"
      >
        ${escapeHtml(category)}
      </button>
    `;
  });

  container.innerHTML = html;

  container
    .querySelectorAll(".category-circle")
    .forEach(button => {
      button.addEventListener("click", () => {
        activeCategory =
          button.dataset.category || "";

        renderCategories();
        renderProducts();
      });
    });
}


/* =========================================================
   SEARCH
========================================================= */

function getFilteredProducts() {
  const input = $("searchInput");

  const query = input
    ? input.value.trim().toLowerCase()
    : "";

  return products.filter(product => {
    const categoryOK =
      !activeCategory ||
      String(product.category || "") ===
        activeCategory;

    if (!categoryOK) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchable = [
      product.name_fa,
      product.name_en,
      product.category,
      product.package,
      product.maker,
      product.intro,
      product.composition,
      product.use_text,
      product.warnings
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(query);
  });
}


/* =========================================================
   PRODUCT CARDS
========================================================= */

function renderProducts() {
  const grid = $("productGrid");
  const empty = $("empty");
  const count = $("productCount");

  if (!grid) return;

  const filtered = getFilteredProducts();

  if (count) {
    count.textContent =
      `${formatNumber(filtered.length)} محصول`;
  }

  if (!filtered.length) {
    grid.innerHTML = "";

    if (empty) {
      empty.classList.remove("hidden");
    }

    return;
  }

  if (empty) {
    empty.classList.add("hidden");
  }

  grid.innerHTML = filtered
    .map(renderProductCard)
    .join("");
}

function renderProductCard(product) {
  const id = product.id;

  const name =
    product.name_fa ||
    product.name_en ||
    "محصول";

  const imageUrl =
    product.image_url || "";

  return `
    <article
      class="product-card"
      data-product-id="${escapeHtml(id)}"
      role="button"
      tabindex="0"
      onclick="openProduct(${Number(id)})"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openProduct(${Number(id)})}"
    >

      <div class="product-image">

        ${
          imageUrl
            ? `
              <img
                src="${escapeHtml(imageUrl)}"
                alt="${escapeHtml(name)}"
                loading="lazy"
                onerror="
                  this.style.display='none';
                  this.parentElement.classList.add('image-error');
                "
              >
            `
            : `
              <div class="no-image">
                🌱
              </div>
            `
        }

      </div>

      <div class="product-body">

        <h3>
          ${escapeHtml(name)}
        </h3>

        ${
          product.name_en
            ? `
              <div class="product-en">
                ${escapeHtml(product.name_en)}
              </div>
            `
            : ""
        }

        ${
          product.category
            ? `
              <div class="product-category">
                ${escapeHtml(product.category)}
              </div>
            `
            : ""
        }

        ${
          product.package
            ? `
              <div class="product-package">
                📦 ${escapeHtml(product.package)}
              </div>
            `
            : ""
        }

        ${getPriceText(product)}

        <button type="button" class="product-cart-button" onclick="addToCart(${Number(id)}, event)">🛒 افزودن به سبد</button>

      </div>
    </article>
  `;
}


/* =========================================================
   APP DIALOGS + CATALOG VIEWER
   جایگزین پیام‌های native برای سازگاری کامل Web و Android WebView
========================================================= */

let appDialogResolver = null;

function appDialogClose(result) {
  const dialog = $("appDialog");
  if (dialog) {
    dialog.classList.add("hidden");
    dialog.setAttribute("aria-hidden", "true");
  }
  const resolver = appDialogResolver;
  appDialogResolver = null;
  if (resolver) resolver(result);
}

function appDialogOk() { appDialogClose(true); }
function appDialogCancel() { appDialogClose(false); }

function showAppDialog(message, confirmMode = false) {
  const dialog = $("appDialog");
  const msg = $("appDialogMessage");
  const ok = $("appDialogOk");
  const cancel = $("appDialogCancel");
  const close = $("appDialogClose");
  const icon = $("appDialogIcon");
  if (!dialog || !msg || !ok || !cancel) return;

  msg.textContent = String(message ?? "");
  const text = String(message ?? "");
  icon.textContent = text.includes("❌") ? "❌" : text.includes("⚠️") ? "⚠️" : text.includes("✅") ? "✅" : "ℹ️";
  cancel.classList.toggle("hidden", !confirmMode);
  ok.textContent = confirmMode ? "تأیید" : "باشه";
  if (close) close.style.display = confirmMode ? "" : "none";
  dialog.classList.remove("hidden");
  dialog.setAttribute("aria-hidden", "false");
  setTimeout(() => ok.focus(), 0);

  if (!confirmMode) return;
  return new Promise(resolve => { appDialogResolver = resolve; });
}

function appAlert(message) { showAppDialog(message, false); }
function appConfirm(message) { return showAppDialog(message, true); }

window.alert = appAlert;

function openCatalog(url, name) {
  const modal = $("catalogModal");
  const frame = $("catalogModalFrame");
  const title = $("catalogModalTitle");
  const external = $("catalogModalExternal");
  if (!modal || !frame) return;
  frame.src = String(url || "");
  if (title) title.textContent = "📄 کاتالوگ " + (name || "محصول");
  if (external) external.href = String(url || "");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeCatalog() {
  const modal = $("catalogModal");
  const frame = $("catalogModalFrame");
  if (frame) frame.src = "about:blank";
  if (modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
}

/* =========================================================
   PRODUCT MODAL
========================================================= */

function openProduct(id) {
  const product = products.find(
    p => Number(p.id) === Number(id)
  );

  if (!product) {
    return;
  }

  const modal = $("modal");
  const content = $("modalContent");

  if (!modal || !content) {
    return;
  }

  const name =
    product.name_fa ||
    product.name_en ||
    "محصول";

  let html = `
    <div class="product-detail">
      <button class="back-product" onclick="closeModal()">← بازگشت به محصولات</button>

      ${
        product.image_url
          ? `
            <img
              class="detail-image"
              src="${escapeHtml(product.image_url)}"
              alt="${escapeHtml(name)}"
            >
          `
          : ""
      }

      <h2>
        ${escapeHtml(name)}
      </h2>

      ${
        product.name_en
          ? `
            <div class="detail-en">
              ${escapeHtml(product.name_en)}
            </div>
          `
          : ""
      }

      ${getPriceText(product)}

      ${
        product.category
          ? `
            <div class="detail-row">
              <strong>دسته‌بندی:</strong>
              <span>${escapeHtml(product.category)}</span>
            </div>
          `
          : ""
      }

      ${
        product.package
          ? `
            <div class="detail-row">
              <strong>بسته‌بندی:</strong>
              <span>${escapeHtml(product.package)}</span>
            </div>
          `
          : ""
      }

      ${
        product.maker
          ? `
            <div class="detail-row">
              <strong>تولیدکننده:</strong>
              <span>${escapeHtml(product.maker)}</span>
            </div>
          `
          : ""
      }

      ${
        product.intro
          ? `
            <section class="detail-section">
              <h3>معرفی محصول</h3>
              <p>${escapeHtml(product.intro)}</p>
            </section>
          `
          : ""
      }

      ${
        product.composition
          ? `
            <section class="detail-section">
              <h3>ترکیبات</h3>
              <p>${escapeHtml(product.composition)}</p>
            </section>
          `
          : ""
      }

      ${
        product.benefits &&
        Array.isArray(product.benefits) &&
        product.benefits.length
          ? `
            <section class="detail-section">
              <h3>مزایا</h3>
              <ul>
                ${product.benefits
                  .map(
                    item =>
                      `<li>${escapeHtml(item)}</li>`
                  )
                  .join("")}
              </ul>
            </section>
          `
          : ""
      }

      ${
        product.use_text
          ? `
            <section class="detail-section">
              <h3>نحوه مصرف</h3>
              <p>${escapeHtml(product.use_text)}</p>
            </section>
          `
          : ""
      }

      ${
        product.warnings
          ? `
            <section class="detail-section warning">
              <h3>⚠️ هشدارها</h3>
              <p>${escapeHtml(product.warnings)}</p>
            </section>
          `
          : ""
      }

      ${
        product.video_url
          ? `
            <div class="video-box">
              <video
                controls
                playsinline
                preload="metadata"
                src="${escapeHtml(product.video_url)}"
              ></video>
            </div>
          `
          : ""
      }


      ${
        product.catalog_pdf_url
          ? `
            <section class="catalog-section">
              <h3>📄 کاتالوگ</h3>
              <div class="catalog-frame-wrap">
                <iframe
                  src="${escapeHtml(product.catalog_pdf_url)}"
                  title="کاتالوگ ${escapeHtml(product.name_fa || "محصول")}"
                  loading="lazy"
                ></iframe>
              </div>
              <a
                 href="#"
                 data-catalog-url="${escapeHtml(product.catalog_pdf_url)}"
                 data-catalog-name="${escapeHtml(product.name_fa || "محصول")}"
                 class="catalog-fallback catalog-open"
               >
                 باز کردن کاتالوگ در صفحه جداگانه
               </a>
            </section>
          `
          : ""
      }


    </div>
  `;

  content.innerHTML = html;

  modal.classList.remove("hidden");

  if (tg && tg.BackButton) {
    try {
      tg.BackButton.show();
    } catch (e) {}
  }
}

function closeModal() {
  const modal = $("modal");

  if (modal) {
    modal.classList.add("hidden");
  }

  if (tg && tg.BackButton) {
    try {
      tg.BackButton.hide();
    } catch (e) {}
  }
}


/* =========================================================
   ADMIN
========================================================= */

async function openAdmin() {
  const modal = $("adminModal");
  const error = $("adminError");

  if (!modal) return;

  modal.classList.remove("hidden");

  if (error) {
    error.classList.add("hidden");
    error.textContent = "";
  }

  // Refresh authentication before opening the management data.
  try {
    await loadCurrentUser();
  } catch (e) {
    console.warn("Admin authentication refresh:", e);
  }

  if (!isAdmin) {
    if (error) {
      error.textContent =
        "❌ این حساب به پنل مدیریت دسترسی ندارد. لطفاً سامانه را از داخل ربات تلگرام و با حساب مدیر باز کنید.";
      error.classList.remove("hidden");
    }
    return;
  }

  await loadAdminData();
}

function closeAdmin() {
  const modal = $("adminModal");

  if (modal) {
    modal.classList.add("hidden");
  }
}

async function loadAdminData() {
  const loading = $("adminLoading");
  const error = $("adminError");

  if (loading) {
    loading.classList.remove("hidden");
  }

  if (error) {
    error.classList.add("hidden");
  }

  try {
    await Promise.all([
      loadAdminProducts(),
      loadCustomers(),
      loadAdminRequests()
    ]);

    renderAdminAccount();

  } catch (e) {
    console.error(e);

    if (error) {
      error.textContent =
        "❌ دریافت اطلاعات مدیریت انجام نشد.";
      error.classList.remove("hidden");
    }

  } finally {
    if (loading) {
      loading.classList.add("hidden");
    }
  }
}

function renderAdminAccount() {
  const el = $("adminAccountInfo");

  if (!el) return;

  if (!currentUser) {
    el.innerHTML = "کاربر وارد نشده است.";
    return;
  }

  const name =
    [
      currentUser.first_name,
      currentUser.last_name
    ]
      .filter(Boolean)
      .join(" ") ||
    currentUser.username ||
    "کاربر";

  el.innerHTML = `
    <div>
      <strong>Name:</strong>
      ${escapeHtml(name)}
    </div>

    ${
      currentUser.username
        ? `
          <div>
            <strong>Username:</strong>
            @${escapeHtml(currentUser.username)}
          </div>
        `
        : ""
    }

    <div>
      <strong>Role:</strong>
      ${escapeHtml(isAdmin ? "admin" : (currentUser.role || "customer"))}
    </div>
  `;
}


/* =========================================================
   ADMIN PRODUCTS
========================================================= */

function renderAdminProductList(list, container){
  const allowDelete = container && container.id === "adminProducts";
  if(!container) return;
  if (allowDelete) {
    container.innerHTML = list.map(product => {
      const id = Number(product.id);
      const nameFa = product.name_fa || product.name_en || "محصول";
      const nameEn = product.name_en || "";
      return `
        <div class="admin-product admin-product-delete-only">
          <div class="admin-product-title">
            <div>
              <strong>${escapeHtml(nameFa)}</strong>
              ${nameEn ? `<small class="admin-product-en">${escapeHtml(nameEn)}</small>` : ""}
            </div>
            <small>ID: ${escapeHtml(id)}</small>
          </div>
          <button type="button" class="admin-danger admin-delete-product-button" onclick="deleteProduct(${id}); return false;">🗑️ حذف محصول</button>
        </div>`;
    }).join("");
    return;
  }
  container.innerHTML = list.map(product => {
      const id = Number(product.id);
      const nameFa = product.name_fa || "";
      const nameEn = product.name_en || "";
      const benefits = Array.isArray(product.benefits)
        ? product.benefits.join("\n")
        : (product.benefits || "");
      return `
        <div class="admin-product">
          <div class="admin-product-title">
            <strong>${escapeHtml(nameFa || nameEn || "محصول")}</strong>
            <small>ID: ${escapeHtml(id)}</small>
          </div>
          <div class="admin-edit-grid">
            <label>نام فارسی<input id="namefa-${id}" value="${escapeHtml(nameFa)}"></label>
            <label>نام انگلیسی<input id="nameen-${id}" value="${escapeHtml(nameEn)}"></label>
            <label>دسته‌بندی<input id="category-${id}" value="${escapeHtml(product.category || "")}"></label>
            <label>بسته‌بندی<input id="package-${id}" value="${escapeHtml(product.package || "")}"></label>
            <label>سازنده<input id="maker-${id}" value="${escapeHtml(product.maker || "")}"></label>
            <label>قیمت پایه<input type="text" inputmode="decimal" id="price-${id}" value="${product.base_price ?? ""}" placeholder="قیمت پایه"></label>
          </div>
          <div class="admin-edit-grid admin-edit-grid-wide">
            <label>معرفی<textarea id="intro-${id}">${escapeHtml(product.intro || "")}</textarea></label>
            <label>ترکیبات<textarea id="composition-${id}">${escapeHtml(product.composition || "")}</textarea></label>
            <label>نحوه مصرف<textarea id="use-${id}">${escapeHtml(product.use_text || "")}</textarea></label>
            <label>هشدارها<textarea id="warnings-${id}">${escapeHtml(product.warnings || "")}</textarea></label>
            <label>مزایا (هر مورد در یک خط)<textarea id="benefits-${id}">${escapeHtml(benefits)}</textarea></label>
          </div>
          <label class="admin-active"><input type="checkbox" id="active-${id}" ${product.active !== false ? "checked" : ""}> محصول فعال و قابل نمایش برای مشتریان</label>
          <div class="admin-product-buttons"><button type="button" onclick="saveProduct(${id}); return false;">💾 ذخیره اطلاعات محصول</button></div>
          <div class="admin-media-grid">
            <div class="admin-media-box"><label>🖼️ تصویر جدید<input type="file" id="image-${id}" accept="image/*"></label><button type="button" onclick="uploadProductImage(${id}); return false;">آپلود / جایگزینی تصویر</button>${product.image_url ? `<button type="button" class="danger" onclick="removeProductImage(${id}); return false;">بایگانی تصویر فعلی</button>` : ""}</div>
            <div class="admin-media-box"><label>🎬 ویدئوی جدید<input type="file" id="video-${id}" accept="video/*"></label><button type="button" onclick="uploadProductVideo(${id}); return false;">آپلود / جایگزینی ویدئو</button>${product.video_url ? `<button type="button" class="danger" onclick="removeProductVideo(${id}); return false;">بایگانی ویدئو</button>` : ""}</div>
            <div class="admin-media-box"><label>📄 کاتالوگ جدید<input type="file" id="catalog-${id}" accept="application/pdf,.pdf,image/*"></label><button type="button" onclick="uploadProductCatalog(${id}); return false;">آپلود / جایگزینی کاتالوگ</button>${product.catalog_pdf_url ? `<button type="button" class="danger" onclick="removeProductCatalog(${id}); return false;">بایگانی کاتالوگ</button>` : ""}</div>
          </div>
        </div>`;
    }).join("");
}

async function loadAdminProducts() {
  const containers = [$('adminProducts'), $('adminEditProducts')].filter(Boolean);
  if (!containers.length) return;
  try {
    const result = await postJson('/api/admin/products', {});
    const list = Array.isArray(result) ? result : (Array.isArray(result?.products) ? result.products : products);
    containers.forEach(container => renderAdminProductList(list, container));
  } catch (error) {
    console.error('Admin products:', error);
    containers.forEach(container => { container.innerHTML = '<div class="message error">دریافت محصولات مدیریت انجام نشد.</div>'; });
  }
}

function adminVisibleElement(id){
  const nodes=Array.from(document.querySelectorAll(`[id="${CSS.escape(id)}"]`));
  return nodes.find(el=>{const sec=el.closest('[id^="adminSection-"]');return sec && !sec.classList.contains('hidden') && el.offsetParent!==null;}) || $(id);
}
function adminNumber(value){
  const raw=String(value??'').trim().replace(/[٬,\s]/g,'').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  return raw===''?null:Number(raw);
}
async function saveProduct(productId) {
  const id=Number(productId);
  const value=adminVisibleElement;
  const benefitsText=value(`benefits-${id}`)?.value||'';
  const payload={product_id:id,name_fa:value(`namefa-${id}`)?.value.trim()||'',name_en:value(`nameen-${id}`)?.value.trim()||'',category:value(`category-${id}`)?.value.trim()||'',package:value(`package-${id}`)?.value.trim()||'',maker:value(`maker-${id}`)?.value.trim()||'',intro:value(`intro-${id}`)?.value||'',composition:value(`composition-${id}`)?.value||'',use_text:value(`use-${id}`)?.value||'',warnings:value(`warnings-${id}`)?.value||'',benefits:benefitsText.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),active:!!value(`active-${id}`)?.checked,base_price:adminNumber(value(`price-${id}`)?.value),base_currency:'تومان'};
  if(!payload.name_fa){alert('نام فارسی محصول نمی‌تواند خالی باشد.');return;}
  try{const result=await postJson('/api/admin/update-product',payload);if(!result?.product?.length && !result?.product?.id)throw new Error('سرور رکورد محصول را تغییر نداد.');alert('✅ اطلاعات محصول ذخیره شد.');await loadProducts();await loadAdminProducts();}catch(error){console.error('Save product:',error);alert('❌ خطا در ذخیره محصول:\n'+error.message);}
}

async function uploadProductImage(productId) {
  const input = adminVisibleElement(`image-${Number(productId)}`);
  if (!input?.files?.length) return alert("لطفاً تصویر را انتخاب کنید.");
  const fd = new FormData();
  fd.append("product_id", String(productId));
  fd.append("file", input.files[0], input.files[0].name);
  try {
    await apiRequest("/api/admin/upload-image", { method:"POST", body:fd });
    alert("✅ تصویر جدید ثبت شد. تصویر قبلی به old منتقل شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در تصویر:\n" + e.message); }
}

async function removeProductImage(productId) {
  if (!(await appConfirm("تصویر فعلی به پوشه old منتقل و از محصول خارج شود؟"))) return;
  try {
    await postJson("/api/admin/remove-image", {product_id:Number(productId)});
    alert("✅ تصویر بایگانی شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در تصویر:\n" + e.message); }
}

async function uploadProductCatalog(productId) {
  const input = adminVisibleElement(`catalog-${Number(productId)}`);
  if (!input?.files?.length) return alert("لطفاً کاتالوگ را انتخاب کنید.");
  const fd = new FormData(); fd.append("product_id", String(productId)); fd.append("file", input.files[0], input.files[0].name);
  try {
    await apiRequest("/api/admin/upload-catalog", {method:"POST", body:fd});
    alert("✅ کاتالوگ جدید ثبت شد. کاتالوگ قبلی به old منتقل شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در کاتالوگ:\n" + e.message); }
}

async function removeProductCatalog(productId) {
  if (!(await appConfirm("کاتالوگ فعلی به پوشه old منتقل و از محصول خارج شود؟"))) return;
  try {
    await postJson("/api/admin/remove-catalog", {product_id:Number(productId)});
    alert("✅ کاتالوگ بایگانی شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در کاتالوگ:\n" + e.message); }
}

async function updateProductPrice(productId) {
  const input = adminVisibleElement(`price-${Number(productId)}`);
  if (!input) { alert("کادر قیمت محصول پیدا نشد."); return; }
  const raw = String(input.value ?? "").trim();
  const normalized = raw.replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const price = normalized === "" ? null : Number(normalized);
  if (price !== null && !Number.isFinite(price)) { alert("قیمت واردشده معتبر نیست."); return; }
  try {
    const result = await postJson("/api/admin/update-price", { product_id:Number(productId), price, currency:"تومان" });
    if (!result?.product || (Array.isArray(result.product) && !result.product.length)) throw new Error("سرور قیمت را تغییر نداد.");
    alert("✅ قیمت ذخیره شد.");
    await loadProducts();
    await loadAdminProducts();
  } catch (error) {
    alert("❌ خطا در ذخیره قیمت:\n" + error.message);
  }
}


/* =========================================================
   VIDEO
========================================================= */

async function uploadProductVideo(productId) {
  const input =
    $(`video-${Number(productId)}`);

  if (!input || !input.files.length) {
    alert("لطفاً یک فایل ویدئو انتخاب کنید.");
    return;
  }

  const file = input.files[0];

  if (file.size > 100 * 1024 * 1024) {
    alert("❌ حجم ویدئو نباید بیشتر از 100MB باشد.");
    return;
  }

  const formData = new FormData();

  formData.append(
    "product_id",
    String(productId)
  );

  formData.append(
    "file",
    file,
    file.name
  );

  try {
    await apiRequest(
      "/api/admin/upload-video",
      {
        method: "POST",
        body: formData
      }
    );

    alert("✅ ویدئو با موفقیت آپلود شد.");

    await loadProducts();
    await loadAdminProducts();

  } catch (error) {
    alert(
      "❌ خطا در آپلود ویدئو:\n" +
      error.message
    );
  }
}

async function removeProductVideo(productId) {
  if (
    !(await appConfirm("آیا از حذف ویدئوی این محصول مطمئن هستید؟"))
  ) {
    return;
  }

  try {
    await postJson(
      "/api/admin/remove-video",
      {
        product_id: Number(productId)
      }
    );

    alert("✅ ویدئو حذف شد.");

    await loadProducts();
    await loadAdminProducts();

  } catch (error) {
    alert(
      "❌ خطا در حذف ویدئو:\n" +
      error.message
    );
  }
}


/* =========================================================
   CUSTOMERS
========================================================= */

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
          ? `${name} (${customer.username})`
          : name;

      option.dataset.customer =
        JSON.stringify(customer);

      select.appendChild(option);
    });

  } catch (error) {
    console.error("Customers:", error);
  }
  const editBox=$("adminUsers"), deleteBox=$("adminUsersDelete");
  if(editBox || deleteBox){
    try{
      const r=await postJson("/api/admin/customers",{});
      const cs=Array.isArray(r?.customers)?r.customers:(Array.isArray(r)?r:[]);
      const editHtml=cs.length?cs.map(c=>{
        const id=String(c.id);
        return `<div class="admin-user-row"><div class="admin-edit-grid"><label>نام<input id="ufirst-${id}" value="${escapeHtml(c.first_name||"")}"></label><label>نام خانوادگی<input id="ulast-${id}" value="${escapeHtml(c.last_name||"")}"></label><label>یوزر<input id="uuser-${id}" value="${escapeHtml(c.username||"")}"></label><label>رمز جدید<input id="upass-${id}" type="password" placeholder="بدون تغییر"></label><label>وضعیت<select id="ustatus-${id}"><option value="active" ${c.status!=="disabled"?"selected":""}>فعال</option><option value="disabled" ${c.status==="disabled"?"selected":""}>غیرفعال</option></select></label></div><button type="button" class="admin-save-customer-button" data-update-customer="${escapeHtml(id)}">💾 ذخیره</button></div>`;
      }).join(""): `<div class="message">هنوز نماینده‌ای تعریف نشده است.</div>`;
      const deleteHtml=cs.length?cs.map(c=>{
        const id=String(c.id);
        const name=[c.first_name,c.last_name].filter(Boolean).join(" ") || c.username || "نماینده";
        return `<div class="admin-user-row admin-delete-row"><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(c.username?c.username:"")}</small></div><button type="button" class="admin-danger admin-delete-customer-button" data-delete-customer="${escapeHtml(id)}">🗑️ حذف نماینده</button></div>`;
      }).join(""): `<div class="message">هنوز نماینده‌ای تعریف نشده است.</div>`;
      if(editBox) editBox.innerHTML=editHtml;
      if(deleteBox) deleteBox.innerHTML=deleteHtml;
    }catch(e){
      if(editBox) editBox.innerHTML=`<div class="message error">خطا در دریافت کاربران.</div>`;
      if(deleteBox) deleteBox.innerHTML=`<div class="message error">خطا در دریافت کاربران.</div>`;
    }
  }
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

    container.innerHTML = `<div class="customer-price-tools"><button type="button" class="admin-danger" onclick="resetCustomerPrices('${escapeHtml(customerId)}')">↩️ برگرداندن تمام قیمت‌ها به قیمت عمومی</button><span>با این کار همه قیمت‌های اختصاصی این مشتری حذف می‌شود.</span></div>` + products.map(product => {
      const pid = Number(product.id);
      const item = priceMap.get(pid);
      return `
        <div class="customer-price-row">
          <div>${escapeHtml(product.name_fa || product.name_en || `محصول ${pid}`)}</div>
          <input type="text" inputmode="numeric" id="customer-price-${pid}" value="${item?.price ?? ""}" placeholder="قیمت اختصاصی (خالی = حذف)" oninput="formatCustomerPriceInput(this)">
          <button onclick="setCustomerPrice('${escapeHtml(customerId)}', ${pid})">ذخیره</button>
        </div>`;
    }).join("");
  } catch (error) {
    container.innerHTML = `<div class="message error">خطا در دریافت قیمت مشتری.</div>`;
  }
}

function formatCustomerPriceInput(input){
  const digits=String(input.value||"").replace(/[^0-9۰-۹٠-٩]/g,"").replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d));
  if(!digits){input.value="";return;}
  input.value=digits.replace(/\B(?=(\d{3})+(?!\d))/g,"'");
}
async function resetCustomerPrices(customerId){
  if(!(await appConfirm("آیا تمام قیمت‌های اختصاصی این مشتری به قیمت عمومی برگردانده شود؟")))return;
  try{const r=await postJson("/api/admin/reset-customer-prices",{customer_id:customerId}); if(!r?.ok)throw new Error(r?.error||"سرور تأیید نکرد."); await loadCustomerPrices(customerId); appAlert("✅ تمام قیمت‌های این مشتری به قیمت عمومی برگشت داده شد.");}
  catch(e){appAlert("❌ بازگردانی قیمت‌ها انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}

async function setCustomerPrice(
  customerId,
  productId
) {
  const input = adminVisibleElement(`customer-price-${Number(productId)}`);

  if (!input) return;

  const value = input.value.trim();
  const normalized = value.replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

  try {
    await postJson(
      "/api/admin/set-customer-price",
      {
        customer_id: customerId,
        product_id: Number(productId),
        price:
          normalized === ""
            ? null
            : Number(normalized),
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
   SYSTEM ADMINS
========================================================= */

async function createAdminUser(){
  const first_name=$("newAdminFirstName")?.value.trim()||"";
  const last_name=$("newAdminLastName")?.value.trim()||"";
  const telegram_user_id=$("newAdminTelegramId")?.value.trim()||"";
  const username=$("newAdminUsername")?.value.trim()||"";
  const password=$("newAdminPassword")?.value||"";

  if(!telegram_user_id && !(username && password)){
    appAlert("⚠️ حداقل Telegram ID یا هر دو مورد نام کاربری و رمز عبور وب را وارد کنید.");
    return;
  }
  if(username && username.length < 3){
    appAlert("⚠️ نام کاربری وب باید حداقل ۳ کاراکتر باشد.");
    return;
  }
  if(username && !/^[a-zA-Z0-9_.-]+$/.test(username)){
    appAlert("⚠️ نام کاربری وب فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.");
    return;
  }
  if(username && !password){
    appAlert("⚠️ برای نام کاربری وب، رمز عبور را هم وارد کنید.");
    return;
  }

  const button=document.querySelector('.admin-admin-create .admin-add-user-button');
  if(button){button.disabled=true;button.textContent="⏳ در حال افزودن...";}
  try{
    const r=await postJson("/api/admin/create-admin",{
      first_name,last_name,telegram_user_id,username,password
    });
    if(!r?.ok) throw new Error(r?.error||"سرور مدیر را ایجاد نکرد.");

    ["newAdminFirstName","newAdminLastName","newAdminTelegramId","newAdminUsername","newAdminPassword"].forEach(id=>{
      const el=$(id);
      if(el) el.value="";
    });
    await loadAdminUsers();
    appAlert("✅ مدیر جدید با موفقیت اضافه شد.");
  }catch(e){
    console.error("Create admin:",e);
    appAlert("❌ افزودن مدیر انجام نشد:\n"+(e.message||"خطای نامشخص"));
  }finally{
    if(button){button.disabled=false;button.textContent="🛡️ افزودن مدیر";}
  }
}

async function loadAdminUsers(){
  const container=$("adminUsersList");
  if(!container) return;
  container.innerHTML='<div class="message">در حال دریافت مدیران سیستم...</div>';
  try{
    const r=await postJson("/api/admin/admin-users",{});
    const admins=Array.isArray(r?.admins)?r.admins:[];
    if(!admins.length){container.innerHTML='<div class="message">هنوز مدیر دیگری تعریف نشده است.</div>';return;}
    container.innerHTML=admins.map(a=>{
      const id=String(a.id||"");
      const main=!!a.is_primary;
      const name=[a.first_name,a.last_name].filter(Boolean).join(" ")||a.username||"مدیر";
      if(main){
        return `<div class="admin-user-row admin-system-user-row admin-system-primary-row">
          <div class="admin-system-user-main"><strong>${escapeHtml(name)}</strong><small>👑 مدیر اصلی${a.telegram_user_id?` · Telegram ID: ${escapeHtml(a.telegram_user_id)}`:''}</small></div>
          <span class="admin-primary-badge">غیرقابل حذف</span>
        </div>`;
      }
      return `<div class="admin-user-row admin-system-user-row admin-system-edit-row">
        <div class="admin-edit-grid admin-system-edit-grid">
          <label>نام<input id="afirst-${escapeHtml(id)}" value="${escapeHtml(a.first_name||"")}"></label>
          <label>نام خانوادگی<input id="alast-${escapeHtml(id)}" value="${escapeHtml(a.last_name||"")}"></label>
          <label>Telegram ID<input id="atele-${escapeHtml(id)}" value="${escapeHtml(a.telegram_user_id||"")}" inputmode="numeric"></label>
          <label>نام کاربری وب<input id="auser-${escapeHtml(id)}" value="${escapeHtml(a.username||"")}" autocomplete="off"></label>
          <label>رمز جدید<input id="apass-${escapeHtml(id)}" type="password" placeholder="بدون تغییر" autocomplete="new-password"></label>
          <label>وضعیت<select id="astatus-${escapeHtml(id)}"><option value="active" ${a.status!=="disabled"?'selected':''}>فعال</option><option value="disabled" ${a.status==="disabled"?'selected':''}>غیرفعال</option></select></label>
        </div>
        <div class="admin-system-actions">
          <button type="button" class="admin-save-customer-button" data-update-admin="${escapeHtml(id)}">💾 ذخیره مدیر</button>
          <button type="button" class="admin-danger admin-delete-admin-button" data-delete-admin="${escapeHtml(id)}">🗑️ حذف مدیر</button>
        </div>
      </div>`;
    }).join("");
  }catch(e){container.innerHTML=`<div class="message error">❌ دریافت مدیران انجام نشد.<br>${escapeHtml(e.message||"")}</div>`;}
}

async function updateAdminUser(id){
  if(!id)return;
  const payload={
    id,
    first_name:$("afirst-"+id)?.value.trim()||"",
    last_name:$("alast-"+id)?.value.trim()||"",
    telegram_user_id:$("atele-"+id)?.value.trim()||"",
    username:$("auser-"+id)?.value.trim()||"",
    password:$("apass-"+id)?.value||"",
    status:$("astatus-"+id)?.value||"active"
  };
  try{
    await postJson("/api/admin/update-admin",payload);
    await loadAdminUsers();
    appAlert("✅ اطلاعات مدیر با موفقیت ذخیره شد.");
  }catch(e){appAlert("❌ ویرایش مدیر انجام نشد:\n"+(e.message||"خطای نامشخص"));}
}

async function deleteAdminUser(id){
  if(!id)return;
  if(!(await appConfirm("آیا این مدیر سیستم حذف شود؟")))return;
  try{
    await postJson("/api/admin/delete-admin",{id});
    await loadAdminUsers();
    appAlert("✅ مدیر سیستم حذف شد.");
  }catch(e){appAlert("❌ حذف مدیر انجام نشد:\n"+(e.message||"خطای نامشخص"));}
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
          <button type="button" class="admin-danger" onclick="deleteCustomerRequest(${Number(r.id)})">🗑️ حذف</button>
        </div>
      </div>`;
    }).join("");
  } catch (error) {
    container.innerHTML = `<div class="message error">خطا در دریافت سفارش‌ها و یادداشت‌ها.<br>${escapeHtml(error.message || "")}</div>`;
  }
}

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
    loadCart();
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
window.openCart=openCart;
window.closeCart=closeCart;
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

function showAdminHome() {
  const home = $("adminHome");
  const sections = document.querySelectorAll("[id^='adminSection-']");

  sections.forEach(section => section.classList.add("hidden"));
  if (home) home.classList.remove("hidden");
}

async function showAdminSection(sectionName) {
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
    }

    if (sectionName === "admins") {
      await loadAdminUsers();
    }

    if (sectionName === "footer") {
      await loadSiteSettings();
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

window.showAdminSection = showAdminSection;
window.showAdminHome = showAdminHome;
window.searchAdminItems = searchAdminItems;
window.createAdminUser = createAdminUser;
window.deleteAdminUser = deleteAdminUser;
window.updateAdminUser = updateAdminUser;
window.loadAdminUsers = loadAdminUsers;

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
