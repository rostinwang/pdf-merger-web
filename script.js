// 注意：由於 pdf.js 是 ESM 模組，我們需要以不同的方式導入
// 在 HTML 中，我們使用了 <script type="module" src="pdf.min.mjs"></script>
// 在這裡，我們將從全局對象訪問 PDFJS
// 或者如果您使用打包工具，可以這樣導入： import * as pdfjsLib from 'pdfjs-dist';
// 這裡假設 pdfjs 已經被全局加載
const { PDFDocument } = PDFLib;

// PDF.js workerSrc 配置 (重要!)
// 確保這是正確的 worker 檔案路徑
// 如果您本地開發或部署，可能需要將 worker 檔案放在正確的相對路徑
// 這裡使用 CDN 路徑，與 HTML 中的引入一致
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
} else {
    console.error("pdfjsLib is not defined. Make sure pdf.min.mjs and pdf.worker.min.mjs are loaded correctly.");
}

const dropArea = document.getElementById('drop-area');
const fileElem = document.getElementById('fileElem');
const fileTableBody = document.getElementById('fileTableBody'); // 修改為 ID
const noFilesMessage = document.getElementById('noFilesMessage');
const mergeBtn = document.getElementById('mergeBtn');
const splitBtn = document.getElementById('splitBtn');
const downloadLink = document.getElementById('downloadLink');
const clearAllFilesBtn = document.getElementById('clearAllFilesBtn'); // 新增清空按鈕

// --- 模態視窗相關元素 (維持不變) ---
const splitModal = document.getElementById('splitModal');
const closeButton = splitModal.querySelector('.close-button');
const splitFileName = document.getElementById('splitFileName');
const pageRangeInput = document.getElementById('pageRangeInput');
const executeSplitBtn = document.getElementById('executeSplitBtn');
const cancelSplitBtn = document.getElementById('cancelSplitBtn');
const splitMessage = document.getElementById('splitMessage');

let uploadedFiles = []; // 用於儲存已上傳的檔案物件
let selectedFileForSplit = null; // 用於儲存當前要分割的檔案

// --- 拖曳排序相關變數 ---
let draggedItem = null;

// 輔助函數：格式化檔案大小 (維持不變)
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 生成 PDF 縮圖
async function generateThumbnail(file, rowElement) {
    if (typeof pdfjsLib === 'undefined' || !pdfjsLib.getDocument) {
        console.warn("pdfjsLib is not fully loaded or available. Cannot generate thumbnail.");
        return;
    }

    try {
        const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1); // 獲取第一頁

        const viewport = page.getViewport({ scale: 1 });
        const desiredWidth = 60; // 縮圖寬度
        const scale = desiredWidth / viewport.width;
        const scaledViewport = page.getViewport({ scale: scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = scaledViewport.height;
        canvas.width = scaledViewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport,
        };
        await page.render(renderContext).promise;

        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/png');
        img.alt = 'PDF 縮圖';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';

        const thumbnailContainer = rowElement.querySelector('.thumbnail-container');
        if (thumbnailContainer) {
            thumbnailContainer.innerHTML = ''; // 清空可能存在的內容
            thumbnailContainer.appendChild(img);
        }
    } catch (error) {
        console.error('生成縮圖失敗:', error);
        const thumbnailContainer = rowElement.querySelector('.thumbnail-container');
        if (thumbnailContainer) {
            thumbnailContainer.innerHTML = '<i class="fas fa-file-pdf" style="font-size: 2em; color: #888;"></i>'; // 顯示預設圖標
        }
    }
}


// 渲染檔案列表
function renderFileList() {
    fileTableBody.innerHTML = ''; // 清空現有列表
    if (uploadedFiles.length === 0) {
        noFilesMessage.style.display = 'block';
        mergeBtn.disabled = true; // 沒有檔案時禁用按鈕
        splitBtn.disabled = true;
        clearAllFilesBtn.disabled = true; // 禁用清空按鈕
        return;
    } else {
        noFilesMessage.style.display = 'none';
        mergeBtn.disabled = false;
        splitBtn.disabled = false;
        clearAllFilesBtn.disabled = false; // 啟用清空按鈕
    }

    uploadedFiles.forEach((file, index) => {
        const row = fileTableBody.insertRow();
        row.dataset.index = index; // 儲存索引以便移除
        row.draggable = true; // 設置為可拖曳
        row.classList.add('draggable-row'); // 添加一個類名用於 CSS 和 JS 選擇器

        row.innerHTML = `
            <td>
                <div class="thumbnail-container">
                    <i class="fas fa-spinner fa-spin" style="color: #007bff;"></i>
                </div>
            </td>
            <td>${file.name}</td>
            <td>${formatBytes(file.size)}</td>
            <td><button class="remove-btn" data-index="${index}"><i class="fas fa-trash"></i> 移除</button></td>
        `;
        // 非同步生成縮圖
        generateThumbnail(file, row);
    });
    addDragListeners(); // 每次渲染後重新添加拖曳監聽器
}

// 處理檔案上傳（拖曳或點擊）
function handleFiles(files) {
    for (const file of files) {
        if (file.type === 'application/pdf') {
            // 避免重複上傳同名檔案，可以進一步優化為檢查檔案內容或唯一ID
            if (!uploadedFiles.some(f => f.name === file.name && f.size === file.size)) {
                uploadedFiles.push(file);
            } else {
                console.warn(`檔案 "${file.name}" 已存在，已跳過。`);
            }
        } else {
            alert(`檔案 "${file.name}" 不是 PDF 格式，已跳過。`);
        }
    }
    renderFileList();
}

// 拖曳事件監聽器 (保持不變)
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.classList.add('highlight');
});

dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('highlight');
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.classList.remove('highlight');
    const files = e.dataTransfer.files;
    handleFiles(files);
});

// 點擊選擇檔案 (保持不變)
fileElem.addEventListener('change', (e) => {
    const files = e.target.files;
    handleFiles(files);
});

// 移除檔案 (保持不變)
fileTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn') || e.target.closest('.remove-btn')) {
        const btn = e.target.closest('.remove-btn');
        const indexToRemove = parseInt(btn.dataset.index);
        
        uploadedFiles.splice(indexToRemove, 1);
        
        renderFileList();
    }
});

// 清空所有檔案
clearAllFilesBtn.addEventListener('click', () => {
    if (confirm('確定要清空所有已上傳的檔案嗎？')) {
        uploadedFiles = []; // 清空陣列
        renderFileList(); // 重新渲染列表
    }
});

// 合併 PDF 功能 (維持不變)
mergeBtn.addEventListener('click', async () => {
    if (uploadedFiles.length < 2) {
        alert('請選擇至少兩個 PDF 檔案進行合併。');
        return;
    }

    mergeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 合併中...';
    mergeBtn.disabled = true;
    splitBtn.disabled = true;
    clearAllFilesBtn.disabled = true;

    try {
        const mergedPdf = await PDFDocument.create();
        for (const file of uploadedFiles) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        downloadPdf(mergedPdfBytes, '合併後的檔案.pdf');
        alert('PDF 合併成功！');
    } catch (error) {
        console.error('合併 PDF 時發生錯誤：', error);
        alert('合併 PDF 失敗，請檢查檔案或稍後再試。');
    } finally {
        mergeBtn.innerHTML = '<i class="fas fa-file-pdf"></i> 合併 PDF';
        mergeBtn.disabled = false;
        splitBtn.disabled = false;
        clearAllFilesBtn.disabled = false;
    }
});

// --- 分割 PDF 功能及模態視窗邏輯 (維持不變) ---

// 顯示模態視窗
function showSplitModal(file) {
    selectedFileForSplit = file;
    splitFileName.textContent = file.name;
    pageRangeInput.value = ''; // 清空輸入框
    splitMessage.style.display = 'none'; // 隱藏消息
    splitModal.style.display = 'flex'; // 顯示模態視窗 (使用 flex 居中)
}

// 隱藏模態視窗
function hideSplitModal() {
    splitModal.style.display = 'none';
    selectedFileForSplit = null;
}

// 分割按鈕點擊事件 (維持不變)
splitBtn.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) {
        alert('請先上傳 PDF 檔案。');
        return;
    }

    if (uploadedFiles.length > 1) {
        alert('目前只支援分割單個檔案。請先移除多餘檔案或選擇要分割的檔案。');
        showSplitModal(uploadedFiles[0]); // 臨時方案，自動選取第一個
    } else {
        showSplitModal(uploadedFiles[0]);
    }
});

// 關閉模態視窗按鈕 (維持不變)
closeButton.addEventListener('click', hideSplitModal);
cancelSplitBtn.addEventListener('click', hideSplitModal);

// 當點擊模態視窗外部時關閉 (維持不變)
window.addEventListener('click', (event) => {
    if (event.target == splitModal) {
        hideSplitModal();
    }
});

// 解析頁碼範圍字串 (維持不變)
function parsePageRanges(rangeStr, totalPages) {
    const pages = new Set();
    const parts = rangeStr.split(',').map(part => part.trim()).filter(part => part !== '');

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            if (isNaN(start) || isNaN(end) || start < 1 || end > totalPages || start > end) {
                throw new Error(`無效的頁碼範圍: ${part}`);
            }
            for (let i = start; i <= end; i++) {
                pages.add(i);
            }
        } else {
            const pageNum = Number(part);
            if (isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) {
                throw new Error(`無效的頁碼: ${part}`);
            }
            pages.add(pageNum);
        }
    }
    return Array.from(pages).sort((a, b) => a - b);
}

// 執行分割按鈕點擊事件 (維持不變)
executeSplitBtn.addEventListener('click', async () => {
    const pageRangeStr = pageRangeInput.value.trim();
    if (!pageRangeStr) {
        displaySplitMessage('error', '請輸入要分割的頁碼範圍。');
        return;
    }

    if (!selectedFileForSplit) {
        displaySplitMessage('error', '沒有選取要分割的檔案。');
        return;
    }

    splitMessage.style.display = 'none';
    executeSplitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 分割中...';
    executeSplitBtn.disabled = true;
    cancelSplitBtn.disabled = true;

    try {
        const arrayBuffer = await selectedFileForSplit.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const totalPages = pdfDoc.getPageCount();

        let pagesToExtract;
        try {
            pagesToExtract = parsePageRanges(pageRangeStr, totalPages);
        } catch (error) {
            displaySplitMessage('error', `頁碼輸入錯誤：${error.message}`);
            return;
        }
        
        if (pagesToExtract.length === 0) {
            displaySplitMessage('error', '沒有有效的頁碼可以分割。');
            return;
        }

        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToExtract.map(p => p - 1)); // PDF-LIB 頁碼是從 0 開始

        copiedPages.forEach((page) => newPdf.addPage(page));

        const pdfBytes = await newPdf.save();
        downloadPdf(pdfBytes, `${selectedFileForSplit.name.replace('.pdf', '')}_分割後.pdf`);
        
        displaySplitMessage('success', 'PDF 分割成功！檔案已下載。');
        setTimeout(hideSplitModal, 2000);
    } catch (error) {
        console.error('分割 PDF 時發生錯誤：', error);
        displaySplitMessage('error', `分割 PDF 失敗：${error.message || error}`);
    } finally {
        executeSplitBtn.innerHTML = '<i class="fas fa-cut"></i> 開始分割';
        executeSplitBtn.disabled = false;
        cancelSplitBtn.disabled = false;
    }
});

// 顯示模態視窗中的消息 (維持不變)
function displaySplitMessage(type, message) {
    splitMessage.textContent = message;
    splitMessage.className = `split-message ${type}`; // 設置 class
    splitMessage.style.display = 'block';
}

// 下載 PDF 輔助函數 (維持不變)
function downloadPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.click();
    URL.revokeObjectURL(url);
}

// --- 拖曳排序邏輯 ---
function addDragListeners() {
    const rows = fileTableBody.querySelectorAll('tr.draggable-row');
    rows.forEach(row => {
        row.addEventListener('dragstart', handleDragStart);
        row.addEventListener('dragover', handleDragOver);
        row.addEventListener('dragleave', handleDragLeave);
        row.addEventListener('drop', handleDrop);
        row.addEventListener('dragend', handleDragEnd);
    });
}

function handleDragStart(e) {
    draggedItem = this; // 'this' 指向被拖曳的行
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging'); // 添加拖曳中的樣式
}

function handleDragOver(e) {
    e.preventDefault(); // 允許放下
    e.dataTransfer.dropEffect = 'move';
    // 視覺提示：在拖曳目標上方或下方顯示一個線
    const targetRow = this;
    if (targetRow && targetRow !== draggedItem) {
        const bounding = targetRow.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);
        if (e.clientY - offset > 0) {
            targetRow.style.borderBottom = '2px solid #007bff';
            targetRow.style.borderTop = '';
        } else {
            targetRow.style.borderTop = '2px solid #007bff';
            targetRow.style.borderBottom = '';
        }
    }
}

function handleDragLeave() {
    this.style.borderTop = '';
    this.style.borderBottom = '';
}

function handleDrop(e) {
    e.preventDefault();
    this.style.borderTop = '';
    this.style.borderBottom = '';

    if (draggedItem !== this) {
        const draggedIndex = parseInt(draggedItem.dataset.index);
        const targetIndex = parseInt(this.dataset.index);

        // 更新 uploadedFiles 陣列中的順序
        const [movedFile] = uploadedFiles.splice(draggedIndex, 1);
        uploadedFiles.splice(targetIndex, 0, movedFile);

        // 重新渲染整個列表以反映新順序和更新索引
        renderFileList();
    }
}

function handleDragEnd() {
    this.classList.remove('dragging');
    // 清除所有行的邊框樣式，以防萬一
    fileTableBody.querySelectorAll('tr').forEach(row => {
        row.style.borderTop = '';
        row.style.borderBottom = '';
    });
    draggedItem = null;
}


// 初始化時檢查是否有檔案並添加拖曳監聽器
renderFileList();