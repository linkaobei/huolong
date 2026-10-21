(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), compact = matchMedia('(max-width: 800px)');
  const chapters = ['home', 'culture', 'craft', 'map', 'play'];
  const names = ['序 / 火龙入夜', '01 / 火龙文化', '02 / 制作工艺', '03 / 文化地图', '04 / 指尖舞龙'];
  const portals = ['火龙入夜', '众人制龙', '竹骨纸衣', '循火寻乡', '与火共舞'];
  const numerals = ['序章', '第一境', '第二境', '第三境', '第四境'];
  const menu = document.querySelector('.menu-toggle'), nav = $('mainNav');
  const rail = document.querySelector('.chapter-rail'), header = document.querySelector('.site-header');
  const stage = $('exhibitionStage'), curtain = $('chapterTransition'), scene = $('dragonExperience');
  const chapterLinks = [...document.querySelectorAll('#mainNav a[href^="#"], .chapter-rail a')];
  let active = 'home', moving = false, menuOpen = false, userPaused = false;
  let queuedNavigation, navigatingId, entryTimer, dialogFocus, skipTravel = false;
  let sceneryFrame = 0, gameArrivalTimer, gameWasVisible = false;
  try { userPaused = sessionStorage.getItem('puzhai-exhibition-paused') === 'true'; } catch (_) {}
  const allowed = () => !reduced.matches && !userPaused;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const heroContent = document.querySelector('.hero-content'), cultureImage = document.querySelector('.culture-picture'), bamboo = document.querySelector('.culture-bamboo');

  // Only the active art scene owns this loop; the game renderer remains independent.
  const canAnimate = () => allowed() && ['home', 'culture'].includes(active) && !document.hidden && !menuOpen && !moving && !$('sourcesDialog').open;
  function syncScenery() {
    document.body.classList.toggle('hero-offscreen', active !== 'home' || document.hidden);
    if (canAnimate()) { if (!sceneryFrame) sceneryFrame = requestAnimationFrame(paintScenery); }
    else if (sceneryFrame) { cancelAnimationFrame(sceneryFrame); sceneryFrame = 0; }
  }
  function paintScenery(time) {
    sceneryFrame = 0; if (!canAnimate()) return;
    pointer.x += (pointer.tx - pointer.x) * .065; pointer.y += (pointer.ty - pointer.y) * .065;
    if (active === 'home') {
      $('home').style.setProperty('--scene-x', (pointer.x * 16).toFixed(2) + 'px');
      $('home').style.setProperty('--scene-y', (pointer.y * 10 + Math.sin(time * .0002) * 2).toFixed(2) + 'px');
      heroContent.style.setProperty('--title-x', (pointer.x * -3).toFixed(2) + 'px');
      heroContent.style.setProperty('--title-y', (pointer.y * -2).toFixed(2) + 'px');
      $('home').style.setProperty('--ember-x', (pointer.x * -10).toFixed(2) + 'px');
    } else {
      cultureImage.style.translate = `${(pointer.x * -7).toFixed(2)}px ${(pointer.y * -4).toFixed(2)}px`;
      bamboo.style.translate = `${(pointer.x * 14).toFixed(2)}px ${(pointer.y * 5).toFixed(2)}px`;
    }
    sceneryFrame = requestAnimationFrame(paintScenery);
  }
  stage.addEventListener('pointermove', e => {
    if (!allowed() || compact.matches || e.pointerType === 'touch') return;
    pointer.tx = (e.clientX / innerWidth - .5) * 2; pointer.ty = (e.clientY / innerHeight - .5) * 2;
  }, { passive: true });
  stage.addEventListener('pointerleave', () => { pointer.tx = pointer.ty = 0; });
  for (let i = 0; i < 22; i++) {
    const ember = document.createElement('i');
    ember.style.cssText = `--x:${(i * 23 + 11) % 100}%;--duration:${10 + i % 8}s;--delay:-${i * 1.7}s`;
    document.querySelector('.hero-embers').append(ember);
  }
  function applyMotion() {
    const enabled = allowed();
    document.body.classList.toggle('js-motion', enabled); document.body.classList.toggle('exhibition-still', !enabled);
    $('motionToggle').setAttribute('aria-pressed', String(!enabled));
    $('motionToggle').setAttribute('aria-label', enabled ? '暂停展览动效' : '恢复展览动效');
    $('motionToggle').disabled = reduced.matches; $('motionLabel').textContent = enabled ? '静观' : '动览';
    if (!enabled) {
      skipTravel = true;
      $('home').style.setProperty('--scene-x', '0px'); $('home').style.setProperty('--scene-y', '0px');
      heroContent.style.setProperty('--title-x', '0px'); heroContent.style.setProperty('--title-y', '0px');
      cultureImage.style.translate = bamboo.style.translate = '0px 0px';
    }
    syncScenery();
  }
  $('motionToggle').addEventListener('click', () => {
    userPaused = !userPaused;
    try { sessionStorage.setItem('puzhai-exhibition-paused', String(userPaused)); } catch (_) {}
    applyMotion();
  });
  reduced.addEventListener('change', applyMotion); document.addEventListener('visibilitychange', syncScenery);

  function pauseGame() { if (!scene.hidden && $('gameOverlay').hidden && !$('pauseGame').disabled) $('pauseGame').click(); }
  function setMenu(open, restore = false) {
    menuOpen = open; nav.classList.toggle('open', open); nav.inert = !open;
    $('navBackdrop').hidden = !open; rail.inert = open || moving;
    document.body.classList.toggle('menu-open', open);
    menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? '关闭章节索引' : '打开章节索引');
    $(active).inert = open || moving; document.querySelector('.brand').inert = open;
    if (open) {
      pauseGame(); requestAnimationFrame(() => nav.querySelector(`a[href="#${active}"]`).focus({ preventScroll: true }));
    } else if (restore) menu.focus({ preventScroll: true });
    syncScenery();
  }
  nav.inert = true;
  menu.addEventListener('click', () => setMenu(!menuOpen)); $('navBackdrop').addEventListener('click', () => setMenu(false, true));
  const preloads = new Map();
  function loadImage(src) {
    if (!preloads.has(src)) { const img = new Image(); img.src = src; preloads.set(src, img.decode().catch(() => {})); }
    return preloads.get(src);
  }
  ['culture-mural-reference', 'craft-bamboo', 'craft-paper', 'craft-paint'].forEach(n => loadImage(`assets/${n}.webp`));
  function showChapter(id, entering = true) {
    if (!scene.hidden && id !== 'play') $('returnToArt').click();
    chapters.forEach(k => { $(k).hidden = k !== id; $(k).classList.toggle('is-active', k === id); $(k).classList.remove('is-entering'); $(k).inert = k !== id; });
    active = id; $(id).scrollTop = 0; pointer.tx = pointer.ty = pointer.x = pointer.y = 0;
    clearTimeout(entryTimer);
    if (entering && allowed()) { $(id).classList.add('is-entering'); entryTimer = setTimeout(() => $(id).classList.remove('is-entering'), 1800); }
    document.body.dataset.chapter = id;
    chapterLinks.forEach(a => {
      const selected = a.hash === '#' + id; a.classList.toggle('active', selected);
      if (selected) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('currentChapter').textContent = names[chapters.indexOf(id)];
    $('pageAnnouncer').textContent = '已进入' + names[chapters.indexOf(id)].split(' / ')[1];
    document.dispatchEvent(new CustomEvent('exhibition:chapter', { detail: { id } })); syncScenery();
  }
  function updateAddress(id, replace = false) {
    try { history[replace ? 'replaceState' : 'pushState']({ chapter: id }, '', '#' + id); }
    catch (_) { if (replace) location.replace('#' + id); else location.hash = '#' + id; }
  }
  async function playAnimation(element, frames, options) {
    const animation = element.animate(frames, options); await animation.finished; return animation;
  }
  // The SVG mask is updated in user coordinates, including under file://.
  function openAperture(duration) {
    const aperture = $('portalAperture'), pattern = $('portalPattern'), started = performance.now();
    return new Promise(resolve => {
      function tick(now) {
        const t = skipTravel || !allowed() ? 1 : Math.max(0, Math.min(1, (now - started) / duration)), eased = 1 - Math.pow(1 - t, 3);
        aperture.setAttribute('r', String(1200 * eased)); pattern.style.transform = `scale(${1 + eased * .38})`;
        if (t < 1) requestAnimationFrame(tick); else resolve();
      }
      requestAnimationFrame(tick);
    });
  }
  async function navigate(id, writeHistory = true) {
    if (!chapters.includes(id)) return;
    if (moving) { queuedNavigation = { id, writeHistory }; return; }
    setMenu(false);
    if (id === active) {
      $(id).scrollTo({ top: 0, behavior: allowed() ? 'smooth' : 'auto' });
      if (writeHistory && location.hash !== '#' + id) updateAddress(id); return;
    }
    if (!scene.hidden) $('returnToArt').click();
    moving = true; navigatingId = id; skipTravel = false;
    stage.inert = header.inert = rail.inert = true; stage.setAttribute('aria-busy', 'true');
    document.body.classList.add('is-travelling'); syncScenery();
    const animations = [];
    try {
      const image = $(id).querySelector('.mural-picture, #craftImage'); if (image) await loadImage(image.src);
      if (writeHistory) updateAddress(id);
      if (allowed() && typeof curtain.animate === 'function') {
        const index = chapters.indexOf(id); curtain.dataset.theme = id;
        $('portalNumber').textContent = numerals[index]; $('portalTitle').textContent = portals[index];
        $('portalAperture').setAttribute('r', '0'); $('portalPattern').style.transform = 'scale(1)';
        curtain.querySelector('.portal-word').style.opacity = '1'; curtain.hidden = false;
        animations.push($(active).animate([{ scale: 1, opacity: 1 }, { scale: 1.045, opacity: .45 }], { duration: 350, easing: 'ease-in', fill: 'forwards' }));
        animations.push(await playAnimation(curtain, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-in', fill: 'forwards' }));
        showChapter(id);
        animations.push(curtain.querySelector('.portal-word').animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 1.15 }], { duration: 330, fill: 'forwards' }));
        await openAperture(1100);
      } else showChapter(id, false);
    } catch (error) { console.warn('章节转场已回退到直接显示。', error); showChapter(id, false); }
    finally {
      curtain.hidden = true; animations.forEach(a => a.cancel());
      $('portalAperture').setAttribute('r', '0'); $('portalPattern').style.transform = '';
      stage.removeAttribute('aria-busy'); stage.inert = header.inert = rail.inert = false;
      moving = false; navigatingId = null; document.body.classList.remove('is-travelling');
      $(active).focus({ preventScroll: true }); syncScenery();
      if (queuedNavigation) { const next = queuedNavigation; queuedNavigation = null; navigate(next.id, next.writeHistory); }
    }
  }
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1); if (chapters.includes(id)) { e.preventDefault(); navigate(id); }
  }));
  addEventListener('hashchange', () => { const id = location.hash.slice(1); if (chapters.includes(id) && id !== navigatingId) navigate(id, false); });
  const initial = chapters.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  if (location.hash !== '#' + initial) updateAddress(initial, true);
  applyMotion(); showChapter(initial);

  const crafts = [
    { name: '一弯竹篾，撑起龙身。', english: 'BAMBOO · STRUCTURE', description: '竹篾扎结成骨架，节段相连，构成可随舞动弯转的龙身。扎骨，是火龙造型的基础。', image: 'assets/craft-bamboo.webp', label: '01 / 竹篾骨架', alt: '双手将竹篾绑扎为中空的节段骨架，扎骨动作艺术示意' },
    { name: '一层纸裱，赋予形体。', english: 'PAPER · SURFACE', description: '纸裱覆盖龙身，轻巧的纸面与竹骨相合，让火龙有了可以着色的外衣。', image: 'assets/craft-paper.webp', label: '02 / 纸裱肌理', alt: '双手把未绘彩的纸面贴覆在竹骨上，裸露竹骨与已裱纸部分清晰区分' },
    { name: '一笔绘彩，龙鳞生辉。', english: 'PIGMENT · ORNAMENT', description: '在纸裱表面绘上色彩与鳞纹。火龙的外观，经由手工绘制而变得鲜明、生动。', image: 'assets/craft-paint.webp', label: '03 / 手工绘彩', alt: '手艺人用毛笔在纸裱龙身绘制朱红鳞纹，绘彩动作艺术示意' }
  ];
  const tabs = [...document.querySelectorAll('[data-craft]')]; let craftRequest = 0;
  async function selectCraft(index, focus = false) {
    const craft = crafts[index], request = ++craftRequest, frame = $('craftImage').closest('figure');
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    $('craftPanel').setAttribute('aria-labelledby', 'craftTab' + index); $('craftModel').dataset.step = String(index);
    $('craftSculpture').setAttribute('aria-label', ['龙形竹篾骨架，环状竹骨与龙头扎结结构','同姿态的米白纸裱火龙，纸衣下可见竹骨与纸缝','同姿态的朱红金鳞火龙，墨绿背鳍、金角与流苏长须'][index]);
    $('craftName').textContent = craft.name; $('craftEnglish').textContent = craft.english;
    $('craftDescription').textContent = craft.description; $('craftImageLabel').textContent = craft.label;
    if (focus) tabs[index].focus({ preventScroll: true });
    if ($('craftImage').getAttribute('src') === craft.image) { frame.classList.remove('media-switching'); frame.removeAttribute('aria-busy'); return; }
    frame.setAttribute('aria-busy', 'true'); if (allowed()) frame.classList.add('media-switching');
    await Promise.all([loadImage(craft.image), new Promise(resolve => setTimeout(resolve, allowed() ? 230 : 0))]);
    if (request !== craftRequest) return;
    $('craftImage').src = craft.image; $('craftImage').alt = craft.alt; await $('craftImage').decode().catch(() => {});
    requestAnimationFrame(() => { if (request === craftRequest) { frame.classList.remove('media-switching'); frame.removeAttribute('aria-busy'); } });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectCraft(index));
    tab.addEventListener('keydown', e => {
      let next; if (e.key === 'ArrowRight') next = (index + 1) % 3; if (e.key === 'ArrowLeft') next = (index + 2) % 3;
      if (e.key === 'Home') next = 0; if (e.key === 'End') next = 2;
      if (next !== undefined) { e.preventDefault(); selectCraft(next, true); }
    });
  });
  function openSources() { dialogFocus = document.activeElement; setMenu(false); pauseGame(); $('sourcesDialog').showModal(); syncScenery(); }
  document.querySelectorAll('[data-dialog]').forEach(button => button.addEventListener('click', openSources));
  $('sourcesDialog').querySelector('[data-close]').addEventListener('click', () => $('sourcesDialog').close());
  $('sourcesDialog').addEventListener('click', e => {
    const rect = $('sourcesDialog').getBoundingClientRect();
    if (e.target === $('sourcesDialog') && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) $('sourcesDialog').close();
  });
  $('sourcesDialog').addEventListener('close', () => { syncScenery(); const target = dialogFocus?.closest('#mainNav') ? menu : dialogFocus; target?.focus({ preventScroll: true }); });

  function syncGame() {
    const visible = !scene.hidden;
    $('gameHelp').hidden = !visible;
    if (visible && !gameWasVisible) {
      $('gameHelp').open = true;
      if (allowed()) { scene.classList.add('game-arriving'); clearTimeout(gameArrivalTimer); gameArrivalTimer = setTimeout(() => scene.classList.remove('game-arriving'), 900); }
    }
    if (!visible && scene.classList.contains('game-arriving')) scene.classList.remove('game-arriving');
    gameWasVisible = visible;
    document.body.classList.toggle('game-active', visible); document.body.classList.toggle('game-playing', visible && $('gameOverlay').hidden);
    document.body.classList.toggle('immersive-active', visible); header.inert = visible || moving; rail.inert = visible || moving || menuOpen;
    $('play').setAttribute('aria-labelledby', visible ? 'danceRoomTitle' : 'endingTitle');
  }
  new MutationObserver(syncGame).observe(scene, { attributes: true, attributeFilter: ['hidden', 'class'] });
  new MutationObserver(syncGame).observe($('gameOverlay'), { attributes: true, attributeFilter: ['hidden'] });
  function fitGame() { syncGame(); $('play').scrollTo({ top: 0, behavior: 'auto' }); }
  $('enterGame').addEventListener('click', fitGame); $('enterGameNav').addEventListener('click', fitGame);
  $('returnToArt').addEventListener('click', () => {
    const label = $('enterGame').textContent.includes('继续') ? '继续舞龙' : '开始舞龙';
    $('enterGame').innerHTML = '<span>' + label + '</span><span aria-hidden="true">↗</span>';
    syncGame(); $('play').scrollTo({ top: 0, behavior: 'auto' });
  });
  compact.addEventListener('change', () => { pointer.tx = pointer.ty = pointer.x = pointer.y = 0; });
  addEventListener('keydown', e => {
    if (moving && e.key === 'Escape') { skipTravel = true; return; }
    if (menuOpen) {
      if (e.key === 'Escape') { e.preventDefault(); setMenu(false, true); }
      if (e.key === 'Tab') {
        const items = [...header.querySelectorAll('a,button:not(:disabled)')].filter(el => el.getClientRects().length && !el.closest('[inert]'));
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (!scene.hidden && e.key === 'Escape' && !$('sourcesDialog').open) { e.preventDefault(); $('returnToArt').click(); }
  });
})();
