console.log("MOSHKFAM TEST JS LOADED");

document.addEventListener("DOMContentLoaded", async function () {

  const loading = document.getElementById("loading");
  const productCount = document.getElementById("productCount");
  const productGrid = document.getElementById("productGrid");

  loading.textContent = "✅ JavaScript جدید اجرا شد...";

  try {

    const response = await fetch(
      "https://moshkfam-telegram-bot.dehghaniweb.workers.dev/api/products"
    );

    loading.textContent = "✅ ارتباط با Worker برقرار شد...";

    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }

    const data = await response.json();

    console.log("API DATA:", data);

    const products = Array.isArray(data)
      ? data
      : (Array.isArray(data.products) ? data.products : []);

    productCount.textContent = products.length + " محصول";

    if (products.length === 0) {
      loading.textContent = "❌ API پاسخ داد ولی محصولی وجود ندارد.";
      return;
    }

    loading.textContent = "✅ " + products.length + " محصول دریافت شد.";

    productGrid.innerHTML = products.map(function(product) {

      return `
        <div class="product-card">

          <div class="product-image">
            <img
              src="${product.image_url || ""}"
              alt="${product.name_fa || ""}"
              onerror="this.style.display='none'"
            >
          </div>

          <div class="product-info">

            <h3>${product.name_fa || "بدون نام"}</h3>

            ${
              product.category
                ? `<div class="product-category">${product.category}</div>`
                : ""
            }

            ${
              product.package
                ? `<div>${product.package}</div>`
                : ""
            }

            ${
              product.maker
                ? `<div>${product.maker}</div>`
                : ""
            }

          </div>

        </div>
      `;

    }).join("");

  } catch (error) {

    console.error("MOSHKFAM ERROR:", error);

    loading.textContent =
      "❌ خطا در اجرای JavaScript: " + error.message;

  }

});
