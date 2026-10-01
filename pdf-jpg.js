/* ══════════════════════════════════════════════════════
   pdf-jpg.js  –  แปลง PDF เป็น JPG

   เลือกหน้าที่ต้องการ แต่ละหน้ากลายเป็นรูป JPG หนึ่งรูป
   · หน้าเดียว  — ได้ไฟล์ .jpg ตรง ๆ
   · หลายหน้า  — มัดรวมเป็น .zip ก้อนเดียว ไม่ให้เบราว์เซอร์ถามดาวน์โหลดทีละรูป
   · แชร์เข้า LINE — ส่งเป็นข้อความรูปภาพ ผู้รับเห็นรูปในแชททันที (ครั้งละไม่เกินโควตาของ LINE)

   พึ่งพา: pdf.js (pdfjsLib) + JSZip
   ══════════════════════════════════════════════════════ */
(function () {
  var jpgPdfDoc = null, jpgFileName = '', jpgTotalPages = 0;
  var jpgSelected = new Set();
  var jpgDpi = 150;

  /* ด้านยาวของรูปไม่เกินนี้ กันกระดาษขนาดใหญ่ทำแคนวาสเกินที่มือถือรับไหว */
  var MAX_EDGE = 4096;

  var modal         = document.getElementById('jpgPdfModal');
  var closeBtn      = document.getElementById('closeJpgPdfModal');
  var cancelBtn     = document.getElementById('cancelJpgBtn');
  var fileNameEl    = document.getElementById('jpgFileName');
  var selectAllBtn  = document.getElementById('jpgSelectAll');
  var clearAllBtn   = document.getElementById('jpgClearAll');
  var qualityPicker = document.getElementById('jpgQualityPicker');
  var pageList      = document.getElementById('jpgPageList');
  var statusEl      = document.getElementById('jpgStatus');
  var statusSpinner = document.getElementById('jpgStatusSpinner');
  var statusText    = document.getElementById('jpgStatusText');
  var footerNote    = document.getElementById('jpgFooterNote');
  var doBtn         = document.getElementById('doJpgBtn');
  var doLabel       = document.getElementById('doJpgLabel');
  var shareBtn      = document.getElementById('jpgShareBtn');
  var shareLabel    = document.getElementById('jpgShareLabel');
  var keepNotice    = document.getElementById('jpgKeepNotice');

  if (!modal) return;

  /* ── เปิด / ปิด Modal ── */
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

  /* ── โหลดไฟล์ PDF ──
     loadToken ตัดโซ่วาดภาพย่อของไฟล์เก่าทิ้ง เมื่อเปิดไฟล์ใหม่ระหว่างที่ยังวาดไม่เสร็จ */
  var loadToken = 0;

  function loadFile(file) {
    var token = ++loadToken;
    jpgFileName = file.name;
    fileNameEl.textContent = jpgFileName;
    showStatus('กำลังโหลด PDF...', true);

    file.arrayBuffer().then(function (buf) {
      return pdfjsLib.getDocument({ data: buf }).promise;
    }).then(function (doc) {
      if (token !== loadToken) return;
      jpgPdfDoc = doc;
      jpgTotalPages = doc.numPages;

      // ส่วนใหญ่ต้องการทุกหน้า จึงเลือกไว้ให้ก่อน ไม่ต้องการหน้าไหนค่อยแตะออก
      for (var i = 0; i < jpgTotalPages; i++) jpgSelected.add(i);
      updateFooter();
      hideStatus();

      var chain = Promise.resolve();
      for (var n = 1; n <= jpgTotalPages; n++) {
        (function (pageNum) {
          chain = chain.then(function () {
            if (token !== loadToken) return;
            return renderPageCard(doc, pageNum).then(function (card) {
              if (token !== loadToken) return;
              pageList.appendChild(card);
            });
          });
        })(n);
      }
      return chain;
    }).catch(function (err) {
      if (token !== loadToken) return;
      console.error(err);
      showStatus('เปิดไฟล์นี้ไม่ได้ ไฟล์อาจเสียหายหรือมีรหัสผ่าน', false, true);
    });
  }

  /* ── การ์ดภาพย่อแต่ละหน้า ── */
  function renderPageCard(doc, pageNum) {
    return doc.getPage(pageNum).then(function (page) {
      var vp = page.getViewport({ scale: 1 });
      var scale = Math.min(160 / vp.width, 220 / vp.height);
      var vp2 = page.getViewport({ scale: scale });
      var cv = document.createElement('canvas');
      cv.width = vp2.width;
      cv.height = vp2.height;
      return page.render({ canvasContext: cv.getContext('2d'), viewport: vp2 }).promise.then(function () {
        var idx = pageNum - 1;
        var card = document.createElement('div');
        card.className = 'jpg-page-card relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all select-none';
        card.dataset.idx = idx;
        card.innerHTML =
          '<div style="aspect-ratio:' + (vp2.width / vp2.height).toFixed(3) + '" class="bg-desk-200 flex items-center justify-center">' +
            '<img src="' + cv.toDataURL('image/jpeg', 0.75) + '" class="w-full h-full object-contain" alt="หน้า ' + pageNum + '" />' +
          '</div>' +
          '<span class="page-card-check absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] transition-colors">' +
            '<i class="fa-solid fa-check"></i>' +
          '</span>' +
          '<p class="text-center text-xs font-mono text-ink-500 py-1">' + pageNum + '</p>';
        paintCard(card, jpgSelected.has(idx));
        card.addEventListener('click', function () { togglePage(idx, card); });
        return card;
      });
    });
  }

  /* ติ๊กมุมขวาบนแทนการทาสีทับทั้งใบ เพราะเริ่มต้นเลือกไว้หมด ถ้าทับทั้งใบจะมองไม่เห็นเนื้อหา */
  function paintCard(card, on) {
    card.classList.toggle('border-ink-600', on);
    card.classList.toggle('border-transparent', !on);
    card.classList.toggle('opacity-50', !on);
    var check = card.querySelector('.page-card-check');
    check.className = 'page-card-check absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] transition-colors ' +
      (on ? 'bg-ink-700 text-white' : 'bg-white/90 text-transparent ring-1 ring-desk-300');
  }

  function togglePage(idx, card) {
    if (jpgSelected.has(idx)) jpgSelected.delete(idx);
    else jpgSelected.add(idx);
    paintCard(card, jpgSelected.has(idx));
    updateFooter();
  }

  selectAllBtn.addEventListener('click', function () { setAll(true); });
  clearAllBtn.addEventListener('click', function () { setAll(false); });

  function setAll(on) {
    jpgSelected.clear();
    if (on) for (var i = 0; i < jpgTotalPages; i++) jpgSelected.add(i);
    pageList.querySelectorAll('.jpg-page-card').forEach(function (c) { paintCard(c, on); });
    updateFooter();
  }

  /* ── ความคมชัด ── */
  qualityPicker.addEventListener('click', function (e) {
    var button = e.target.closest('button[data-jpg-dpi]');
    if (!button) return;
    jpgDpi = parseInt(button.dataset.jpgDpi, 10);
    paintQuality();
  });

  function paintQuality() {
    qualityPicker.querySelectorAll('button[data-jpg-dpi]').forEach(function (button) {
      var active = parseInt(button.dataset.jpgDpi, 10) === jpgDpi;
      button.setAttribute('aria-checked', String(active));
      button.className = 'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
        (active ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700');
    });
  }

  /* ── footer ── */
  function updateFooter() {
    var count = jpgSelected.size;
    footerNote.innerHTML =
      'เลือก <span class="font-semibold text-ink-700">' + count + '</span> ' +
      'จาก <span class="font-semibold text-ink-700">' + jpgTotalPages + '</span> หน้า';

    doBtn.disabled = !count;
    doLabel.textContent = count > 1
      ? 'ดาวน์โหลด ZIP (' + count + ' รูป)'
      : 'ดาวน์โหลด JPG';

    updateShareButton(count);
  }

  /** ปุ่มแชร์โผล่เฉพาะตอนที่ LINE พร้อมใช้จริง และส่งได้ไม่เกินโควตาต่อครั้ง */
  function updateShareButton(count) {
    var lineReady = window.LineShare && window.LineShare.isReady();
    shareBtn.classList.toggle('hidden', !lineReady);
    shareBtn.classList.toggle('inline-flex', !!lineReady);
    if (!lineReady) return;

    var max = window.LineShare.maxFiles;
    var tooMany = count > max;

    shareBtn.disabled = !count || tooMany;
    shareBtn.title = tooMany ? 'LINE ส่งได้ครั้งละไม่เกิน ' + max + ' รูป' : '';
    shareLabel.textContent = tooMany
      ? 'แชร์ได้ไม่เกิน ' + max + ' รูป'
      : (count > 1 ? 'แชร์ ' + count + ' รูป' : 'แชร์เข้า LINE');
  }

  /* ── แปลงหนึ่งหน้าเป็น JPG ──
     longEdge ใส่มาเมื่อต้องการกำหนดขนาดเอง (ตอนแชร์) ไม่ใส่จะใช้ความคมชัดที่เลือกไว้ */
  function pageToJpeg(pageNum, longEdge) {
    return jpgPdfDoc.getPage(pageNum).then(function (page) {
      var base = page.getViewport({ scale: 1 });
      var edge = Math.max(base.width, base.height);
      var scale = longEdge ? longEdge / edge : Math.min(jpgDpi / 72, MAX_EDGE / edge);
      var vp = page.getViewport({ scale: scale });

      var cv = document.createElement('canvas');
      cv.width = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      var ctx = cv.getContext('2d');

      // JPG ไม่มีพื้นโปร่งใส ไม่ทาขาวก่อนจะได้พื้นดำตรงส่วนที่ PDF ไม่ได้วาด
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);

      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        return new Promise(function (resolve, reject) {
          cv.toBlob(function (blob) {
            cv.width = cv.height = 0;   // คืนหน่วยความจำทันที มือถือแรมน้อยแปลงหลายหน้าจะได้ไม่ค้าง
            if (blob) resolve(blob);
            else reject(new Error('แปลงหน้า ' + pageNum + ' เป็นรูปไม่สำเร็จ'));
          }, 'image/jpeg', 0.92);
        });
      });
    });
  }

  function baseName() {
    return jpgFileName.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '-') || 'เอกสาร';
  }

  /**
   * ส่งไฟล์ถึงมือผู้ใช้
   * ในแอป LINE ดาวน์โหลดตรงไม่ได้ LineFile จะอ้อมผ่าน Drive ให้เอง
   */
  function deliver(blob, filename, mimeType, pageCount) {
    if (window.LineFile) {
      return window.LineFile.save({
        data: blob,
        filename: filename,
        mimeType: mimeType,
        title: filename.replace(/\.[a-z0-9]+$/i, ''),
        pageCount: pageCount,
        onProgress: function () { showStatus('กำลังอัปโหลดเพื่อเปิดในเบราว์เซอร์...', true); }
      });
    }

    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    return Promise.resolve('saved');
  }

  doBtn.addEventListener('click', function () {
    if (!jpgPdfDoc || !jpgSelected.size) return;

    var pages = Array.from(jpgSelected).sort(function (a, b) { return a - b; })
      .map(function (idx) { return idx + 1; });

    if (pages.length > 1 && typeof JSZip === 'undefined') {
      showStatus('โหลดตัวบีบอัดไฟล์ (JSZip) ไม่สำเร็จ ลองรีเฟรชหน้าเว็บอีกครั้ง', false, true);
      return;
    }

    doBtn.disabled = true;
    var zip = pages.length > 1 ? new JSZip() : null;
    var single = null;
    var chain = Promise.resolve();

    pages.forEach(function (pageNum, order) {
      chain = chain.then(function () {
        showStatus('กำลังแปลงหน้า ' + pageNum + ' (' + (order + 1) + ' จาก ' + pages.length + ')...', true);
        return pageToJpeg(pageNum).then(function (blob) {
          if (zip) zip.file(baseName() + '_หน้า-' + pageNum + '.jpg', blob);
          else single = blob;
        });
      });
    });

    chain.then(function () {
      if (!zip) {
        return deliver(single, baseName() + '_หน้า-' + pages[0] + '.jpg', 'image/jpeg', 1);
      }
      showStatus('กำลังบีบอัดเป็นไฟล์ zip...', true);
      return zip.generateAsync({ type: 'blob' }).then(function (blob) {
        return deliver(blob, baseName() + '_JPG.zip', 'application/zip', pages.length);
      });
    }).then(function (how) {
      var what = zip ? 'ไฟล์ zip (' + pages.length + ' รูป)' : 'รูป JPG';
      showStatus(how === 'drive'
        ? 'เปิด ' + what + ' ในเบราว์เซอร์แล้ว กดดาวน์โหลดต่อได้เลย ✓'
        : 'สร้าง ' + what + ' เสร็จแล้ว ✓', false);
    }).catch(function (err) {
      console.error(err);
      showStatus('เกิดข้อผิดพลาด: ' + err.message, false, true);
    }).finally(updateFooter);
  });

  /* ── แชร์เข้า LINE ──
     ไม่ว่าเลือกความคมชัดไว้แค่ไหน LINE ก็ย่อรูปเหลือด้านยาวราว 1600px อยู่ดี
     จึงแปลงที่ขนาดนั้นเลย อัปโหลดเร็วกว่าและไม่กินพื้นที่ Drive */
  shareBtn.addEventListener('click', function () {
    if (!jpgPdfDoc || !jpgSelected.size || !window.LineShare) return;

    var pages = Array.from(jpgSelected).sort(function (a, b) { return a - b; })
      .map(function (idx) { return idx + 1; });

    if (pages.length > window.LineShare.maxFiles) {
      showStatus('LINE ส่งได้ครั้งละไม่เกิน ' + window.LineShare.maxFiles +
                 ' รูป เลือกหน้าให้น้อยลง หรือกดดาวน์โหลดเป็น zip แทน', false, true);
      return;
    }

    shareBtn.disabled = true;
    doBtn.disabled = true;

    var items = [];
    var chain = Promise.resolve();
    pages.forEach(function (pageNum, order) {
      chain = chain.then(function () {
        showStatus('กำลังเตรียมรูปหน้า ' + pageNum + ' (' + (order + 1) + ' จาก ' + pages.length + ')...', true);
        return pageToJpeg(pageNum, window.LineShare.imageLongEdge).then(function (blob) {
          items.push({ blob: blob, filename: baseName() + '_หน้า-' + pageNum + '.jpg' });
        });
      });
    });

    chain.then(function () {
      return window.LineShare.shareImages(items, function () {
        showStatus('กำลังอัปโหลดรูปขึ้น Drive...', true);
      });
    }).then(function (sent) {
      if (sent) {
        showStatus('ส่งรูปเข้า LINE แล้ว ✓', false);
        if (keepNotice) keepNotice.classList.remove('hidden');
      } else {
        hideStatus();
      }
    }).catch(function (err) {
      console.error(err);
      showStatus('แชร์ไม่สำเร็จ: ' + err.message, false, true);
    }).finally(updateFooter);
  });

  /* ── status bar ── */
  function showStatus(msg, spinning, isError) {
    statusEl.classList.remove('hidden');
    statusSpinner.classList.toggle('hidden', !spinning);
    statusText.textContent = msg;
    statusEl.style.background = isError ? 'rgba(178,58,52,.08)' : '';
    statusText.style.color = isError ? '#B23A34' : '';
  }
  function hideStatus() { statusEl.classList.add('hidden'); }

  function resetState() {
    loadToken++;
    if (jpgPdfDoc) jpgPdfDoc.destroy();
    jpgPdfDoc = null;
    jpgFileName = '';
    jpgTotalPages = 0;
    jpgSelected.clear();
    pageList.innerHTML = '';
    if (keepNotice) keepNotice.classList.add('hidden');
    hideStatus();
    paintQuality();
    updateFooter();
  }

  /* ── ทางเข้าจากหน้าแรก ── */
  window.PdfJpg = {
    open: function (file) {
      resetState();
      openModal();
      if (file) loadFile(file);
    }
  };
})();
