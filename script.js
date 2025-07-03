const { PDFDocument } = PDFLib;

const dropArea = document.getElementById('drop-area');
const fileElem = document.getElementById('fileElem');
const fileTableBody = document.querySelector('#fileTable tbody');
const noFilesMessage = document.getElementById('noFilesMessage');
const mergeBtn = document.getElementById('mergeBtn');
const splitBtn = document.getElementById('splitBtn');
const downloadLink = document.getElementById('downloadLink');

// --- 模態視窗相關元素 ---
const splitModal = document.getElementById('splitModal');
const closeButton = splitModal.querySelector('.close-button');
const splitFileName = document.getElementById('splitFileName');
const pageRangeInput = document.getElementById('pageRangeInput');
const executeSplitBtn = document.getElementById('executeSplitBtn');
const cancelSplitBtn = document.getElementById('cancelSplitBtn');
const splitMessage = document.getElementById('splitMessage');

let uploadedFiles = []; // 用於儲存已上傳的檔案物件
let selectedFileForSplit = null; // 用於儲存當前要分割的檔案

// 輔助函數：格式化檔案大小
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 渲染檔案列表
function renderFileList() {
    fileTableBody.innerHTML = ''; // 清空現有列表
    if (uploadedFiles.length === 0) {
        noFilesMessage.style.display = 'block';
        mergeBtn.disabled = true; // 沒有檔案時禁用按鈕
        splitBtn.disabled = true;
        return;
    } else {
        noFilesMessage.style.display = 'none';
        mergeBtn.disabled = false;
        splitBtn.disabled = false;
    }

    uploadedFiles.forEach((file, index) => {
        const row = fileTableBody.insertRow();
        row.dataset.index = index; // 儲存索引以便移除
        row.innerHTML = `
            <td>${file.name}</td>
            <td>${formatBytes(file.size)}</td>
            <td><button class="remove-btn" data-index="${index}"><i class="fas fa-trash"></i> 移除</button></td>
        `;
    });
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

// 拖曳事件監聽器
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

// 點擊選擇檔案
fileElem.addEventListener('change', (e) => {
    const files = e.target.files;
    handleFiles(files);
});

// 移除檔案
fileTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-btn') || e.target.closest('.remove-btn')) {
        const btn = e.target.closest('.remove-btn');
        const indexToRemove = parseInt(btn.dataset.index);
        
        // 使用 splice 移除陣列中的元素
        uploadedFiles.splice(indexToRemove, 1);
        
        // 重新渲染列表以更新索引和顯示
        renderFileList();
    }
});

// 合併 PDF 功能
mergeBtn.addEventListener('click', async () => {
    if (uploadedFiles.length < 2) {
        alert('請選擇至少兩個 PDF 檔案進行合併。');
        return;
    }

    mergeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 合併中...';
    mergeBtn.disabled = true;
    splitBtn.disabled = true;

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
    }
});

// --- 分割 PDF 功能及模態視窗邏輯 ---

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

// 分割按鈕點擊事件
splitBtn.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) {
        alert('請先上傳 PDF 檔案。');
        return;
    }

    if (uploadedFiles.length > 1) {
        // 如果有多個檔案，提示使用者選擇一個
        // 更友善的介面應該是讓使用者在列表中點擊 "分割" 按鈕
        alert('目前只支援分割單個檔案。請先移除多餘檔案或選擇要分割的檔案。');
        // 作為一個臨時方案，我們這裡只處理第一個上傳的檔案
        showSplitModal(uploadedFiles[0]);
    } else {
        showSplitModal(uploadedFiles[0]);
    }
});

// 關閉模態視窗按鈕
closeButton.addEventListener('click', hideSplitModal);
cancelSplitBtn.addEventListener('click', hideSplitModal);

// 當點擊模態視窗外部時關閉
window.addEventListener('click', (event) => {
    if (event.target == splitModal) {
        hideSplitModal();
    }
});

// 解析頁碼範圍字串
// 範例輸入: "1-5, 7, 9-10"
// 輸出: [1, 2, 3, 4, 5, 7, 9, 10] (已排序且去重)
function parsePageRanges(rangeStr, totalPages) {
    const pages = new Set(); // 使用 Set 來自動去重
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
    return Array.from(pages).sort((a, b) => a - b); // 排序並轉為陣列
}

// 執行分割按鈕點擊事件
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

    splitMessage.style.display = 'none'; // 隱藏之前的消息
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

        // 創建新的 PDF 文檔
        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, pagesToExtract.map(p => p - 1)); // PDF-LIB 頁碼是從 0 開始

        copiedPages.forEach((page) => newPdf.addPage(page));

        const pdfBytes = await newPdf.save();
        downloadPdf(pdfBytes, `${selectedFileForSplit.name.replace('.pdf', '')}_分割後.pdf`);
        
        displaySplitMessage('success', 'PDF 分割成功！檔案已下載。');
        setTimeout(hideSplitModal, 2000); // 2秒後自動關閉模態視窗
    } catch (error) {
        console.error('分割 PDF 時發生錯誤：', error);
        displaySplitMessage('error', `分割 PDF 失敗：${error.message || error}`);
    } finally {
        executeSplitBtn.innerHTML = '<i class="fas fa-cut"></i> 開始分割';
        executeSplitBtn.disabled = false;
        cancelSplitBtn.disabled = false;
    }
});

// 顯示模態視窗中的消息
function displaySplitMessage(type, message) {
    splitMessage.textContent = message;
    splitMessage.className = `split-message ${type}`; // 設置 class
    splitMessage.style.display = 'block';
}

// 下載 PDF 輔助函數
function downloadPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.click();
    URL.revokeObjectURL(url); // 釋放記憶體
}

// 初始化時檢查是否有檔案
renderFileList();