// 注意：由於 pdf.js 是 ESM 模組，我們需要以不同的方式導入
// 在 HTML 中，我們使用了 <script type="module" src="pdf.min.mjs"></script>
// 在這裡，我們將從全局對象訪問 PDFJS
// 或者如果您使用打包工具，可以這樣導入： import * as pdfjsLib from 'pdfjs-dist';
// 這裡假設 pdfjs 已經被全局加載
const { PDFDocument } = PDFLib;

// PDF.js workerSrc 配置 (重要!)
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
} else {
    console.error("pdfjsLib is not defined. Make sure pdf.min.mjs and pdf.worker.min.mjs are loaded correctly.");
}

const dropArea = document.getElementById('drop-area');
const fileElem = document.getElementById('fileElem');
const fileTableBody = document.getElementById('fileTableBody');
const noFilesMessage = document.getElementById('noFilesMessage');
const mergeBtn = document.getElementById('mergeBtn');
const splitBtn = document.getElementById('splitBtn'); // 主分割按鈕
const downloadLink = document.getElementById('downloadLink');
const clearAllFilesBtn = document.getElementById('clearAllFilesBtn');

// --- 分割面板相關元素 ---
const splitPanel = document.getElementById('splitPanel'); // 分割操作面板
const selectedSplitFileName = document.getElementById('selectedSplitFileName');
const splitPageRangeInput = document.getElementById('splitPageRangeInput');
const executeSplitBtn = document.getElementById('executeSplitBtn'); // 開始分割按鈕
const cancelSplitSelectionBtn = document.getElementById('cancelSplitSelectionBtn'); // 取消選擇按鈕
const splitMessage = document.getElementById('splitMessage');

let uploadedFiles = []; // 用於儲存已上傳的檔案物件
let selectedFileForSplit = null; // 用於儲存當前要分割的檔案物件 (不是索引)

// --- 拖曳排序相關變數 ---
let draggedItem = null;

// 輔助函數：格式化檔案大小
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
            thumbnailContainer.innerHTML = '';
            thumbnailContainer.appendChild(img);
        }
    } catch (error) {
        console.error('生成縮圖失敗:', error);
        const thumbnailContainer = rowElement.querySelector('.thumbnail-container');
        if (thumbnailContainer) {
            thumbnailContainer.innerHTML = '<i class="fas fa-file-pdf" style="font-size: 2em; color: #888;"></i>';
        }
    }
}


// 渲染檔案列表
function renderFileList() {
    fileTableBody.innerHTML = '';
    // 清除所有行的 selected-for-split 類名
    document.querySelectorAll('.file-table tbody tr').forEach(row => {
        row.classList.remove('selected-for-split');
    });

    if (uploadedFiles.length === 0) {
        noFilesMessage.style.display = 'block';
        mergeBtn.disabled = true;
        splitBtn.disabled = true;
        clearAllFilesBtn.disabled = true;
        hideSplitPanel(); // 沒有檔案時隱藏分割面板
        return;
    } else {
        noFilesMessage.style.display = 'none';
        mergeBtn.disabled = false;
        splitBtn.disabled = false;
        clearAllFilesBtn.disabled = false;
    }

    uploadedFiles.forEach((file, index) => {
        const row = fileTableBody.insertRow();
        row.dataset.index = index; // 將 index 存入 dataset
        row.draggable = true;
        row.classList.add('draggable-row');

        // 檢查當前檔案是否為被選擇的分割檔案，並添加樣式
        if (selectedFileForSplit && selectedFileForSplit === file) {
            row.classList.add('selected-for-split');
        }

        row.innerHTML = `
            <td>
                <div class="thumbnail-container">
                    <i class="fas fa-spinner fa-spin" style="color: #007bff;"></i>
                </div>
            </td>
            <td>${file.name}</td>
            <td>${formatBytes(file.size)}</td>
            <td>
                <button class="remove-btn" data-index="${index}"><i class="fas fa-trash"></i> 移除</button>
                <button class="split-row-btn" data-index="${index}"><i class="fas fa-cut"></i> 分割</button>
            </td>
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

// 拖曳上傳區域事件 (維持不變)
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

// 點擊選擇檔案 (維持不變)
fileElem.addEventListener('change', (e) => {
    const files = e.target.files;
    handleFiles(files);
});

// 檔案列表中的按鈕點擊事件 (包含移除和單行分割按鈕)
fileTableBody.addEventListener('click', (e) => {
    const target = e.target;
    const rowBtn = target.closest('button'); // 找到最近的按鈕

    if (!rowBtn) return; // 如果沒有點到按鈕，直接返回

    const index = parseInt(rowBtn.dataset.index);
    const file = uploadedFiles[index];

    if (rowBtn.classList.contains('remove-btn')) {
        // 移除檔案
        if (confirm(`確定要移除檔案 "${file.name}" 嗎？`)) {
            uploadedFiles.splice(index, 1);
            // 如果移除的檔案是當前選中要分割的檔案，則隱藏分割面板
            if (selectedFileForSplit === file) {
                selectedFileForSplit = null;
                hideSplitPanel();
            }
            renderFileList();
        }
    } else if (rowBtn.classList.contains('split-row-btn')) {
        // 單行分割按鈕
        showSplitPanelForFile(file);
    }
});


// 清空所有檔案
clearAllFilesBtn.addEventListener('click', () => {
    if (confirm('確定要清空所有已上傳的檔案嗎？')) {
        uploadedFiles = [];
        selectedFileForSplit = null; // 清空時也重置分割選擇
        renderFileList();
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
    splitBtn.disabled = true; // 禁用主分割按鈕
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

// --- 分割 PDF 操作面板邏輯 ---

// 顯示分割面板並設置選定的檔案
function showSplitPanelForFile(file) {
    selectedFileForSplit = file;
    selectedSplitFileName.textContent = file.name;
    splitPageRangeInput.value = ''; // 清空輸入框
    splitMessage.style.display = 'none'; // 隱藏之前的消息
    splitPanel.style.display = 'block'; // 顯示面板

    // 高亮顯示被選中的檔案行
    document.querySelectorAll('.file-table tbody tr').forEach(row => {
        row.classList.remove('selected-for-split');
        if (uploadedFiles[parseInt(row.dataset.index)] === file) {
            row.classList.add('selected-for-split');
        }
    });

    // 滾動到分割面板，讓使用者看到
    splitPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 隱藏分割面板
function hideSplitPanel() {
    splitPanel.style.display = 'none';
    selectedFileForSplit = null; // 清空選中的檔案
    // 移除所有行的 selected-for-split 類名
    document.querySelectorAll('.file-table tbody tr').forEach(row => {
        row.classList.remove('selected-for-split');
    });
}

// 主分割按鈕點擊事件 (僅用於引導選擇)
splitBtn.addEventListener('click', () => {
    if (uploadedFiles.length === 0) {
        alert('請先上傳 PDF 檔案。');
        return;
    }
    // 如果只有一個檔案，則自動選取該檔案並顯示面板
    if (uploadedFiles.length === 1) {
        showSplitPanelForFile(uploadedFiles[0]);
    } else {
        alert('請點擊檔案列表旁邊的「分割」按鈕來選擇要分割的檔案。');
        // 可以滾動到檔案列表，或閃爍一下列表
        fileTableBody.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

// 取消選擇按鈕
cancelSplitSelectionBtn.addEventListener('click', hideSplitPanel);


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

// 執行分割按鈕點擊事件 (在面板中)
executeSplitBtn.addEventListener('click', async () => {
    const pageRangeStr = splitPageRangeInput.value.trim();
    if (!pageRangeStr) {
        displaySplitMessage('error', '請輸入要分割的頁碼範圍。');
        return;
    }

    if (!selectedFileForSplit) {
        displaySplitMessage('error', '沒有選取要分割的檔案。請先在列表中選擇一個。');
        return;
    }

    splitMessage.style.display = 'none';
    executeSplitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 分割中...';
    executeSplitBtn.disabled = true;
    cancelSplitSelectionBtn.disabled = true; // 禁用取消按鈕

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

        // 創建新的 PDF 文檔
        const newPdf = await PDFDocument.create();
        // PDF-LIB 的頁碼是從 0 開始，所以要減 1
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToExtract.map(p => p - 1)); 

        copiedPages.forEach((page) => newPdf.addPage(page));

        const pdfBytes = await newPdf.save();
        downloadPdf(pdfBytes, `${selectedFileForSplit.name.replace('.pdf', '')}_分割後.pdf`);
        
        displaySplitMessage('success', 'PDF 分割成功！檔案已下載。');
        // 成功後延遲隱藏面板，並重置狀態
        setTimeout(() => {
            hideSplitPanel();
            splitPageRangeInput.value = ''; // 清空輸入框
            displaySplitMessage('success', ''); // 清空訊息
        }, 2000); 

    } catch (error) {
        console.error('分割 PDF 時發生錯誤：', error);
        displaySplitMessage('error', `分割 PDF 失敗：${error.message || error}`);
    } finally {
        executeSplitBtn.innerHTML = '<i class="fas fa-cut"></i> 開始分割';
        executeSplitBtn.disabled = false;
        cancelSplitSelectionBtn.disabled = false; // 重新啟用取消按鈕
    }
});

// 顯示訊息輔助函數 (適用於分割面板)
function displaySplitMessage(type, message) {
    splitMessage.textContent = message;
    splitMessage.className = `split-message ${type}`;
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

// --- 拖曳排序邏輯 (維持不變) ---
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
    draggedItem = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
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

        const [movedFile] = uploadedFiles.splice(draggedIndex, 1);
        uploadedFiles.splice(targetIndex, 0, movedFile);

        renderFileList();
    }
}

function handleDragEnd() {
    this.classList.remove('dragging');
    fileTableBody.querySelectorAll('tr').forEach(row => {
        row.style.borderTop = '';
        row.style.borderBottom = '';
    });
    draggedItem = null;
}


// 初始化時渲染列表並添加監聽器
renderFileList();