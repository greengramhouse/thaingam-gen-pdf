/* ══════════════════════════════════════════════════════
   pdf-merge.js  –  รวมไฟล์ PDF
   พึ่งพา: pdf-lib (PDFLib)
   ══════════════════════════════════════════════════════ */
(function () {
  /* ── state ── */
  var mergeFiles = [];  // [{ name, bytes (ArrayBuffer), pageCount }]

  /* ── DOM refs ── */
  var modal         = document.getElementById('mergePdfModal');
  var closeBtn      = document.getElementById('closeMergePdfModal');
  var cancelBtn     = document.getElementById('cancelMergeBtn');
  var openBtn       = document.getElementById('openMergePdfBtn');

  var uploadZone    = document.getElementById('mergeUploadZone');
  var fileInput     = document.getElementById('mergeFileInput');
  var fileList      = document.getElementById('mergeFileList');
  var fileItems     = document.getElementById('mergeFileItems');

  var addMoreRow    = document.getElementById('mergeAddMoreRow');
  var addMoreBtn    = document.getElementById('mergeAddMoreBtn');
  var addFileInput  = document.getElementById('mergeAddFileInput');
  var clearAllBtn   = document.getElementById('mergeClearAll');

  var statusEl      = document.getElementById('mergeStatus');
  var statusSpinner = document.getElementById('mergeStatusSpinner');
  var statusText    = document.getElementById('mergeStatusText');

  var fileCountEl   = document.getElementById('mergeFileCount');
  var totalPagesEl  = document.getElementById('mergeTotalPages');
  var doMergeBtn    = document.getElementById('doMergeBtn');
  var doMergeLabel  = document.getElementById('doMergeLabel');

  if (!modal || !openBtn) return;

  /* ══════════════════════════════════════════
     เปิด / ปิด Modal
  ══════════════════════════════════════════ */
  openBtn.addEventListener('click', function () {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  });
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ══════════════════════════════════════════
     Upload Zone
  ══════════════════════════════════════════ */
  uploadZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function (e) { handleFiles(e.target.files); fileInput.value = ''; });

  uploadZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadZone.style.borderColor = '#3A5B9E';
    uploadZone.style.background = '#F2F5FB';
  });
  uploadZone.addEventListener('dragleave', function () {
    uploadZone.style.borderColor = '';
    uploadZone.style.background = '';
  });
  uploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadZone.style.borderColor = '';
    uploadZone.style.background = '';
    handleFiles(e.dataTransfer.files);
  });

  /* ── เพิ่มไฟล์เพิ่มเติม ── */
  addMoreBtn.addEventListener('click', function () { addFileInput.click(); });
  addFileInput.addEventListener('change', function (e) { handleFiles(e.target.files); addFileInput.value = ''; });

  /* ── ล้างทั้งหมด ── */
  clearAllBtn.addEventListener('click', resetState);

  /* ══════════════════════════════════════════
     โหลดไฟล์ PDF
  ══════════════════════════════════════════ */
  function handleFiles(files) {
    if (!files || !files.length) return;
    showStatus('กำลังโหลดไฟล์...', true);

    var promises = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.type !== 'application/pdf') continue;
      promises.push(loadOneFile(f));
    }

    Promise.all(promises).then(function (results) {
      results.forEach(function (r) { if (r) mergeFiles.push(r); });
      renderFileList();
      hideStatus();
    }).catch(function (err) {
      console.error(err);
      showStatus('โหลดไฟล์ไม่สำเร็จ: ' + err.message, false, true);
    });
  }

  function loadOneFile(file) {
    return file.arrayBuffer().then(function (buf) {
      return PDFLib.PDFDocument.load(buf).then(function (doc) {
        return { name: file.name, bytes: buf, pageCount: doc.getPageCount() };
      });
    });
  }

  /* ══════════════════════════════════════════
     แสดงรายการไฟล์
  ══════════════════════════════════════════ */
  function renderFileList() {
    fileItems.innerHTML = '';

    if (mergeFiles.length === 0) {
      uploadZone.classList.remove('hidden');
      fileList.classList.add('hidden');
      addMoreRow.classList.add('hidden');
      updateFooter();
      return;
    }

    uploadZone.classList.add('hidden');
    fileList.classList.remove('hidden');
    addMoreRow.classList.remove('hidden');

    mergeFiles.forEach(function (f, idx) {
      var row = document.createElement('div');
      row.className = 'merge-file-row flex items-center gap-3 bg-white border border-desk-200 rounded-xl px-4 py-3 transition-all';
      row.dataset.idx = idx;
      row.draggable = true;

      row.innerHTML =
        '<span class="merge-drag-handle shrink-0 cursor-grab text-ink-300 hover:text-ink-500 active:cursor-grabbing">' +
          '<i class="fa-solid fa-grip-vertical"></i>' +
        '</span>' +
        '<span class="shrink-0 w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center text-ink-500">' +
          '<i class="fa-solid fa-file-pdf"></i>' +
        '</span>' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-medium text-ink-900 truncate">' + escHtml(f.name) + '</p>' +
          '<p class="text-xs text-ink-400">' + f.pageCount + ' หน้า</p>' +
        '</div>' +
        '<div class="flex items-center gap-1 shrink-0">' +
          '<button type="button" class="merge-move-up w-7 h-7 rounded-lg hover:bg-desk-100 text-ink-400 hover:text-ink-700 transition-colors" title="เลื่อนขึ้น">' +
            '<i class="fa-solid fa-chevron-up text-xs"></i>' +
          '</button>' +
          '<button type="button" class="merge-move-down w-7 h-7 rounded-lg hover:bg-desk-100 text-ink-400 hover:text-ink-700 transition-colors" title="เลื่อนลง">' +
            '<i class="fa-solid fa-chevron-down text-xs"></i>' +
          '</button>' +
          '<button type="button" class="merge-remove w-7 h-7 rounded-lg hover:bg-seal-500/10 text-ink-400 hover:text-seal-500 transition-colors" title="ลบ">' +
            '<i class="fa-solid fa-xmark text-xs"></i>' +
          '</button>' +
        '</div>';

      /* ── ปุ่ม move up / down / remove ── */
      row.querySelector('.merge-move-up').addEventListener('click', function () {
        if (idx > 0) { swap(idx, idx - 1); renderFileList(); }
      });
      row.querySelector('.merge-move-down').addEventListener('click', function () {
        if (idx < mergeFiles.length - 1) { swap(idx, idx + 1); renderFileList(); }
      });
      row.querySelector('.merge-remove').addEventListener('click', function () {
        mergeFiles.splice(idx, 1);
        renderFileList();
      });

      /* ── drag to reorder ── */
      row.addEventListener('dragstart', function (e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', idx);
        row.style.opacity = '0.5';
      });
      row.addEventListener('dragend', function () { row.style.opacity = ''; });
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.style.borderColor = '#3A5B9E';
      });
      row.addEventListener('dragleave', function () { row.style.borderColor = ''; });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        row.style.borderColor = '';
        var fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        var toIdx = parseInt(row.dataset.idx);
        if (fromIdx !== toIdx) {
          var item = mergeFiles.splice(fromIdx, 1)[0];
          mergeFiles.splice(toIdx, 0, item);
          renderFileList();
        }
      });

      fileItems.appendChild(row);
    });

    updateFooter();
  }

  function swap(a, b) {
    var tmp = mergeFiles[a];
    mergeFiles[a] = mergeFiles[b];
    mergeFiles[b] = tmp;
  }

  function escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ── อัปเดต footer ── */
  function updateFooter() {
    var count = mergeFiles.length;
    var pages = 0;
    mergeFiles.forEach(function (f) { pages += f.pageCount; });
    fileCountEl.textContent = count;
    totalPagesEl.textContent = pages;
    var has = count >= 2;
    doMergeBtn.disabled = !has;
    doMergeLabel.textContent = has
      ? 'รวมแล้วดาวน์โหลด (' + pages + ' หน้า)'
      : 'ดาวน์โหลด PDF';
  }

  /* ══════════════════════════════════════════
     รวมและดาวน์โหลด
  ══════════════════════════════════════════ */
  doMergeBtn.addEventListener('click', function () {
    if (mergeFiles.length < 2) return;
    showStatus('กำลังรวมไฟล์ PDF...', true);
    doMergeBtn.disabled = true;

    PDFLib.PDFDocument.create().then(function (newDoc) {
      var chain = Promise.resolve();
      mergeFiles.forEach(function (f) {
        chain = chain.then(function () {
          return PDFLib.PDFDocument.load(f.bytes).then(function (srcDoc) {
            var indices = [];
            for (var i = 0; i < srcDoc.getPageCount(); i++) indices.push(i);
            return newDoc.copyPages(srcDoc, indices);
          }).then(function (copied) {
            copied.forEach(function (p) { newDoc.addPage(p); });
          });
        });
      });
      return chain.then(function () { return newDoc.save(); });
    }).then(function (bytes) {
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'merged.pdf';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);

      var pages = 0;
      mergeFiles.forEach(function (f) { pages += f.pageCount; });
      showStatus('รวมไฟล์เสร็จแล้ว (' + mergeFiles.length + ' ไฟล์, ' + pages + ' หน้า) ✓', false);
    }).catch(function (err) {
      console.error(err);
      showStatus('เกิดข้อผิดพลาด: ' + err.message, false, true);
    }).finally(function () {
      doMergeBtn.disabled = mergeFiles.length < 2;
    });
  });

  /* ══════════════════════════════════════════
     helpers
  ══════════════════════════════════════════ */
  function showStatus(msg, spinning, isError) {
    statusEl.classList.remove('hidden');
    statusSpinner.classList.toggle('hidden', !spinning);
    statusText.textContent = msg;
    statusEl.style.background = isError ? 'rgba(178,58,52,.08)' : '';
    statusText.style.color = isError ? '#B23A34' : '';
  }
  function hideStatus() { statusEl.classList.add('hidden'); }

  function resetState() {
    mergeFiles = [];
    fileItems.innerHTML = '';
    uploadZone.classList.remove('hidden');
    fileList.classList.add('hidden');
    addMoreRow.classList.add('hidden');
    hideStatus();
    updateFooter();
  }
})();
