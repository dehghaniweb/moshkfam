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
      برای اطلاع از قیمت تماس بگیرید
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

  if (tg && tg.initData) {
    headers["X-Telegram-Init-Data"] = tg.initData;
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

  if (!currentUser) {
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
      currentUser.role === "admin"
        ? "مدیر سیستم"
        : "مشتری";
  }

  if (adminButton) {
    if (isAdmin) {
      adminButton.classList.remove("hidden");
    } else {
      adminButton.classList.add("hidden");
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
      class="category-btn ${
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
        class="category-btn ${
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
    .querySelectorAll(".category-btn")
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

        <button
          class="view-product"
          onclick="openProduct(${Number(id)})"
        >
          مشاهده مشخصات
        </button>

      </div>
    </article>
  `;
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
        product.catalog_pdf_url
          ? `
            <div class="detail-actions">
              <a
                href="${escapeHtml(product.catalog_pdf_url)}"
                target="_blank"
                rel="noopener"
                class="catalog-button"
              >
                📄 مشاهده کاتالوگ
              </a>
            </div>
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

function openAdmin() {
  if (!isAdmin) {
    return;
  }

  const modal = $("adminModal");

  if (!modal) return;

  modal.classList.remove("hidden");

  loadAdminData();
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
      loadCustomers()
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
      ${escapeHtml(currentUser.role || "customer")}
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
    const result =
      await postJson("/api/admin/products", {});

    const list =
      Array.isArray(result)
        ? result
        : Array.isArray(result?.products)
          ? result.products
          : products;

    container.innerHTML = list
      .map(product => {

        return `
          <div class="admin-product">

            <div>
              <strong>
                ${escapeHtml(
                  product.name_fa ||
                  product.name_en ||
                  "محصول"
                )}
              </strong>

              <small>
                ID: ${escapeHtml(product.id)}
              </small>
            </div>

            <div class="admin-price-row">

              <input
                type="number"
                id="price-${Number(product.id)}"
                value="${
                  product.base_price ?? ""
                }"
                placeholder="قیمت"
              >

              <button
                onclick="updateProductPrice(${Number(product.id)})"
              >
                ذخیره قیمت
              </button>

            </div>

            <div class="admin-file-row">

              <label>
                ویدئو
                <input
                  type="file"
                  id="video-${Number(product.id)}"
                  accept="video/*"
                >
              </label>

              <button
                onclick="uploadProductVideo(${Number(product.id)})"
              >
                آپلود ویدئو
              </button>

              ${
                product.video_url
                  ? `
                    <button
                      class="danger"
                      onclick="removeProductVideo(${Number(product.id)})"
                    >
                      حذف ویدئو
                    </button>
                  `
                  : ""
              }

            </div>

          </div>
        `;
      })
      .join("");

  } catch (error) {
    console.error("Admin products:", error);

    container.innerHTML =
      `<div class="message error">
        دریافت محصولات مدیریت انجام نشد.
      </div>`;
  }
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
}

async function loadCustomerPrices(customerId) {
  const container = $("customerPrices");
  const info = $("customerInfo");

  if (!container) return;

  container.innerHTML =
    `<div class="message">
      در حال دریافت قیمت‌ها...
    </div>`;

  try {
    const result =
      await postJson(
        "/api/admin/customer-prices",
        {
          customer_id: customerId
        }
      );

    const prices =
      Array.isArray(result)
        ? result
        : Array.isArray(result?.prices)
          ? result.prices
          : [];

    if (!prices.length) {
      container.innerHTML =
        `<div class="message">
          قیمتی برای این مشتری ثبت نشده است.
        </div>`;

      return;
    }

    container.innerHTML =
      prices
        .map(item => {

          const product =
            products.find(
              p =>
                Number(p.id) ===
                Number(item.product_id)
            );

          const name =
            product?.name_fa ||
            `محصول ${item.product_id}`;

          return `
            <div class="customer-price-row">

              <div>
                ${escapeHtml(name)}
              </div>

              <input
                type="number"
                id="customer-price-${Number(
                  item.product_id
                )}"
                value="${
                  item.price ?? ""
                }"
              >

              <button
                onclick="
                  setCustomerPrice(
                    '${escapeHtml(customerId)}',
                    ${Number(item.product_id)}
                  )
                "
              >
                ذخیره
              </button>

            </div>
          `;
        })
        .join("");

    if (info) {
      info.classList.remove("hidden");
    }

  } catch (error) {
    container.innerHTML =
      `<div class="message error">
        خطا در دریافت قیمت مشتری.
      </div>`;
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
   EVENTS
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

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

      tg.BackButton.onClick(() => {

        const modal =
          $("modal");

        const adminModal =
          $("adminModal");

        if (
          modal &&
          !modal.classList.contains("hidden")
        ) {
          closeModal();
          return;
        }

        if (
          adminModal &&
          !adminModal.classList.contains("hidden")
        ) {
          closeAdmin();

          try {
            tg.BackButton.hide();
          } catch (e) {}

          return;
        }
      });
    }
  }
);


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
  } catch (error) {
    console.error(
      "User init:",
      error
    );
  }

  await loadProducts();

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

window.updateProductPrice =
  updateProductPrice;

window.uploadProductVideo =
  uploadProductVideo;

window.removeProductVideo =
  removeProductVideo;

window.loadCustomerPrices =
  loadCustomerPrices;

window.setCustomerPrice =
  setCustomerPrice;
