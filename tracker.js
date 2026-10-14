/**
 * tracker.js - Daily Nutrient Tracker, Interactive SVG Donut Meter,
 * Water Intake Tracker, and Meal History CRUD
 */

window.NutriTracker = {
  init() {
    this.setupWaterTracker();
    this.setupCustomFoodModal();
    this.loadDailyMeals();
  },

  async loadDailyMeals() {
    const curDate = window.NutriFind.state.currentDate;
    try {
      const res = await fetch(`/api/logs?date=${curDate}`);
      const data = await res.json();
      if (data.success) {
        this.renderMealSections(data.meals);
      }
    } catch (err) {
      console.error('Error loading daily meals:', err);
    }
  },

  renderSummary(data) {
    // 1. Calorie Circular SVG Meter
    const cals = data.consumed.calories;
    const target = data.targets.calories;
    const remaining = data.remaining_calories;

    const ringCalNum = document.getElementById('tracker-calorie-num');
    const ringTarget = document.getElementById('tracker-target-display');
    const ringBurned = document.getElementById('tracker-consumed-display');
    const ringRemaining = document.getElementById('tracker-remaining-display');

    if (ringCalNum) ringCalNum.textContent = cals;
    if (ringTarget) ringTarget.textContent = `${target} kcal`;
    if (ringBurned) ringBurned.textContent = `${cals} kcal`;
    if (ringRemaining) {
      ringRemaining.textContent = remaining >= 0 ? `${remaining} kcal left` : `${Math.abs(remaining)} kcal over`;
      ringRemaining.style.color = remaining >= 0 ? 'var(--primary-700)' : 'var(--status-danger)';
    }

    // SVG Circle Stroke Offset (Radius = 75, Circumference = 2 * PI * 75 ~= 471.2)
    const circle = document.getElementById('calorie-svg-circle');
    if (circle) {
      const circumference = 471.2;
      const pct = Math.min(100, Math.max(0, (cals / target) * 100));
      const offset = circumference - (pct / 100) * circumference;
      circle.style.strokeDashoffset = offset;
      circle.style.stroke = cals > target ? '#f59e0b' : '#10b981';
    }

    // 2. Macro Progress Bars
    const updateBar = (type, current, goal) => {
      const fill = document.getElementById(`macro-fill-${type}`);
      const label = document.getElementById(`macro-val-${type}`);
      const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
      if (fill) fill.style.width = `${pct}%`;
      if (label) label.textContent = `${current}g / ${goal}g (${pct}%)`;
    };

    updateBar('protein', data.consumed.protein_g, data.targets.protein_g);
    updateBar('carbs', data.consumed.carbs_g, data.targets.carbs_g);
    updateBar('fat', data.consumed.fat_g, data.targets.fat_g);

    // Fiber bar (Target 28g FDA standard)
    const fiberFill = document.getElementById('macro-fill-fiber');
    const fiberLabel = document.getElementById('macro-val-fiber');
    const fiberPct = Math.min(100, Math.round((data.consumed.fiber_g / 28.0) * 100));
    if (fiberFill) fiberFill.style.width = `${fiberPct}%`;
    if (fiberLabel) fiberLabel.textContent = `${data.consumed.fiber_g}g / 28g (${fiberPct}%)`;

    // 3. Water Tracker Sync
    this.updateWaterUI(data.water_consumed_ml, data.water_target_ml);

    // 4. Personalized Insights
    this.renderPersonalizedInsights(data.insights);
  },

  renderPersonalizedInsights(insights) {
    const container = document.getElementById('tracker-insights-container');
    if (!container) return;

    if (!insights || insights.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem;">Log your meals to unlock personalized nutrition guidance.</div>`;
      return;
    }

    const typeIcons = {
      success: '🌟',
      tip: '💡',
      warning: '⚠️',
      neutral: '🎯',
      info: '📋'
    };

    container.innerHTML = insights.map(item => `
      <div style="display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.75rem 0.85rem; background: #f8fafc; border-radius: var(--radius-md); border-left: 3px solid ${item.type === 'success' ? 'var(--primary-500)' : item.type === 'warning' ? '#f59e0b' : 'var(--primary-400)'};">
        <span style="font-size: 1.1rem; line-height: 1.2;">${typeIcons[item.type] || '✨'}</span>
        <div>
          <strong style="display: block; font-size: 0.85rem; color: var(--text-main); margin-bottom: 0.15rem;">${item.title}</strong>
          <span style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.35;">${item.text}</span>
        </div>
      </div>
    `).join('');
  },

  setupWaterTracker() {
    const btnAdd = document.getElementById('btn-water-add');
    const btnSub = document.getElementById('btn-water-sub');

    if (btnAdd) {
      btnAdd.addEventListener('click', () => window.NutriFind.handleWaterChange(250));
    }
    if (btnSub) {
      btnSub.addEventListener('click', () => window.NutriFind.handleWaterChange(-250));
    }
  },

  updateWaterUI(consumed, target) {
    const amountBig = document.getElementById('water-amount-big');
    const glassesRow = document.getElementById('water-glasses-row');

    if (amountBig) {
      amountBig.textContent = `${consumed} / ${target} ml`;
    }

    if (glassesRow) {
      const totalGlasses = 8;
      const filledGlasses = Math.min(totalGlasses, Math.floor(consumed / 250));

      glassesRow.innerHTML = Array.from({ length: totalGlasses }).map((_, idx) => `
        <span class="water-glass-icon ${idx < filledGlasses ? 'filled' : ''}" style="cursor: pointer;" title="Glass ${idx+1} (250ml)" onclick="window.NutriFind.handleWaterChange(${idx < filledGlasses ? -250 : 250})">
          💧
        </span>
      `).join('');
    }
  },

  renderMealSections(meals) {
    const categories = ['breakfast', 'lunch', 'dinner', 'snack'];
    const catLabels = {
      breakfast: 'Breakfast 🍳',
      lunch: 'Lunch 🥗',
      dinner: 'Dinner 🍲',
      snack: 'Snacks & Treats 🍎'
    };

    categories.forEach(cat => {
      const container = document.getElementById(`meal-list-${cat}`);
      const calBadge = document.getElementById(`meal-cals-${cat}`);
      if (!container) return;

      const items = meals[cat] || [];
      const totalCals = Math.round(items.reduce((sum, item) => sum + (item.calories || 0), 0));

      if (calBadge) {
        calBadge.textContent = `${totalCals} kcal`;
      }

      if (items.length === 0) {
        container.innerHTML = `
          <div class="meal-empty-hint">
            No items logged for ${cat}.
            <button class="btn btn-secondary btn-sm" style="margin-left: 0.5rem;" onclick="NutriTracker.openCustomAddModal('${cat}')">
              + Add Item
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = items.map(item => `
        <div class="logged-food-row" id="log-item-${item.id}">
          <div class="logged-food-left">
            <div class="logged-food-name">
              ${item.food_name}
              ${item.is_estimate ? '<span class="badge badge-estimate" style="font-size: 0.65rem; padding: 0.1rem 0.4rem;">AI Estimate</span>' : ''}
            </div>
            <div class="logged-food-sub">
              ${Math.round(item.grams)}g • P: ${Number(item.protein_g).toFixed(1)}g • C: ${Number(item.carbs_g).toFixed(1)}g • F: ${Number(item.fat_g).toFixed(1)}g
            </div>
          </div>
          <div class="logged-food-right">
            <div class="logged-food-macros">
              ${Math.round(item.calories)} kcal
            </div>
            <button class="btn-remove-log" title="Delete meal entry" onclick="NutriTracker.deleteMealItem(${item.id})">
              ✕
            </button>
          </div>
        </div>
      `).join('');
    });
  },

  async deleteMealItem(logId) {
    try {
      const res = await fetch(`/api/logs/${logId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        window.NutriFind.showToast('Item removed', 'info');
        window.NutriFind.fetchDailySummary();
        this.loadDailyMeals();
      }
    } catch (err) {
      window.NutriFind.showToast('Error removing item', 'error');
    }
  },

  setupCustomFoodModal() {
    const modal = document.getElementById('custom-food-modal');
    const closeBtn = document.getElementById('btn-close-custom-modal');
    const form = document.getElementById('form-custom-food');

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const mealType = document.getElementById('custom-meal-type').value;
        const name = document.getElementById('custom-food-name').value.trim();
        const grams = parseFloat(document.getElementById('custom-food-grams').value) || 100;
        const cals = parseFloat(document.getElementById('custom-food-cals').value) || 0;
        const prot = parseFloat(document.getElementById('custom-food-prot').value) || 0;
        const carbs = parseFloat(document.getElementById('custom-food-carbs').value) || 0;
        const fat = parseFloat(document.getElementById('custom-food-fat').value) || 0;

        try {
          const res = await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: window.NutriFind.state.currentDate,
              meal_type: mealType,
              food_id: 'custom-user-item',
              food_name: name,
              servings: 1.0,
              grams: grams,
              calories: cals,
              protein_g: prot,
              carbs_g: carbs,
              fat_g: fat,
              is_estimate: 0
            })
          });

          const data = await res.json();
          if (data.success) {
            window.NutriFind.showToast(`Logged "${name}" to ${mealType.toUpperCase()}!`, 'success');
            modal.classList.remove('open');
            window.NutriFind.fetchDailySummary();
            this.loadDailyMeals();
            form.reset();
          }
        } catch (err) {
          window.NutriFind.showToast('Could not save custom meal', 'error');
        }
      });
    }
  },

  openCustomAddModal(preferredMealType = 'snack') {
    const modal = document.getElementById('custom-food-modal');
    const select = document.getElementById('custom-meal-type');
    if (select) select.value = preferredMealType;
    if (modal) modal.classList.add('open');
  }
};
