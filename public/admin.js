const state = {
  imageFile: null,
  videoFile: null,
  targetFile: null,
  generatedTarget: null,
  imageSize: null,
  videoSize: null,
};

const loginPanel = document.querySelector("#loginPanel");
const adminPanel = document.querySelector("#adminPanel");
const loginForm = document.querySelector("#loginForm");
const itemForm = document.querySelector("#itemForm");
const adminItems = document.querySelector("#adminItems");
const compileStatus = document.querySelector("#compileStatus");
const submitButton = document.querySelector("#submitButton");
const logoutButton = document.querySelector("#logoutButton");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = new FormData(loginForm).get("password");
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    setStatus("密碼不正確，請再試一次。", "error");
    return;
  }

  loginPanel.hidden = true;
  adminPanel.hidden = false;
  logoutButton.hidden = false;
  await refreshItems();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  location.reload();
});

document.querySelector("#refreshButton").addEventListener("click", refreshItems);

document.querySelector("#imageInput").addEventListener("change", async (event) => {
  state.imageFile = event.target.files[0] || null;
  state.generatedTarget = null;
  state.imageSize = null;

  if (!state.imageFile) return;

  try {
    state.imageSize = await readImageSize(state.imageFile);
    await compileImageTarget(state.imageFile);
  } catch (error) {
    setStatus(`自動產生辨識檔失敗：${error.message}。可以改用 .mind 備援上傳。`, "error");
  }
});

document.querySelector("#videoInput").addEventListener("change", async (event) => {
  state.videoFile = event.target.files[0] || null;
  state.videoSize = null;
  if (state.videoFile) {
    state.videoSize = await readVideoSize(state.videoFile);
  }
});

document.querySelector("#targetInput").addEventListener("change", (event) => {
  state.targetFile = event.target.files[0] || null;
  if (state.targetFile) {
    setStatus("已選擇 .mind 備援辨識檔。", "ok");
  }
});

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus("正在儲存素材...", "");

  try {
    const formData = new FormData(itemForm);
    const targetFile = state.targetFile || state.generatedTarget;

    if (!state.imageFile || !state.videoFile || !targetFile) {
      throw new Error("請確認圖片、影片與辨識檔都已準備完成。");
    }

    const payload = {
      title: formData.get("title"),
      published: formData.get("published") === "on",
      sortOrder: Number(formData.get("sortOrder") || 1),
      imageWidth: state.imageSize?.width || 1,
      imageHeight: state.imageSize?.height || 1,
      videoWidth: state.videoSize?.width || 1,
      videoHeight: state.videoSize?.height || 1,
      image: await fileToPayload(state.imageFile),
      video: await fileToPayload(state.videoFile),
      target: await fileToPayload(targetFile, "target.mind"),
    };

    const response = await fetch("/api/admin/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "儲存失敗。");

    itemForm.reset();
    state.imageFile = null;
    state.videoFile = null;
    state.targetFile = null;
    state.generatedTarget = null;
    state.imageSize = null;
    state.videoSize = null;
    setStatus("已新增項目。", "ok");
    await refreshItems();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

async function refreshItems() {
  const response = await fetch("/api/admin/items");
  if (response.status === 401) return;

  const items = await response.json();
  adminItems.innerHTML = "";

  if (items.length === 0) {
    adminItems.innerHTML = `<p class="hint">目前沒有素材。新增後會出現在這裡。</p>`;
    return;
  }

  items
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach((item) => {
      const row = document.createElement("article");
      row.className = "admin-item";
      row.innerHTML = `
        <img src="${item.imageUrl}" alt="${escapeHtml(item.title)}" />
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p class="hint">排序 ${item.sortOrder || 0} · ${item.published ? "已發布" : "未發布"}</p>
          <div class="item-actions">
            <button class="ghost-button" data-action="toggle" data-id="${item.id}" type="button">
              ${item.published ? "下架" : "發布"}
            </button>
            <a class="ghost-button" href="/ar.html?id=${item.id}" target="_blank">測試掃描</a>
            <button class="danger-button" data-action="delete" data-id="${item.id}" type="button">刪除</button>
          </div>
        </div>
      `;
      row.querySelector('[data-action="toggle"]').addEventListener("click", () => togglePublish(item));
      row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteItem(item));
      adminItems.appendChild(row);
    });
}

async function togglePublish(item) {
  await fetch(`/api/admin/items/${item.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ published: !item.published }),
  });
  await refreshItems();
}

async function deleteItem(item) {
  if (!confirm(`確定刪除「${item.title}」？`)) return;
  await fetch(`/api/admin/items/${item.id}`, { method: "DELETE" });
  await refreshItems();
}

async function compileImageTarget(file) {
  const Compiler = window.MINDAR?.IMAGE?.Compiler || window.MINDAR?.Compiler;
  if (!Compiler) {
    throw new Error("AR 編譯器尚未載入，請改用 .mind 備援上傳，或用一般 Chrome/Safari 開啟後台再試");
  }

  setStatus("正在產生圖片辨識檔，圖片越大需要越久...", "");
  const image = await fileToImage(file);
  const compiler = new Compiler();
  await compiler.compileImageTargets([image], (progress) => {
    const percent = Math.round(progress * 100);
    setStatus(`正在產生圖片辨識檔 ${percent}%...`, "");
  });
  const buffer = await compiler.exportData();
  state.generatedTarget = new File([buffer], "target.mind", { type: "application/octet-stream" });
  setStatus("辨識檔已產生，可以新增項目。", "ok");
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片讀取失敗"));
    image.src = URL.createObjectURL(file);
  });
}

function readImageSize(file) {
  return fileToImage(file).then((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
}

function readVideoSize(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => reject(new Error("影片讀取失敗"));
    video.src = URL.createObjectURL(file);
  });
}

function fileToPayload(file, fallbackName) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        name: file.name || fallbackName,
        type: file.type || "application/octet-stream",
        base64: result.split(",")[1],
      });
    };
    reader.onerror = () => reject(new Error("檔案讀取失敗"));
    reader.readAsDataURL(file);
  });
}

function setStatus(message, kind) {
  compileStatus.textContent = message;
  if (kind) {
    compileStatus.dataset.kind = kind;
  } else {
    delete compileStatus.dataset.kind;
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
