(function(){
  const FILTERS = [
    { id:'classic', label:'Classic', css:'contrast(1.06) saturate(1.05)' },
    { id:'noir', label:'Noir', css:'grayscale(1) contrast(1.15)' },
    { id:'sepia', label:'Sepia', css:'sepia(0.6) contrast(1.05) saturate(1.1)' },
    { id:'dreamy', label:'Dreamy', css:'saturate(1.35) brightness(1.08) contrast(0.95)' }
  ];
  const PAPERS = [
    { id:'cream', hex:'#FFFDF8' },
    { id:'blush', hex:'#FBE4E8' },
    { id:'sage', hex:'#EAF0E2' },
    { id:'lav', hex:'#EFE7F5' }
  ];

  const FRAME_W = 960;
  const FRAME_H = 720;
  const HALF_W = FRAME_W / 2;

  let currentFilter = FILTERS[0];
  let currentPaper = PAPERS[0];
  let currentLayout = '1x4'; // '1x4' | '2x2'
  let shots = [];
  let stream = null;
  let busy = false;
  let mirrorLocal = true;
  let mode = 'photobooth'; // 'photobooth' | 'ldr'

  let peer = null;
  let dataConn = null;
  let mediaCall = null;
  let remoteStream = null;
  let ldrConnected = false;
  let importedPartnerImage = null;

  const video = document.getElementById('video');
  const partnerVideoEl = document.getElementById('partnerVideo');
  const partnerPhotoEl = document.getElementById('partnerPhoto');
  const partnerEmptyEl = document.getElementById('partnerEmpty');
  const partnerSideEl = document.getElementById('partnerSide');
  const filtersEl = document.getElementById('filters');
  const swatchRow = document.getElementById('swatchRow');
  const slotsEl = document.getElementById('slots');
  const stripEl = document.getElementById('strip');
  const stripFrame = document.getElementById('stripFrame');
  const shutterBtn = document.getElementById('shutterBtn');
  const shutterCount = document.getElementById('shutterCount');
  const shotsLeft = document.getElementById('shotsLeft');
  const countdownEl = document.getElementById('countdown');
  const flashEl = document.getElementById('flash');
  const heartsBurstEl = document.getElementById('heartsBurst');
  const camError = document.getElementById('camError');
  const retryCam = document.getElementById('retryCam');
  const retakeBtn = document.getElementById('retakeBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const hint = document.getElementById('hint');
  const stickerToggle = document.getElementById('stickerToggle');
  const flipBtn = document.getElementById('flipBtn');
  const modeSelect = document.getElementById('modeSelect');
  const layoutSelect = document.getElementById('layoutSelect');
  const ldrPanel = document.getElementById('ldrPanel');
  const myCodeEl = document.getElementById('myCode');
  const copyCodeBtn = document.getElementById('copyCode');
  const partnerCodeInput = document.getElementById('partnerCode');
  const connectBtn = document.getElementById('connectBtn');
  const ldrStatus = document.getElementById('ldrStatus');
  const partnerFileBtn = document.getElementById('partnerFileBtn');
  const partnerFileInput = document.getElementById('partnerFile');
  const dateStamp = document.getElementById('dateStamp');
  const perfLeft = document.getElementById('perfLeft');
  const perfRight = document.getElementById('perfRight');

  function updateLiveClocks() {
    const d = new Date();
    const phTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d);

    const thTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d);

    const timeEl = document.getElementById('timePill');
    if (timeEl) {
      timeEl.innerHTML = `PH ${phTime} <span>&bull;</span> TH ${thTime}`;
    }
  }
  setInterval(updateLiveClocks, 1000);
  updateLiveClocks();

  function buildFilterChips(){
    filtersEl.innerHTML = '';
    FILTERS.forEach(f => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (f.id === currentFilter.id ? ' active' : '');
      b.textContent = f.label;
      b.addEventListener('click', () => {
        currentFilter = f;
        video.style.filter = f.css;
        partnerVideoEl.style.filter = f.css;
        partnerPhotoEl.style.filter = f.css;
        [...filtersEl.children].forEach(c => c.classList.remove('active'));
        b.classList.add('active');
      });
      filtersEl.appendChild(b);
    });
    video.style.filter = currentFilter.css;
  }

  function buildSwatches(){
    PAPERS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (p.id === currentPaper.id ? ' active' : '');
      b.style.background = p.hex;
      b.setAttribute('aria-label', p.id + ' paper');
      b.addEventListener('click', () => {
        currentPaper = p;
        stripEl.style.background = p.hex;
        [...swatchRow.querySelectorAll('.swatch')].forEach(c => c.classList.remove('active'));
        b.classList.add('active');
      });
      swatchRow.appendChild(b);
    });
    stripEl.style.background = currentPaper.hex;
  }

  function setupLayoutToggle(){
    const btns = layoutSelect.querySelectorAll('.chip');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        currentLayout = btn.dataset.layout;
        btns.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        
        if(currentLayout === '2x2'){
          stripEl.classList.add('layout-2x2');
          stripFrame.classList.add('layout-2x2');
        } else {
          stripEl.classList.remove('layout-2x2');
          stripFrame.classList.remove('layout-2x2');
        }
      });
    });
  }

  function buildSlots(){
    slotsEl.innerHTML = '';
    for(let i=0;i<4;i++){
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = '<span class="num">' + (i+1) + '</span>';
      slotsEl.appendChild(s);
    }
  }

  function buildPerf(){
    [perfLeft, perfRight].forEach(p => {
      p.innerHTML = '';
      for(let i=0;i<9;i++){
        const dot = document.createElement('i');
        p.appendChild(dot);
      }
    });
  }

  function setDate(){
    const d = new Date();
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    dateStamp.textContent = `${yr}.${mo}.${da}`;
  }

  function partnerReady(){
    return ldrConnected || !!importedPartnerImage;
  }

  function readyToShoot(){
    return mode === 'ldr' ? partnerReady() : true;
  }

  function updateShutterEnabled(){
    const ready = !!stream && readyToShoot() && shots.length < 4 && !busy;
    shutterBtn.disabled = !ready;
    shutterCount.textContent = shots.length >= 4
      ? 'all done'
      : (mode === 'ldr' && !partnerReady() ? 'connect first' : 'tap to capture');
  }

  async function startCamera(){
    camError.style.display = 'none';
    try{
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'user', width:{ideal:1280}, height:{ideal:720} }, audio:false });
      video.srcObject = stream;
      updateShutterEnabled();
    }catch(err){
      camError.style.display = 'flex';
      updateShutterEnabled();
    }
  }

  flipBtn.addEventListener('click', () => {
    mirrorLocal = !mirrorLocal;
    video.style.transform = mirrorLocal ? 'scaleX(-1)' : 'scaleX(1)';
  });

  function defaultHintForMode(){
    if(mode === 'photobooth') return 'Strike a pose — one click captures all four shots automatically!';
    return 'Connect with your long-distance partner to start shooting together.';
  }

  function setMode(m){
    mode = m;
    [...modeSelect.children].forEach(c => c.classList.toggle('active', c.dataset.mode === m));
    const together = m === 'ldr';
    partnerSideEl.classList.toggle('hidden', !together);
    ldrPanel.style.display = together ? 'block' : 'none';
    if(shots.length === 0) hint.textContent = defaultHintForMode();
    updateShutterEnabled();
  }

  [...modeSelect.children].forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  function makeRoomCode(){
    return Math.floor(10000 + Math.random() * 90000).toString();
  }

  function setLdrStatus(text, kind){
    ldrStatus.textContent = text;
    ldrStatus.className = 'ldr-status' + (kind ? ' ' + kind : '');
  }

  function showPartnerEmpty(){
    partnerVideoEl.style.display = 'none';
    partnerPhotoEl.style.display = 'none';
    partnerEmptyEl.style.display = 'flex';
  }
  function showPartnerLive(){
    partnerEmptyEl.style.display = 'none';
    partnerPhotoEl.style.display = 'none';
    partnerVideoEl.style.display = 'block';
  }
  function showPartnerPhoto(){
    partnerEmptyEl.style.display = 'none';
    partnerVideoEl.style.display = 'none';
    partnerPhotoEl.style.display = 'block';
  }

  function initPeer(){
    if(typeof Peer === 'undefined'){
      setLdrStatus('Live mode needs an internet connection to load.', 'err');
      return;
    }
    setLdrStatus('Getting your code…');
    peer = new Peer(makeRoomCode());
    peer.on('open', id => {
      myCodeEl.textContent = id;
      myCodeEl.dataset.full = id;
      setLdrStatus('Share your code with your partner, or paste theirs above.');
    });
    peer.on('error', err => {
      if(err && err.type === 'unavailable-id'){
        peer.destroy();
        peer = new Peer(makeRoomCode());
        return;
      }
      setLdrStatus('Connection hiccup. Try again.', 'err');
    });
    peer.on('call', call => {
      if(!stream) return;
      mediaCall = call;
      call.answer(stream);
      call.on('stream', rs => attachRemoteStream(rs));
    });
    peer.on('connection', conn => {
      dataConn = conn;
      wireDataConn();
    });
  }

  function attachRemoteStream(rs){
    remoteStream = rs;
    partnerVideoEl.srcObject = rs;
    partnerVideoEl.style.filter = currentFilter.css;
    showPartnerLive();
    ldrConnected = true;
    updateShutterEnabled();
    setLdrStatus('Connected — you\'re live together.', 'ok');
  }

  function wireDataConn(){
    dataConn.on('open', () => {
      setLdrStatus(remoteStream ? 'Connected.' : 'Linked — waiting on video…', remoteStream ? 'ok' : '');
    });
    dataConn.on('data', msg => {
      if(msg && msg.type === 'startSequence'){
        runFullSequence();
      }
    });
    dataConn.on('close', () => {
      ldrConnected = false;
      remoteStream = null;
      if(importedPartnerImage){ showPartnerPhoto(); } else { showPartnerEmpty(); }
      updateShutterEnabled();
      setLdrStatus('Partner disconnected.', 'err');
    });
  }

  connectBtn.addEventListener('click', () => {
    const partnerId = partnerCodeInput.value.trim();
    if(!partnerId || !peer || !stream) return;
    setLdrStatus('Connecting…');
    dataConn = peer.connect(partnerId);
    wireDataConn();
    mediaCall = peer.call(partnerId, stream);
    mediaCall.on('stream', rs => attachRemoteStream(rs));
    mediaCall.on('error', () => setLdrStatus('Could not reach that code.', 'err'));
  });

  copyCodeBtn.addEventListener('click', () => {
    const full = myCodeEl.dataset.full;
    if(!full) return;
    navigator.clipboard.writeText(full).then(() => {
      copyCodeBtn.textContent = 'Copied!';
      setTimeout(() => { copyCodeBtn.textContent = 'Copy'; }, 1400);
    }).catch(() => {});
  });

  partnerFileBtn.addEventListener('click', () => partnerFileInput.click());
  partnerFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        importedPartnerImage = img;
        partnerPhotoEl.src = ev.target.result;
        partnerPhotoEl.style.filter = currentFilter.css;
        if(!ldrConnected) showPartnerPhoto();
        updateShutterEnabled();
        setLdrStatus('Photo added — ready to shoot.', 'ok');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  function playShutterSound(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.value = 0.06;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      o.stop(ctx.currentTime + 0.2);
    }catch(e){}
  }

  function spawnHearts(){
    heartsBurstEl.innerHTML = '';
    for(let i=0;i<6;i++){
      const h = document.createElement('div');
      h.className = 'heart-bit';
      h.style.left = (10 + Math.random() * 80) + '%';
      h.style.top = (45 + Math.random() * 30) + '%';
      h.style.animationDelay = (Math.random() * 0.15) + 's';
      heartsBurstEl.appendChild(h);
    }
  }

  function flash(){
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  }

  function drawRegion(ctx, source, mirrored, xOff, w, h, filterCss){
    ctx.save();
    ctx.beginPath();
    ctx.rect(xOff, 0, w, h);
    ctx.clip();
    if(filterCss) ctx.filter = filterCss;
    const vw = source.videoWidth || source.naturalWidth || source.width || 960;
    const vh = source.videoHeight || source.naturalHeight || source.height || 720;
    const scale = Math.max(w / vw, h / vh);
    const sw = w / scale, sh = h / scale;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    if(mirrored){
      ctx.translate(xOff * 2 + w, 0);
      ctx.scale(-1, 1);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, xOff, 0, w, h);
    ctx.restore();
  }

  function composeSoloFrame(){
    const c = document.createElement('canvas');
    c.width = FRAME_W; c.height = FRAME_H;
    const ctx = c.getContext('2d');
    drawRegion(ctx, video, mirrorLocal, 0, FRAME_W, FRAME_H, currentFilter.css);
    return c.toDataURL('image/jpeg', 0.98);
  }

  function composeTogetherFrame(){
    const c = document.createElement('canvas');
    c.width = FRAME_W; c.height = FRAME_H;
    const ctx = c.getContext('2d');

    drawRegion(ctx, video, mirrorLocal, 0, HALF_W, FRAME_H, currentFilter.css);

    let partnerSource = null;
    if(ldrConnected && remoteStream) partnerSource = partnerVideoEl;
    else if(importedPartnerImage) partnerSource = importedPartnerImage;

    if(partnerSource){
      drawRegion(ctx, partnerSource, false, HALF_W, HALF_W, FRAME_H, currentFilter.css);
    }else{
      ctx.fillStyle = '#1c1015';
      ctx.fillRect(HALF_W, 0, HALF_W, FRAME_H);
    }

    ctx.strokeStyle = 'rgba(255,253,248,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(HALF_W, 0);
    ctx.lineTo(HALF_W, FRAME_H);
    ctx.stroke();

    return c.toDataURL('image/jpeg', 0.98);
  }

  function composeFrame(){
    return mode === 'ldr' ? composeTogetherFrame() : composeSoloFrame();
  }

  function updateShotsLeft(){
    const left = 4 - shots.length;
    shotsLeft.textContent = left > 0 ? left + ' shot' + (left === 1 ? '' : 's') + ' left' : 'strip complete';
  }

  function fillSlot(index, dataUrl){
    const slot = slotsEl.children[index];
    slot.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Photo ' + (index+1) + ' of your strip';
    slot.appendChild(img);
  }

  function finishShot(dataUrl){
    shots.push(dataUrl);
    fillSlot(shots.length - 1, dataUrl);
    updateShotsLeft();
    if(shots.length >= 4){
      stripEl.classList.remove('printing');
      void stripEl.offsetWidth;
      stripEl.classList.add('printing');
      downloadBtn.disabled = false;
      hint.textContent = 'Your strip is ready. Download it or retake for a new take.';
      shutterBtn.disabled = true;
      shutterCount.textContent = 'all done';
      busy = false;
    }
  }

  // ONE CLICK: Runs a 3-2-1 countdown, snaps, and loops until 4 photos are taken.
  function runFullSequence() {
    if (shots.length >= 4) return;
    
    function takeNextShot() {
      // Safety check just in case
      if (shots.length >= 4) return;

      let n = 3;
      countdownEl.style.display = 'flex';
      countdownEl.textContent = n;

      const timerIv = setInterval(() => {
        n -= 1;
        if (n === 0) {
          clearInterval(timerIv);
          countdownEl.style.display = 'none';
          
          // Snap!
          flash();
          playShutterSound();
          spawnHearts();
          finishShot(composeFrame());
          
          // If we still need more pictures, automatically trigger the next countdown
          if (shots.length < 4) {
             // Half second pause before the next 3..2..1 starts
            setTimeout(takeNextShot, 500);
          }
        } else {
          countdownEl.textContent = n;
        }
      }, 1000);
    }

    // Start the process
    takeNextShot();
  }

  shutterBtn.addEventListener('click', () => {
    if(busy || shots.length >= 4 || !stream || !readyToShoot()) return;
    busy = true;
    shutterBtn.disabled = true;

    if(mode === 'ldr' && ldrConnected && dataConn && dataConn.open){
      try{ dataConn.send({ type:'startSequence' }); }catch(e){}
    }

    runFullSequence();
  });

  retryCam.addEventListener('click', startCamera);

  retakeBtn.addEventListener('click', () => {
    shots = [];
    buildSlots();
    updateShotsLeft();
    downloadBtn.disabled = true;
    hint.textContent = defaultHintForMode();
    updateShutterEnabled();
  });

  async function downloadStrip(){
    await document.fonts.load('600 20px Caveat');
    await document.fonts.load('600 24px Fraunces');
    await document.fonts.ready;

    let W, H, PAD, PHOTO_W, PHOTO_H, GAP, TOP, BOTTOM;

    if (currentLayout === '1x4') {
      W = 400; H = 1200; 
      PAD = 24; GAP = 12; TOP = 40; BOTTOM = 68;
      PHOTO_W = 352; PHOTO_H = 264;
    } else { // 2x2
      W = 800; H = 745; 
      PAD = 40; GAP = 20; TOP = 80; BOTTOM = 120;
      PHOTO_W = 350; PHOTO_H = 262.5;
    }

    const EXPORT_SCALE = 3; 

    const c = document.createElement('canvas');
    c.width = W * EXPORT_SCALE; 
    c.height = H * EXPORT_SCALE;
    const ctx = c.getContext('2d');
    
    ctx.scale(EXPORT_SCALE, EXPORT_SCALE); 
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = currentPaper.hex;
    ctx.fillRect(0, 0, W, H);

    const images = await Promise.all(shots.map(src => new Promise(res => {
      const im = new Image();
      im.onload = () => res(im);
      im.src = src;
    })));

    function drawPhoto(im, x, y, index) {
      ctx.save();
      ctx.drawImage(im, x, y, PHOTO_W, PHOTO_H);
      ctx.strokeStyle = 'rgba(43,22,32,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, PHOTO_W, PHOTO_H);
      ctx.restore();

      if(stickerToggle.checked){
        ctx.font = '18px Fraunces';
        const marks = ['\u2661','\u2726','\u2661','\u2726'];
        ctx.fillStyle = 'rgba(158,33,72,0.85)';
        ctx.fillText(marks[index % marks.length], x + PHOTO_W - 24, y + 22);
      }
    }

    images.forEach((im, i) => {
      if (currentLayout === '1x4') {
        drawPhoto(im, PAD, TOP + i * (PHOTO_H + GAP), i);
      } else { 
        const col = i % 2;
        const row = Math.floor(i / 2);
        drawPhoto(im, PAD + col * (PHOTO_W + GAP), TOP + row * (PHOTO_H + GAP), i);
      }
    });

    const d = new Date();
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const dateString = `${yr}.${mo}.${da}`;

    function drawDecorations(offsetX = 0, isGrid = false) {
      ctx.textAlign = 'center';
      
      let centerX = isGrid ? W/2 : (400 / 2) + offsetX;
      let textY = H - 32;
      let dateY = H - 14;

      ctx.fillStyle = '#6E1732';
      ctx.font = '600 24px Caveat';
      ctx.fillText('cheese booth', centerX, textY);
      
      ctx.fillStyle = '#5B454C';
      ctx.font = '700 12px DM Sans'; 
      ctx.fillText(dateString, centerX, dateY);
    }

    if (currentLayout === '1x4') {
      drawDecorations(0);
    } else {
      drawDecorations(0, true);
    }

    const link = document.createElement('a');
    link.download = 'cheese-booth-strip.png';
    link.href = c.toDataURL('image/png', 1.0);
    link.click();
  }

  downloadBtn.addEventListener('click', downloadStrip);

  buildFilterChips();
  setupLayoutToggle();
  buildSwatches();
  buildSlots();
  buildPerf();
  setDate();
  updateShotsLeft();
  showPartnerEmpty();
  setMode('photobooth'); 
  startCamera();
  initPeer();
})();