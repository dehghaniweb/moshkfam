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
   MOSHKFAM - پاک‌سازی یک‌بارهٔ کش‌های قدیمی (App.js only)
   ========================================================= */
const APP_VERSION = window.MOSHKFAM_VERSION || "V1.0.66";
(async function clearLegacyCachesOnce() {
  try {
    if (new URLSearchParams(window.location.search).get("debug") === "1") return;
    // V1.0.62: قبلاً اینجا «همهٔ کش‌ها پاک، Service Worker حذف و صفحه دوباره بارگذاری» می‌شد؛ یعنی در اولین ورود هر دستگاه
    // همهٔ فایل‌ها دو بار دانلود می‌شدند (روی اینترنت کند تا چند دقیقه) و نسخهٔ ذخیره‌شدهٔ برنامه هم از بین می‌رفت.
    // حالا فقط کش‌های قدیمی و ناشناخته (یک‌بار برای هر دستگاه) پاک می‌شوند؛ کش فایل‌های برنامه (moshkfam-assets-*) و
    // کش پوستهٔ Service Worker (moshkfam-shell-*) دست‌نخورده می‌ماند و صفحه دوباره بارگذاری نمی‌شود.
    const version = "moshkfam-app-20261101-01";
    const flag = "moshkfam_cache_cleared_" + version;

    if (localStorage.getItem(flag)) return;
    localStorage.setItem(flag, "1");

    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(name => !name.startsWith("moshkfam-assets-") && !name.startsWith("moshkfam-shell-"))
          .map(name => caches.delete(name))
      );
    }
  } catch (e) {
    console.warn("Cache clear:", e);
  }
})();

const WORKER_URL =
  "https://api.moshkfamfertilizer.ir";

// Google Apps Script iframe bridge used only when the primary API is unreachable.
const GAS_BRIDGE_URL =
  "https://script.google.com/macros/s/AKfycbxZE93G7lfthNctLEQGfLSva6vrdkqAKNmO4XuEs5Gn8hsd4mWUUkEh-x6620fkM-5AvA/exec?bridge=1";
const GAS_BRIDGE_TIMEOUT_MS = 35000;
// مهلت بالا آمدن خود پل (iframe). اگر Google از این شبکه باز نشود، بیش از این منتظر نمی‌مانیم.
const GAS_BRIDGE_READY_TIMEOUT_MS = 15000;
// بعد از شکست بالا آمدن پل، این مدت درخواست‌ها مستقیم به Worker می‌روند تا هر درخواست منتظر نماند.
const GAS_BRIDGE_COOLDOWN_MS = 2 * 60 * 1000;
let gasBridgeDownUntil = 0;
let gasBridgeFrame = null;
let gasBridgeReady = false;
// پنجرهٔ داخلی که کد پل را اجرا می‌کند (event.source پیام READY). پل Google داخل
// یک iframe تو در توی sandbox اجرا می‌شود؛ پیام‌های درخواست باید مستقیم به همین
// پنجره برسند، نه به پنجرهٔ بیرونی iframe.
let gasBridgeTarget = null;
let gasBridgeReadyWaiters = [];
const gasBridgePending = new Map();
let gasBridgeRequestId = 0;

// خطای «انتقال» پل (نه خطای HTTP سرور). requestSent مشخص می‌کند درخواست به پل فرستاده شده یا نه.
function makeBridgeTransportError(message, requestSent) {
  const error = new Error(message);
  error.name = "BridgeTransportError";
  error.bridgeTransport = true;
  error.requestSent = requestSent === true;
  return error;
}

function ensureGasBridge() {
  if (gasBridgeFrame) return gasBridgeFrame;

  const frame = document.createElement("iframe");
  frame.title = "Moshkfam API fallback";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:absolute;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none";
  frame.src = GAS_BRIDGE_URL;
  gasBridgeFrame = frame;
  (document.body || document.documentElement).appendChild(frame);
  return frame;
}

// آیا این پنجره داخل iframe پل ما (در هر عمقی) قرار دارد؟ دسترسی به window.parent
// حتی بین originهای متفاوت مجاز است، پس این بررسی روی پنجرهٔ Google هم کار می‌کند.
function isWindowInsideGasBridgeFrame(win) {
  if (!win || !gasBridgeFrame || !gasBridgeFrame.contentWindow) return false;
  try {
    let current = win;
    for (let depth = 0; depth < 8; depth++) {
      if (current === gasBridgeFrame.contentWindow) return true;
      const parent = current.parent;
      if (!parent || parent === current) return false;
      current = parent;
    }
  } catch (_) {}
  return false;
}

window.addEventListener("message", function (event) {
  if (!gasBridgeFrame) return;
  // V1.0.62: پل جداگانهٔ لودر فایل‌های سایت (index.html) پیام‌های خودش را دارد؛ اینجا نباید با پل برنامه قاطی شود.
  if (window.MoshkfamAssets && window.MoshkfamAssets.isBridgeWindow && window.MoshkfamAssets.isBridgeWindow(event.source)) return;
  const message = event.data || {};
  // Apps Script HtmlService runs the page inside a nested sandbox iframe.
  // Its postMessage source may therefore differ from gasBridgeFrame.contentWindow.
  // Accept only messages carrying our bridge marker from Google's hosted iframe.
  const trustedBridgeOrigin =
    event.origin === "https://script.google.com" ||
    event.origin.endsWith(".googleusercontent.com");
  if (!trustedBridgeOrigin || message.source !== "MOSHKFAM_GAS_BRIDGE") return;

  if (message.type === "READY") {
    // مقصد درخواست‌ها را همان پنجره‌ای قرار بده که پیام READY را فرستاده؛
    // فقط اگر واقعاً داخل iframe پل ما باشد.
    if (isWindowInsideGasBridgeFrame(event.source)) {
      gasBridgeTarget = event.source;
    }
    gasBridgeReady = true;
    gasBridgeDownUntil = 0;
    gasBridgeReadyWaiters.splice(0).forEach(resolve => resolve());
    return;
  }

  if (message.type === "RESPONSE" && message.id && gasBridgePending.has(message.id)) {
    const pending = gasBridgePending.get(message.id);
    gasBridgePending.delete(message.id);
    clearTimeout(pending.timer);
    pending.resolve(message.result);
  }
});

function waitForGasBridgeReady() {
  if (gasBridgeReady) return Promise.resolve();
  ensureGasBridge();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = gasBridgeReadyWaiters.indexOf(onReady);
      if (index >= 0) gasBridgeReadyWaiters.splice(index, 1);
      gasBridgeDownUntil = Date.now() + GAS_BRIDGE_COOLDOWN_MS;
      reject(makeBridgeTransportError("Google Apps Script bridge did not become ready", false));
    }, GAS_BRIDGE_READY_TIMEOUT_MS);
    function onReady() {
      clearTimeout(timer);
      resolve();
    }
    gasBridgeReadyWaiters.push(onReady);
  });
}

async function requestViaGasBridge(path, options, headers) {
  // پل فقط متن (JSON) را منتقل می‌کند. FormData/Blob با postMessage قابل ارسال
  // نیست و باعث DataCloneError می‌شد؛ پس قبل از هر کاری روشن رد می‌کنیم.
  if (options.body !== undefined && options.body !== null && typeof options.body !== "string") {
    throw makeBridgeTransportError("ارسال فایل از مسیر پشتیبان ممکن نیست. اتصال مستقیم به سرور لازم است.", false);
  }

  await waitForGasBridgeReady();
  const id = "gas-" + Date.now() + "-" + (++gasBridgeRequestId);
  const request = {
    path: path,
    method: String(options.method || "GET").toUpperCase(),
    headers: headers,
    body: options.body === undefined ? null : options.body
  };

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      gasBridgePending.delete(id);
      reject(makeBridgeTransportError("Google Apps Script bridge request timed out", true));
    }, GAS_BRIDGE_TIMEOUT_MS);
    gasBridgePending.set(id, { resolve, reject, timer });
    // مقصد اصلی: پنجرهٔ داخلی پل (از پیام READY). اگر به هر دلیل ثبت نشده بود،
    // مثل قبل به پنجرهٔ iframe می‌فرستیم.
    const target = gasBridgeTarget || gasBridgeFrame.contentWindow;
    try {
      target.postMessage({
        source: "MOSHKFAM_SITE",
        type: "REQUEST",
        id: id,
        request: request
      }, "*");
    } catch (postError) {
      clearTimeout(timer);
      gasBridgePending.delete(id);
      reject(makeBridgeTransportError(postError && postError.message ? postError.message : String(postError), false));
    }
  });

  if (!result || result.transportOk !== true) {
    throw makeBridgeTransportError(result && result.body ? result.body : "Google Apps Script bridge transport failed", true);
  }

  let data = null;
  try {
    data = result.body ? JSON.parse(result.body) : null;
  } catch (_) {
    data = result.body;
  }

  if (result.status < 200 || result.status >= 300) {
    const message = data && typeof data === "object" && data.error
      ? data.error
      : "HTTP " + result.status;
    throw new Error(message);
  }
  return data;
}

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
let adminPermissions = [];
const ADMIN_PERMISSION_KEYS = ["products","customers","prices","requests","footer"];



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

function normalizeNumericValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬،]/g, ",")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value) {
  const n = normalizeNumericValue(value);
  if (n === null) return "";
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
  const custom = normalizeNumericValue(product?.custom_price);
  if (custom !== null) return custom;
  return normalizeNumericValue(product?.base_price);
}

function getPriceText(product) {
  const publicPrice = normalizeNumericValue(product?.base_price);
  const customPrice = normalizeNumericValue(product?.custom_price);
  const hasPublic = publicPrice !== null;
  const hasCustom = customPrice !== null;
  const publicCurrency = product?.base_currency || "تومان";
  const customCurrency = product?.custom_currency || publicCurrency;
  if (hasCustom && (!hasPublic || customPrice !== publicPrice)) {
    return `<div class="price price-custom-wrap"><span class="public-price-old">${formatNumber(publicPrice)} ${escapeHtml(publicCurrency)}</span><span class="custom-price-current">${formatNumber(customPrice)} ${escapeHtml(customCurrency)}</span></div>`;
  }
  if (hasPublic) return `<div class="price">${formatNumber(publicPrice)} ${escapeHtml(publicCurrency)}</div>`;
  return `<div class="price private-price">برای اطلاع از قیمت تماس بگیرید.</div>`;
}

function normalizeDigits(value){
  return String(value ?? "").replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function getProductPackageKg(product){
  const raw=normalizeDigits(product?.package||"").replace(/٬/g,",").replace(/,/g,".");
  const m=raw.match(/(\d+(?:\.\d+)?)\s*(?:کیلوگرم|کیلوگرمی|کیلو|kg|kgs)/i);
  const kg=m?Number(m[1]):NaN;
  return Number.isFinite(kg)&&kg>0?kg:1;
}
function formatDecimal(value){
  const n=Number(value);
  if(!Number.isFinite(n)) return "۰";
  return formatNumber(Number.isInteger(n)?n:Number(n.toFixed(3)));
}
function getCartAmountKg(item,product){
  const packageKg=getProductPackageKg(product);
  if(Number.isFinite(Number(item.amountKg)) && Number(item.amountKg)>0) return Number(item.amountKg);
  return (Number(item.quantity)||0)*packageKg;
}
function getCartUnitValue(item,product){
  const kg=getCartAmountKg(item,product);
  return item.unit==="ton" ? kg/1000 : kg;
}
function cartStorageKey(){
  const id = currentUser?.id || currentUser?.telegram_user_id || currentUser?.username || "guest";
  return "moshkfam_cart_" + String(id);
}
function loadCart(){
  try{
    cartItems=JSON.parse(localStorage.getItem(cartStorageKey())||"{}");
    Object.values(cartItems).forEach(item=>{
      const p=products.find(x=>Number(x.id)===Number(item.productId));
      if(p){
        item.unit=item.unit==="ton"?"ton":"kg";
        item.amountKg=getCartAmountKg(item,p);
        item.quantity=Math.round(item.amountKg/getProductPackageKg(p));
      }
    });
  }catch{cartItems={};}
  updateCartBadge();
}
function saveCart(){try{localStorage.setItem(cartStorageKey(),JSON.stringify(cartItems));}catch{}updateCartBadge();}
function updateCartBadge(){
  const badge=$("cartCount"); if(!badge)return;
  const n=Object.keys(cartItems).length;
  badge.textContent=formatNumber(n); badge.classList.toggle("empty",n===0);
}
let cartToastTimer = null;
function showCartToast(message = "به سبد خرید اضافه شد") {
  let toast = $("cartToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "cartToast";
    toast.className = "cart-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = `✓ ${message}`;
  toast.classList.remove("show", "hide");
  void toast.offsetWidth;
  toast.classList.add("show");
  clearTimeout(cartToastTimer);
  cartToastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(() => toast.classList.remove("hide"), 280);
  }, 1700);
}

function addToCart(productId,event){
  if(event){event.preventDefault();event.stopPropagation();}
  if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری خود شوید.");return;}
  const product=products.find(p=>Number(p.id)===Number(productId));
  if(!product){appAlert("❌ محصول پیدا نشد.");return;}
  const price=getEffectivePrice(product);
  if(!Number.isFinite(price)){appAlert("⚠️ این محصول هنوز قیمت مشخصی ندارد.");return;}
  const key=String(productId), packageKg=getProductPackageKg(product);
  if(!cartItems[key]) cartItems[key]={productId:Number(productId),quantity:1,amountKg:packageKg,unit:"kg"};
  else{
    cartItems[key].unit=cartItems[key].unit==="ton"?"ton":"kg";
    cartItems[key].amountKg=getCartAmountKg(cartItems[key],product)+packageKg;
    cartItems[key].quantity=Math.round(cartItems[key].amountKg/packageKg);
  }
  saveCart();
  showCartToast("به سبد خرید اضافه شد");
}
function changeCartQty(productId,delta){
  const key=String(productId); if(!cartItems[key])return;
  const p=products.find(x=>Number(x.id)===Number(productId)); if(!p)return;
  const packageKg=getProductPackageKg(p);
  const currentKg=getCartAmountKg(cartItems[key],p);
  const nextKg=Math.max(0,currentKg+(Number(delta)||0)*packageKg);
  if(nextKg===0){delete cartItems[key];}
  else{cartItems[key].amountKg=nextKg;cartItems[key].quantity=Math.round(nextKg/packageKg);}
  saveCart();renderCart();
}
function setCartUnit(productId,unit){
  const key=String(productId); if(!cartItems[key])return;
  cartItems[key].unit=unit==="ton"?"ton":"kg";
  saveCart();renderCart();
}
function updateCartAmountLive(productId,value){
  const key=String(productId); if(!cartItems[key])return;
  const p=products.find(x=>Number(x.id)===Number(productId)); if(!p)return;
  const unit=cartItems[key].unit==="ton"?"ton":"kg";
  const entered=Number(normalizeDigits(value).replace(/,/g,"."));
  if(!Number.isFinite(entered)||entered<=0)return;
  const amountKg=unit==="ton"?entered*1000:entered;
  const packageKg=getProductPackageKg(p);
  const packages=amountKg/packageKg;
  const price=getEffectivePrice(p);
  if(!Number.isFinite(price))return;
  const lineTotal=price*packages;
  const lineEl=$("cart-line-total-"+Number(productId));
  if(lineEl) lineEl.textContent=formatNumber(Math.round(lineTotal))+" تومان";
  const helpEl=$("cart-weight-help-"+Number(productId));
  if(helpEl) helpEl.innerHTML=`مقدار سفارش: <b>${formatDecimal(amountKg)} کیلوگرم</b> · معادل <b>${formatDecimal(packages)} بسته ${formatDecimal(packageKg)} کیلویی</b>`;
  let grand=0;
  Object.values(cartItems).forEach(item=>{
    const pr=products.find(x=>Number(x.id)===Number(item.productId));
    if(!pr) return;
    const effectivePrice=getEffectivePrice(pr);
    if(!Number.isFinite(effectivePrice)) return;
    if(String(item.productId)===key) grand+=lineTotal;
    else grand+=effectivePrice*(Number(item.quantity)||0);
  });
  const totalEl=$("cartTotal");
  if(totalEl) totalEl.textContent=formatNumber(Math.round(grand))+" تومان";
  // Live update: keep the package count synchronized with the entered amount.
  const qtyEl=document.getElementById(`cart-package-count-${Number(productId)}`);
  if(qtyEl) qtyEl.textContent=formatDecimal(packages)+" بسته";
}
function setCartAmount(productId,value){
  const key=String(productId); if(!cartItems[key])return;
  const p=products.find(x=>Number(x.id)===Number(productId)); if(!p)return;
  const unit=cartItems[key].unit==="ton"?"ton":"kg";
  const entered=Number(normalizeDigits(value).replace(/,/g,"."));
  if(!Number.isFinite(entered)||entered<=0){return;}
  const amountKg=unit==="ton"?entered*1000:entered;
  const packageKg=getProductPackageKg(p);
  const packages=amountKg/packageKg;
  if(Math.abs(packages-Math.round(packages))>1e-9){
    appAlert(`⚠️ مقدار ${formatDecimal(amountKg)} کیلوگرم برای بسته ${formatDecimal(packageKg)} کیلوگرمی قابل ثبت نیست.\nلطفاً مقدار را مضربی از ${formatDecimal(packageKg)} کیلوگرم وارد کنید.`);
    renderCart();return;
  }
  cartItems[key].amountKg=amountKg;
  cartItems[key].quantity=Math.round(packages);
  saveCart();renderCart();
}
function removeFromCart(productId){delete cartItems[String(productId)];saveCart();renderCart();appAlert("✅ کالا از سبد خرید حذف شد.");}
function openCart(){if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری خود شوید.");return;}loadCart();renderCart();$("cartModal")?.classList.remove("hidden");}
function closeCart(){$("cartModal")?.classList.add("hidden");}
function renderCart(){
  const box=$("cartItems"),totalEl=$("cartTotal"); if(!box)return;
  const rows=Object.values(cartItems).filter(x=>(Number(x.quantity)||0)>0).map(item=>{
    const p=products.find(x=>Number(x.id)===Number(item.productId)); if(!p)return "";
    const price=getEffectivePrice(p), packageKg=getProductPackageKg(p), amountKg=getCartAmountKg(item,p), unit=item.unit==="ton"?"ton":"kg", unitValue=getCartUnitValue(item,p), total=price*(Number(item.quantity)||0);
    return `<div class="cart-row cart-row-weight">
      <div class="cart-row-info"><strong>${escapeHtml(p.name_fa||p.name_en||"محصول")}</strong><span>${formatNumber(price)} ${escapeHtml(p.base_currency||"تومان")} · بسته ${formatDecimal(packageKg)} کیلوگرمی</span></div>
      <div class="cart-weight-editor">
        <label>واحد<select onchange="setCartUnit(${Number(p.id)},this.value)"><option value="kg" ${unit==="kg"?"selected":""}>کیلوگرم</option><option value="ton" ${unit==="ton"?"selected":""}>تن</option></select></label>
        <label>مقدار<input type="number" min="0.001" step="0.001" value="${unitValue}" oninput="updateCartAmountLive(${Number(p.id)},this.value)" onchange="setCartAmount(${Number(p.id)},this.value)" onkeydown="if(event.key==='Enter'){this.blur();}"></label>
      </div>
      <div class="cart-qty"><button type="button" onclick="changeCartQty(${Number(p.id)},-1)">−</button><b id="cart-package-count-${Number(p.id)}">${formatNumber(item.quantity)} بسته</b><button type="button" onclick="changeCartQty(${Number(p.id)},1)">+</button></div>
      <strong id="cart-line-total-${Number(p.id)}" class="cart-line-total">${formatNumber(total)} تومان</strong>
      <button type="button" class="cart-remove" onclick="removeFromCart(${Number(p.id)})">🗑️</button>
      <div id="cart-weight-help-${Number(p.id)}" class="cart-weight-help">مقدار سفارش: <b>${formatDecimal(amountKg)} کیلوگرم</b> · معادل <b>${formatNumber(item.quantity)} بسته ${formatDecimal(packageKg)} کیلویی</b></div>
    </div>`;
  }).filter(Boolean);
  box.innerHTML=rows.length?rows.join(""):"<div class=\"message\">سبد خرید خالی است.</div>";
  const total=Object.values(cartItems).reduce((sum,item)=>{const p=products.find(x=>Number(x.id)===Number(item.productId));const price=getEffectivePrice(p);return sum+(Number.isFinite(price)?price*(Number(item.quantity)||0):0)},0);
  if(totalEl)totalEl.textContent=formatNumber(total)+" تومان";
}
let cartOrderSubmitting=false;
async function submitCartOrder(){
  if(cartOrderSubmitting)return;
  if(!currentUser){appAlert("⚠️ ابتدا وارد حساب کاربری شوید.");return;}
  const entries=Object.values(cartItems).filter(x=>(Number(x.quantity)||0)>0); if(!entries.length){appAlert("⚠️ سبد خرید خالی است.");return;}
  cartOrderSubmitting=true;
  const submitButton=document.querySelector('#cartModal .cart-submit');
  const originalText=submitButton?.textContent||'📨 ثبت سفارش سبد خرید';
  if(submitButton){submitButton.disabled=true;submitButton.dataset.originalText=originalText;submitButton.textContent='⏳ لطفاً منتظر بمانید...';submitButton.classList.add('is-submitting');$('cartModal')?.classList.add('is-submitting');}
  const lines=entries.map(item=>{
    const p=products.find(x=>Number(x.id)===Number(item.productId)); if(!p)return "";
    const price=getEffectivePrice(p),packageKg=getProductPackageKg(p),amountKg=getCartAmountKg(item,p),unit=item.unit==="ton"?"ton":"kg",unitValue=getCartUnitValue(item,p);
    return `${p.name_fa||p.name_en||"محصول"} × ${formatDecimal(unitValue)} ${unit==="ton"?"تن":"کیلوگرم"} = ${formatNumber(item.quantity)} بسته ${formatDecimal(packageKg)} کیلویی = ${formatNumber(price*(Number(item.quantity)||0))} تومان`;
  }).filter(Boolean);
  const total=entries.reduce((sum,item)=>{const p=products.find(x=>Number(x.id)===Number(item.productId));const price=getEffectivePrice(p);return sum+(Number.isFinite(price)?price*(Number(item.quantity)||0):0)},0);
  try{const cartText="🛒 سفارش سبد خرید\n"+lines.join("\n")+`\nمجموع: ${formatNumber(total)} تومان`; await postJson("/api/customer/request",{type:"order",text:cartText}); cartItems={};saveCart();renderCart();closeCart();await loadOrderHistoryCount();appAlert("✅ سفارش سبد خرید با موفقیت ثبت شد.");}catch(e){appAlert("❌ ثبت سفارش انجام نشد:\n"+(e.message||"خطای نامشخص"));}
  finally{cartOrderSubmitting=false;if(submitButton){submitButton.disabled=false;submitButton.textContent=submitButton.dataset.originalText||originalText;submitButton.classList.remove('is-submitting');}$('cartModal')?.classList.remove('is-submitting');}
}


/* =========================================================
   BOOT DIAGNOSTIC
   Enable with ?debug=1
========================================================= */
const MOSHKFAM_DEBUG = new URLSearchParams(window.location.search).get("debug") === "1";
const bootDiagnostics = [];
const bootStartedAt = performance.now();
let bootCurrentStage = "START";
let bootDiagnosticPanel = null;

function bootDiag(stage, status = "RUNNING", details = "") {
  const elapsed = Math.round(performance.now() - bootStartedAt);
  bootCurrentStage = stage;
  const item = { time: new Date().toISOString(), elapsed, stage, status, details: String(details || "") };
  bootDiagnostics.push(item);
  if (bootDiagnostics.length > 100) bootDiagnostics.shift();
  const line = `[BOOT +${elapsed}ms] ${stage} ${status}${details ? ` | ${details}` : ""}`;
  if (status === "ERROR") console.error(line);
  else if (status === "TIMEOUT") console.error(line);
  else console.log(line);
  try { if (window.MoshkfamBoot) window.MoshkfamBoot.onDiag(stage, status, details); } catch (_) {}
  renderBootDiagnostics();
}

function bootDiagError(stage, error) {
  const message = error?.stack || error?.message || String(error || "Unknown error");
  bootDiag(stage, "ERROR", message);
}

function renderBootDiagnostics() {
  if (!MOSHKFAM_DEBUG) return;
  if (!bootDiagnosticPanel) {
    bootDiagnosticPanel = document.createElement("div");
    bootDiagnosticPanel.id = "moshkfamBootDiagnostics";
    bootDiagnosticPanel.dir = "ltr";
    bootDiagnosticPanel.style.cssText = [
      "position:fixed","left:10px","right:10px","bottom:10px","z-index:100000",
      "max-height:46vh","overflow:auto","padding:12px","border-radius:12px",
      "background:rgba(15,23,42,.96)","color:#e2e8f0","font:12px/1.55 monospace",
      "box-shadow:0 10px 35px rgba(0,0,0,.35)","white-space:pre-wrap"
    ].join(";");
    document.body.appendChild(bootDiagnosticPanel);
  }
  const recent = bootDiagnostics.slice(-18).map(x => {
    const icon = x.status === "OK" ? "✓" : x.status === "ERROR" || x.status === "TIMEOUT" ? "✗" : "→";
    return `${icon} +${x.elapsed}ms  ${x.stage}  ${x.status}${x.details ? `\n    ${x.details}` : ""}`;
  }).join("\n");
  bootDiagnosticPanel.textContent = `MOSHKFAM BOOT DIAGNOSTIC\nCurrent: ${bootCurrentStage}\n\n${recent}`;
}

window.MOSHKFAM_DEBUG_DUMP = () => JSON.stringify({
  currentStage: bootCurrentStage,
  elapsedMs: Math.round(performance.now() - bootStartedAt),
  url: location.href,
  userAgent: navigator.userAgent,
  entries: bootDiagnostics
}, null, 2);

bootDiag("HTML/JS", "START", MOSHKFAM_DEBUG ? "debug mode enabled" : "normal mode");

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

/* ---------------------------------------------------------
   حالت مسیر ارتباط با سرور (برای هر دستگاه جدا ذخیره می‌شود)

   "google" (پیش‌فرض): درخواست‌های متنی اول از پل Google Apps Script می‌روند
                        (برای شبکه‌هایی که IPهای Cloudflare در آن‌ها بسته است).
                        اگر پل بالا نیامد، مستقیم به Worker.
                        آپلود فایل همیشه مستقیم به Worker می‌رود (پل فقط متن می‌برد).
   "auto":             اول Worker، و اگر در دسترس نبود پل Google (رفتار قبلی).
   "worker":           فقط مستقیم به Worker.

   تغییر حالت: یک بار آدرس سایت را با ?api=google یا ?api=auto یا ?api=worker باز کنید.
--------------------------------------------------------- */
const API_MODE_STORAGE_KEY = "moshkfam_api_mode";
const API_MODES = ["google", "auto", "worker"];
const API_MODE_DEFAULT = "google";

function normalizeApiMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return API_MODES.indexOf(mode) >= 0 ? mode : "";
}

function setApiMode(mode) {
  const normalized = normalizeApiMode(mode);
  if (!normalized) return false;
  try { localStorage.setItem(API_MODE_STORAGE_KEY, normalized); } catch (_) {}
  apiModeInMemory = normalized;
  return true;
}

let apiModeInMemory = "";

function getApiMode() {
  if (apiModeInMemory) return apiModeInMemory;
  let stored = "";
  try { stored = normalizeApiMode(localStorage.getItem(API_MODE_STORAGE_KEY)); } catch (_) {}
  apiModeInMemory = stored || API_MODE_DEFAULT;
  return apiModeInMemory;
}

// ?api=... در آدرس صفحه
function readApiModeFromLocation() {
  try {
    const requested = normalizeApiMode(new URLSearchParams(window.location.search).get("api"));
    if (requested) setApiMode(requested);
  } catch (_) {}
}

/* ---------------------------------------------------------
   سیاست مهلت و مسیر پشتیبان (Google Apps Script)

   - GET و POSTهای فقط‌خواندنی: اگر تا ۷ ثانیه پاسخی نیامد، مسیر پشتیبان.
   - POSTهای نوشتنی (ثبت سفارش، نامه، ویرایش، حذف و ...): فقط وقتی به مسیر
     پشتیبان می‌روند که Worker از این شبکه واقعاً در دسترس نباشد. در غیر این
     صورت ممکن بود Worker سفارش/نامه را ثبت کرده باشد ولی پاسخ دیر برسد و
     درخواست دوباره ارسال شود (ثبت تکراری).
   - آپلود فایل: بدون مهلت ۷ ثانیه‌ای و بدون مسیر پشتیبان، چون پل Google فقط
     متن (JSON) منتقل می‌کند و FormData با postMessage قابل ارسال نیست.
--------------------------------------------------------- */
const API_FIRST_RESPONSE_TIMEOUT_MS = 7000;
const API_REACHABILITY_PROBE_TIMEOUT_MS = 6000;
const API_WRITE_MAX_WAIT_MS = 60000;
const API_UPLOAD_MAX_WAIT_MS = 15 * 60 * 1000;

const API_AMBIGUOUS_WRITE_MESSAGE =
  "پاسخ سرور دریافت نشد. ممکن است درخواست شما ثبت شده باشد؛ پیش از ارسال دوباره، فهرست را بررسی کنید.";
const API_UPLOAD_FAILED_MESSAGE =
  "ارسال فایل کامل نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید. اگر مطمئن نیستید، ابتدا وضعیت فایل را در فهرست ببینید.";
const API_UPLOAD_TIMEOUT_MESSAGE =
  "زمان ارسال فایل به پایان رسید. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید (برای فایل‌های حجیم اینترنت پایدارتری لازم است).";

// مسیرهایی که با POST صدا زده می‌شوند ولی فقط می‌خوانند (یا تکرارشان بی‌ضرر است).
// ارسال دوبارهٔ خودکار آن‌ها از مسیر پشتیبان هیچ خطری ندارد.
const REPEAT_SAFE_POST_PATHS = new Set([
  "/api/login",
  "/api/logout",
  "/api/telegram-auth",
  "/api/whoami",
  "/api/admin/admin-users",
  "/api/admin/customers",
  "/api/admin/customer-prices",
  "/api/admin/customer-profile",
  "/api/admin/customer-requests",
  "/api/admin/products",
  "/api/admin/cleanup-stats",
  "/api/admin/service-limits",
  "/api/admin/letter-recipients",
  "/api/admin/letters",
  "/api/admin/letter-thread",
  "/api/admin/letters-unread-count",
  "/api/admin/unread-count",
  "/api/customer/letters",
  "/api/customer/letter-thread",
  "/api/customer/letters-unread-count",
  "/api/customer/orders"
]);

function getApiPathname(path) {
  return String(path || "").split("?")[0];
}

// بدنهٔ غیرمتنی (FormData، Blob، ArrayBuffer، stream) یعنی آپلود فایل.
function isUploadBody(body) {
  return body !== undefined && body !== null && typeof body !== "string";
}

// خروجی: "upload" | "safe" | "write"
function classifyApiRequest(path, options) {
  if (isUploadBody(options.body)) return "upload";
  const method = String(options.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return "safe";
  if (method === "POST" && REPEAT_SAFE_POST_PATHS.has(getApiPathname(path))) return "safe";
  return "write";
}

// خطای مسیر اصلی. bridgeAllowed مشخص می‌کند ارسال دوباره از مسیر پشتیبان مجاز است یا نه.
function makePrimaryApiError(original, bridgeAllowed, userMessage) {
  const error = new Error(userMessage || (original && original.message) || String(original));
  error.name = "PrimaryApiError";
  error.cause = original;
  error.bridgeAllowed = bridgeAllowed === true;
  return error;
}

// آیا مسیر شبکه تا Worker باز است؟ هر پاسخ HTTP (حتی خطا) یعنی بله.
async function isPrimaryApiReachable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_REACHABILITY_PROBE_TIMEOUT_MS);
  try {
    await fetch(buildApiUrl("/api/test"), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    return true;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromPrimaryApi(apiUrl, options, headers, requestKind) {
  const controller = new AbortController();
  const fetchOptions = {
    ...options,
    cache: "no-store",
    headers,
    signal: controller.signal
  };

  // 1) آپلود فایل: فقط سقف طولانی؛ مسیر پشتیبان ممکن نیست.
  if (requestKind === "upload") {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, API_UPLOAD_MAX_WAIT_MS);
    try {
      return await fetch(apiUrl, fetchOptions);
    } catch (error) {
      throw makePrimaryApiError(
        error,
        false,
        timedOut ? API_UPLOAD_TIMEOUT_MESSAGE : API_UPLOAD_FAILED_MESSAGE
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // 2) خواندنی/بی‌خطر: ۷ ثانیه، سپس مسیر پشتیبان (رفتار قبلی).
  if (requestKind === "safe") {
    const timer = setTimeout(() => controller.abort(), API_FIRST_RESPONSE_TIMEOUT_MS);
    try {
      return await fetch(apiUrl, fetchOptions);
    } catch (error) {
      throw makePrimaryApiError(error, true);
    } finally {
      clearTimeout(timer);
    }
  }

  // 3) نوشتنی: درخواست اصلی را تا سقف ۶۰ ثانیه منتظر می‌مانیم. اگر بعد از ۷ ثانیه
  // هنوز جوابی نیامده، یک آزمایش سبک (/api/test) می‌زنیم:
  //   - Worker در دسترس است  -> درخواست احتمالاً رسیده؛ صبر می‌کنیم (ارسال دوباره نمی‌کنیم)
  //   - Worker در دسترس نیست -> درخواست قطعاً به سرور نرسیده؛ مسیر پشتیبان مجاز است
  let settled = false;
  let abortedByProbe = false;
  let abortedByLimit = false;

  const limitTimer = setTimeout(() => {
    abortedByLimit = true;
    controller.abort();
  }, API_WRITE_MAX_WAIT_MS);

  const probeTimer = setTimeout(async () => {
    if (settled) return;
    const reachable = await isPrimaryApiReachable();
    if (settled || reachable) return;
    abortedByProbe = true;
    controller.abort();
  }, API_FIRST_RESPONSE_TIMEOUT_MS);

  const finish = () => {
    settled = true;
    clearTimeout(limitTimer);
    clearTimeout(probeTimer);
  };

  try {
    const response = await fetch(apiUrl, fetchOptions);
    finish();
    return response;
  } catch (error) {
    finish();
    if (abortedByLimit) {
      throw makePrimaryApiError(error, false, API_AMBIGUOUS_WRITE_MESSAGE);
    }
    if (abortedByProbe) {
      throw makePrimaryApiError(error, true);
    }
    // خطای سریع شبکه (قبل از ۷ ثانیه): فقط اگر Worker واقعاً در دسترس نیست مسیر پشتیبان.
    const reachable = await isPrimaryApiReachable();
    throw reachable
      ? makePrimaryApiError(error, false, API_AMBIGUOUS_WRITE_MESSAGE)
      : makePrimaryApiError(error, true);
  }
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

  const requestStage = `WORKER ${path}`;
  const apiUrl = buildApiUrl(path);
  bootDiag(requestStage, "START", apiUrl);

  const requestKind = classifyApiRequest(path, options);
  const apiMode = getApiMode();

  // حالت google: اول پل Google (به‌جز آپلود فایل). فقط وقتی پل در همین چند لحظهٔ اخیر
  // بالا نیامده بود، مستقیم به Worker می‌رویم.
  let bridgeAlreadyTried = false;
  if (apiMode === "google" && requestKind !== "upload" && Date.now() >= gasBridgeDownUntil) {
    const bridgeStage = `GOOGLE BRIDGE ${path}`;
    bridgeAlreadyTried = true;
    bootDiag(bridgeStage, "START", GAS_BRIDGE_URL);
    try {
      const bridgeData = await requestViaGasBridge(path, options, headers);
      bootDiag(bridgeStage, "OK", "Bridge response received");
      return bridgeData;
    } catch (bridgeError) {
      const bridgeReason = bridgeError?.message || String(bridgeError);
      // پاسخ واقعی سرور (مثلاً HTTP 400) خطای انتقال نیست؛ همان‌طور نمایش داده می‌شود.
      if (!bridgeError || bridgeError.bridgeTransport !== true) {
        bootDiag(bridgeStage, "ERROR", bridgeReason);
        throw bridgeError;
      }
      // نوشتنی که به پل فرستاده شده ولی پاسخش نرسیده، ممکن است ثبت شده باشد: ارسال دوباره ممنوع.
      if (requestKind === "write" && bridgeError.requestSent === true) {
        bootDiag(bridgeStage, "ERROR", bridgeReason + " | write may have been delivered; no resend");
        throw makePrimaryApiError(bridgeError, false, API_AMBIGUOUS_WRITE_MESSAGE);
      }
      bootDiag(bridgeStage, "ERROR", bridgeReason + " | trying direct Worker");
    }
  }

  let response;
  try {
    // Do not let an unreachable HTTPS Worker freeze startup indefinitely.
    // Read-only requests abort after 7 seconds so the Google Apps Script
    // fallback can run. Uploads and writes follow the safer policy above.
    response = await fetchFromPrimaryApi(apiUrl, options, headers, requestKind);
  } catch (primaryError) {
    const primaryReason = primaryError?.message || String(primaryError);

    // ارسال دوباره از مسیر پشتیبان فقط برای درخواست‌های بی‌خطر مجاز است؛
    // و فقط در حالت auto (در حالت google پل قبلاً امتحان شده، در حالت worker ممنوع است).
    if (apiMode !== "auto" || bridgeAlreadyTried || !primaryError || primaryError.bridgeAllowed !== true) {
      bootDiag(requestStage, "ERROR", primaryReason + " | no Google Apps Script fallback (" + requestKind + ", mode " + apiMode + ")");
      throw primaryError instanceof Error ? primaryError : new Error(primaryReason);
    }

    bootDiag(requestStage, "ERROR", primaryReason + " | trying Google Apps Script fallback");
    const fallbackStage = `GOOGLE BRIDGE ${path}`;
    bootDiag(fallbackStage, "START", GAS_BRIDGE_URL);
    try {
      const fallbackData = await requestViaGasBridge(path, options, headers);
      bootDiag(fallbackStage, "OK", "Fallback response received");
      return fallbackData;
    } catch (fallbackError) {
      bootDiag(fallbackStage, "ERROR", fallbackError?.message || String(fallbackError));
      throw fallbackError;
    }
  }

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  bootDiag(requestStage, response.ok ? "OK" : "ERROR", `HTTP ${response.status}`);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && data.error
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


readApiModeFromLocation();
// در حالت google، پل را زود بالا می‌آوریم تا اولین درخواست معطل نماند.
if (getApiMode() === "google") {
  try { ensureGasBridge(); } catch (_) {}
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
  try{const r=await postJson("/api/login",{username,password});setStoredToken(r.token);currentUser=r.user||null;isAdmin=String(r.user?.role||"").toLowerCase()==="admin" || String(r.user?.role||"").toLowerCase()==="super_admin";adminPermissions=[];try{const session=await apiRequest("/api/session",{method:"GET"});if(session?.authenticated&&session.user){currentUser=session.user;isAdmin=!!session.isAdmin || String(session.user.role||"").toLowerCase()==="admin" || String(session.user.role||"").toLowerCase()==="super_admin";adminPermissions=Array.isArray(session.permissions)?session.permissions:[];}}catch(sessionError){console.warn("Login permission session:",sessionError);}if($("loginPassword"))$("loginPassword").value="";if(msg)msg.textContent="✅ ورود با موفقیت انجام شد.";updateAccountUI();loadCart();await loadProducts();await loadOrderHistoryCount();if(currentUser){await loadLetterUnreadCount();startLetterPolling();}}catch(e){if(msg)msg.textContent=e.message||"ورود انجام نشد.";}
}
async function loadWebSession(){const t=getStoredToken();if(!t){updateAccountUI();return;}try{const r=await apiRequest("/api/session",{method:"GET"});if(r?.authenticated&&r.user){currentUser=r.user;isAdmin=!!r.isAdmin || String(r.user.role||"").toLowerCase()==="admin" || String(r.user.role||"").toLowerCase()==="super_admin";adminPermissions=Array.isArray(r.permissions)?r.permissions:[];updateAccountUI();loadCart();await loadOrderHistoryCount();if(currentUser){await loadLetterUnreadCount();startLetterPolling();}}else{currentUser=null;isAdmin=false;adminPermissions=[];setStoredToken("");updateAccountUI();}}catch(error){console.warn("Web session check:",error);/* شبکه/لود موقت نباید تب‌های دیگر را با پاک کردن localStorage خارج کند. */}}

window.addEventListener("storage", function(event){if(event.key!=="moshkfam_session")return;loadWebSession();});
async function logoutUser(){try{await apiRequest("/api/logout",{method:"POST"});}catch{}setStoredToken("");currentUser=null;isAdmin=false;cartItems={};updateCartBadge();updateAccountUI();await loadProducts();}
async function loadSiteSettings(){bootDiag("SITE SETTINGS", "START");try{const r=await get("/api/site-settings"),st=r?.settings||{};if($("footerCompanyName"))$("footerCompanyName").textContent="🌱 "+(st.company_name||"مشکفام فارس");if($("footerText"))$("footerText").textContent=st.footer_text||"";if($("footerPhone"))$("footerPhone").textContent=st.phone?"☎️ "+st.phone:"";if($("footerAddress"))$("footerAddress").textContent=st.address?"📍 "+st.address:"";if($("settingCompanyName"))$("settingCompanyName").value=st.company_name||"مشکفام فارس";if($("settingFooterText"))$("settingFooterText").value=st.footer_text||"";if($("settingPhone"))$("settingPhone").value=st.phone||"";if($("settingAddress"))$("settingAddress").value=st.address||"";if($("salesSettingCompanyName"))$("salesSettingCompanyName").value=st.company_name||"مشکفام فارس";if($("salesSettingFooterText"))$("salesSettingFooterText").value=st.footer_text||"";if($("salesSettingPhone"))$("salesSettingPhone").value=st.phone||"";if($("salesSettingAddress"))$("salesSettingAddress").value=st.address||"";}catch(e){bootDiagError("SITE SETTINGS",e);console.warn("Settings:",e);}}
async function saveSalesSettings(){try{await postJson("/api/admin/site-settings",{company_name:$("salesSettingCompanyName")?.value.trim()||"مشکفام فارس",footer_text:$("salesSettingFooterText")?.value||"",phone:$("salesSettingPhone")?.value.trim()||"",address:$("salesSettingAddress")?.value||""});await loadSiteSettings();appAlert("✅ تنظیمات با موفقیت ذخیره شد.");}catch(e){appAlert("❌ ذخیره تنظیمات انجام نشد:\n"+(e.message||"خطای نامشخص"));}}
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
function togglePasswordVisibility(inputId, buttonId) {
  const input = $(inputId);
  const button = $(buttonId);
  if (!input) return;
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  if (button) {
    button.textContent = showing ? "👁️" : "🙈";
    button.setAttribute("aria-label", showing ? "نمایش رمز عبور" : "مخفی کردن رمز عبور");
    button.title = showing ? "نمایش رمز عبور" : "مخفی کردن رمز عبور";
  }
}

async function createCustomerUser(){const p={first_name:$("newUserFirstName")?.value.trim(),last_name:$("newUserLastName")?.value.trim(),username:$("newUserUsername")?.value.trim(),password:$("newUserPassword")?.value||""};try{await postJson("/api/admin/create-customer",p);alert("✅ نماینده اضافه شد.");["newUserFirstName","newUserLastName","newUserUsername","newUserPassword"].forEach(id=>{if($(id))$(id).value=""});await loadCustomers();}catch(e){alert("❌ افزودن نماینده انجام نشد:\n"+e.message);}}
async function deleteCustomerUser(id){
  const customerId=String(id||"").trim();
  if(!customerId){alert("❌ شناسه نماینده مشخص نیست.");return false;}
  try{
    await postJson("/api/admin/delete-customer",{customer_id:customerId});
    alert("✅ نماینده با موفقیت حذف شد.");
    await loadCustomers();
  }catch(e){
    const detail=e?.message||String(e||"خطای نامشخص");
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
      adminPermissions = Array.isArray(result.permissions) ? result.permissions : [];
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
      adminPermissions = Array.isArray(result.permissions) ? result.permissions : [];
    }

    updateAccountUI();

  } catch (error) {
    console.warn("whoami:", error);
  }
}


