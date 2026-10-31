/* =========================================================
   ACCOUNT UI
========================================================= */

function updateAccountUI() {
  const versionEl = $("appVersion");
  if(versionEl) versionEl.textContent = APP_VERSION;
  const account = $("account");
  const adminButton = $("adminButton");
  const loginBox = $("loginBox");
  const logoutButton = $("logoutButton");

  if (!currentUser) {
    document.body.classList.add("login-active");
    if(loginBox) loginBox.classList.remove("hidden");
    if(logoutButton) logoutButton.classList.add("hidden");
    if (account) {
      account.classList.add("hidden");
    }

    if (adminButton) {
      adminButton.classList.add("hidden");
    }

    const mobileAccount = $("mobileAccountInfo");
    if (mobileAccount) mobileAccount.classList.add("hidden");
    const ordersButton = $("ordersButton");
    if (ordersButton) ordersButton.classList.add("hidden");

    const cartButton = $("cartButton");
    if (cartButton) cartButton.classList.add("hidden");

    const inboxButton = $("letterInboxButton");
    if (inboxButton) inboxButton.classList.add("hidden");


    return;
  }

  document.body.classList.remove("login-active");

  if (loginBox) loginBox.classList.add("hidden");
  if (logoutButton) logoutButton.classList.remove("hidden");

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
    const accountRole = String(currentUser?.role || "").toLowerCase();
    $("accountInfo").textContent =
      isAdmin || accountRole === "admin" || accountRole === "super_admin"
        ? "مدیر نرم‌افزار"
        : accountRole === "sales"
          ? "کارشناس فروش"
          : "مشتری";
  }

  const role = String(currentUser?.role || "").toLowerCase();
  const hasSalesPanel = role === "sales";
  if (adminButton) {
    adminButton.classList.toggle("hidden", !(isAdmin || hasSalesPanel));
    adminButton.textContent = isAdmin ? "⚙️ پنل مدیر نرم‌افزار" : "⚙️ پنل کارشناس فروش";
  }

  // پنل کارشناس فروش همان پنل مدیر نرم‌افزار است، اما فقط بخش‌هایی را
  // نشان می‌دهد که مدیر نرم‌افزار برای این حساب مجاز کرده است.
  const adminMenuItems = document.querySelectorAll("#adminHome .admin-menu-item");
  adminMenuItems.forEach(item => {
    if (isAdmin || role !== "sales") {
      item.classList.remove("hidden");
      return;
    }
    const match = String(item.getAttribute("onclick") || "").match(/showAdminSection\(['\"]([^'\"]+)['\"]\)/);
    const sectionName = match ? match[1] : "";
    const permissionMap = {
      products: "products",
      "edit-products": "products",
      customers: "customers",
      "edit-customers": "customers",
      prices: "prices",
      admins: "admins",
      limits: "limits",
      footer: "footer",
      archives: "products",
      cleanup: "cleanup"
    };
    const needed = permissionMap[sectionName];
    // پنل «تنظیمات» فقط برای مدیر نرم‌افزار است؛ کارشناس از همین پنل
    // اما فقط بخش‌های مجاز دیگر را می‌بیند.
    if (sectionName === "settings") {
      item.classList.add("hidden");
      return;
    }
    const allowed = !!needed && needed !== "cleanup" && adminPermissions.includes(needed);
    item.classList.toggle("hidden", !allowed);
  });

  const adminModalTitle = $("adminModal")?.querySelector(".admin-header h2");
  const adminModalKicker = $("adminModal")?.querySelector(".admin-kicker");
  const adminWelcomeTitle = $("adminHome")?.querySelector(".admin-welcome strong");
  const adminWelcomeText = $("adminHome")?.querySelector(".admin-welcome span");
  if (role === "sales" && !isAdmin) {
    if (adminModalKicker) adminModalKicker.textContent = "مشکفام فارس";
    if (adminModalTitle) adminModalTitle.textContent = "⚙️ پنل کارشناس فروش";
    if (adminWelcomeTitle) adminWelcomeTitle.textContent = "";
    if (adminWelcomeText) adminWelcomeText.textContent = "";
  } else {
    if (adminModalKicker) adminModalKicker.textContent = "مشکفام فارس";
    if (adminModalTitle) adminModalTitle.textContent = "⚙️ پنل مدیر نرم‌افزار";
    if (adminWelcomeTitle) adminWelcomeTitle.textContent = "";
    if (adminWelcomeText) adminWelcomeText.textContent = "";
  }

  const isSalesRole = role === "sales";
  const isSoftwareAdmin = !!isAdmin || role === "admin" || role === "super_admin";
  document.body.dataset.accountRole = isSoftwareAdmin ? "software-admin" : (isSalesRole ? "sales" : "customer");

  const cartButton = $("cartButton");
  if (cartButton) cartButton.classList.toggle("hidden", isSalesRole || isSoftwareAdmin);

  const ordersButton = $("ordersButton");
  if (ordersButton) ordersButton.classList.toggle("hidden", isSalesRole || isSoftwareAdmin);

  const salesReportsButton = $("salesReportsButton");
  if (salesReportsButton) salesReportsButton.classList.add("hidden");

  const inboxButton = $("letterInboxButton");
  if (inboxButton) {
    inboxButton.classList.toggle("hidden", !currentUser || isSoftwareAdmin);
    // Software admin must never see the mailbox button, even if an older
    // stylesheet/cache tries to restore its position.
    inboxButton.style.display = (currentUser && !isSoftwareAdmin) ? "" : "none";
  }

  const headerTools = $("headerShoppingActions");
  if (headerTools) {
    headerTools.style.display = isSoftwareAdmin ? "none" : "";
  }

  const mobileAccount = $("mobileAccountInfo");
  if (mobileAccount) {
    mobileAccount.innerHTML = `
      <span class="mobile-account-avatar">👤</span>
      <span class="mobile-account-text">
        <strong>${escapeHtml(name)}</strong>
        <small>${username ? escapeHtml(username) + " · " : ""}${isAdmin ? "مدیر نرم‌افزار" : (role === "sales" ? "کارشناس فروش" : "نماینده")}</small>
      </span>`;
    mobileAccount.classList.remove("hidden");
  }
}


/* =========================================================
   PRODUCTS
========================================================= */


async function loadProductDetailGallery(productId){
  const box=document.getElementById(`product-detail-gallery-${Number(productId)}`); if(!box)return;
  try{const r=await get(`/api/product-detail-images?product_id=${encodeURIComponent(productId)}`); const images=Array.isArray(r?.images)?r.images:[]; if(!images.length){box.innerHTML="";return;} box.innerHTML=`<div class="product-gallery-grid">${images.map((im,i)=>`<figure class="product-gallery-item"><img src="${escapeHtml(im.file_url||"")}" alt="${escapeHtml(im.caption||"تصویر محصول")}" loading="lazy"><figcaption>${escapeHtml(im.caption||"")}</figcaption></figure>`).join("")}</div>`;}catch(e){console.warn("Product gallery:",e);box.innerHTML="";}
}

async function loadProducts() {
  bootDiag("PRODUCTS", "START");
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
    bootDiag("PRODUCTS", "OK", `${products.length} products`);

  } catch (error) {
    bootDiagError("PRODUCTS", error);
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

      <div id="product-detail-gallery-${Number(product.id)}" class="product-detail-gallery"></div>

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
  loadProductDetailGallery(product.id);

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

function openSalesReports(){
  const role = String(currentUser?.role||"").toLowerCase();
  if(role !== "sales") return appAlert("⚠️ این بخش فقط برای کارشناس فروش است.");
  openAdmin();
}

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

  const role = String(currentUser?.role||"").toLowerCase();
  const canOpenSalesPanel = role === "sales";
  const canOpenReports = false;
  if (!isAdmin && !canOpenSalesPanel && !canOpenReports) {
    if (error) {
      error.textContent =
        "❌ این حساب به پنل مدیریت دسترسی ندارد. لطفاً سامانه را از داخل ربات تلگرام و با حساب مدیر باز کنید.";
      error.classList.remove("hidden");
    }
    return;
  }

  if (canOpenSalesPanel && !isAdmin) {
    // کارشناس همان پنل مدیر را می‌بیند، اما منو و بخش‌ها بر اساس مجوزها فیلتر می‌شوند.
    await loadAdminData();
    showAdminHome();
  } else {
    await loadAdminData();
    // هر بار پنل مدیر نرم‌افزار باز می‌شود، از صفحه اصلی منو شروع شود
    // و آخرین بخش بازشده (مثلاً پاک‌سازی) به صورت خودکار باز نماند.
    showAdminHome();
  }
}

function closeAdmin() {
  const modal = $("adminModal");

  if (modal) {
    modal.classList.add("hidden");
  }
}

async function loadAdminData() {
  const loading = $("adminLoadingOverlay");
  const error = $("adminError");
  if (loading) loading.classList.remove("hidden");
  const accountInfo = $("adminAccountInfo");
  if (accountInfo) accountInfo.classList.add("hidden");
  if (error) { error.classList.add("hidden"); }

  try {
    const role = String(currentUser?.role || "").toLowerCase();
    const sales = role === "sales" && !isAdmin;
    const perms = Array.isArray(adminPermissions) ? adminPermissions : [];
    const tasks = [];

    if (!sales || perms.includes("products")) tasks.push(loadAdminProducts());
    if (!sales || perms.includes("customers") || perms.includes("prices")) tasks.push(loadCustomers());
    if (!sales || perms.includes("requests")) tasks.push(loadAdminRequests());

    await Promise.all(tasks);
    renderAdminAccount();
  } catch (e) {
    console.error(e);
    if (error) {
      error.textContent = "❌ دریافت اطلاعات مدیریت انجام نشد.";
      error.classList.remove("hidden");
    }
  } finally {
    if (loading) loading.classList.add("hidden");
    renderAdminAccount();
    if (accountInfo) accountInfo.classList.remove("hidden");
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

  const roleKey = String(currentUser.role || "").toLowerCase();
  const roleLabel = isAdmin || roleKey === "admin" || roleKey === "super_admin"
    ? "مدیر نرم‌افزار"
    : roleKey === "sales" ? "کارشناس فروش" : "نماینده";

  el.innerHTML = `
    <div><strong>Name:</strong> ${escapeHtml(name)}</div>
    ${currentUser.username ? `<div><strong>Username:</strong> @${escapeHtml(currentUser.username)}</div>` : ""}
    <div><strong>Role:</strong> ${escapeHtml(roleLabel)}</div>
  `;
}


/* =========================================================
   ADMIN PRODUCTS
========================================================= */

function toggleAdminAccordion(id){
  const item=$(id);
  if(!item || item.dataset.toggleBusy === "1") return;
  item.dataset.toggleBusy = "1";
  window.setTimeout(() => {
    item.classList.toggle("open");
    const button=item.querySelector(":scope > .admin-accordion-title");
    if(button) {
      const open = item.classList.contains("open");
      button.setAttribute("aria-expanded", open ? "true" : "false");
      const chevron = button.querySelector(".admin-accordion-chevron");
      if (chevron) chevron.setAttribute("data-open", open ? "1" : "0");
    }
    item.dataset.toggleBusy = "0";
  }, 45);
}
function adminAccordion(id,title,body,extraClass=""){
  return `<div id="${escapeHtml(id)}" class="admin-accordion ${escapeHtml(extraClass)}">
    <button type="button" class="admin-accordion-title" aria-expanded="false" onclick="toggleAdminAccordion('${escapeHtml(id)}'); return false;">
      <span class="admin-accordion-title-text">${title}</span><span class="admin-accordion-chevron" aria-hidden="true">⌄</span>
    </button>
    <div class="admin-accordion-body">${body}</div>
  </div>`;
}

function setAdminCount(id, count) {
  const el = $(id);
  if (el) el.textContent = formatNumber(count);
}

function renderAdminProductList(list, container){
  const allowDelete = container && container.id === "adminProducts";
  if(!container) return;
  if (allowDelete) {
    container.innerHTML = list.map((product, index) => {
      const id = Number(product.id);
      const nameFa = product.name_fa || product.name_en || "محصول";
      const nameEn = product.name_en || "";
      const body=`<div class="admin-accordion-summary"><span>شناسه محصول: ${escapeHtml(id)}</span></div>
        <button type="button" class="admin-danger admin-delete-product-button" onclick="deleteProduct(${id}); return false;">🗑️ حذف محصول</button>`;
      return adminAccordion(`admin-product-delete-${id}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>📦 ${escapeHtml(nameFa)}</strong>${nameEn ? `<small>${escapeHtml(nameEn)}</small>` : ""}`, body, "admin-product-accordion");
    }).join("");
    return;
  }
  container.innerHTML = list.map((product, index) => {
      const id = Number(product.id);
      const nameFa = product.name_fa || "";
      const nameEn = product.name_en || "";
      const benefits = Array.isArray(product.benefits) ? product.benefits.join("\n") : (product.benefits || "");
      const body=`
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
            <label>مزایا<textarea id="benefits-${id}">${escapeHtml(benefits)}</textarea></label>
          </div>
          <label class="admin-active"><input type="checkbox" id="active-${id}" ${product.active !== false ? "checked" : ""}> محصول فعال و قابل نمایش برای مشتریان</label>
          <div class="admin-product-buttons"><button type="button" onclick="saveProduct(${id}); return false;">💾 ذخیره اطلاعات محصول</button></div>
          <div class="admin-product-images-manager" id="admin-detail-images-${id}">
            <div class="admin-media-heading"><strong>🖼️ عکس‌های محصول</strong><button type="button" onclick="loadAdminProductGallery(${id}); return false;">بارگذاری عکس‌های جزئیات</button></div>
            <div class="admin-detail-gallery-list"><div class="admin-gallery-empty">برای مدیریت عکس‌های جزئیات کلیک کنید.</div></div>
          </div>
          <div class="admin-media-grid">
            <div class="admin-media-box"><label>🖼️ تصویر اصلی جدید<input type="file" id="image-${id}" accept="image/*"></label><button type="button" onclick="uploadProductImage(${id}); return false;">آپلود / جایگزینی تصویر اصلی</button>${product.image_url ? `<button type="button" class="danger" onclick="removeProductImage(${id}); return false;">بایگانی تصویر اصلی</button>` : ""}</div>
            <div class="admin-media-box"><label>🎬 ویدئوی جدید<input type="file" id="video-${id}" accept="video/*"></label><button type="button" onclick="uploadProductVideo(${id}); return false;">آپلود / جایگزینی ویدئو</button>${product.video_url ? `<button type="button" class="danger" onclick="removeProductVideo(${id}); return false;">بایگانی ویدئو</button>` : ""}</div>
            <div class="admin-media-box"><label>📄 کاتالوگ جدید<input type="file" id="catalog-${id}" accept="application/pdf,.pdf,image/*"></label><button type="button" onclick="uploadProductCatalog(${id}); return false;">آپلود / جایگزینی کاتالوگ</button>${product.catalog_pdf_url ? `<button type="button" class="danger" onclick="removeProductCatalog(${id}); return false;">بایگانی کاتالوگ</button>` : ""}</div>
          </div>`;
      return adminAccordion(`admin-product-edit-${id}`, `<span class="admin-item-number">${formatNumber(index+1)}</span><strong>📦 ${escapeHtml(nameFa || nameEn || "محصول")}</strong>${nameEn ? `<small>${escapeHtml(nameEn)}</small>` : ""}`, body, "admin-product-accordion");
  }).join("");
}

async function loadAdminProducts() {
  const containers = [$('adminProducts'), $('adminEditProducts')].filter(Boolean);
  if (!containers.length) return;
  try {
    const result = await postJson('/api/admin/products', {});
    const list = Array.isArray(result) ? result : (Array.isArray(result?.products) ? result.products : products);
    setAdminCount("adminProductCountAdd", list.length);
    setAdminCount("adminProductCountEdit", list.length);
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

async function uploadAdminProductGalleryImage(productId){
  const fileInput=document.getElementById(`detail-file-${Number(productId)}`); const captionInput=document.getElementById(`detail-caption-${Number(productId)}`); if(!fileInput?.files?.length)return alert("لطفاً تصویر را انتخاب کنید.");
  const fd=new FormData(); fd.append("product_id",String(productId)); fd.append("caption",captionInput?.value||""); fd.append("file",fileInput.files[0],fileInput.files[0].name);
  try{await apiRequest("/api/admin/upload-product-detail-image",{method:"POST",body:fd}); alert("✅ تصویر جزئیات اضافه شد."); fileInput.value=""; if(captionInput)captionInput.value=""; await loadAdminProductGallery(productId);}catch(e){alert("❌ خطا در آپلود تصویر جزئیات:\n"+e.message);}
}
async function saveAdminProductGalleryCaption(id,productId){const input=document.getElementById(`detail-cap-${Number(id)}`);try{await postJson("/api/admin/update-product-detail-image",{id:Number(id),caption:input?.value||""});alert("✅ عنوان تصویر ذخیره شد.");}catch(e){alert("❌ خطا:\n"+e.message);}}
async function replaceAdminProductGalleryImage(id,productId){const input=document.getElementById(`detail-replace-${Number(id)}`);if(!input?.files?.length)return alert("لطفاً تصویر جدید را انتخاب کنید.");const fd=new FormData();fd.append("id",String(id));fd.append("file",input.files[0],input.files[0].name);try{await apiRequest("/api/admin/replace-product-detail-image",{method:"POST",body:fd});alert("✅ تصویر جایگزین شد.");await loadAdminProductGallery(productId);}catch(e){alert("❌ خطا در جایگزینی:\n"+e.message);}}
async function deleteAdminProductGalleryImage(id,productId){if(!(await appConfirm("این تصویر به بایگانی منتقل و از جزئیات محصول حذف شود؟")))return;try{await postJson("/api/admin/delete-product-detail-image",{id:Number(id)});alert("✅ تصویر بایگانی شد.");await loadAdminProductGallery(productId);}catch(e){alert("❌ خطا:\n"+e.message);}}
async function loadAdminProductGallery(productId){const wrap=document.getElementById(`admin-detail-images-${Number(productId)}`);if(!wrap)return;try{const r=await get(`/api/product-detail-images?product_id=${encodeURIComponent(productId)}`);const images=Array.isArray(r?.images)?r.images:[];const list=wrap.querySelector('.admin-detail-gallery-list');list.innerHTML=`<div class="admin-detail-upload"><input type="file" id="detail-file-${Number(productId)}" accept="image/*"><input id="detail-caption-${Number(productId)}" placeholder="عنوان / توضیح تصویر"><button type="button" onclick="uploadAdminProductGalleryImage(${Number(productId)});return false;">➕ افزودن تصویر</button></div>${images.length?images.map(im=>`<div class="admin-gallery-row"><img src="${escapeHtml(im.file_url||"")}" alt=""><div class="admin-gallery-fields"><input id="detail-cap-${Number(im.id)}" value="${escapeHtml(im.caption||"")}" placeholder="عنوان تصویر"><div><button type="button" onclick="saveAdminProductGalleryCaption(${Number(im.id)},${Number(productId)});return false;">💾 عنوان</button><input type="file" id="detail-replace-${Number(im.id)}" accept="image/*"><button type="button" onclick="replaceAdminProductGalleryImage(${Number(im.id)},${Number(productId)});return false;">🔄 جایگزین</button><button type="button" class="danger" onclick="deleteAdminProductGalleryImage(${Number(im.id)},${Number(productId)});return false;">🗄️ بایگانی</button></div></div></div>`).join(""):"<div class=\"admin-gallery-empty\">هنوز عکس جزئیاتی ثبت نشده است.</div>"}`;}catch(e){console.error(e);alert("❌ دریافت عکس‌های جزئیات انجام نشد.\n"+e.message);}}
async function loadImageArchives(){const box=document.getElementById('imageArchivesList');if(!box)return;box.innerHTML='<div class="message">در حال دریافت بایگانی...</div>';try{const r=await get('/api/admin/image-archives');const files=Array.isArray(r?.files)?r.files:[];box.innerHTML=files.length?files.map(f=>`<div class="archive-image-row"><img src="${escapeHtml(f.file_url)}"><div><strong>${escapeHtml(f.name)}</strong><small>${escapeHtml(f.created_at||'')}</small><div class="archive-restore"><input type="number" min="1" id="archive-product-${escapeHtml(f.name.replace(/[^a-zA-Z0-9]/g,''))}" placeholder="شماره محصول"><button type="button" onclick="restoreArchivedImage(${JSON.stringify(f.storage_key)},this);return false;">↩️ بازگردانی</button></div></div></div>`).join(''):'<div class="message">بایگانی تصویری خالی است.</div>';}catch(e){box.innerHTML=`<div class="message error">دریافت بایگانی انجام نشد: ${escapeHtml(e.message)}</div>`;}}
async function restoreArchivedImage(storageKey,button){const wrap=button.closest('.archive-restore');const productId=Number(wrap?.querySelector('input')?.value);if(!productId)return alert('شماره محصول را وارد کنید.');if(!(await appConfirm('این تصویر به عنوان تصویر اصلی محصول بازگردانی شود؟')))return;try{await postJson('/api/admin/restore-image-archive',{storage_key:storageKey,product_id:productId});alert('✅ تصویر بازگردانی شد.');await loadImageArchives();await loadProducts();await loadAdminProducts();}catch(e){alert('❌ بازگردانی انجام نشد:\n'+e.message);}}

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


