const { PDFDocument } = PDFLib;

const dropArea = document.getElementById('drop-area');
const fileElem = document.getElementById('fileElem');
const fileTableBody = document.querySelector('#fileTable tbody');
const noFilesMessage = document.getElementById('noFilesMessage');
const mergeBtn = document.getElementById('mergeBtn');
const splitBtn = document.getElementById('splitBtn');
const downloadLink = document.getElementById('downloadLink');

let uploadedFiles = []; // 用於儲存已上傳的檔案物件

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
            uploadedFiles.push(file);
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

// 分割 PDF 功能 (提示：需要更複雜的互動)
splitBtn.addEventListener('click', async () => {
    if (uploadedFiles.length === 0) {
        alert('請先上傳 PDF 檔案。');
        return;
    }
    // 這裡需要彈出一個介面讓使用者選擇要分割的檔案以及分割頁碼範圍
    // 實現會比較複雜，建議使用模態視窗來引導使用者
    alert('分割功能需要您選擇要分割的 PDF 以及指定頁碼範圍，這將在未來的版本中實現。');
    // 示範基本的分割邏輯（此處為單個檔案分割成多個文件，實際應用中會更複雜）
    // try {
    //     const file = uploadedFiles[0]; // 假設只處理第一個檔案
    //     const arrayBuffer = await file.arrayBuffer();
    //     const pdfDoc = await PDFDocument.load(arrayBuffer);
    //     const totalPages = pdfDoc.getPageCount();

    //     for (let i = 0; i < totalPages; i++) {
    //         const newPdf = await PDFDocument.create();
    //         const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    //         newPdf.addPage(copiedPage);
    //         const pdfBytes = await newPdf.save();
    //         downloadPdf(pdfBytes, `${file.name.replace('.pdf', '')}_page_${i + 1}.pdf`);
    //     }
    //     alert('PDF 分割成功！');
    // } catch (error) {
    //     console.error('分割 PDF 時發生錯誤：', error);
    //     alert('分割 PDF 失敗，請檢查檔案或稍後再試。');
    // }
});

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