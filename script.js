/* js/app.js — Consolidated app + page-specific behavior
   - Core app (map, donors, charts, UI)
   - Swipe page module (swipe-to-auth)
   - Auth page module (login/signup/recover)
   - Explore page module (donor list, modals, find button, badges)
*/

/* -------------------------
   Core helpers + app (IIFE)
   ------------------------- */
(function () {
  // helpers
  window.escapeHtml = function (str = '') {
    return String(str).replace(/[&<>"'`=\/]/g, function (s) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'})[s];
    });
  };

  window.randomPastDate = function () {
    const d = new Date();
    const daysAgo = Math.floor(Math.random()*300) + 10;
    d.setDate(d.getDate() - daysAgo);
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  };

  // create donor card (full)
  function createDonorElement(donor = {}) {
    const wrapper = document.createElement('article');
    wrapper.className = 'donor-card liquid-glass';
    wrapper.setAttribute('data-id', donor.id || '');
    wrapper.innerHTML = `
      <div class="card-body">
        <div class="avatar" aria-hidden="true">
          ${ donor.avatarUrl ? `<img loading="lazy" src="${escapeHtml(donor.avatarUrl)}" alt="${escapeHtml(donor.name || 'Donor')}" />` : '<span>👤</span>' }
        </div>
        <div class="info">
          <div class="donor-name">${escapeHtml(donor.name || 'Unknown')}</div>
          <div class="donor-sub">${escapeHtml(donor.city || '')}</div>
          <div class="text-xs text-slate-400 mt-2">Last: ${escapeHtml(donor.lastDonation || randomPastDate())}</div>
        </div>
        <div class="right-side">
          <div class="blood-badge">${escapeHtml(donor.group || 'N/A')}</div>
          <button class="btn-ask mt-4 btn-action" data-action="contact" data-id="${escapeHtml(String(donor.id || ''))}" aria-label="Ask ${escapeHtml(donor.name || 'donor')}">Ask</button>
        </div>
      </div>
      <div class="donor-footer">Last date of donation ${escapeHtml(donor.lastDonation || randomPastDate())}</div>
    `;
    return wrapper;
  }

  // create light donor element (feed)
  function createLightDonorElement(donor = {}) {
    const el = document.createElement('div');
    el.className = 'flex items-start gap-4 mb-4 light-donor';
    el.setAttribute('data-id', donor.id || '');
    el.innerHTML = `
      <div class="w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-sm">
        ${donor.avatarUrl ? `<img loading="lazy" src="${escapeHtml(donor.avatarUrl)}" alt="${escapeHtml(donor.name || 'Donor')}" style="width:100%;height:100%;object-fit:cover;">` : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f3f4f6;"><span>👤</span></div>'}
      </div>
      <div class="flex-1">
        <div class="font-bold">${escapeHtml(donor.name || 'Unknown')}</div>
        <div class="text-xs text-slate-500">${escapeHtml(donor.city || '')} · <span class="font-semibold">${escapeHtml(donor.group || donor.blood || '')}</span></div>
        <div class="text-xs text-slate-400 mt-1">Last: ${escapeHtml(donor.lastDonation || randomPastDate())}</div>
      </div>
      <div class="flex flex-col items-end gap-2">
        <button class="btn-ask btn-action" data-action="contact" data-id="${escapeHtml(String(donor.id || ''))}" aria-label="Contact ${escapeHtml(donor.name || 'donor')}">Contact</button>
      </div>
    `;
    return el;
  }

  // app object
  const app = {
    donors: [],
    map: null,
    markerLayer: null,
    bloodChart: null,
    CONFIG: { STORAGE_KEY: 'saviour_donors', DEMO_TARGET: 100 },

    init() {
      this.cacheEls();
      this.bindUI();
      this.loadData();
      this.router('home');
    },

    cacheEls() {
      this.$donorGrid = document.getElementById('donor-grid');
      this.$donorList = document.getElementById('donor-list');
      this.$search = document.getElementById('searchInput');
      this.$donorForm = document.getElementById('donorForm');
      this.$logoBtn = document.getElementById('logoBtn');
      this.$mobileMenuBtn = document.getElementById('mobileMenuBtn');
    },

    bindUI() {
      // route buttons
      document.addEventListener('click', (ev) => {
        const routeBtn = ev.target.closest('[data-route]');
        if (routeBtn) {
          ev.preventDefault();
          const route = routeBtn.getAttribute('data-route');
          this.router(route);
        }
      });

      // delegated actions
      document.addEventListener('click', (ev) => {
        const actionBtn = ev.target.closest('.btn-action');
        if (!actionBtn) return;
        const action = actionBtn.getAttribute('data-action');
        const id = actionBtn.getAttribute('data-id');
        if (action === 'contact') {
          const donor = this.donors.find(d => String(d.id) === String(id));
          this.contactDonor(donor ? donor.name : 'donor');
        }
      });

      // search input
      if (this.$search) {
        this.$search.addEventListener('input', (e) => {
          const q = (e.target.value || '').toLowerCase().trim();
          this.renderDonors(q);
        });
      }

      // donor form
      if (this.$donorForm) {
        this.$donorForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = (this.$donorForm.querySelector('[name="name"]') || {}).value || '';
          const group = (this.$donorForm.querySelector('[name="group"]') || {}).value || '';
          const city = (this.$donorForm.querySelector('[name="city"]') || {}).value || '';
          if (!name.trim() || !group || !city) {
            Toastify({ text:"Please complete all fields", duration:2000, gravity:"top", position:"right", style:{ background:"#e11d48" } }).showToast();
            return;
          }
          const baseCoords = { Dhaka:[23.8103,90.4125], Chittagong:[22.3569,91.7832], Sylhet:[24.8949,91.8687], Rajshahi:[24.3636,88.6241], Khulna:[22.8456,89.5403] };
          const coords = baseCoords[city] || [23.8,90.4];
          const lat = coords[0] + (Math.random()-0.5)*0.05;
          const lng = coords[1] + (Math.random()-0.5)*0.05;
          const newDonor = { id: Date.now(), name: name.trim(), group, city, lat, lng, avatarUrl:`https://i.pravatar.cc/140?img=${Math.floor(Math.random()*70)+1}`, lastDonation: randomPastDate() };
          this.donors.unshift(newDonor);
          this.saveData();
          this.renderDonors();
          Toastify({ text:"🎉 Registration Successful! Welcome to Saviour.", duration:3000, gravity:"top", position:"right", style:{ background:"linear-gradient(to right,#059669,#10b981)", borderRadius:"10px" } }).showToast();
          this.router('home');
          this.$donorForm.reset();
        });
      }

      if (this.$logoBtn) this.$logoBtn.addEventListener('click', () => this.router('home'));

      if (this.$mobileMenuBtn) {
        this.$mobileMenuBtn.addEventListener('click', () => {
          const route = prompt('Open route: home / map-view / dashboard / donate', 'home');
          if (route) this.router(route);
        });
      }
    },

    loadData() {
      let stored = [];
      try { stored = JSON.parse(localStorage.getItem(this.CONFIG.STORAGE_KEY) || '[]') || []; } catch (e) { stored = []; }

      if (!stored || stored.length < this.CONFIG.DEMO_TARGET) {
        const generated = this._generateDemoDonors(this.CONFIG.DEMO_TARGET - (stored.length || 0));
        const merged = generated.concat(stored || []);
        this.donors = merged.slice();
        try { localStorage.setItem(this.CONFIG.STORAGE_KEY, JSON.stringify(this.donors)); } catch(e) { console.warn('Could not persist demo donors', e); }
      } else {
        this.donors = stored.slice();
      }

      this.renderDonors();
      this._renderFeed();
      this.updateStats();
    },

    saveData() {
      try { localStorage.setItem(this.CONFIG.STORAGE_KEY, JSON.stringify(this.donors)); } catch(e) { console.warn('saveData failed', e); }
      this.updateStats();
      if (this.map) this._refreshMarkers();
      if (this.bloodChart) this._updateCharts();
    },

    router(viewId) {
      document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
      const target = document.getElementById(viewId);
      if (target) {
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (viewId === 'map-view') setTimeout(() => this.initMap(), 150);
      if (viewId === 'dashboard') setTimeout(() => this.initCharts(), 150);
    },

    initMap() {
      if (!document.getElementById('map')) return;
      if (this.map) { this.map.invalidateSize(); this._refreshMarkers(); return; }
      this.map = L.map('map').setView([23.6850, 90.3563], 7);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap & CartoDB',
        maxZoom: 19
      }).addTo(this.map);

      this.markerLayer = L.layerGroup().addTo(this.map);
      this._refreshMarkers();
    },

    _refreshMarkers() {
      if (!this.map || !this.markerLayer) return;
      this.markerLayer.clearLayers();
      (this.donors || []).forEach(d => {
        if (!d.lat || !d.lng) return;
        const marker = L.marker([d.lat, d.lng]);
        marker.bindPopup(`
          <div class="text-center">
            <h4 class="font-bold text-slate-800 text-base">${escapeHtml(d.name)}</h4>
            <span class="inline-block bg-brand-100 text-brand-600 px-2 py-1 rounded text-xs font-bold mt-1">${escapeHtml(d.group)}</span>
            <p class="text-xs text-slate-500 mt-1">${escapeHtml(d.city)}</p>
          </div>
        `);
        this.markerLayer.addLayer(marker);
      });
    },

    initCharts() {
      if (!document.getElementById('bloodChart') || !document.getElementById('activityChart')) return;
      const groups = (this.donors || []).reduce((acc, curr) => { acc[curr.group] = (acc[curr.group] || 0) + 1; return acc; }, {});
      if (this.bloodChart) this.bloodChart.destroy();

      const ctx1 = document.getElementById('bloodChart').getContext('2d');
      this.bloodChart = new Chart(ctx1, {
        type: 'doughnut',
        data: { labels: Object.keys(groups), datasets: [{ data: Object.values(groups), backgroundColor: ['#f43f5e','#ec4899','#8b5cf6','#14b8a6','#f59e0b','#3b82f6'], borderWidth: 0 }]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
      });

      const ctx2 = document.getElementById('activityChart').getContext('2d');
      const existing = Chart.getChart('activityChart');
      if (existing) existing.destroy();
      new Chart(ctx2, {
        type: 'line',
        data: { labels: ['Jan','Feb','Mar','Apr','May','Jun'], datasets: [{ label:'New Donors', data:[12,19,8,15,22,(this.donors||[]).length], borderColor:'#0f172a', backgroundColor:'rgba(15,23,42,0.1)', fill:true, tension:0.4 }]},
        options: { responsive: true, maintainAspectRatio: false }
      });
    },

    _updateCharts() { this.initCharts(); },

    renderDonors(filterText = '') {
      if (!this.$donorGrid) return;
      this.$donorGrid.innerHTML = '';
      const q = (filterText || '').toLowerCase();
      const filtered = (this.donors || []).filter(d =>
        (d.name || '').toLowerCase().includes(q) ||
        (d.group || '').toLowerCase().includes(q) ||
        (d.city || '').toLowerCase().includes(q)
      );
      const frag = document.createDocumentFragment();
      filtered.forEach(d => frag.appendChild(createDonorElement(d)));
      this.$donorGrid.appendChild(frag);
    },

    _renderFeed() {
      if (!this.$donorList) return;
      this.$donorList.innerHTML = '';
      const feedSource = (this.donors || []).slice(0, this.CONFIG.DEMO_TARGET);
      const frag = document.createDocumentFragment();
      feedSource.forEach(d => frag.appendChild(createLightDonorElement(d)));
      this.$donorList.appendChild(frag);
    },

    updateStats() {
      const el = document.getElementById('stat-total-donors');
      if (el) el.innerText = (this.donors || []).length;
    },

    contactDonor(name) {
      Toastify({ text: `📨 Request sent to ${name}`, duration:3000, gravity:"bottom", position:"center", style:{ background:"#3b82f6", borderRadius:"50px", fontWeight:"bold" } }).showToast();
    },

    _generateDemoDonors(count) {
      const sampleNames = ['Mahir Hasan','Rahim Ahmed','Karim Bhuiyan','Sujon Khan','Nusrat Jahan','Farhana Akter','Arif Shohag','Mita Rahman','Sabbir Karim','Rita Laila','Tanim S.','Rashed M.','Nabila H.','Javed U.','Anika R.','Ibrahim K.','Samiha A.','Nazmul H.','Rumana P.','Fahim Z.'];
      const sampleCities = ['Dhaka','Mirpur DOHS, Dhaka','Mohammadpur, Dhaka','Chittagong','Sylhet','Rajshahi','Khulna','Comilla','Gazipur'];
      const bloodGroups = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];
      const baseCoords = {
        Dhaka:[23.8103,90.4125],'Mirpur DOHS, Dhaka':[23.8200,90.3600],'Mohammadpur, Dhaka':[23.7500,90.3560],
        Chittagong:[22.3569,91.7832], Sylhet:[24.8949,91.8687], Rajshahi:[24.3636,88.6241], Khulna:[22.8456,89.5403],
        Comilla:[23.4591,91.1809], Gazipur:[24.0017,90.4264]
      };
      const arr = [];
      for (let i = 0; i < count; i++) {
        const name = `${sampleNames[i % sampleNames.length]} ${100 + i}`;
        const group = bloodGroups[(i + 2) % bloodGroups.length];
        const city = sampleCities[(i + 3) % sampleCities.length];
        const imgId = ((i % 70) + 1);
        const coords = baseCoords[city] || baseCoords['Dhaka'];
        const lat = coords[0] + (Math.random() - 0.5) * 0.02;
        const lng = coords[1] + (Math.random() - 0.5) * 0.02;
        arr.push({
          id: Date.now() + i + Math.floor(Math.random() * 1000),
          name, group, city,
          division: 'Dhaka',
          district: city.split(',')[0] || city,
          lastDonation: randomPastDate(),
          avatarUrl: `https://i.pravatar.cc/140?img=${imgId}`,
          lat, lng
        });
      }
      return arr;
    }
  }; // end app

  document.addEventListener('DOMContentLoaded', () => { app.init(); });
  window.app = app;
})();

/* -------------------------
   SWIPE PAGE module
------------------------- */
(function () {
  const knob = document.getElementById("swipeKnob");
  const fill = document.getElementById("swipeFill");
  const swipeBox = document.getElementById("swipeBox");

  if (!knob || !fill || !swipeBox) return;

  let dragging = false;
  let startX = 0;
  const initialLeft = 6;

  knob.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    knob.style.transition = "none";
    fill.style.transition = "none";
    knob.setPointerCapture && knob.setPointerCapture(e.pointerId);
  });

  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const boxRect = swipeBox.getBoundingClientRect();
    let dx = e.clientX - startX;
    let newLeft = initialLeft + dx;
    const maxLeft = boxRect.width - knob.offsetWidth - 6;
    newLeft = Math.max(initialLeft, Math.min(newLeft, maxLeft));
    knob.style.left = newLeft + "px";
    fill.style.width = (newLeft + knob.offsetWidth) + "px";
    if (newLeft >= maxLeft - 2) {
      dragging = false;
      setTimeout(() => { window.location.href = "auth.html"; }, 150);
    }
  });

  window.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    knob.style.transition = "left 0.25s";
    fill.style.transition = "width 0.25s";
    knob.style.left = initialLeft + "px";
    fill.style.width = "0px";
    knob.releasePointerCapture && knob.releasePointerCapture(e.pointerId);
  });
})();

/* -------------------------
   AUTH PAGE module
------------------------- */
(function () {
  if (!document.body.classList.contains("auth-body")) return;

  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  if (loginTab && signupTab && loginForm && signupForm) {
    loginTab.addEventListener('click', () => {
      loginTab.classList.add("active");
      signupTab.classList.remove("active");
      loginForm.classList.remove("hidden");
      signupForm.classList.add("hidden");
    });

    signupTab.addEventListener('click', () => {
      signupTab.classList.add("active");
      loginTab.classList.remove("active");
      signupForm.classList.remove("hidden");
      loginForm.classList.add("hidden");
    });
  }

  const signupBtn = document.getElementById("signupBtn");
  if (signupBtn) {
    signupBtn.addEventListener('click', () => {
      const user = {
        name: (document.getElementById("su_name") || {}).value?.trim() || "",
        gender: (document.getElementById("su_gender") || {}).value || "",
        blood: (document.getElementById("su_blood") || {}).value || "",
        phone: (document.getElementById("su_phone") || {}).value?.trim() || "",
        city: (document.getElementById("su_city") || {}).value?.trim() || "",
        area: (document.getElementById("su_area") || {}).value?.trim() || "",
        email: (document.getElementById("su_email") || {}).value?.trim() || "",
        pass: (document.getElementById("su_pass") || {}).value || "",
        pass2: (document.getElementById("su_pass2") || {}).value || "",
        isdonor: (document.getElementById("su_isdonor") || {}).checked || false
      };

      if (!user.name || !user.email || !user.pass) {
        alert("Please fill in Full name, Email, and Password.");
        return;
      }
      if (user.pass !== user.pass2) {
        alert("Passwords do not match.");
        return;
      }

      try { localStorage.setItem("saviour_user", JSON.stringify(user)); } catch(e) { console.warn('Could not store user', e); }
      alert("Signup successful!");
      loginTab && loginTab.click();
      const loginUser = document.getElementById("loginUser");
      if (loginUser) loginUser.value = user.email;
    });
  }

  const loginBtn = document.getElementById("loginBtn");
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      const username = (document.getElementById("loginUser") || {}).value?.trim() || "";
      const password = (document.getElementById("loginPass") || {}).value || "";
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem("saviour_user") || "null"); } catch(e) { saved = null; }

      if (saved && (username === saved.email || username === saved.name) && password === saved.pass) {
        try { localStorage.setItem("saviour_logged", JSON.stringify(saved)); } catch (e) { console.warn('Could not persist login', e); }
        window.location.href = "explore.html";
        return;
      }

      alert("Invalid login. Try again or sign up first.");
    });
  }

  // Forgot password inline
  const forgotBtn = document.getElementById("forgotBtn");
  const recoverInline = document.getElementById("recoverInline");
  const sendRecover = document.getElementById("sendRecover");
  const cancelRecover = document.getElementById("cancelRecover");
  const recoverEmail = document.getElementById("recoverEmail");

  if (forgotBtn && recoverInline) {
    forgotBtn.addEventListener('click', () => recoverInline.classList.toggle("hidden"));
  }
  if (cancelRecover) {
    cancelRecover.addEventListener('click', (e) => { e.preventDefault(); recoverInline.classList.add("hidden"); });
  }
  if (sendRecover) {
    sendRecover.addEventListener('click', (e) => {
      e.preventDefault();
      if (!recoverEmail || !recoverEmail.value.trim()) { alert("Enter your email."); return; }
      alert("Recovery link sent to: " + recoverEmail.value);
      recoverEmail.value = "";
      recoverInline.classList.add("hidden");
    });
  }

  // Toggle login password visibility
  const toggleLoginEye = document.getElementById("toggleLoginEye");
  if (toggleLoginEye) {
    toggleLoginEye.addEventListener('click', () => {
      const input = document.getElementById("loginPass");
      if (!input) return;
      if (input.type === "password") { input.type = "text"; toggleLoginEye.textContent = "🙈"; }
      else { input.type = "password"; toggleLoginEye.textContent = "👁"; }
    });
  }
})();

/* -------------------------
   EXPLORE PAGE module
------------------------- */
(function () {
  if (!document.body.classList.contains("explore-body")) return;

  // demo donors (local list)
  const donors = [
    { name: "Tashdid Rahman", bg: "A+", area: "Bashundhara River View", city: "Dhaka", last: "23 Jan 2023", img: "https://i.pravatar.cc/100?u=tashdid" },
    { name: "Maisha Himadri Khan", bg: "O+", area: "South Azampur", city: "Dhaka", last: "06 Apr 2022", img: "https://i.pravatar.cc/100?u=maisha" },
    { name: "Minhajul Islam Mukit", bg: "AB+", area: "Majidee Bazar", city: "Chittagong", last: "19 Jul 2022", img: "https://i.pravatar.cc/100?u=minhajul" },
    { name: "Alvy Rahman Niloy", bg: "B+", area: "Mirpur-6", city: "Dhaka", last: "26 Feb 2023", img: "https://i.pravatar.cc/100?u=alvy" },
    { name: "Sorifa Akter", bg: "O-", area: "Banani", city: "Dhaka", last: "11 Mar 2022", img: "https://i.pravatar.cc/100?u=sorifa" },
    { name: "Rashed Kibria", bg: "A-", area: "Gulshan", city: "Dhaka", last: "02 Jan 2023", img: "https://i.pravatar.cc/100?u=rashed" },
    { name: "Farzana Hossain", bg: "B-", area: "Cox’s Bazar", city: "Cox’s Bazar", last: "15 Aug 2022", img: "https://i.pravatar.cc/100?u=farzana" },
    { name: "Imran Chowdhury", bg: "AB-", area: "Noakhali", city: "Noakhali", last: "04 May 2022", img: "https://i.pravatar.cc/100?u=imran" },
    { name: "Sadia Noor", bg: "O+", area: "Dhanmondi", city: "Dhaka", last: "30 Sep 2022", img: "https://i.pravatar.cc/100?u=sadia" },
    { name: "Mizanur Rahman", bg: "A+", area: "Khilgaon", city: "Dhaka", last: "12 Dec 2022", img: "https://i.pravatar.cc/100?u=mizanur" }
  ];

  const donorList = document.getElementById("donorList");
  const searchInput = document.getElementById("searchInput");

  function renderList(filter = "") {
    if (!donorList) return;
    donorList.innerHTML = "";
    const filtered = donors.filter((d) => (d.name + d.bg + d.area + d.city).toLowerCase().includes((filter || '').toLowerCase()));
    filtered.forEach((d, idx) => {
      const card = document.createElement("div");
      card.className = "dcard";

      card.innerHTML = `
        <div class="dcard-top">
          <div class="avatar-wrap"><div class="avatar"><img src="${d.img}" alt="${escapeHtml(d.name)}"></div></div>
          <div class="dinfo">
            <div class="dname">${escapeHtml(d.name)}</div>
            <div class="dmeta">📍 ${escapeHtml(d.area)}, ${escapeHtml(d.city)} <br> Division: ${escapeHtml(d.city)} <br> District: ${escapeHtml(d.city)}</div>
          </div>
          <div class="blood-box">
            <div class="blood-circle">${escapeHtml(d.bg)}</div>
            <div class="blood-label">Blood group</div>
          </div>
        </div>

        <button class="ask-btn" data-index="${idx}">Ask for help</button>

        <div class="donation-ribbon">Last date of donation ${escapeHtml(d.last)}</div>
      `;
      donorList.appendChild(card);
    });

    // attach ask button behavior
    donorList.querySelectorAll(".ask-btn").forEach((btn) => {
      btn.onclick = () => { const index = Number(btn.getAttribute("data-index")); openAskModal(donors[index]); };
    });
  }

  // expose renderList for other modules (saved-filter integration)
  window.renderList = renderList;

  renderList();

  if (searchInput) {
    searchInput.addEventListener('input', () => renderList(searchInput.value));
  }

  /* ASK MODAL */
  const askModal = document.getElementById("askModal");
  const closeAsk = document.getElementById("closeAsk");
  const cancelAsk = document.getElementById("cancelAsk");
  const sendAsk = document.getElementById("sendAsk");
  const askTo = document.getElementById("askTo");
  const askMsg = document.getElementById("askMessage");

  function openAskModal(donor) {
    if (!askModal || !askTo) return;
    askTo.textContent = "Send request to " + donor.name;
    askModal.classList.add("open");
    askModal.classList.remove("hidden");
  }
  function closeAskModal() {
    if (!askModal) return;
    askModal.classList.remove("open");
    setTimeout(() => askModal.classList.add("hidden"), 200);
    if (askMsg) askMsg.value = "";
  }

  closeAsk && (closeAsk.onclick = closeAskModal);
  cancelAsk && (cancelAsk.onclick = closeAskModal);

  sendAsk && (sendAsk.onclick = () => {
    if (!askMsg || !askMsg.value.trim()) { alert("Write a message first."); return; }
    alert("Request sent (demo).");
    closeAskModal();
  });

  /* PROFILE MODAL */
  const profileBtn = document.getElementById("profileBtn");
  const profileModal = document.getElementById("profileModal");
  const closeProfile = document.getElementById("closeProfile");
  const updateProfile = document.getElementById("updateProfile");

  const p_name = document.getElementById("p_name");
  const p_gender = document.getElementById("p_gender");
  const p_blood = document.getElementById("p_blood");
  const p_phone = document.getElementById("p_phone");
  const p_city = document.getElementById("p_city");
  const p_area = document.getElementById("p_area");
  const p_email = document.getElementById("p_email");
  const p_pass = document.getElementById("p_pass");
  const p_isdonor = document.getElementById("p_isdonor");

  function openProfile() {
    const saved = JSON.parse(localStorage.getItem("saviour_logged") || "{}");
    if (p_name) p_name.value = saved.name || "";
    if (p_gender) p_gender.value = saved.gender || "";
    if (p_blood) p_blood.value = saved.blood || "";
    if (p_phone) p_phone.value = saved.phone || "";
    if (p_city) p_city.value = saved.city || "";
    if (p_area) p_area.value = saved.area || "";
    if (p_email) p_email.value = saved.email || "";
    if (p_pass) p_pass.value = saved.pass || "";
    if (p_isdonor) p_isdonor.checked = saved.isdonor || false;

    profileModal && profileModal.classList.add("open");
    profileModal && profileModal.classList.remove("hidden");
  }
  function closeProfileModal() {
    profileModal && profileModal.classList.remove("open");
    setTimeout(() => profileModal && profileModal.classList.add("hidden"), 200);
  }

  profileBtn && (profileBtn.onclick = openProfile);
  closeProfile && (closeProfile.onclick = closeProfileModal);

  updateProfile && (updateProfile.onclick = () => {
    const updated = {
      name: p_name?.value || "",
      gender: p_gender?.value || "",
      blood: p_blood?.value || "",
      phone: p_phone?.value || "",
      city: p_city?.value || "",
      area: p_area?.value || "",
      email: p_email?.value || "",
      pass: p_pass?.value || "",
      isdonor: p_isdonor?.checked || false
    };
    try { localStorage.setItem("saviour_logged", JSON.stringify(updated)); localStorage.setItem("saviour_user", JSON.stringify(updated)); } catch(e){ console.warn('Could not save profile', e); }
    alert("Profile Updated!");
    closeProfileModal();
  });

  /* Find button behavior + saved filters */
  (function(){
    const findBtn = document.getElementById('findBtn');
    if(findBtn){
      findBtn.addEventListener('click', ()=> { window.location.href = 'find.html'; });
    }

    const saved = localStorage.getItem('saviour_filters');
    if(saved){
      try{
        const crit = JSON.parse(saved);
        const combined = ((crit.bg || '') + ' ' + (crit.div || '') + ' ' + (crit.dist || '')).trim();
        const searchInputLocal = document.getElementById('searchInput');
        if(searchInputLocal){
          searchInputLocal.value = combined;
          if(typeof window.renderList === 'function'){
            window.renderList(combined);
          } else {
            const evt = new Event('input', { bubbles: true });
            searchInputLocal.dispatchEvent(evt);
          }
        }
      }catch(e){ console.error('Invalid saved filters', e); }
      localStorage.removeItem('saviour_filters');
    }

    if(window.location.hash === '#openProfile'){
      const profileBtnLocal = document.getElementById('profileBtn');
      setTimeout(()=> profileBtnLocal && profileBtnLocal.click(), 200);
      history.replaceState(null, '', 'explore.html');
    }
  })();

  /* Requests badge */
  (function(){
    const showRequestsBadge = () => {
      const list = JSON.parse(localStorage.getItem('saviour_requests') || '[]');
      const profileBtnLocal = document.getElementById('profileBtn') || document.querySelector('.profile-fab') || document.getElementById('profileFabRequest');
      if(!profileBtnLocal) return;
      const existing = profileBtnLocal.querySelector('.req-badge');
      if(existing) existing.remove();
      if(Array.isArray(list) && list.length > 0){
        const dot = document.createElement('span');
        dot.className = 'req-badge';
        dot.style.cssText = 'position:absolute;right:-6px;top:-6px;background:#ffcb2f;color:#000;border-radius:50%;padding:4px 6px;font-size:11px;font-weight:700';
        dot.textContent = list.length;
        profileBtnLocal.style.position = 'relative';
        profileBtnLocal.appendChild(dot);
      }
    };
    showRequestsBadge();
    setInterval(showRequestsBadge, 5000);
  })();

})(); // end of file
