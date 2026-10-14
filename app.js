/**
 * app.js - NutriFind AI Global Application State & Navigation
 */

window.NutriFind = {
  state: {
    activeTab: 'search',
    currentDate: new Date().toISOString().split('T')[0],
    profile: null,
    summary: null,
    settings: {}
  },

  init() {
    this.setupNavigation();
    this.setupDateNavigator();
    this.setupSettingsModal();
    this.fetchUserProfile();
    this.fetchDailySummary();

    // Initialize modules
    if (window.NutriSearch) window.NutriSearch.init();
    if (window.NutriVision) window.NutriVision.init();
    if (window.NutriTracker) window.NutriTracker.init();
    if (window.NutriAnalytics) window.NutriAnalytics.init();
    if (window.NutriProfile) window.NutriProfile.init();
  },

  setupNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabTarget = btn.getAttribute('data-tab');
        this.switchTab(tabTarget);
      });
    });
  },

  switchTab(tabName) {
    this.state.activeTab = tabName;

    // Update Tab Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Tab Panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      if (panel.id === `tab-${tabName}`) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });

    // Refresh tab-specific data if needed
    if (tabName === 'tracker' && window.NutriTracker) {
      window.NutriTracker.loadDailyMeals();
    } else if (tabName === 'analytics' && window.NutriAnalytics) {
      window.NutriAnalytics.loadWeeklyData();
    }
  },

  setupDateNavigator() {
    const prevBtn = document.getElementById('btn-prev-date');
    const nextBtn = document.getElementById('btn-next-date');
    const dateLabel = document.getElementById('current-date-display');

    const updateDateDisplay = () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const cur = new Date(this.state.currentDate + 'T00:00:00');

      if (this.state.currentDate === todayStr) {
        dateLabel.textContent = 'Today';
      } else {
        const opts = { month: 'short', day: 'numeric' };
        dateLabel.textContent = cur.toLocaleDateString(undefined, opts);
      }

      this.fetchDailySummary();
      if (window.NutriTracker) window.NutriTracker.loadDailyMeals();
    };

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const d = new Date(this.state.currentDate + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        this.state.currentDate = d.toISOString().split('T')[0];
        updateDateDisplay();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const d = new Date(this.state.currentDate + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        this.state.currentDate = d.toISOString().split('T')[0];
        updateDateDisplay();
      });
    }

    updateDateDisplay();
  },

  async fetchUserProfile() {
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (data.success) {
        this.state.profile = data.profile;
        this.updateProfileUI();
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  },

  updateProfileUI() {
    const p = this.state.profile;
    if (!p) return;

    const userPill = document.getElementById('user-profile-name');
    if (userPill) userPill.textContent = p.name || 'Alex Morgan';

    const avatarInitial = document.getElementById('user-avatar-initial');
    if (avatarInitial) avatarInitial.textContent = (p.name || 'A')[0].toUpperCase();
  },

  async fetchDailySummary() {
    try {
      const res = await fetch(`/api/summary?date=${this.state.currentDate}`);
      const data = await res.json();
      if (data.success) {
        this.state.summary = data;
        this.updateSummaryHeaderUI(data);
        if (window.NutriTracker) window.NutriTracker.renderSummary(data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  },

  updateSummaryHeaderUI(data) {
    const calPill = document.getElementById('header-calories-val');
    if (calPill) {
      calPill.textContent = `${data.consumed.calories} / ${data.targets.calories} kcal`;
    }

    const waterBtn = document.getElementById('header-water-btn');
    if (waterBtn) {
      waterBtn.title = `Water: ${data.water_consumed_ml} / ${data.water_target_ml} ml`;
    }
  },

  async handleWaterChange(delta) {
    try {
      const res = await fetch('/api/water', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(delta > 0 ? '+250ml Water logged 💧' : '-250ml Water adjusted', 'success');
        this.fetchDailySummary();
        if (window.NutriTracker) window.NutriTracker.updateWaterUI(data.water_consumed_ml, data.water_target_ml);
      }
    } catch (err) {
      this.showToast('Could not update water log', 'error');
    }
  },

  setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('btn-open-settings');
    const closeBtn = document.getElementById('btn-close-settings');
    const form = document.getElementById('settings-form');

    if (openBtn) {
      openBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/settings');
          const data = await res.json();
          if (data.success) {
            document.getElementById('input-gemini-key').value = data.settings.gemini_api_key || '';
            document.getElementById('input-usda-key').value = data.settings.usda_api_key || '';
          }
        } catch (e) {}
        modal.classList.add('open');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const geminiKey = document.getElementById('input-gemini-key').value.trim();
        const usdaKey = document.getElementById('input-usda-key').value.trim();

        try {
          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gemini_api_key: geminiKey,
              usda_api_key: usdaKey
            })
          });
          const data = await res.json();
          if (data.success) {
            this.showToast('Settings saved successfully', 'success');
            modal.classList.remove('open');
          }
        } catch (err) {
          this.showToast('Failed to save settings', 'error');
        }
      });
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 300ms ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  window.NutriFind.init();
});
