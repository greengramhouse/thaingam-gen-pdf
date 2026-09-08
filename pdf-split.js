/* ══════════════════════════════════════════════════════
   pdf-split.js  –  แยกหน้า PDF

   แยกได้สองแบบ
   · เลือกทีละหน้า — ติ๊กหน้าที่ต้องการ ได้ PDF ออกมาไฟล์เดียว
   · แบ่งเป็นช่วง  — กำหนดได้หลายช่วง เช่น 1-3 / 4-7 / 8-10
                     ทุกช่วงกลายเป็นไฟล์ของตัวเอง แล้วมัดรวมเป็น .zip

   พึ่งพา: pdf.js (pdfjsLib) + pdf-lib (PDFLib) + JSZip
   ══════════════════════════════════════════════════════ */
(function () {
  var splitPdfDoc = null, splitPdfBytes = null, splitFileName = '';
  var splitTotalPages = 0, splitSelected = new Set();

  /* โหมดที่เปิดอยู่ 'pages' = เลือกทีละหน้า  'ranges' = แบ่งเป็นช่วง */
  var splitMode = 'pages';

  /* ช่วงที่ผู้ใช้กรอกไว้ เก็บเป็นข้อความดิบ ตรวจความถูกต้องตอนวาดและตอนส่งออก */
  var splitRanges = [];
  var rangeSeq = 0;

  var modal         = document.getElementById('splitPdfModal');
  var closeBtn      = document.getElementById('closeSplitPdfModal');
  var cancelBtn     = document.getElementById('cancelSplitBtn');
  var openBtn       = document.getElementById('openSplitPdfBtn');
  var subtitleEl    = document.getElementById('splitSubtitle');
  var uploadZone    = document.getElementById('splitUploadZone');
  var fileInput     = document.getElementById('splitFileInput');
  var toolbar       = document.getElementById('splitToolbar');
  var fileNameEl    = document.getElementById('splitFileName');
  var selectAllBtn  = document.getElementById('splitSelectAll');
  var clearAllBtn   = document.getElementById('splitClearAll');
  var changeFileBtn = document.getElementById('splitChangeFile');
  var modePicker    = document.getElementById('splitModePicker');
  var pagesPane     = document.getElementById('splitPagesPane');
  var rangesPane    = document.getElementById('splitRangesPane');
  var rangeInput    = document.getElementById('splitRangeInput');
  var applyRangeBtn = document.getElementById('splitApplyRange');
  var pageList      = document.getElementById('splitPageList');
  var rangeListEl   = document.getElementById('splitRangeList');
  var addRangeBtn   = document.getElementById('splitAddRange');
  var everyInput    = document.getElementById('splitEveryInput');
  var everyApplyBtn = document.getElementById('splitEveryApply');
  var rangeResetBtn = document.getElementById('splitRangeReset');
  var statusEl      = document.getElementById('splitStatus');
  var statusSpinner = document.getElementById('splitStatusSpinner');
  var statusText    = document.getElementById('splitStatusText');
  var footerNote    = document.getElementById('splitFooterNote');
  var doSplitBtn      = document.getElementById('doSplitBtn');
  var doSplitLabel    = document.getElementById('doSplitLabel');
  var shareBtn        = document.getElementById('splitShareBtn');
  var shareLabel      = document.getElementById('splitShareLabel');
  var keepNotice      = document.getElementById('splitKeepNotice');

  if (!modal || !openBtn) return;

  /* ── เปิด / ปิด Modal ── */
  openBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  function openModal() {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    updateFooter();   // LIFF เพิ่งพร้อมทีหลังได้ ปุ่มแชร์จึงเช็คสถานะใหม่ทุกครั้งที่เปิด
  }
  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  /* ── Upload Zone ── */
  uploadZone.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (f) loadFile(f);
    fileInput.value = '';
  });
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
    var f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') loadFile(f);
  });
  changeFileBtn.addEventListener('click', resetState);

  /* ── โหลดไฟล์ PDF ── */
  function loadFile(file) {
    splitFileName = file.name;
    showStatus('กำลังโหลด PDF...', true);

    file.arrayBuffer().then(function (buf) {
      splitPdfBytes = buf;
      return PDFLib.PDFDocument.load(buf);
    }).then(function (doc) {
      splitPdfDoc = doc;
      splitTotalPages = doc.getPageCount();
      return pdfjsLib.getDocument({ data: splitPdfBytes.slice(0) }).promise;
    }).then(function (pdfJsDoc) {
      uploadZone.classList.add('hidden');
      toolbar.classList.remove('hidden');
      modePicker.classList.remove('hidden');
      fileNameEl.textContent = splitFileName;
      splitSelected.clear();
      pageList.innerHTML = '';

      // เริ่มด้วยช่วงแรกที่ครอบทั้งไฟล์ ผู้ใช้แก้ตัวเลขต่อได้เลย
      splitRanges = [];
      addRange(1, splitTotalPages);

      everyInput.max = splitTotalPages;
      applyMode();
      hideStatus();

      /* render thumbnail ทีละหน้าตามลำดับ */
      var chain = Promise.resolve();
      for (var i = 1; i <= splitTotalPages; i++) {
        (function (n) {
          chain = chain.then(function () {
            return renderPageCard(pdfJsDoc, n).then(function (card) {
              pageList.appendChild(card);
            });
          });
        })(i);
      }
      return chain;
    }).then(updateFooter)
      .catch(function (err) {
        console.error(err);
        showStatus('โหลด PDF ไม่สำเร็จ: ' + err.message, false, true);
      });
  }

  /* ── render card แต่ละหน้า ── */
  function renderPageCard(pdfJsDoc, pageNum) {
    return pdfJsDoc.getPage(pageNum).then(function (page) {
      var vp = page.getViewport({ scale: 1 });
      var scale = Math.min(160 / vp.width, 220 / vp.height);
      var vp2 = page.getViewport({ scale: scale });
      var cv = document.createElement('canvas');
      cv.width = vp2.width;
      cv.height = vp2.height;
      return page.render({ canvasContext: cv.getContext('2d'), viewport: vp2 }).promise.then(function () {
        var idx = pageNum - 1;
        var card = document.createElement('div');
        card.className = 'split-page-card relative rounded-xl overflow-hidden cursor-pointer border-2 border-transparent transition-all select-none';
        card.dataset.idx = idx;
        var ar = (vp2.width / vp2.height).toFixed(3);
        var src = cv.toDataURL('image/jpeg', 0.75);
        card.innerHTML =
          '<div style="aspect-ratio:' + ar + '" class="bg-desk-200 flex items-center justify-center">' +
            '<img src="' + src + '" class="w-full h-full object-contain" alt="หน้า ' + pageNum + '" />' +
          '</div>' +
          '<div class="page-card-overlay absolute inset-0 flex items-center justify-center opacity-0 transition-opacity" style="background:rgba(30,53,104,.5)">' +
            '<span class="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">' +
              '<i class="fa-solid fa-check text-ink-700"></i>' +
            '</span>' +
          '</div>' +
          '<p class="text-center text-xs font-mono text-ink-500 py-1">' + pageNum + '</p>';
        card.addEventListener('click', function () { togglePage(idx, card); });
        return card;
      });
    });
  }

  /* ── toggle เลือก / ยกเลิก หน้า ── */
  function togglePage(idx, card) {
    if (splitSelected.has(idx)) {
      splitSelected.delete(idx);
      card.classList.remove('border-ink-600', 'shadow-md');
      card.querySelector('.page-card-overlay').classList.add('opacity-0');
    } else {
      splitSelected.add(idx);
      card.classList.add('border-ink-600', 'shadow-md');
      card.querySelector('.page-card-overlay').classList.remove('opacity-0');
    }
    updateFooter();
  }

  /* ── เลือกทั้งหมด / ล้างทั้งหมด ── */
  selectAllBtn.addEventListener('click', function () {
    document.querySelectorAll('.split-page-card').forEach(function (c) {
      splitSelected.add(parseInt(c.dataset.idx));
      c.classList.add('border-ink-600', 'shadow-md');
      c.querySelector('.page-card-overlay').classList.remove('opacity-0');
    });
    updateFooter();
  });

  clearAllBtn.addEventListener('click', clearPageSelection);

  function clearPageSelection() {
    document.querySelectorAll('.split-page-card').forEach(function (c) {
      c.classList.remove('border-ink-600', 'shadow-md');
      c.querySelector('.page-card-overlay').classList.add('opacity-0');
    });
    splitSelected.clear();
    updateFooter();
  }

  /* ── range input (เช่น 1,3-5,8) ── */
  applyRangeBtn.addEventListener('click', applyRange);
  rangeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyRange(); });

  function applyRange() {
    var raw = rangeInput.value.trim();
    if (!raw) return;
    var pages = parseRange(raw, splitTotalPages);
    if (!pages.length) {
      showStatus('รูปแบบช่วงไม่ถูกต้อง เช่น 1,3-5,8', false, true);
      return;
    }
    hideStatus();
    clearPageSelection();
    pages.forEach(function (p) {
      var idx = p - 1;
      var c = pageList.querySelector('[data-idx="' + idx + '"]');
      if (c) {
        splitSelected.add(idx);
        c.classList.add('border-ink-600', 'shadow-md');
        c.querySelector('.page-card-overlay').classList.remove('opacity-0');
      }
    });
    updateFooter();
  }

  function parseRange(str, max) {
    var out = new Set();
    var parts = str.split(',');
    for (var j = 0; j < parts.length; j++) {
      var m = parts[j].trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return [];
      var a = parseInt(m[1]);
      var b = m[2] ? parseInt(m[2]) : a;
      if (a < 1 || b > max || a > b) return [];
      for (var i = a; i <= b; i++) out.add(i);
    }
    return Array.from(out).sort(function (a, b) { return a - b; });
  }

  /* ══ สลับโหมด ══ */
  modePicker.addEventListener('click', function (e) {
    var button = e.target.closest('button[data-split-mode]');
    if (!button || button.dataset.splitMode === splitMode) return;
    splitMode = button.dataset.splitMode;
    hideStatus();
    applyMode();
  });

  function applyMode() {
    var ranges = splitMode === 'ranges';

    modePicker.querySelectorAll('button[data-split-mode]').forEach(function (button) {
      var active = button.dataset.splitMode === splitMode;
      button.setAttribute('aria-checked', String(active));
      button.className = 'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
        (active ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700');
    });

    pagesPane.classList.toggle('hidden', ranges);
    pagesPane.classList.toggle('flex', !ranges);
    rangesPane.classList.toggle('hidden', !ranges);
    rangesPane.classList.toggle('flex', ranges);

    subtitleEl.textContent = ranges
      ? 'กำหนดช่วงได้หลายช่วง แต่ละช่วงจะกลายเป็นไฟล์ PDF ของตัวเอง'
      : 'เลือกหน้าที่ต้องการ แล้วดาวน์โหลดเป็นไฟล์ PDF ใหม่';

    if (ranges) renderRanges();
    updateFooter();
  }

  /* ══ ช่วงหลายช่วง ══ */
  function addRange(from, to) {
    splitRanges.push({
      id: ++rangeSeq,
      from: String(from == null ? '' : from),
      to: String(to == null ? '' : to)
    });
  }

  /**
   * ตรวจช่วงหนึ่งช่วง คืน { pages, error }
   * ปล่อยให้ช่องว่างเป็น "ยังไม่ได้กรอก" ไม่ใช่ข้อผิดพลาด จะได้ไม่ขึ้นแดงตั้งแต่ยังพิมพ์ไม่จบ
   */
  function checkRange(range) {
    var from = range.from.trim();
    var to = range.to.trim();

    if (!from && !to) return { pages: [], error: '' };
    if (!/^\d+$/.test(from) || !/^\d+$/.test(to)) return { pages: [], error: 'กรอกเป็นตัวเลขทั้งสองช่อง' };

    var a = parseInt(from, 10);
    var b = parseInt(to, 10);

    if (a < 1 || b < 1) return { pages: [], error: 'หน้าเริ่มต้นที่ 1' };
    if (a > splitTotalPages || b > splitTotalPages) return { pages: [], error: 'เกินจำนวนหน้าของไฟล์ (' + splitTotalPages + ' หน้า)' };
    if (a > b) return { pages: [], error: 'หน้าเริ่มต้องไม่มากกว่าหน้าจบ' };

    var pages = [];
    for (var i = a; i <= b; i++) pages.push(i);
    return { pages: pages, error: '' };
  }

  /** ชื่อไฟล์ของช่วงหนึ่งช่วง เช่น เอกสาร_1-3.pdf */
  function rangeFilename(range, check) {
    var base = splitFileName.replace(/\.pdf$/i, '');
    var first = check.pages[0];
    var last = check.pages[check.pages.length - 1];
    var suffix = !check.pages.length ? 'ช่วง'
      : (first === last ? String(first) : first + '-' + last);
    return (base + '_' + suffix + '.pdf').replace(/[\\/:*?"<>|]/g, '-');
  }

  function renderRanges() {
    rangeListEl.innerHTML = '';

    splitRanges.forEach(function (range, index) {
      var check = checkRange(range);
      var row = document.createElement('div');
      row.className = 'rounded-xl border px-3 py-2.5 ' +
        (check.error ? 'border-seal-500/40 bg-seal-500/5' : 'border-desk-300 bg-white');

      // จอแคบให้ชื่อไฟล์ตกไปบรรทัดล่าง ไม่งั้นเหลือที่ไม่กี่สิบพิกเซลจนอ่านไม่ออก
      var inputCls = 'w-[4.5rem] sm:w-20 rounded-lg border border-desk-300 bg-white px-2 py-2 sm:py-1.5' +
                     ' text-sm text-center text-ink-900 focus:outline-none focus:border-ink-500' +
                     ' focus:ring-4 focus:ring-ink-500/10';

      row.innerHTML =
        '<div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">' +
          '<span class="shrink-0 text-xs text-ink-500 w-14 sm:w-16">ช่วงที่ ' + (index + 1) + '</span>' +
          '<input type="number" inputmode="numeric" min="1" max="' + splitTotalPages + '" value="' + escapeAttr(range.from) + '"' +
                ' data-range-field="from" aria-label="หน้าเริ่มของช่วงที่ ' + (index + 1) + '"' +
                ' class="' + inputCls + '" />' +
          '<span class="text-ink-400 text-sm">ถึง</span>' +
          '<input type="number" inputmode="numeric" min="1" max="' + splitTotalPages + '" value="' + escapeAttr(range.to) + '"' +
                ' data-range-field="to" aria-label="หน้าจบของช่วงที่ ' + (index + 1) + '"' +
                ' class="' + inputCls + '" />' +
          '<button type="button" data-range-remove="1" aria-label="ลบช่วงที่ ' + (index + 1) + '"' +
                ' class="ml-auto shrink-0 w-9 h-9 sm:w-8 sm:h-8 rounded-lg text-ink-400' +
                ' hover:bg-seal-500/10 hover:text-seal-500 transition-colors">' +
            '<i class="fa-regular fa-trash-can text-sm"></i>' +
          '</button>' +
          '<span class="order-last w-full sm:order-none sm:w-auto sm:flex-1 min-w-0 truncate text-xs ' +
            (check.error ? 'text-seal-500' : 'text-ink-400') + '">' +
            (check.error ? check.error
              : (check.pages.length ? '→ ' + escapeHtml(rangeFilename(range, check)) : 'ยังไม่ได้กรอก')) +
          '</span>' +
        '</div>';

      row.querySelectorAll('input[data-range-field]').forEach(function (input) {
        input.addEventListener('input', function () {
          range[input.dataset.rangeField] = input.value;
          updateRangeRow(row, range, index);
          updateFooter();
        });
      });

      row.querySelector('[data-range-remove]').addEventListener('click', function () {
        splitRanges = splitRanges.filter(function (item) { return item.id !== range.id; });
        if (!splitRanges.length) addRange('', '');
        renderRanges();
        updateFooter();
      });

      rangeListEl.appendChild(row);
    });
  }

  /**
   * อัปเดตเฉพาะป้ายกำกับและสีกรอบของแถวเดียว
   * ไม่วาดใหม่ทั้งรายการ เพราะจะทำให้ช่องที่กำลังพิมพ์อยู่เสียโฟกัส
   */
  function updateRangeRow(row, range, index) {
    var check = checkRange(range);

    row.className = 'rounded-xl border px-3 py-2.5 ' +
      (check.error ? 'border-seal-500/40 bg-seal-500/5' : 'border-desk-300 bg-white');

    var note = row.querySelector('span.order-last');
    note.className = 'order-last w-full sm:order-none sm:w-auto sm:flex-1 min-w-0 truncate text-xs ' +
      (check.error ? 'text-seal-500' : 'text-ink-400');
    note.textContent = check.error
      ? check.error
      : (check.pages.length ? '→ ' + rangeFilename(range, check) : 'ยังไม่ได้กรอก');
  }

  addRangeBtn.addEventListener('click', function () {
    if (!splitTotalPages) return;

    // ต่อจากหน้าสุดท้ายของช่วงก่อนหน้า เดาให้ตรงกับที่คนมักจะทำ
    var last = splitRanges[splitRanges.length - 1];
    var lastCheck = last ? checkRange(last) : { pages: [] };
    var next = lastCheck.pages.length ? lastCheck.pages[lastCheck.pages.length - 1] + 1 : 1;

    if (next > splitTotalPages) next = splitTotalPages;
    addRange(next, splitTotalPages);
    renderRanges();
    updateFooter();
  });

  rangeResetBtn.addEventListener('click', function () {
    splitRanges = [];
    addRange('', '');
    renderRanges();
    updateFooter();
  });

  everyApplyBtn.addEventListener('click', function () {
    var size = parseInt(everyInput.value, 10);
    if (!size || size < 1) {
      showStatus('กรอกจำนวนหน้าต่อไฟล์เป็นตัวเลขตั้งแต่ 1 ขึ้นไป', false, true);
      return;
    }

    hideStatus();
    splitRanges = [];
    for (var start = 1; start <= splitTotalPages; start += size) {
      addRange(start, Math.min(start + size - 1, splitTotalPages));
    }
    renderRanges();
    updateFooter();
  });

  /** ช่วงที่กรอกครบและถูกต้อง พร้อมส่งออกจริง */
  function validRanges() {
    return splitRanges
      .map(function (range) { return { range: range, check: checkRange(range) }; })
      .filter(function (item) { return !item.check.error && item.check.pages.length; });
  }

  /* ── อัปเดต footer ── */
  function updateFooter() {
    if (splitMode === 'ranges') {
      var ready = validRanges();
      var hasError = splitRanges.some(function (range) { return checkRange(range).error; });

      footerNote.innerHTML = hasError
        ? '<span class="text-seal-500">มีช่วงที่ยังไม่ถูกต้อง</span>'
        : 'จะได้ <span class="font-semibold text-ink-700">' + ready.length + '</span> ไฟล์ ' +
          'จาก <span class="font-semibold text-ink-700">' + splitTotalPages + '</span> หน้า';

      doSplitBtn.disabled = hasError || !ready.length;
      doSplitLabel.textContent = ready.length > 1
        ? 'ดาวน์โหลด ZIP (' + ready.length + ')'
        : 'ดาวน์โหลด PDF';

      updateShareButton(hasError ? 0 : ready.length);
      return;
    }

    footerNote.innerHTML =
      'เลือก <span class="font-semibold text-ink-700">' + splitSelected.size + '</span> ' +
      'จาก <span class="font-semibold text-ink-700">' + splitTotalPages + '</span> หน้า';

    doSplitBtn.disabled = splitSelected.size === 0;
    doSplitLabel.textContent = splitSelected.size
      ? 'ดาวน์โหลด (' + splitSelected.size + ' หน้า)'
      : 'ดาวน์โหลด PDF';

    updateShareButton(splitSelected.size ? 1 : 0);
  }

  /**
   * ปุ่มแชร์โผล่เฉพาะตอนที่ LINE พร้อมใช้จริง
   * แยกหลายช่วงส่งได้ครั้งละไม่เกินโควตาของ LINE เกินกว่านั้นให้ดาวน์โหลด zip แทน
   */
  function updateShareButton(fileCount) {
    if (!shareBtn) return;

    var lineReady = window.LineShare && window.LineShare.isReady();
    shareBtn.classList.toggle('hidden', !lineReady);
    shareBtn.classList.toggle('inline-flex', !!lineReady);
    if (!lineReady) return;

    var max = window.LineShare.maxFiles;
    var tooMany = fileCount > max;

    shareBtn.disabled = !fileCount || tooMany;
    shareBtn.title = tooMany ? 'LINE ส่งได้ครั้งละไม่เกิน ' + max + ' ไฟล์' : '';
    shareLabel.textContent = fileCount > 1
      ? 'แชร์ ' + fileCount + ' ไฟล์'
      : 'แชร์เข้า LINE';
  }

  /* ── สร้าง PDF หนึ่งไฟล์จากเลขหน้าที่ให้มา (นับจาก 0) ── */
  function buildPdfBytes(indexes) {
    return PDFLib.PDFDocument.create().then(function (newDoc) {
      return newDoc.copyPages(splitPdfDoc, indexes).then(function (copied) {
        copied.forEach(function (p) { newDoc.addPage(p); });
        return newDoc.save();
      });
    });
  }

  function downloadBytes(bytes, filename, mime) {
    var blob = new Blob([bytes], { type: mime || 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /* ── ปุ่มดาวน์โหลด ── */
  doSplitBtn.addEventListener('click', function () {
    if (!splitPdfDoc) return;
    if (splitMode === 'ranges') doSplitRanges();
    else doSplitPages();
  });

  /* ── ปุ่มแชร์เข้า LINE ──
     สร้างไฟล์ชุดเดียวกับที่จะดาวน์โหลด แล้วส่งเป็นการ์ดใบละไฟล์
     ไม่ส่งเป็น zip เพราะผู้รับบนมือถือเปิด zip ต่อได้ยาก */
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      if (!splitPdfDoc || !window.LineShare) return;

      var jobs = splitMode === 'ranges'
        ? validRanges().map(function (item) {
            return {
              indexes: item.check.pages.map(function (p) { return p - 1; }),
              filename: rangeFilename(item.range, item.check),
              pageCount: item.check.pages.length
            };
          })
        : (function () {
            var idx = Array.from(splitSelected).sort(function (a, b) { return a - b; });
            if (!idx.length) return [];
            return [{
              indexes: idx,
              filename: splitFileName.replace(/\.pdf$/i, '') + '_split.pdf',
              pageCount: idx.length
            }];
          })();

      if (!jobs.length) return;

      if (jobs.length > window.LineShare.maxFiles) {
        showStatus('LINE ส่งได้ครั้งละไม่เกิน ' + window.LineShare.maxFiles +
                   ' ไฟล์ ลดจำนวนช่วงลง หรือกดดาวน์โหลดเป็น zip แทน', false, true);
        return;
      }

      shareBtn.disabled = true;
      doSplitBtn.disabled = true;
      showStatus('กำลังเตรียมไฟล์สำหรับแชร์...', true);

      var items = [];
      var chain = Promise.resolve();

      jobs.forEach(function (job) {
        chain = chain.then(function () {
          return buildPdfBytes(job.indexes).then(function (bytes) {
            items.push({
              bytes: bytes,
              filename: job.filename,
              title: job.filename.replace(/\.pdf$/i, ''),
              pageCount: job.pageCount
            });
          });
        });
      });

      chain.then(function () {
        return window.LineShare.shareFiles(items, function (done, total) {
          showStatus('กำลังอัปโหลดขึ้น Drive (' + done + '/' + total + ')...', true);
        });
      }).then(function (sent) {
        if (sent) {
          showStatus('ส่งเข้า LINE แล้ว ✓', false);
          if (keepNotice) keepNotice.classList.remove('hidden');
        } else {
          hideStatus();
        }
      }).catch(function (err) {
        console.error(err);
        showStatus('แชร์ไม่สำเร็จ: ' + err.message, false, true);
      }).finally(updateFooter);
    });
  }

  function doSplitPages() {
    if (splitSelected.size === 0) return;

    showStatus('กำลังสร้าง PDF...', true);
    doSplitBtn.disabled = true;

    var sortedIdx = Array.from(splitSelected).sort(function (a, b) { return a - b; });

    buildPdfBytes(sortedIdx).then(function (bytes) {
      downloadBytes(bytes, splitFileName.replace(/\.pdf$/i, '') + '_split.pdf');
      showStatus('สร้าง PDF เสร็จแล้ว (' + sortedIdx.length + ' หน้า) ✓', false);
    }).catch(function (err) {
      console.error(err);
      showStatus('เกิดข้อผิดพลาด: ' + err.message, false, true);
    }).finally(updateFooter);
  }

  /**
   * แต่ละช่วงกลายเป็นไฟล์ของตัวเอง
   * ช่วงเดียวส่งออกเป็น PDF ตรง ๆ หลายช่วงจึงค่อยมัดเป็น zip
   */
  function doSplitRanges() {
    var ready = validRanges();
    if (!ready.length) return;

    if (ready.length > 1 && typeof JSZip === 'undefined') {
      showStatus('โหลดตัวบีบอัดไฟล์ (JSZip) ไม่สำเร็จ ลองรีเฟรชหน้าเว็บอีกครั้ง', false, true);
      return;
    }

    showStatus('กำลังสร้างไฟล์ ' + ready.length + ' ไฟล์...', true);
    doSplitBtn.disabled = true;

    var zip = ready.length > 1 ? new JSZip() : null;
    var used = {};
    var chain = Promise.resolve();

    ready.forEach(function (item, order) {
      chain = chain.then(function () {
        var indexes = item.check.pages.map(function (p) { return p - 1; });

        return buildPdfBytes(indexes).then(function (bytes) {
          var name = rangeFilename(item.range, item.check);

          // ช่วงที่ซ้ำกันเป๊ะ ๆ จะได้ชื่อเดียวกัน เติมลำดับกันไฟล์ทับกันในซิป
          if (used[name]) name = name.replace(/\.pdf$/i, '') + ' (' + (order + 1) + ').pdf';
          used[name] = true;

          if (zip) zip.file(name, bytes);
          else downloadBytes(bytes, name);

          showStatus('กำลังสร้างไฟล์ ' + (order + 1) + ' จาก ' + ready.length + '...', true);
        });
      });
    });

    chain.then(function () {
      if (!zip) {
        showStatus('สร้าง PDF เสร็จแล้ว ✓', false);
        return;
      }

      showStatus('กำลังบีบอัดเป็นไฟล์ zip...', true);
      return zip.generateAsync({ type: 'blob' }).then(function (blob) {
        downloadBytes(blob, splitFileName.replace(/\.pdf$/i, '') + '_แยกช่วง.zip', 'application/zip');
        showStatus('สร้างไฟล์ zip เสร็จแล้ว (' + ready.length + ' ไฟล์) ✓', false);
      });
    }).catch(function (err) {
      console.error(err);
      showStatus('เกิดข้อผิดพลาด: ' + err.message, false, true);
    }).finally(updateFooter);
  }

  /* ── ตัวช่วยเล็ก ๆ ── */
  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(text) { return escapeHtml(text); }

  /* ── status bar helpers ── */
  function showStatus(msg, spinning, isError) {
    statusEl.classList.remove('hidden');
    statusSpinner.classList.toggle('hidden', !spinning);
    statusText.textContent = msg;
    statusEl.style.background = isError ? 'rgba(178,58,52,.08)' : '';
    statusText.style.color = isError ? '#B23A34' : '';
  }
  function hideStatus() { statusEl.classList.add('hidden'); }

  /* ── reset state ── */
  function resetState() {
    splitPdfDoc = null; splitPdfBytes = null;
    splitFileName = ''; splitTotalPages = 0;
    splitSelected.clear();
    splitRanges = [];
    pageList.innerHTML = '';
    rangeListEl.innerHTML = '';
    rangeInput.value = '';
    if (keepNotice) keepNotice.classList.add('hidden');
    uploadZone.classList.remove('hidden');
    toolbar.classList.add('hidden');
    modePicker.classList.add('hidden');
    pagesPane.classList.add('hidden');
    pagesPane.classList.remove('flex');
    rangesPane.classList.add('hidden');
    rangesPane.classList.remove('flex');
    hideStatus();
    updateFooter();
  }
})();
