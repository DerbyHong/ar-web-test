const loading = document.querySelector("#loading");
const arRoot = document.querySelector("#arRoot");
const scanHint = document.querySelector("#scanHint");

start();

function toRelativePath(url) {
  if (!url) return "";
  return url.replace(/^\//, "./");
}

async function start() {
  const params = new URLSearchParams(location.search);
  const itemId = params.get("id");

  if (!itemId) {
    showError("沒有選擇圖片，請先回到首頁。");
    return;
  }

  try {
    // 為了相容 GitHub Pages 等純靜態託管環境，直接讀取相對路徑的 data/items.json
    const response = await fetch("data/items.json");
    const items = await response.json();
    const item = items.find((entry) => entry.id === itemId);

    if (!item) {
      showError("找不到這張圖片，可能尚未發布或已被下架。");
      return;
    }

    buildScene(item);
  } catch (error) {
    showError("讀取 AR 資料失敗，請稍後再試。");
  }
}

function buildScene(item) {
  const imageRatio = item.imageHeight && item.imageWidth ? item.imageHeight / item.imageWidth : 0.7;
  const videoHeight = Number(imageRatio.toFixed(4));

  arRoot.innerHTML = `
    <a-scene
      mindar-image="imageTargetSrc: ${toRelativePath(item.targetUrl)}; filterMinCF: 0.0001; filterBeta: 0.001;"
      color-space="sRGB"
      renderer="colorManagement: true"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
      embedded>
      <a-assets>
        <video
          id="overlayVideo"
          src="${toRelativePath(item.videoUrl)}"
          preload="auto"
          muted
          loop
          playsinline
          webkit-playsinline
          crossorigin="anonymous"></video>
      </a-assets>
      <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
      <a-entity id="target" mindar-image-target="targetIndex: 0">
        <a-video
          id="videoPlane"
          src="#overlayVideo"
          width="1"
          height="${videoHeight}"
          position="0 0 0"
          rotation="0 0 0"></a-video>
      </a-entity>
    </a-scene>
  `;

  const scene = arRoot.querySelector("a-scene");
  const target = arRoot.querySelector("#target");
  const video = arRoot.querySelector("#overlayVideo");

  // 強制載入影片媒體源以確保 A-Frame 能順利渲染
  video.load();

  scene.addEventListener("arReady", () => {
    // 當 AR 場景與相機準備就緒，將 Loading 改為開始按鈕以解鎖影片自動播放
    loading.innerHTML = `
      <h1>準備就緒！</h1>
      <p>點擊下方按鈕啟動掃描，並對準您所選擇的印刷圖片。</p>
      <button id="startButton" class="button" style="margin-top: 20px; min-width: 180px; font-size: 16px;">開始體驗</button>
    `;

    const startButton = loading.querySelector("#startButton");
    startButton.addEventListener("click", () => {
      // 關鍵：在使用者點擊事件（User Gesture）中呼叫 play & pause 解鎖自動播放限制
      video.play().then(() => {
        video.pause();
      }).catch((err) => {
        console.warn("影片解鎖失敗：", err);
      });

      loading.hidden = true;
      scanHint.hidden = false;
    });
  });

  scene.addEventListener("arError", () => {
    showError("相機啟動失敗。請確認使用 HTTPS 或 localhost，並允許相機權限。");
  });

  target.addEventListener("targetFound", async () => {
    scanHint.hidden = true;
    try {
      video.currentTime = 0;
      await video.play();
    } catch (error) {
      video.muted = true;
      await video.play().catch(() => {});
    }
  });

  target.addEventListener("targetLost", () => {
    scanHint.hidden = false;
    video.pause();
  });
}

function showError(message) {
  loading.hidden = false;
  loading.innerHTML = `
    <h1>無法開始掃描</h1>
    <p>${escapeHtml(message)}</p>
  `;
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
