# AR 互動網頁 MVP

這是一個完全免費技術路線的 WebAR MVP：

- 使用者前台：選擇圖片後進入 AR 掃描
- 掃描頁：相機辨識印刷圖片後播放矩形 MP4 影片
- 管理後台：上傳圖片、影片，發布或下架項目
- 資料儲存：本機 `data/items.json` 與 `public/uploads/`

## 啟動方式

```bash
node server.js
```

開啟：

- 前台：http://localhost:4173/
- 後台：http://localhost:4173/admin.html

後台預設密碼：

```text
admin123
```

公開上線前請改用環境變數設定密碼：

```bash
ADMIN_PASSWORD=你的新密碼 node server.js
```

## 上傳素材

後台每個 AR 項目需要：

- 印刷圖片：JPG 或 PNG
- 2D 影片：MP4，建議 H.264 編碼
- 辨識檔：系統會嘗試自動產生 `.mind`

如果自動產生辨識檔失敗，可以先使用 MindAR 官方免費編譯工具產生 `.mind` 檔，再從後台的備援欄位上傳。

手動測試流程：

1. 開啟 https://hiukim.github.io/mind-ar-js-doc/tools/compile/
2. 把印刷圖片原檔拖進去，按 `Start`
3. 完成後下載 `.mind` 檔
4. 回到本專案後台，上傳同一張圖片、MP4 影片、剛下載的 `.mind`
5. 儲存並發布後，回前台點該圖片進入掃描頁
6. 用手機鏡頭對準實際印刷品測試

## 注意事項

- 相機功能在手機上通常需要 HTTPS；本機測試的 `localhost` 例外。
- AR 函式庫與 A-Frame 已放在 `public/assets/lib/`，後台與掃描頁不需要依賴 CDN。
- 免費方案適合先驗證流程與效果；大量素材、公開高流量或商業活動要再評估部署限制。
