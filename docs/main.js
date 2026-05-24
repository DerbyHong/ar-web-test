function toRelativePath(url) {
  if (!url) return "";
  return url.replace(/^\//, "./");
}

async function loadItems() {
  const gallery = document.querySelector("#gallery");
  const emptyState = document.querySelector("#emptyState");

  try {
    // 為了相容 GitHub Pages 等純靜態託管環境，直接讀取相對路徑的 data/items.json
    const response = await fetch("data/items.json");
    const items = await response.json();

    gallery.innerHTML = "";
    emptyState.hidden = items.length > 0;

    items.forEach((item) => {
      const link = document.createElement("a");
      link.className = "target-tile";
      link.href = `ar.html?id=${encodeURIComponent(item.id)}`;
      link.innerHTML = `
        <img src="${toRelativePath(item.imageUrl)}" alt="${escapeHtml(item.title)}" />
        <span class="tile-body">
          <span class="tile-title">${escapeHtml(item.title)}</span>
          <span class="tile-action">掃描</span>
        </span>
      `;
      gallery.appendChild(link);
    });
  } catch (error) {
    gallery.innerHTML = `<p class="status" data-kind="error">讀取圖片清單失敗，請確認伺服器正在執行，或確認 data/items.json 檔案存在。</p>`;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

loadItems();
