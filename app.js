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

  if (sessionToken) {
    headers["Authorization"] = "Bearer " + sessionToken;
  }

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

function getStoredToken() {
  try {
    return localStorage.getItem("moshkfam_session") || "";
  } catch {
    return "";
  }
}

function setStoredToken(t) {
  try {
    if (t) {
      localStorage.setItem("moshkfam_session", t);
    } else {
      localStorage.removeItem("moshkfam_session");
    }
  } catch {}
}

async function loginWithUsernamePassword() {
  const username =
    $("loginUsername")?.value.trim() || "";

  const password =
    $("loginPassword")?.value || "";

  const msg = $("loginMessage");

  if (!username || !password) {
    if (msg) {
      msg.textContent =
        "نام کاربری و رمز عبور را وارد کنید.";
    }

    return;
  }

  if (msg) {
    msg.textContent = "در حال ورود...";
  }

  try {
    const r = await postJson(
      "/api/login",
      {
        username,
        password
      }
    );

    setStoredToken(r.token);

    currentUser = r.user || null;
    isAdmin = false;

    if ($("loginPassword")) {
      $("loginPassword").value = "";
    }

    if (msg) {
      msg.textContent =
        "✅ ورود با موفقیت انجام شد.";
    }

    updateAccountUI();

    await loadProducts();

  } catch (e) {
    if (msg) {
      msg.textContent =
        e.message || "ورود انجام نشد.";
    }
  }
}

async function loadWebSession() {
  const t = getStoredToken();

  if (!t) return;

  try {
    const r = await apiRequest(
      "/api/session",
      {
        method: "GET"
      }
    );

    if (
      r?.authenticated &&
      r.user
    ) {
      currentUser = r.user;
      isAdmin = false;

      updateAccountUI();

    } else {
      setStoredToken("");
    }

  } catch {
    setStoredToken("");
  }
}

async function logoutUser() {
  try {
    await apiRequest(
      "/api/logout",
      {
        method: "POST"
      }
    );
  } catch {}

  setStoredToken("");

  currentUser = null;
  isAdmin = false;

  updateAccountUI();

  await loadProducts();
}

async function loadSiteSettings() {
  try {
    const r =
      await get("/api/site-settings");

    const st =
      r?.settings || {};

    if ($("footerCompanyName")) {
      $("footerCompanyName").textContent =
        "🌱 " +
        (st.company_name ||
          "مشکفام فارس");
    }

    if ($("footerText")) {
      $("footerText").textContent =
        st.footer_text || "";
    }

    if ($("footerPhone")) {
      $("footerPhone").textContent =
        st.phone
          ? "☎️ " + st.phone
          : "";
    }

    if ($("footerAddress")) {
      $("footerAddress").textContent =
        st.address
          ? "📍 " + st.address
          : "";
    }

    if ($("settingCompanyName")) {
      $("settingCompanyName").value =
        st.company_name ||
        "مشکفام فارس";
    }

    if ($("settingFooterText")) {
      $("settingFooterText").value =
        st.footer_text || "";
    }

    if ($("settingPhone")) {
      $("settingPhone").value =
        st.phone || "";
    }

    if ($("settingAddress")) {
      $("settingAddress").value =
        st.address || "";
    }

  } catch (e) {
    console.warn(
      "Settings:",
      e
    );
  }
}

async function saveSiteSettings() {
  try {
    await postJson(
      "/api/admin/site-settings",
      {
        company_name:
          $("settingCompanyName")
            ?.value.trim() ||
          "مشکفام فارس",

        footer_text:
          $("settingFooterText")
            ?.value || "",

        phone:
          $("settingPhone")
            ?.value.trim() || "",

        address:
          $("settingAddress")
            ?.value || ""
      }
    );

    await loadSiteSettings();

    alert(
      "✅ اطلاعات پایین صفحه ذخیره شد."
    );

  } catch (e) {
    alert(
      "❌ ذخیره تنظیمات انجام نشد:\n" +
      e.message
    );
  }
}

async function createProduct() {
  const p = {
    name_fa:
      $("newProductNameFa")
        ?.value.trim(),

    name_en:
      $("newProductNameEn")
        ?.value.trim(),

    category:
      $("newProductCategory")
        ?.value.trim(),

    package:
      $("newProductPackage")
        ?.value.trim(),

    maker:
      $("newProductMaker")
        ?.value.trim(),

    base_price:
      $("newProductPrice")
        ?.value.trim() || null
  };

  if (!p.name_fa) {
    alert(
      "نام فارسی محصول را وارد کنید."
    );

    return;
  }

  try {
    await postJson(
      "/api/admin/create-product",
      p
    );

    alert(
      "✅ محصول جدید ایجاد شد."
    );

    [
      "newProductNameFa",
      "newProductNameEn",
      "newProductCategory",
      "newProductPackage",
      "newProductMaker",
      "newProductPrice"
    ].forEach(id => {
      if ($(id)) {
        $(id).value = "";
      }
    });

    await loadProducts();
    await loadAdminProducts();

  } catch (e) {
    alert(
      "❌ افزودن محصول انجام نشد:\n" +
      e.message
    );
  }
}

async function deleteProduct(id) {
  if (
    !confirm(
      "آیا از حذف کامل این محصول مطمئن هستید؟"
    )
  ) {
    return;
  }

  try {
    await postJson(
      "/api/admin/delete-product",
      {
        product_id: Number(id)
      }
    );

    alert(
      "✅ محصول حذف شد."
    );

    await loadProducts();
    await loadAdminProducts();

  } catch (e) {
    alert(
      "❌ حذف محصول انجام نشد:\n" +
      e.message
    );
  }
}

async function createCustomerUser() {
  const p = {
    first_name:
      $("newUserFirstName")
        ?.value.trim(),

    last_name:
      $("newUserLastName")
        ?.value.trim(),

    username:
      $("newUserUsername")
        ?.value.trim(),

    password:
      $("newUserPassword")
        ?.value || ""
  };

  try {
    await postJson(
      "/api/admin/create-customer",
      p
    );

    alert(
      "✅ نماینده اضافه شد."
    );

    [
      "newUserFirstName",
      "newUserLastName",
      "newUserUsername",
      "newUserPassword"
    ].forEach(id => {
      if ($(id)) {
        $(id).value = "";
      }
    });

    await loadCustomers();

  } catch (e) {
    alert(
      "❌ افزودن نماینده انجام نشد:\n" +
      e.message
    );
  }
}

async function deleteCustomerUser(id) {
  if (
    !confirm(
      "آیا از حذف این نماینده مطمئن هستید؟"
    )
  ) {
    return;
  }

  try {
    await postJson(
      "/api/admin/delete-customer",
      {
        customer_id: String(id)
      }
    );

    alert(
      "✅ نماینده حذف شد."
    );

    await loadCustomers();

  } catch (e) {
    alert(
      "❌ حذف نماینده انجام نشد:\n" +
      e.message
    );
  }
}

async function updateCustomerUser(id) {
  const p = {
    customer_id:
      String(id),

    first_name:
      $("ufirst-" + id)
        ?.value.trim() || "",

    last_name:
      $("ulast-" + id)
        ?.value.trim() || "",

    username:
      $("uuser-" + id)
        ?.value.trim() || "",

    status:
      $("ustatus-" + id)
        ?.value || "active"
  };

  const pass =
    $("upass-" + id)
      ?.value || "";

  if (pass) {
    p.password = pass;
  }

  try {
    await postJson(
      "/api/admin/customer-profile",
      p
    );

    alert(
      "✅ اطلاعات نماینده ذخیره شد."
    );

    await loadCustomers();

  } catch (e) {
    alert(
      "❌ ویرایش نماینده انجام نشد:\n" +
      e.message
    );
  }
}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function authenticate() {
  if (!tg || !tg.initData) {
    return;
  }

  try {
    const result =
      await postJson(
        "/api/telegram-auth",
        {
          initData: tg.initData
        }
      );

    if (
      result &&
      result.user
    ) {
      currentUser =
        result.user;
    }

    if (
      result &&
      result.isAdmin
    ) {
      isAdmin = true;
    }

    updateAccountUI();

  } catch (error) {
    console.warn(
      "Telegram authentication failed:",
      error
    );
  }
}

async function loadCurrentUser() {
  if (!tg || !tg.initData) {
    return;
  }

  try {
    const result =
      await postJson(
        "/api/whoami",
        {
          initData: tg.initData
        }
      );

    if (
      result &&
      result.user
    ) {
      currentUser =
        result.user;
    }

    if (
      result &&
      typeof result.isAdmin ===
        "boolean"
    ) {
      isAdmin =
        result.isAdmin;
    }

    updateAccountUI();

  } catch (error) {
    console.warn(
      "whoami:",
      error
    );
  }
}


/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI() {
  const account =
    $("account");

  const adminButton =
    $("adminButton");

  const loginBox =
    $("loginBox");

  const logoutButton =
    $("logoutButton");

  if (!currentUser) {
    if (loginBox) {
      loginBox.classList.remove(
        "hidden"
      );
    }

    if (logoutButton) {
      logoutButton.classList.add(
        "hidden"
      );
    }

    if (account) {
      account.classList.add(
        "hidden"
      );
    }

    if (adminButton) {
      adminButton.classList.add(
        "hidden"
      );
    }

    return;
  }

  if (account) {
    account.classList.remove(
      "hidden"
    );
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
      ? "@" +
        currentUser.username
      : "";

  if ($("accountName")) {
    $("accountName").textContent =
      name;
  }

  if ($("accountUser")) {
    $("accountUser").textContent =
      username;
  }

  if ($("accountInfo")) {
    $("accountInfo").textContent =
      isAdmin ||
      currentUser.role === "admin"
        ? "مدیر سیستم"
        : "مشتری";
  }

  const customerButton =
    $("customerButton");

  if (loginBox) {
    loginBox.classList.add(
      "hidden"
    );
  }

  if (logoutButton) {
    logoutButton.classList.remove(
      "hidden"
    );
  }

  if (adminButton) {
         if (adminButton) {
      if (
        isAdmin ||
        currentUser.role === "admin"
      ) {
        adminButton.classList.remove(
          "hidden"
        );
      } else {
        adminButton.classList.add(
          "hidden"
        );
      }
    }
  }
}


/* =========================================================
   PRODUCTS
========================================================= */

async function loadProducts() {
  const container =
    $("products");

  if (container) {
    container.innerHTML = `
      <div class="loading">
        در حال دریافت محصولات...
      </div>
    `;
  }

  try {
    const result =
      await get("/api/products");

    products =
      Array.isArray(result)
        ? result
        : Array.isArray(result?.products)
          ? result.products
          : [];

    buildCategories();
    renderProducts();

  } catch (e) {
    console.error(
      "Products:",
      e
    );

    if (container) {
      container.innerHTML = `
        <div class="error-box">
          دریافت محصولات انجام نشد.
          <br>
          ${escapeHtml(e.message)}
        </div>
      `;
    }
  }
}

function buildCategories() {
  const set =
    new Set();

  products.forEach(product => {
    if (
      product.category &&
      String(product.category).trim()
    ) {
      set.add(
        String(product.category).trim()
      );
    }
  });

  categories =
    Array.from(set)
      .sort((a, b) =>
        a.localeCompare(
          b,
          "fa"
        )
      );

  renderCategories();
}

function renderCategories() {
  const container =
    $("categories");

  if (!container) {
    return;
  }

  let html = `
    <button
      type="button"
      class="category-btn ${
        activeCategory === ""
          ? "active"
          : ""
      }"
      data-category=""
    >
      همه محصولات
    </button>
  `;

  categories.forEach(category => {
    html += `
      <button
        type="button"
        class="category-btn ${
          activeCategory === category
            ? "active"
            : ""
        }"
        data-category="${escapeHtml(
          category
        )}"
      >
        ${escapeHtml(category)}
      </button>
    `;
  });

  container.innerHTML =
    html;

  container
    .querySelectorAll(
      ".category-btn"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          activeCategory =
            button.dataset.category ||
            "";

          renderCategories();
          renderProducts();
        }
      );
    });
}

function getFilteredProducts() {
  const search =
    $("searchInput")
      ?.value
      .trim()
      .toLowerCase() || "";

  return products.filter(
    product => {
      const category =
        String(
          product.category || ""
        );

      if (
        activeCategory &&
        category !== activeCategory
      ) {
        return false;
      }

      if (!search) {
        return true;
      }

      const text = [
        product.name_fa,
        product.name_en,
        product.category,
        product.description,
        product.short_description,
        product.maker,
        product.package
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(search);
    }
  );
}

function renderProducts() {
  const container =
    $("products");

  if (!container) {
    return;
  }

  const list =
    getFilteredProducts();

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-box">
        محصولی پیدا نشد.
      </div>
    `;

    return;
  }

  container.innerHTML =
    list
      .map(
        product =>
          createProductCard(
            product
          )
      )
      .join("");

  container
    .querySelectorAll(
      "[data-product-id]"
    )
    .forEach(card => {
      card.addEventListener(
        "click",
        () => {
          const id =
            Number(
              card.dataset.productId
            );

          openProductModal(id);
        }
      );
    });
}

function createProductCard(
  product
) {
  const id =
    Number(product.id);

  const image =
    product.image_url ||
    product.image ||
    product.catalog_url ||
    "";

  const imageHtml =
    image
      ? `
        <div class="product-image">
          <img
            src="${escapeHtml(
              image
            )}"
            alt="${escapeHtml(
              product.name_fa ||
              ""
            )}"
            loading="lazy"
            onerror="this.parentElement.classList.add('image-error')"
          >
        </div>
      `
      : `
        <div class="product-image image-placeholder">
          <span>🌱</span>
        </div>
      `;

  return `
    <article
      class="product-card"
      data-product-id="${id}"
    >

      ${imageHtml}

      <div class="product-body">

        <div class="product-title">
          ${escapeHtml(
            product.name_fa ||
            ""
          )}
        </div>

        ${
          product.name_en
            ? `
              <div class="product-name-en">
                ${escapeHtml(
                  product.name_en
                )}
              </div>
            `
            : ""
        }

        ${
          product.short_description ||
          product.description
            ? `
              <div class="product-description">
                ${escapeHtml(
                  product.short_description ||
                  product.description ||
                  ""
                )}
              </div>
            `
            : ""
        }

        ${
          product.package
            ? `
              <div class="product-package">
                📦 ${escapeHtml(
                  product.package
                )}
              </div>
            `
            : ""
        }

        ${getPriceText(product)}

      </div>

    </article>
  `;
}


/* =========================================================
   PRODUCT MODAL
========================================================= */

function openProductModal(
  productId
) {
  const product =
    products.find(
      p =>
        Number(p.id) ===
        Number(productId)
    );

  if (!product) {
    return;
  }

  const modal =
    $("productModal");

  if (!modal) {
    return;
  }

  const image =
    product.image_url ||
    product.image ||
    product.catalog_url ||
    "";

  const imageElement =
    $("modalProductImage");

  if (imageElement) {
    if (image) {
      imageElement.src =
        image;

      imageElement.alt =
        product.name_fa || "";

      imageElement.classList.remove(
        "hidden"
      );
    } else {
      imageElement.removeAttribute(
        "src"
      );

      imageElement.classList.add(
        "hidden"
      );
    }
  }

  if ($("modalProductName")) {
    $("modalProductName").textContent =
      product.name_fa || "";
  }

  if ($("modalProductNameEn")) {
    $("modalProductNameEn").textContent =
      product.name_en || "";
  }

  if ($("modalProductDescription")) {
    $("modalProductDescription").textContent =
      product.description ||
      product.short_description ||
      "";
  }

  if ($("modalProductCategory")) {
    $("modalProductCategory").textContent =
      product.category || "";
  }

  if ($("modalProductPackage")) {
    $("modalProductPackage").textContent =
      product.package
        ? "📦 " +
          product.package
        : "";
  }

  if ($("modalProductMaker")) {
    $("modalProductMaker").textContent =
      product.maker || "";
  }

  const price =
    $("modalProductPrice");

  if (price) {
    if (
      product.base_price !== null &&
      product.base_price !== undefined &&
      product.base_price !== ""
    ) {
      price.textContent =
        formatNumber(
          product.base_price
        ) +
        " " +
        (
          product.base_currency ||
          "تومان"
        );
    } else {
      price.textContent =
        "برای اطلاع از قیمت تماس بگیرید.";
    }
  }

  const video =
    $("modalProductVideo");

  if (video) {
    const videoUrl =
      product.video_url ||
      product.video ||
      "";

    if (videoUrl) {
      video.src =
        videoUrl;

      video.classList.remove(
        "hidden"
      );
    } else {
      video.pause();

      video.removeAttribute(
        "src"
      );

      video.load();

      video.classList.add(
        "hidden"
      );
    }
  }

  modal.classList.remove(
    "hidden"
  );

  document.body.classList.add(
    "modal-open"
  );

  /*
   * مهم:
   * بعضی نسخه‌های Telegram WebApp ممکن است
   * BackButton را در محیط عادی وب پشتیبانی نکنند.
   * بنابراین قبل از استفاده بررسی می‌کنیم.
   */
  if (
    tg &&
    tg.initData &&
    tg.BackButton
  ) {
    try {
      if (
        typeof tg.BackButton.show ===
        "function"
      ) {
        tg.BackButton.show();
      }
    } catch (e) {
      console.warn(
        "Telegram BackButton.show:",
        e
      );
    }
  }
}

function closeModal() {
  const modal =
    $("productModal");

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }

  document.body.classList.remove(
    "modal-open"
  );

  const video =
    $("modalProductVideo");

  if (video) {
    try {
      video.pause();
    } catch {}

    video.removeAttribute(
      "src"
    );

    try {
      video.load();
    } catch {}
  }

  if (
    tg &&
    tg.initData &&
    tg.BackButton
  ) {
    try {
      if (
        typeof tg.BackButton.hide ===
        "function"
      ) {
        tg.BackButton.hide();
      }
    } catch (e) {
      console.warn(
        "Telegram BackButton.hide:",
        e
      );
    }
  }
}


/* =========================================================
   CUSTOMER REQUEST MODAL
========================================================= */

function openCustomerRequest(
  type = "order"
) {
  const modal =
    $("customerRequestModal");

  if (!modal) {
    return;
  }

  const select =
    $("customerRequestType");

  if (select) {
    select.value =
      type === "note"
        ? "note"
        : "order";
  }

  const title =
    $("customerRequestTitle");

  if (title) {
    title.textContent =
      type === "note"
        ? "ثبت یادداشت"
        : "ثبت سفارش";
  }

  const input =
    $("customerRequestText");

  if (input) {
    input.value = "";
    input.focus();
  }

  modal.classList.remove(
    "hidden"
  );
}

function closeCustomerRequest() {
  const modal =
    $("customerRequestModal");

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }
}


/* =========================================================
   ثبت سفارش / یادداشت
   نسخه اصلاح‌شده برای رفع
   WebAppMethod Unsupported
========================================================= */

async function submitCustomerRequest() {
  const input =
    $("customerRequestText");

  const typeInput =
    $("customerRequestType");

  const text =
    input
      ? input.value.trim()
      : "";

  const type =
    typeInput?.value === "note"
      ? "note"
      : "order";

  if (!text) {
    alert(
      "لطفاً متن سفارش یا یادداشت را بنویسید."
    );

    return;
  }

  try {
    await postJson(
      "/api/customer/request",
      {
        type,
        text
      }
    );

    if (input) {
      input.value = "";
    }

    closeCustomerRequest();

    /*
     * عمداً از tg.showPopup استفاده نمی‌کنیم.
     * چون در بعضی محیط‌ها این متد وجود دارد ولی
     * توسط WebApp پشتیبانی نمی‌شود و خطای:
     *
     * WebAppMethod Unsupported
     *
     * ایجاد می‌کند.
     *
     * alert در مرورگر، PWA و WebApp قابل استفاده است.
     */

    alert(
      type === "note"
        ? "✅ یادداشت شما با موفقیت ثبت شد."
        : "✅ سفارش شما با موفقیت ثبت شد."
    );

  } catch (error) {
    console.error(
      "Customer request error:",
      error
    );

    alert(
      "❌ ثبت درخواست انجام نشد:\n" +
      (
        error?.message ||
        "خطای نامشخص"
      )
    );
  }
}


/* =========================================================
   ADMIN PRODUCTS
========================================================= */

async function loadAdminProducts() {
  const container =
    $("adminProducts");

  if (!container) {
    return;
  }

  try {
    const result =
      await get("/api/products");

    const list =
      Array.isArray(result)
        ? result
        : Array.isArray(
            result?.products
          )
          ? result.products
          : [];

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-box">
          محصولی وجود ندارد.
        </div>
      `;

      return;
    }

    container.innerHTML =
      list
        .map(
          product => `
            <div
              class="admin-product-row"
            >

              <div
                class="admin-product-info"
              >
                <strong>
                  ${escapeHtml(
                    product.name_fa ||
                    ""
                  )}
                </strong>

                ${
                  product.name_en
                    ? `
                      <span>
                        ${escapeHtml(
                          product.name_en
                        )}
                      </span>
                    `
                    : ""
                }

                <small>
                  ID:
                  ${escapeHtml(
                    product.id
                  )}
                </small>
              </div>

              <div
                class="admin-product-actions"
              >

                <button
                  type="button"
                  class="danger-btn"
                  data-delete-product="${
                    product.id
                  }"
                >
                  حذف
                </button>

              </div>

            </div>
          `
        )
        .join("");

    container
      .querySelectorAll(
        "[data-delete-product]"
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            deleteProduct(
              button.dataset
                .deleteProduct
            );
          }
        );
      });

  } catch (e) {
    container.innerHTML = `
      <div class="error-box">
        ${escapeHtml(
          e.message
        )}
      </div>
    `;
  }
}


/* =========================================================
   CUSTOMERS / REPRESENTATIVES
========================================================= */

async function loadCustomers() {
  const container =
    $("customersList");

  if (!container) {
    return;
  }

  try {
    const result =
      await get(
        "/api/admin/customers"
      );

    const list =
      Array.isArray(result)
        ? result
        : Array.isArray(
            result?.customers
          )
          ? result.customers
          : [];

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-box">
          نماینده‌ای تعریف نشده است.
        </div>
      `;

      return;
    }

    container.innerHTML =
      list
        .map(customer => {
          const id =
            String(
              customer.id
            );

          const first =
            escapeHtml(
              customer.first_name ||
              ""
            );

          const last =
            escapeHtml(
              customer.last_name ||
              ""
            );

          const username =
            escapeHtml(
              customer.username ||
              ""
            );

          const status =
            customer.status ||
            "active";

          return `
            <div
              class="customer-admin-card"
            >

              <div
                class="customer-admin-header"
              >
                <strong>
                  ${first}
                  ${last}
                </strong>

                <small>
                  ID:
                  ${escapeHtml(id)}
                </small>
              </div>

              <div
                class="customer-admin-fields"
              >

                <label>
                  نام
                  <input
                    id="ufirst-${escapeHtml(
                      id
                    )}"
                    value="${first}"
                  >
                </label>

                <label>
                  نام خانوادگی
                  <input
                    id="ulast-${escapeHtml(
                      id
                    )}"
                    value="${last}"
                  >
                </label>

                <label>
                  نام کاربری
                  <input
                    id="uuser-${escapeHtml(
                      id
                    )}"
                    value="${username}"
                    dir="ltr"
                  >
                </label>

                <label>
                  رمز جدید
                  <input
                    id="upass-${escapeHtml(
                      id
                    )}"
                    type="password"
                    placeholder="در صورت تغییر"
                    dir="ltr"
                  >
                </label>

                <label>
                  وضعیت
                  <select
                    id="ustatus-${escapeHtml(
                      id
                    )}"
                  >
                    <option
                      value="active"
                      ${
                        status ===
                        "active"
                          ? "selected"
                          : ""
                      }
                    >
                      فعال
                    </option>

                    <option
                      value="inactive"
                      ${
                        status ===
                        "inactive"
                          ? "selected"
                          : ""
                      }
                    >
                      غیرفعال
                    </option>
                  </select>
                </label>

              </div>

              <div
                class="customer-admin-actions"
              >

                <button
                  type="button"
                  class="primary-btn"
                  data-save-customer="${escapeHtml(
                    id
                  )}"
                >
                  ذخیره
                </button>

                <button
                  type="button"
                  class="danger-btn"
                  data-delete-customer="${escapeHtml(
                    id
                  )}"
                >
                  حذف نماینده
                </button>

              </div>

            </div>
          `;
        })
        .join("");

    container
      .querySelectorAll(
        "[data-save-customer]"
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            updateCustomerUser(
              button.dataset
                .saveCustomer
            );
          }
        );
      });

    container
      .querySelectorAll(
        "[data-delete-customer]"
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            deleteCustomerUser(
              button.dataset
                .deleteCustomer
            );
          }
        );
      });

  } catch (e) {
    container.innerHTML = `
      <div class="error-box">
        ${escapeHtml(
          e.message
        )}
      </div>
    `;
  }
}


/* =========================================================
   ADMIN PANEL
========================================================= */

function openAdminPanel() {
  if (
    !currentUser ||
    !(
      isAdmin ||
      currentUser.role ===
        "admin"
    )
  ) {
    alert(
      "دسترسی به پنل مدیریت مجاز نیست."
    );

    return;
  }

  const panel =
    $("adminPanel");

  if (!panel) {
    return;
  }

  panel.classList.remove(
    "hidden"
  );

  loadAdminProducts();
  loadCustomers();
  loadSiteSettings();
}

function closeAdminPanel() {
  const panel =
    $("adminPanel");

  if (panel) {
    panel.classList.add(
      "hidden"
    );
  }
}


/* =========================================================
   SEARCH
========================================================= */

function setupSearch() {
  const input =
    $("searchInput");

  if (!input) {
    return;
  }

  let timer = null;

  input.addEventListener(
    "input",
    () => {
      clearTimeout(timer);

      timer =
        setTimeout(
          () => {
            renderProducts();
          },
          120
        );
    }
  );
}


/* =========================================================
   TELEGRAM BACK BUTTON
========================================================= */

function setupTelegramBackButton() {
  if (
    !tg ||
    !tg.initData ||
    !tg.BackButton
  ) {
    return;
  }

  try {
    if (
      typeof tg.BackButton.onClick ===
      "function"
    ) {
      tg.BackButton.onClick(
        () => {
          const productModal =
            $("productModal");

          const requestModal =
            $("customerRequestModal");

          const adminPanel =
            $("adminPanel");

          if (
            productModal &&
            !productModal.classList.contains(
              "hidden"
            )
          ) {
            closeModal();
            return;
          }

          if (
            requestModal &&
            !requestModal.classList.contains(
              "hidden"
            )
          ) {
            closeCustomerRequest();
            return;
          }

          if (
            adminPanel &&
            !adminPanel.classList.contains(
              "hidden"
            )
          ) {
            closeAdminPanel();
          }
        }
      );
    }
  } catch (e) {
    console.warn(
      "Telegram BackButton:",
      e
    );
  }
}
/* =========================================================
   EVENT SETUP
========================================================= */

function setupEvents() {

  /* -----------------------------------------
     Search
  ----------------------------------------- */
  setupSearch();


  /* -----------------------------------------
     Login
  ----------------------------------------- */
  const loginButton =
    $("loginButton");

  if (loginButton) {
    loginButton.addEventListener(
      "click",
      loginWithUsernamePassword
    );
  }

  const loginForm =
    $("loginForm");

  if (loginForm) {
    loginForm.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        loginWithUsernamePassword();
      }
    );
  }


  /* -----------------------------------------
     Logout
  ----------------------------------------- */
  const logoutButton =
    $("logoutButton");

  if (logoutButton) {
    logoutButton.addEventListener(
      "click",
      logoutUser
    );
  }


  /* -----------------------------------------
     Admin
  ----------------------------------------- */
  const adminButton =
    $("adminButton");

  if (adminButton) {
    adminButton.addEventListener(
      "click",
      openAdminPanel
    );
  }

  const closeAdminButton =
    $("closeAdminButton");

  if (closeAdminButton) {
    closeAdminButton.addEventListener(
      "click",
      closeAdminPanel
    );
  }


  /* -----------------------------------------
     Product modal close
  ----------------------------------------- */
  const closeProductButton =
    $("closeProductModal");

  if (closeProductButton) {
    closeProductButton.addEventListener(
      "click",
      closeModal
    );
  }

  const productModal =
    $("productModal");

  if (productModal) {
    productModal.addEventListener(
      "click",
      event => {
        if (
          event.target ===
          productModal
        ) {
          closeModal();
        }
      }
    );
  }


  /* -----------------------------------------
     Customer request
  ----------------------------------------- */
  const orderButton =
    $("orderButton");

  if (orderButton) {
    orderButton.addEventListener(
      "click",
      () => {
        openCustomerRequest(
          "order"
        );
      }
    );
  }

  const noteButton =
    $("noteButton");

  if (noteButton) {
    noteButton.addEventListener(
      "click",
      () => {
        openCustomerRequest(
          "note"
        );
      }
    );
  }

  const closeRequestButton =
    $("closeCustomerRequest");

  if (closeRequestButton) {
    closeRequestButton.addEventListener(
      "click",
      closeCustomerRequest
    );
  }

  const cancelRequestButton =
    $("cancelCustomerRequest");

  if (cancelRequestButton) {
    cancelRequestButton.addEventListener(
      "click",
      closeCustomerRequest
    );
  }

  const submitRequestButton =
    $("submitCustomerRequest");

  if (submitRequestButton) {
    submitRequestButton.addEventListener(
      "click",
      submitCustomerRequest
    );
  }

  const requestModal =
    $("customerRequestModal");

  if (requestModal) {
    requestModal.addEventListener(
      "click",
      event => {
        if (
          event.target ===
          requestModal
        ) {
          closeCustomerRequest();
        }
      }
    );
  }


  /* -----------------------------------------
     Admin: create product
  ----------------------------------------- */
  const createProductButton =
    $("createProductButton");

  if (createProductButton) {
    createProductButton.addEventListener(
      "click",
      createProduct
    );
  }


  /* -----------------------------------------
     Admin: create customer
  ----------------------------------------- */
  const createCustomerButton =
    $("createCustomerButton");

  if (createCustomerButton) {
    createCustomerButton.addEventListener(
      "click",
      createCustomerUser
    );
  }


  /* -----------------------------------------
     Admin: save settings
  ----------------------------------------- */
  const saveSettingsButton =
    $("saveSettingsButton");

  if (saveSettingsButton) {
    saveSettingsButton.addEventListener(
      "click",
      saveSiteSettings
    );
  }


  /* -----------------------------------------
     ESC key
  ----------------------------------------- */
  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key !== "Escape"
      ) {
        return;
      }

      const productModal =
        $("productModal");

      const requestModal =
        $("customerRequestModal");

      const adminPanel =
        $("adminPanel");

      if (
        productModal &&
        !productModal.classList.contains(
          "hidden"
        )
      ) {
        closeModal();
        return;
      }

      if (
        requestModal &&
        !requestModal.classList.contains(
          "hidden"
        )
      ) {
        closeCustomerRequest();
        return;
      }

      if (
        adminPanel &&
        !adminPanel.classList.contains(
          "hidden"
        )
      ) {
        closeAdminPanel();
      }

    }
  );


  /* -----------------------------------------
     Telegram Back Button
  ----------------------------------------- */
  setupTelegramBackButton();
}


/* =========================================================
   ADMIN TAB / SECTION
========================================================= */

function setupAdminTabs() {

  const buttons =
    document.querySelectorAll(
      "[data-admin-tab]"
    );

  const sections =
    document.querySelectorAll(
      "[data-admin-section]"
    );

  if (!buttons.length) {
    return;
  }

  buttons.forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const target =
          button.dataset.adminTab;

        buttons.forEach(
          item => {
            item.classList.toggle(
              "active",
              item === button
            );
          }
        );

        sections.forEach(
          section => {
            section.classList.toggle(
              "hidden",
              section.dataset
                .adminSection !==
                target
            );
          }
        );

      }
    );

  });
}


/* =========================================================
   PRODUCT IMAGE FALLBACK
========================================================= */

function setupImageFallback() {

  document.addEventListener(
    "error",
    event => {

      const image =
        event.target;

      if (
        !image ||
        image.tagName !==
          "IMG"
      ) {
        return;
      }

      if (
        image.dataset
          .fallbackApplied
      ) {
        return;
      }

      image.dataset
        .fallbackApplied =
        "1";

      const fallback =
        image.dataset
          .fallback;

      if (fallback) {
        image.src =
          fallback;

        return;
      }

      const parent =
        image.parentElement;

      if (parent) {
        parent.classList.add(
          "image-error"
        );
      }

    },
    true
  );
}


/* =========================================================
   PWA SERVICE WORKER
========================================================= */

function registerServiceWorker() {

  if (
    !("serviceWorker" in
      navigator)
  ) {
    return;
  }

  /*
   * Service Worker فقط روی HTTPS
   * یا localhost قابل استفاده است.
   */
  if (
    location.protocol !==
      "https:" &&
    location.hostname !==
      "localhost" &&
    location.hostname !==
      "127.0.0.1"
  ) {
    return;
  }

  navigator.serviceWorker
    .register(
      "./service-worker.js",
      {
        scope: "./"
      }
    )
    .then(
      registration => {
        console.log(
          "Service Worker registered:",
          registration.scope
        );
      }
    )
    .catch(
      error => {
        console.warn(
          "Service Worker:",
          error
        );
      }
    );
}


/* =========================================================
   INSTALL / PWA UI
========================================================= */

let deferredInstallPrompt =
  null;

function setupInstallPrompt() {

  window.addEventListener(
    "beforeinstallprompt",
    event => {

      /*
       * جلوگیری از نمایش خودکار
       */
      event.preventDefault();

      deferredInstallPrompt =
        event;

      const button =
        $("installAppButton");

      if (button) {
        button.classList.remove(
          "hidden"
        );
      }
    }
  );


  const installButton =
    $("installAppButton");

  if (installButton) {

    installButton.addEventListener(
      "click",
      async () => {

        if (
          !deferredInstallPrompt
        ) {
          alert(
            "برای نصب برنامه، از گزینه نصب برنامه در مرورگر استفاده کنید."
          );

          return;
        }

        try {

          deferredInstallPrompt
            .prompt();

          await deferredInstallPrompt
            .userChoice;

        } catch (
          error
        ) {

          console.warn(
            "Install prompt:",
            error
          );

        } finally {

          deferredInstallPrompt =
            null;

          installButton.classList.add(
            "hidden"
          );
        }

      }
    );
  }


  window.addEventListener(
    "appinstalled",
    () => {

      deferredInstallPrompt =
        null;

      const button =
        $("installAppButton");

      if (button) {
        button.classList.add(
          "hidden"
        );
      }

      console.log(
        "Moshkfam installed."
      );
    }
  );
}


/* =========================================================
   IMAGE / LOGO INITIALIZATION
========================================================= */

function setupLogo() {

  const logo =
    $("siteLogo");

  if (!logo) {
    return;
  }

  /*
   * در بعضی سرورها حروف بزرگ/کوچک
   * مسیر فایل اهمیت دارد.
   */
  logo.addEventListener(
    "error",
    () => {

      if (
        logo.dataset
          .fallbackApplied
      ) {
        return;
      }

      logo.dataset
        .fallbackApplied =
        "1";

      logo.src =
        "./images/logo.png";
    }
  );

  /*
   * مسیر اصلی
   */
  if (
    !logo.getAttribute("src")
  ) {
    logo.src =
      "./Images/logo.png";
  }
}


/* =========================================================
   URL / HASH
========================================================= */

function setupNavigation() {

  document.addEventListener(
    "click",
    event => {

      const link =
        event.target.closest(
          "a[href^='#']"
        );

      if (!link) {
        return;
      }

      const href =
        link.getAttribute(
          "href"
        );

      if (
        !href ||
        href === "#"
      ) {
        return;
      }

      const target =
        document.querySelector(
          href
        );

      if (!target) {
        return;
      }

      event.preventDefault();

      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    }
  );

}


/* =========================================================
   CUSTOMER ACCESS CHECK
========================================================= */

function canSubmitCustomerRequest() {

  if (!currentUser) {

    alert(
      "برای ثبت سفارش یا یادداشت ابتدا وارد حساب کاربری شوید."
    );

    return false;
  }

  return true;
}


/* =========================================================
   WRAP CUSTOMER REQUEST BUTTONS
========================================================= */

function setupCustomerAccess() {

  const buttons =
    document.querySelectorAll(
      "[data-customer-request]"
    );

  buttons.forEach(
    button => {

      button.addEventListener(
        "click",
        event => {

          event.preventDefault();

          if (
            !canSubmitCustomerRequest()
          ) {
            return;
          }

          const type =
            button.dataset
              .customerRequest ===
              "note"
              ? "note"
              : "order";

          openCustomerRequest(
            type
          );

        }
      );

    }
  );
}


/* =========================================================
   ADMIN LOGIN VISIBILITY
========================================================= */

function refreshAdminVisibility() {

  const elements =
    document.querySelectorAll(
      "[data-admin-only]"
    );

  elements.forEach(
    element => {

      const allowed =
        !!currentUser &&
        (
          isAdmin ||
          currentUser.role ===
            "admin"
        );

      element.classList.toggle(
        "hidden",
        !allowed
      );

    }
  );
}


/* =========================================================
   USER NAME
========================================================= */

function getUserDisplayName(
  user
) {

  if (!user) {
    return "";
  }

  const fullName =
    [
      user.first_name,
      user.last_name
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  if (fullName) {
    return fullName;
  }

  if (user.name) {
    return String(
      user.name
    );
  }

  if (user.username) {
    return String(
      user.username
    );
  }

  return "کاربر";
}


/* =========================================================
   HEADER USER INFO
========================================================= */

function renderUserHeader() {

  const name =
    getUserDisplayName(
      currentUser
    );

  const elements = [
    $("headerUserName"),
    $("loggedUserName"),
    $("userName"),
    $("welcomeUser")
  ];

  elements.forEach(
    element => {

      if (!element) {
        return;
      }

      if (currentUser) {
        element.textContent =
          name;
      } else {
        element.textContent =
          "";
      }

    }
  );

  const usernameElements = [
    $("headerUsername"),
    $("loggedUsername"),
    $("userUsername")
  ];

  usernameElements.forEach(
    element => {

      if (!element) {
        return;
      }

      element.textContent =
        currentUser?.username
          ? "@" +
            currentUser.username
          : "";

    }
  );
}


/* =========================================================
   ACCOUNT REFRESH
========================================================= */

function refreshAccount() {
  updateAccountUI();
  refreshAdminVisibility();
  renderUserHeader();
}


/* =========================================================
   INITIAL LOAD
========================================================= */

async function initializeApp() {

  hideError();

  setupEvents();
  setupAdminTabs();
  setupImageFallback();
  setupInstallPrompt();
  setupLogo();
  setupNavigation();
  setupCustomerAccess();

  registerServiceWorker();

  /*
   * ابتدا تنظیمات عمومی
   */
  await loadSiteSettings();

  /*
   * نشست ورود معمولی وب / اندروید
   */
  await loadWebSession();

  /*
   * اگر برنامه داخل Telegram باز شده باشد،
   * احراز هویت Telegram نیز انجام می‌شود.
   */
  if (
    tg &&
    tg.initData
  ) {

    await authenticate();
    await loadCurrentUser();

  }

  refreshAccount();

  /*
   * محصولات در نهایت بارگذاری می‌شوند.
   */
  await loadProducts();

}


/* =========================================================
   DOM READY
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeApp,
    {
      once: true
    }
  );

} else {

  initializeApp();

}


/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.Moshkfam = {

  loadProducts,

  openProductModal,

  closeModal,

  openCustomerRequest,

  closeCustomerRequest,

  submitCustomerRequest,

  loginWithUsernamePassword,

  logoutUser,

  openAdminPanel,

  closeAdminPanel,

  saveSiteSettings,

  createProduct,

  deleteProduct,

  createCustomerUser,

  deleteCustomerUser,

  updateCustomerUser

};


/* =========================================================
   DEBUG
========================================================= */

console.log(
  "Moshkfam app.js loaded."
);
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
                href="${escapeHtml(product.catalog_pdf_url)}"
                target="_blank"
                rel="noopener"
                class="catalog-fallback"
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
      <strong>نام:</strong>
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
      <strong>نقش:</strong>
      ${escapeHtml(isAdmin ? "admin" : (currentUser.role || "customer"))}
    </div>
  `;
}


/* =========================================================
   ADMIN PRODUCTS
========================================================= */

async function loadAdminProducts() {
  const container = $("adminProducts");
  if (!container) return;

  try {
    const result = await postJson("/api/admin/products", {});
    const list = Array.isArray(result)
      ? result
      : (Array.isArray(result?.products) ? result.products : products);

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
            <label>قیمت پایه<input type="number" id="price-${id}" value="${product.base_price ?? ""}" placeholder="قیمت پایه"></label>
          </div>

          <div class="admin-edit-grid admin-edit-grid-wide">
            <label>معرفی<textarea id="intro-${id}">${escapeHtml(product.intro || "")}</textarea></label>
            <label>ترکیبات<textarea id="composition-${id}">${escapeHtml(product.composition || "")}</textarea></label>
            <label>نحوه مصرف<textarea id="use-${id}">${escapeHtml(product.use_text || "")}</textarea></label>
            <label>هشدارها<textarea id="warnings-${id}">${escapeHtml(product.warnings || "")}</textarea></label>
            <label>مزایا (هر مورد در یک خط)<textarea id="benefits-${id}">${escapeHtml(benefits)}</textarea></label>
          </div>

          <label class="admin-active">
            <input type="checkbox" id="active-${id}" ${product.active !== false ? "checked" : ""}>
            محصول فعال و قابل نمایش برای مشتریان
          </label>

          <div class="admin-product-buttons"><button onclick="saveProduct(${id})">💾 ذخیره اطلاعات محصول</button><button class="admin-danger" onclick="deleteProduct(${id})">🗑️ حذف محصول</button></div>

          <div class="admin-media-grid">
            <div class="admin-media-box">
              <label>🖼️ تصویر جدید<input type="file" id="image-${id}" accept="image/*"></label>
              <button onclick="uploadProductImage(${id})">آپلود / جایگزینی تصویر</button>
              ${product.image_url ? `<button class="danger" onclick="removeProductImage(${id})">بایگانی تصویر فعلی</button>` : ""}
            </div>
            <div class="admin-media-box">
              <label>🎬 ویدئوی جدید<input type="file" id="video-${id}" accept="video/*"></label>
              <button onclick="uploadProductVideo(${id})">آپلود / جایگزینی ویدئو</button>
              ${product.video_url ? `<button class="danger" onclick="removeProductVideo(${id})">بایگانی ویدئو</button>` : ""}
            </div>
            <div class="admin-media-box">
              <label>📄 کاتالوگ جدید<input type="file" id="catalog-${id}" accept="application/pdf,.pdf,image/*"></label>
              <button onclick="uploadProductCatalog(${id})">آپلود / جایگزینی کاتالوگ</button>
              ${product.catalog_pdf_url ? `<button class="danger" onclick="removeProductCatalog(${id})">بایگانی کاتالوگ</button>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");
  } catch (error) {
    console.error("Admin products:", error);
    container.innerHTML = `<div class="message error">دریافت محصولات مدیریت انجام نشد.</div>`;
  }
}

async function saveProduct(productId) {
  const id = Number(productId);
  const value = id => $(id);
  const benefitsText = value(`benefits-${id}`)?.value || "";
  const benefits = benefitsText.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const payload = {
    product_id: id,
    name_fa: value(`namefa-${id}`)?.value.trim() || "",
    name_en: value(`nameen-${id}`)?.value.trim() || "",
    category: value(`category-${id}`)?.value.trim() || "",
    package: value(`package-${id}`)?.value.trim() || "",
    maker: value(`maker-${id}`)?.value.trim() || "",
    intro: value(`intro-${id}`)?.value || "",
    composition: value(`composition-${id}`)?.value || "",
    use_text: value(`use-${id}`)?.value || "",
    warnings: value(`warnings-${id}`)?.value || "",
    benefits,
    active: !!value(`active-${id}`)?.checked,
    base_price: (value(`price-${id}`)?.value.trim() || "") === "" ? null : Number(value(`price-${id}`).value),
    base_currency: "تومان"
  };

  try {
    await postJson("/api/admin/update-product", payload);
    alert("✅ اطلاعات محصول ذخیره شد.");
    await loadProducts();
    await loadAdminProducts();
  } catch (error) {
    alert("❌ خطا در ذخیره محصول:\n" + error.message);
  }
}

async function uploadProductImage(productId) {
  const input = $(`image-${Number(productId)}`);
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
  if (!confirm("تصویر فعلی به پوشه old منتقل و از محصول خارج شود؟")) return;
  try {
    await postJson("/api/admin/remove-image", {product_id:Number(productId)});
    alert("✅ تصویر بایگانی شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در تصویر:\n" + e.message); }
}

async function uploadProductCatalog(productId) {
  const input = $(`catalog-${Number(productId)}`);
  if (!input?.files?.length) return alert("لطفاً کاتالوگ را انتخاب کنید.");
  const fd = new FormData(); fd.append("product_id", String(productId)); fd.append("file", input.files[0], input.files[0].name);
  try {
    await apiRequest("/api/admin/upload-catalog", {method:"POST", body:fd});
    alert("✅ کاتالوگ جدید ثبت شد. کاتالوگ قبلی به old منتقل شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در کاتالوگ:\n" + e.message); }
}

async function removeProductCatalog(productId) {
  if (!confirm("کاتالوگ فعلی به پوشه old منتقل و از محصول خارج شود؟")) return;
  try {
    await postJson("/api/admin/remove-catalog", {product_id:Number(productId)});
    alert("✅ کاتالوگ بایگانی شد.");
    await loadProducts(); await loadAdminProducts();
  } catch(e) { alert("❌ خطا در کاتالوگ:\n" + e.message); }
}

async function updateProductPrice(productId) {
  const input =
    $(`price-${Number(productId)}`);

  if (!input) return;

  const value = input.value.trim();

  try {
    await postJson(
      "/api/admin/update-price",
      {
        product_id: Number(productId),
        price:
          value === ""
            ? null
            : Number(value),
        currency: "تومان"
      }
    );

    alert("✅ قیمت ذخیره شد.");

    await loadProducts();
    await loadAdminProducts();

  } catch (error) {
    alert(
      "❌ خطا در ذخیره قیمت:\n" +
      error.message
    );
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
    !confirm(
      "آیا از حذف ویدئوی این محصول مطمئن هستید؟"
    )
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
window.createProduct=createProduct;
window.deleteProduct=deleteProduct;
window.createCustomerUser=createCustomerUser;
window.deleteCustomerUser=deleteCustomerUser;
window.updateCustomerUser=updateCustomerUser;
window.saveSiteSettings=saveSiteSettings;      info.innerHTML = customer ? `
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
window.createProduct=createProduct;
window.deleteProduct=deleteProduct;
window.createCustomerUser=createCustomerUser;
window.deleteCustomerUser=deleteCustomerUser;
window.updateCustomerUser=updateCustomerUser;
window.saveSiteSettings=saveSiteSettings;
