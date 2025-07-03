const { PDFDocument, rgb, StandardFonts } = PDFLib;

document.getElementById('mergeBtn').addEventListener('click', async () => {
    const files = document.getElementById('pdfInput').files;
    if (files.length < 2) {
        alert('請選擇至少兩個 PDF 檔案進行合併。');
        return;
    }

    const mergedPdf = await PDFDocument.create();
    for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    downloadPdf(mergedPdfBytes, '合併後的檔案.pdf');
});

// 這裡需要實現分割邏輯，會比較複雜，需要使用者輸入分割頁碼等
document.getElementById('splitBtn').addEventListener('click', async () => {
    alert('分割功能尚未實現。');
    // 提示：分割邏輯會涉及獲取使用者選擇的檔案和分割頁碼，然後創建多個新的 PDFDocument
});

function downloadPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const link = document.getElementById('downloadLink');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = 'block';
    link.click(); // 自動觸發下載
    URL.revokeObjectURL(link.href); // 釋放 URL 物件
}