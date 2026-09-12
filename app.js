const WORKER_URL = "https://moshkfam-telegram-bot.dehghaniweb.workers.dev";

const tg =
  window.Telegram && window.Telegram.WebApp
    ? window.Telegram.WebApp
    : null;

if (tg) {
  try {
    tg.ready();
    tg.expand();
  } catch (e) {}
}

let products = [];
let categories = [];
let activeCategory = "";
let currentUser = null;
let isAdmin = false;
let selectedCustomer = null;


/* =========================
   Helpers
========================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getProductName(product) {
  return product?.name_fa || product?.name_en || "بدون نام";
}

function formatPrice(price, currency = "تومان") {
  if (price === null || price === undefined || price === "") {
    return "";
  }

  const number = Number(price);

  if (!Number.isFinite(number)) {
    return escapeHtml(price);
  }

  return `${number.toLocaleString("fa-IR")} ${escapeHtml(currency || "تومان")}`;
}

function getImageUrl(product) {
  return product?.image_url || "";
}

function getCatalogUrl(product) {
  return product?.catalog_pdf_url || "";
}

function authHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };

  if (tg && tg.initData) {
    headers["X-Telegram-Init-Data"] = tg.initData;
  }

  return headers;
}

async function request(path, options = {}) {
  const url = WORKER_URL + path;

  const headers = {
    ...authHeaders(),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = {
      raw: text
    };
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      data?.raw ||
      `HTTP ${response.status}`
    );
  }

  return data;
}

async function get(path) {
  return request(path, {
    method: "GET"
  });
}

async function post(path, body = {}) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}


/* =========================
   Telegram User
========================= */

function getTelegramUser() {
  if (!tg?.initDataUnsafe?.user) {
    return null;
  }

  return tg.initDataUnsafe.user;
}

async function authenticate() {
  const user = getTelegramUser();

  if (!user) {
    showAccount(null);
    return;
  }

  try {
    const result = await post("/api/telegram-auth", {
      initData: tg.initData || ""
    });

    if (result?.user) {
      currentUser = result.user;
    } else {
      currentUser = {
        id: user.id,
        username: user.username || "",
        first_name: user.first_name || "",
        last_name: user.last_name || ""
      };
    }

    isAdmin = Boolean(result?.is_admin);

    showAccount(currentUser);

    if (isAdmin) {
      const button = document.getElementById("adminButton");

      if (button) {
        button.classList.remove("hidden");
      }
    }

  } catch (error) {
    console.error("Authentication error:", error);

    currentUser = {
      id: user.id,
      username: user.username || "",
      first_name: user.first_name || "",
      last_name: user.last_name || ""
    };

    isAdmin = false;

    showAccount(currentUser);
  }
}

function showAccount(user) {
  const account = document.getElementById("account");
  const accountName = document.getElementById("accountName");
  const accountUser = document.getElementById("accountUser");
  const accountInfo = document.getElementById("accountInfo");

  if (!account) return;

  if (!user) {
    account.classList.add("hidden");
    return;
  }

  account.classList.remove("hidden");

  const fullName =
    [user.first_name, user.last_name]
      .filter(Boolean)
      .join(" ") ||
    user.username ||
    "کاربر";

  if (accountName) {
    accountName.textContent = fullName;
  }

  if (accountUser) {
    accountUser.textContent = user.username
      ? `@${user.username}`
      : "";
  }

  if (accountInfo) {
    accountInfo.innerHTML =
      user.id
        ? `شناسه تلگرام: ${escapeHtml(user.id)}`
        : "";
  }
}


/* =========================
   Products
========================= */

async function loadProducts() {
  const loading = document.getElementById("loading");
  const error = document.getElementById("error");
  const empty = document.getElementById("empty");

  if (loading) {
    loading.classList.remove("hidden");
    loading.textContent = "در حال دریافت محصولات...";
  }

  if (error) {
    error.classList.add("hidden");
    error.textContent = "";
  }

  if (empty) {
    empty.classList.add("hidden");
  }

  try {
    const result = await get("/api/products");

    console.log("Products response:", result);

    if (Array.isArray(result)) {
      products = result;
    } else if (Array.isArray(result?.products)) {
      products = result.products;
    } else {
      products = [];
    }

    console.log("Products loaded:", products);

    renderCategories();
    renderProducts();

  } catch (err) {
    console.error("Load products error:", err);

    products = [];

    if (error) {
      error.textContent =
        "خطا در دریافت محصولات: " +
        (err.message || "خطای نامشخص");

      error.classList.remove("hidden");
    }
  } finally {
    if (loading) {
      loading.classList.add("hidden");
    }
  }
}

function renderCategories() {
  const container = document.getElementById("categories");

  if (!container) return;

  const values = [];

  for (const product of products) {
    const category = String(product?.category || "").trim();

    if (category && !values.includes(category)) {
      values.push(category);
    }
  }

  categories = values;

  let html = `
    <button
      class="category-btn ${activeCategory === "" ? "active" : ""}"
      onclick="selectCategory('')">
      همه
    </button>
  `;

  for (const category of categories) {
    html += `
      <button
        class="category-btn ${activeCategory === category ? "active" : ""}"
        onclick="selectCategory(${JSON.stringify(category)})">
        ${escapeHtml(category)}
      </button>
    `;
  }

  container.innerHTML = html;
}

function selectCategory(category) {
  activeCategory = category || "";

  renderCategories();
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById("productGrid");
  const count = document.getElementById("productCount");
  const empty = document.getElementById("empty");
  const searchInput = document.getElementById("searchInput");

  if (!grid) return;

  const searchText = String(
    searchInput?.value || ""
  )
    .trim()
    .toLowerCase();

  let filtered = products.filter(product => {
    const name =
      String(product?.name_fa || "").toLowerCase();

    const nameEn =
      String(product?.name_en || "").toLowerCase();

    const category =
      String(product?.category || "").toLowerCase();

    const matchesSearch =
      !searchText ||
      name.includes(searchText) ||
      nameEn.includes(searchText) ||
      category.includes(searchText);

    const matchesCategory =
      !activeCategory ||
      product?.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  if (count) {
    count.textContent =
      `${filtered.length.toLocaleString("fa-IR")} محصول`;
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
    .map(product => createProductCard(product))
    .join("");
}

function createProductCard(product) {
  const id = product?.id;

  const name = getProductName(product);
  const category = product?.category || "";

  const imageUrl = getImageUrl(product);

  const privatePrice =
    product?.has_private_price
      ? product?.customer_price
      : null;

  const privateCurrency =
    product?.customer_currency ||
    "تومان";

  let priceHtml = "";

  if (
    privatePrice !== null &&
    privatePrice !== undefined &&
    privatePrice !== ""
  ) {
    priceHtml = `
      <div class="private-price">
        💰 قیمت اختصاصی شما:
        ${formatPrice(privatePrice, privateCurrency)}
      </div>
    `;
  } else if (
    product?.base_price !== null &&
    product?.base_price !== undefined &&
    product?.base_price !== ""
  ) {
    priceHtml = `
      <div class="price">
        💰 ${formatPrice(
          product.base_price,
          product.base_currency || "تومان"
        )}
      </div>
    `;
  }

  const imageHtml = imageUrl
    ? `
      <img
        src="${escapeHtml(imageUrl)}"
        alt="${escapeHtml(name)}"
        loading="lazy"
        onerror="this.style.display='none';this.parentElement.classList.add('image-error');"
      >
    `
    : `
      <div class="no-image">🌱</div>
    `;

  return `
    <article
      class="product-card"
      onclick="openProduct(${Number(id)})"
    >

      <div class="product-image">
        ${imageHtml}
      </div>

      <div class="product-card-content">

        <h3>
          ${escapeHtml(name)}
        </h3>

        ${
          category
            ? `<div class="product-category">
                ${escapeHtml(category)}
               </div>`
            : ""
        }

        ${priceHtml}

        <button
          class="view-product"
          onclick="event.stopPropagation();openProduct(${Number(id)})">
          مشاهده محصول
        </button>

      </div>

    </article>
  `;
}


/* =========================
   Product Detail
========================= */

async function openProduct(id) {
  const product = products.find(
    item => Number(item?.id) === Number(id)
  );

  if (!product) {
    console.error("Product not found:", id);
    return;
  }

  const modal = document.getElementById("modal");
  const content = document.getElementById("modalContent");

  if (!modal || !content) return;

  const name = getProductName(product);

  let html = `
    <div class="product-detail">

      <div class="detail-image">
        ${
          product.image_url
            ? `
              <img
                src="${escapeHtml(product.image_url)}"
                alt="${escapeHtml(name)}"
                onerror="this.style.display='none';"
              >
            `
            : `
              <div class="no-image">🌱</div>
            `
        }
      </div>

      <h2>${escapeHtml(name)}</h2>

      ${
        product.category
          ? `
            <div class="detail-category">
              ${escapeHtml(product.category)}
            </div>
          `
          : ""
      }
  `;

  if (product.package) {
    html += `
      <div class="detail-row">
        <strong>بسته‌بندی:</strong>
        <span>${escapeHtml(product.package)}</span>
      </div>
    `;
  }

  if (product.maker) {
    html += `
      <div class="detail-row">
        <strong>تولیدکننده:</strong>
        <span>${escapeHtml(product.maker)}</span>
      </div>
    `;
  }

  const privatePrice =
    product?.has_private_price
      ? product?.customer_price
      : null;

  if (
    privatePrice !== null &&
    privatePrice !== undefined &&
    privatePrice !== ""
  ) {
    html += `
      <div class="private-price detail-price">
        💰 قیمت اختصاصی شما:
        ${formatPrice(
          privatePrice,
          product.customer_currency || "تومان"
        )}
      </div>
    `;
  } else if (
    product.base_price !== null &&
    product.base_price !== undefined &&
    product.base_price !== ""
  ) {
    html += `
      <div class="price detail-price">
        💰 ${formatPrice(
          product.base_price,
          product.base_currency || "تومان"
        )}
      </div>
    `;
  }

  if (product.intro) {
    html += `
      <section class="detail-section">
        <h3>معرفی محصول</h3>
        <p>${formatText(product.intro)}</p>
      </section>
    `;
  }

  if (product.composition) {
    html += `
      <section class="detail-section">
        <h3>ترکیبات</h3>
        <p>${formatText(product.composition)}</p>
      </section>
    `;
  }

  if (product.benefits) {
    html += `
      <section class="detail-section">
        <h3>مزایا</h3>
        <p>${formatText(product.benefits)}</p>
      </section>
    `;
  }

  if (product.use_text) {
    html += `
      <section class="detail-section">
        <h3>نحوه مصرف</h3>
        <p>${formatText(product.use_text)}</p>
      </section>
    `;
  }

  if (product.warnings) {
    html += `
      <section class="detail-section">
        <h3>هشدارها</h3>
        <p>${formatText(product.warnings)}</p>
      </section>
    `;
  }

  if (product.video_url) {
    html += `
      <section class="detail-section">
        <h3>🎬 ویدئوی محصول</h3>

        <video
          class="product-video"
          controls
          preload="metadata"
          src="${escapeHtml(product.video_url)}">
        </video>
      </section>
    `;
  }

  if (product.catalog_pdf_url) {
    html += `
      <section class="detail-section">
        <h3>📄 کاتالوگ محصول</h3>

        <a
          class="catalog-link"
          href="${escapeHtml(product.catalog_pdf_url)}"
          target="_blank"
          rel="noopener">
          مشاهده کاتالوگ
        </a>
      </section>
    `;
  }

  html += `
    </div>
  `;

  content.innerHTML = html;

  modal.classList.remove("hidden");

  if (tg?.BackButton) {
    try {
      tg.BackButton.show();

      tg.BackButton.onClick(closeModal);
    } catch (e) {}
  }
}

function formatText(value) {
  return escapeHtml(value)
    .replace(/\r\n/g, "<br>")
    .replace(/\n/g, "<br>");
}

function closeModal() {
  const modal = document.getElementById("modal");

  if (modal) {
    modal.classList.add("hidden");
  }

  if (tg?.BackButton) {
    try {
      tg.BackButton.hide();
    } catch (e) {}
  }
}


/* =========================
   Admin
========================= */

function openAdmin() {
  if (!isAdmin) {
    alert("شما دسترسی مدیریت ندارید.");
    return;
  }

  const modal = document.getElementById("adminModal");

  if (!modal) return;

  modal.classList.remove("hidden");

  loadAdminPanel();
}

function closeAdmin() {
  const modal = document.getElementById("adminModal");

  if (modal) {
    modal.classList.add("hidden");
  }
}

async function loadAdminPanel() {
  const loading = document.getElementById("adminLoading");
  const error = document.getElementById("adminError");

  if (loading) {
    loading.classList.remove("hidden");
  }

  if (error) {
    error.classList.add("hidden");
    error.textContent = "";
  }

  try {
    const result = await post("/api/admin/products");

    const adminProducts =
      Array.isArray(result)
        ? result
        : result?.products || [];

    renderAdminProducts(adminProducts);
    renderAdminAccount();

    await loadCustomers();

  } catch (err) {
    console.error("Admin panel error:", err);

    if (error) {
      error.textContent =
        err.message || "خطا در دریافت اطلاعات مدیریت.";

      error.classList.remove("hidden");
    }
  } finally {
    if (loading) {
      loading.classList.add("hidden");
    }
  }
}

function renderAdminAccount() {
  const box =
    document.getElementById("adminAccountInfo");

  if (!box) return;

  if (!currentUser) {
    box.innerHTML = "کاربر شناسایی نشد.";
    return;
  }

  const name =
    [currentUser.first_name, currentUser.last_name]
      .filter(Boolean)
      .join(" ") ||
    currentUser.username ||
    "کاربر";

  box.innerHTML = `
    <strong>${escapeHtml(name)}</strong>
    <br>
    ${
      currentUser.username
        ? `@${escapeHtml(currentUser.username)}`
        : ""
    }
    <br>
    Telegram ID:
    ${escapeHtml(currentUser.id)}
  `;
}

function renderAdminProducts(list) {
  const container =
    document.getElementById("adminProducts");

  if (!container) return;

  if (!list.length) {
    container.innerHTML =
      `<div class="message">محصولی وجود ندارد.</div>`;
    return;
  }

  container.innerHTML = list.map(product => {
    const name = getProductName(product);

    return `
      <div class="admin-product">

        <div class="admin-product-title">
          ${escapeHtml(name)}
        </div>

        <label>
          قیمت عمومی
          <input
            type="number"
            id="price-${Number(product.id)}"
            value="${
              product.base_price ??
              ""
            }"
            placeholder="مثلاً 200000"
          >
        </label>

        <button
          onclick="savePublicPrice(${Number(product.id)})">
          💾 ذخیره قیمت
        </button>

        <hr>

        <label>
          ویدئو
          <input
            type="file"
            id="video-${Number(product.id)}"
            accept="video/*"
          >
        </label>

        <button
          onclick="uploadProductVideo(${Number(product.id)})">
          🎬 آپلود ویدئو
        </button>

        ${
          product.video_url
            ? `
              <button
                onclick="deleteProductVideo(${Number(product.id)})">
                🗑 حذف ویدئو
              </button>
            `
            : ""
        }

      </div>
    `;
  }).join("");
}

async function savePublicPrice(productId) {
  const input =
    document.getElementById(`price-${productId}`);

  if (!input) return;

  const value = input.value.trim();

  try {
    await post("/api/admin/update-price", {
      product_id: Number(productId),
      price: value === "" ? null : Number(value),
      currency: "تومان"
    });

    alert("قیمت ذخیره شد.");

    await loadProducts();
    await loadAdminPanel();

  } catch (err) {
    alert(
      "خطا در ذخیره قیمت:\n" +
      (err.message || "")
    );
  }
}


/* =========================
   Video
========================= */

async function uploadProductVideo(productId) {
  const input =
    document.getElementById(`video-${productId}`);

  if (!input?.files?.length) {
    alert("ابتدا فایل ویدئو را انتخاب کنید.");
    return;
  }

  const file = input.files[0];

  if (file.size > 100 * 1024 * 1024) {
    alert("حجم ویدئو نباید بیشتر از 100 مگابایت باشد.");
    return;
  }

  if (!file.type.startsWith("video/")) {
    alert("فایل انتخاب‌شده ویدئو نیست.");
    return;
  }

  const formData = new FormData();

  formData.append(
    "product_id",
    String(productId)
  );

  formData.append(
    "file",
    file
  );

  try {
    const headers = {};

    if (tg?.initData) {
      headers["X-Telegram-Init-Data"] =
        tg.initData;
    }

    const response = await fetch(
      WORKER_URL + "/api/admin/upload-video",
      {
        method: "POST",
        headers,
        body: formData
      }
    );

    const text = await response.text();

    let result = {};

    try {
      result = text ? JSON.parse(text) : {};
    } catch (e) {}

    if (!response.ok) {
      throw new Error(
        result?.error ||
        result?.message ||
        text ||
        `HTTP ${response.status}`
      );
    }

    alert("ویدئو با موفقیت آپلود شد.");

    await loadProducts();
    await loadAdminPanel();

  } catch (err) {
    console.error(err);

    alert(
      "خطا در آپلود ویدئو:\n" +
      (err.message || "")
    );
  }
}

async function deleteProductVideo(productId) {
  if (!confirm("ویدئوی این محصول حذف شود؟")) {
    return;
  }

  try {
    await post("/api/admin/remove-video", {
      product_id: Number(productId)
    });

    alert("ویدئو حذف شد.");

    await loadProducts();
    await loadAdminPanel();

  } catch (err) {
    alert(
      "خطا در حذف ویدئو:\n" +
      (err.message || "")
    );
  }
}


/* =========================
   Customers
========================= */

async function loadCustomers() {
  const select =
    document.getElementById("customerSelect");

  if (!select) return;

  try {
    const result =
      await post("/api/admin/customers");

    const customers =
      Array.isArray(result)
        ? result
        : result?.customers || [];

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
        "بدون نام";

      const option =
        document.createElement("option");

      option.value = customer.id;

      option.textContent =
        `${name} - ${
          customer.username
            ? "@" + customer.username
            : customer.telegram_user_id || ""
        }`;

      select.appendChild(option);
    });

  } catch (err) {
    console.error("Customers error:", err);
  }
}

async function loadCustomerPrices(customerId) {
  if (!customerId) {
    selectedCustomer = null;

    const info =
      document.getElementById("customerInfo");

    const prices =
      document.getElementById("customerPrices");

    if (info) {
      info.classList.add("hidden");
      info.innerHTML = "";
    }

    if (prices) {
      prices.innerHTML = "";
    }

    return;
  }

  selectedCustomer = customerId;

  try {
    const result =
      await post("/api/admin/customer-prices", {
        customer_id: customerId
      });

    const rows =
      Array.isArray(result)
        ? result
        : result?.prices || [];

    renderCustomerPrices(rows);

  } catch (err) {
    console.error("Customer prices error:", err);

    const container =
      document.getElementById("customerPrices");

    if (container) {
      container.innerHTML =
        `<div class="message error">
          ${escapeHtml(err.message || "خطا")}
        </div>`;
    }
  }
}

function renderCustomerPrices(rows) {
  const container =
    document.getElementById("customerPrices");

  const info =
    document.getElementById("customerInfo");

  if (!container) return;

  const priceMap = new Map();

  rows.forEach(row => {
    if (row?.product_id !== undefined) {
      priceMap.set(
        Number(row.product_id),
        row
      );
    }
  });

  if (info) {
    info.classList.remove("hidden");

    const selected =
      document.getElementById("customerSelect");

    const option =
      selected?.options[
        selected.selectedIndex
      ];

    info.innerHTML =
      option
        ? `<strong>${escapeHtml(option.textContent)}</strong>`
        : "";
  }

  container.innerHTML = products
    .map(product => {
      const row =
        priceMap.get(Number(product.id));

      const price =
        row?.price ?? "";

      return `
        <div class="customer-price-row">

          <div>
            <strong>
              ${escapeHtml(
                getProductName(product)
              )}
            </strong>
          </div>

          <input
            type="number"
            id="customer-price-${Number(product.id)}"
            value="${escapeHtml(price)}"
            placeholder="قیمت اختصاصی"
          >

          <button
            onclick="saveCustomerPrice(${Number(product.id)})">
            💾
          </button>

        </div>
      `;
    })
    .join("");
}

async function saveCustomerPrice(productId) {
  if (!selectedCustomer) {
    alert("ابتدا مشتری را انتخاب کنید.");
    return;
  }

  const input =
    document.getElementById(
      `customer-price-${productId}`
    );

  if (!input) return;

  const value = input.value.trim();

  try {
    await post("/api/admin/set-customer-price", {
      customer_id: selectedCustomer,
      product_id: Number(productId),
      price: value === "" ? null : Number(value),
      currency: "تومان"
    });

    alert("قیمت اختصاصی ذخیره شد.");

    await loadCustomerPrices(
      selectedCustomer
    );

    await loadProducts();

  } catch (err) {
    alert(
      "خطا در ذخیره قیمت اختصاصی:\n" +
      (err.message || "")
    );
  }
}


/* =========================
   Events
========================= */

const searchInput =
  document.getElementById("searchInput");

if (searchInput) {
  searchInput.addEventListener(
    "input",
    renderProducts
  );
}

const adminButton =
  document.getElementById("adminButton");

if (adminButton) {
  adminButton.addEventListener(
    "click",
    openAdmin
  );
}

const customerSelect =
  document.getElementById("customerSelect");

if (customerSelect) {
  customerSelect.addEventListener(
    "change",
    event => {
      loadCustomerPrices(
        event.target.value
      );
    }
  );
}


/* =========================
   Global functions
========================= */

window.openProduct = openProduct;
window.closeModal = closeModal;

window.openAdmin = openAdmin;
window.closeAdmin = closeAdmin;

window.selectCategory = selectCategory;

window.savePublicPrice = savePublicPrice;

window.uploadProductVideo =
  uploadProductVideo;

window.deleteProductVideo =
  deleteProductVideo;

window.loadCustomerPrices =
  loadCustomerPrices;

window.saveCustomerPrice =
  saveCustomerPrice;


/* =========================
   Start
========================= */

(async function init() {
  try {
    await authenticate();
  } catch (e) {
    console.error("Auth init error:", e);
  }

  await loadProducts();
})();

این نسخه را کامل جایگزین "app.js" فعلی کن.

نکته مهم: در این نسخه "catalog_pdf_url" دیگر به‌عنوان عکس نمایش داده نمی‌شود؛ به‌عنوان لینک کاتالوگ باز می‌شود. همچنین محدودیت ویدئو به‌درستی روی ۱۰۰ مگابایت تنظیم شده است.

بعد از آپلود فایل، صفحه را کامل Refresh کن و ببین آیا ۲۰ محصول نمایش داده می‌شوند یا نه.
