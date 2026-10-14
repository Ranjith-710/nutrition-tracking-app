/**
 * search.js - Food Search, Autocomplete, FDA Nutrition Facts Label Modal,
 * and Interactive Serving Adjuster
 */

window.NutriSearch = {
  activeCategory: 'All',
  searchDebounceTimer: null,
  currentFood: null,
  servingMultiplier: 1.0,

  init() {
    this.setupSearchInput();
    this.setupCategoryChips();
    this.setupModals();
    this.loadInitialSuggestions();
  },

  setupSearchInput() {
    const input = document.getElementById('food-search-input');
    const clearBtn = document.getElementById('food-search-clear');
    const dropdown = document.getElementById('search-autocomplete');

    if (!input) return;

    input.addEventListener('input', (e) => {
      const q = e.target.value.trim();
      clearBtn.style.display = q ? 'block' : 'none';

      clearTimeout(this.searchDebounceTimer);
      if (q.length < 2) {
        if (dropdown) dropdown.style.display = 'none';
        if (q.length === 0) this.executeSearch('');
        return;
      }

      this.searchDebounceTimer = setTimeout(() => {
        this.fetchAutocomplete(q);
        this.executeSearch(q);
      }, 260);
    });

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      if (dropdown) dropdown.style.display = 'none';
      this.executeSearch('');
      input.focus();
    });

    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (dropdown && !input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  },

  setupCategoryChips() {
    const container = document.getElementById('category-chips-list');
    if (!container) return;

    container.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      container.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      this.activeCategory = chip.getAttribute('data-category');
      const input = document.getElementById('food-search-input');
      this.executeSearch(input ? input.value.trim() : '');
    });
  },

  async loadInitialSuggestions() {
    try {
      const res = await fetch('/api/foods/suggestions');
      const data = await res.json();
      if (data.success) {
        this.renderCategoryChips(data.categories);
        this.renderFoodGrid(data.featured, "Featured Nutrient-Dense Foods");
      }
    } catch (err) {
      console.error('Error loading suggestions:', err);
    }
  },

  renderCategoryChips(categories) {
    const container = document.getElementById('category-chips-list');
    if (!container) return;

    const icons = {
      "All": "✨",
      "Fruits": "🍎",
      "Vegetables": "🥦",
      "Proteins": "🍗",
      "Grains": "🍚",
      "Legumes": "🥜",
      "Dairy": "🥛",
      "Meals": "🍱",
      "Snacks": "🍫",
      "Beverages": "🍵"
    };

    container.innerHTML = categories.map(cat => `
      <button class="chip ${cat === this.activeCategory ? 'active' : ''}" data-category="${cat}">
        <span>${icons[cat] || '🥗'}</span> ${cat}
      </button>
    `).join('');
  },

  async fetchAutocomplete(q) {
    const dropdown = document.getElementById('search-autocomplete');
    if (!dropdown) return;

    try {
      const res = await fetch(`/api/foods/search?q=${encodeURIComponent(q)}&limit=6`);
      const data = await res.json();

      if (data.success && data.foods.length > 0) {
        dropdown.innerHTML = data.foods.map(food => `
          <div class="autocomplete-item" data-food-id="${food.id}">
            <div class="autocomplete-info">
              <span style="font-size: 1.25rem;">${food.image_url || '🥗'}</span>
              <div>
                <div class="autocomplete-name">${this.highlightMatch(food.name, q)}</div>
                <div class="autocomplete-meta">${food.serving_unit} • ${food.calories} kcal • ${food.data_source.split('#')[0].trim()}</div>
              </div>
            </div>
            <span class="badge badge-verified">Verified</span>
          </div>
        `).join('');

        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
          item.addEventListener('click', () => {
            const foodId = item.getAttribute('data-food-id');
            dropdown.style.display = 'none';
            this.openFoodDetailsModal(foodId);
          });
        });
      } else {
        dropdown.style.display = 'none';
      }
    } catch (err) {
      dropdown.style.display = 'none';
    }
  },

  highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  },

  async executeSearch(query) {
    const grid = document.getElementById('foods-grid-container');
    const countLabel = document.getElementById('foods-count-label');
    if (!grid) return;

    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem 0; color: var(--text-muted);">
        <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">🔍 Searching USDA & Verified Foods...</div>
      </div>
    `;

    try {
      let url = `/api/foods/search?q=${encodeURIComponent(query)}`;
      if (this.activeCategory && this.activeCategory !== 'All') {
        url += `&category=${encodeURIComponent(this.activeCategory)}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        if (countLabel) {
          countLabel.textContent = `${data.count} food${data.count === 1 ? '' : 's'} found`;
        }
        this.renderFoodGrid(data.foods, query ? `Results for "${query}"` : null);
      }
    } catch (err) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--status-danger);">Failed to search foods. Please check connection.</div>`;
    }
  },

  renderFoodGrid(foods, headerText) {
    const grid = document.getElementById('foods-grid-container');
    if (!grid) return;

    if (!foods || foods.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 4rem 1rem; background: white; border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🥑</div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: var(--text-main); margin-bottom: 0.25rem;">No Matching Foods Found</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 400px; margin: 0 auto 1.25rem;">We couldn't find matches for this query. Try a generic term like "Salmon", "Avocado", or "Rice", or snap a photo in our AI Vision scanner.</p>
          <button class="btn btn-primary" onclick="document.querySelector('[data-tab=vision]').click()">
            📸 Switch to AI Vision Scanner
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = foods.map(food => `
      <div class="food-card" data-food-id="${food.id}">
        <div>
          <div class="food-card-header">
            <span class="food-emoji">${food.image_url || '🥗'}</span>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              <span class="badge ${food.is_estimate ? 'badge-estimate' : 'badge-verified'}">
                ${food.is_estimate ? 'Estimate' : 'USDA Verified'}
              </span>
              <span class="badge-score-${food.health_score || 'A'}">${food.health_score || 'A'}</span>
            </div>
          </div>
          <h4 class="food-card-title">${food.name}</h4>
          <div class="food-serving-label">${food.serving_unit || (food.serving_size_g + 'g')}</div>

          <div class="food-macro-row">
            <div class="macro-box">
              <span class="macro-box-val calories">${Math.round(food.calories)}</span>
              <span class="macro-box-lbl">Cals</span>
            </div>
            <div class="macro-box">
              <span class="macro-box-val protein">${Number(food.protein_g).toFixed(1)}g</span>
              <span class="macro-box-lbl">Prot</span>
            </div>
            <div class="macro-box">
              <span class="macro-box-val carbs">${Number(food.carbs_g).toFixed(1)}g</span>
              <span class="macro-box-lbl">Carb</span>
            </div>
            <div class="macro-box">
              <span class="macro-box-val fat">${Number(food.fat_g).toFixed(1)}g</span>
              <span class="macro-box-lbl">Fat</span>
            </div>
          </div>
        </div>

        <div class="food-card-actions">
          <button class="btn btn-secondary btn-sm btn-inspect-food" style="flex: 1;" data-food-id="${food.id}">
            📋 Nutrition Facts
          </button>
          <button class="btn btn-primary btn-sm btn-quick-log" data-food-id="${food.id}" title="Log to Daily Meals">
            + Log
          </button>
        </div>
      </div>
    `).join('');

    // Attach click events
    grid.querySelectorAll('.btn-inspect-food').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-food-id');
        this.openFoodDetailsModal(id);
      });
    });

    grid.querySelectorAll('.btn-quick-log').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-food-id');
        this.openLogMealModal(id);
      });
    });
  },

  async openFoodDetailsModal(foodId) {
    const modal = document.getElementById('nutrition-modal');
    if (!modal) return;

    try {
      const res = await fetch(`/api/foods/${foodId}`);
      const data = await res.json();
      if (!data.success) return;

      this.currentFood = data.food;
      this.servingMultiplier = 1.0;
      this.renderNutritionModalContent();
      modal.classList.add('open');
    } catch (err) {
      window.NutriFind.showToast('Could not load nutrition facts', 'error');
    }
  },

  renderNutritionModalContent() {
    const food = this.currentFood;
    if (!food) return;

    const mult = this.servingMultiplier;
    const baseG = food.serving_size_g || 100;
    const currentG = Math.round(baseG * mult);

    const calcVal = (val, dec = 1) => {
      if (val === null || val === undefined) return '<span style="color:#94a3b8;font-weight:normal;">Not Reported</span>';
      return (val * mult).toFixed(dec);
    };

    const calcDV = (key) => {
      if (!food.percent_dv || food.percent_dv[key] === null || food.percent_dv[key] === undefined) return '—';
      return `${Math.round(food.percent_dv[key] * mult)}%`;
    };

    document.getElementById('modal-food-name').textContent = food.name;
    document.getElementById('modal-food-badge').className = `badge ${food.is_estimate ? 'badge-estimate' : 'badge-verified'}`;
    document.getElementById('modal-food-badge').textContent = food.is_estimate ? 'AI Estimate' : 'USDA Standard Reference';

    document.getElementById('serving-multiplier-display').textContent = `${mult.toFixed(1)}x (${currentG}g)`;

    // FDA Nutrition Facts Panel
    const panel = document.getElementById('fda-nutrition-panel');
    panel.innerHTML = `
      <div class="nutrition-facts-box">
        <div class="nf-title">Nutrition Facts</div>
        <div class="nf-serving">
          <strong>Serving size:</strong> ${food.serving_unit || '1 serving'} (${currentG}g)
        </div>
        <div class="nf-calories-row">
          <div class="nf-calories-label">Calories</div>
          <div class="nf-calories-val">${Math.round(food.calories * mult)}</div>
        </div>
        <div class="nf-dv-header">% Daily Value*</div>

        <div class="nf-line bold">
          <span>Total Fat ${calcVal(food.fat_g, 1)}g</span>
          <span>${calcDV('fat_g')}</span>
        </div>
        <div class="nf-line indent">
          <span>Saturated Fat ${calcVal(food.saturated_fat_g, 1)}g</span>
          <span>${calcDV('saturated_fat_g')}</span>
        </div>
        <div class="nf-line bold">
          <span>Sodium ${calcVal(food.sodium_mg, 0)}mg</span>
          <span>${calcDV('sodium_mg')}</span>
        </div>
        <div class="nf-line bold">
          <span>Total Carbohydrate ${calcVal(food.carbs_g, 1)}g</span>
          <span>${calcDV('carbs_g')}</span>
        </div>
        <div class="nf-line indent">
          <span>Dietary Fiber ${calcVal(food.fiber_g, 1)}g</span>
          <span>${calcDV('fiber_g')}</span>
        </div>
        <div class="nf-line indent">
          <span>Total Sugars ${calcVal(food.sugar_g, 1)}g</span>
          <span>—</span>
        </div>
        <div class="nf-line bold nf-thick-line">
          <span>Protein ${calcVal(food.protein_g, 1)}g</span>
          <span>${calcDV('protein_g')}</span>
        </div>

        <div class="nf-line">
          <span>Vitamin D ${calcVal(food.vitamin_d_mcg, 1)}mcg</span>
          <span>${calcDV('vitamin_d_mcg')}</span>
        </div>
        <div class="nf-line">
          <span>Calcium ${calcVal(food.calcium_mg, 0)}mg</span>
          <span>${calcDV('calcium_mg')}</span>
        </div>
        <div class="nf-line">
          <span>Iron ${calcVal(food.iron_mg, 2)}mg</span>
          <span>${calcDV('iron_mg')}</span>
        </div>
        <div class="nf-line">
          <span>Potassium ${calcVal(food.potassium_mg, 0)}mg</span>
          <span>${calcDV('potassium_mg')}</span>
        </div>
        <div class="nf-line">
          <span>Vitamin A ${calcVal(food.vitamin_a_mcg, 0)}mcg</span>
          <span>${calcDV('vitamin_a_mcg')}</span>
        </div>
        <div class="nf-line">
          <span>Vitamin C ${calcVal(food.vitamin_c_mg, 1)}mg</span>
          <span>${calcDV('vitamin_c_mg')}</span>
        </div>

        <div style="font-size: 0.7rem; color: #666; margin-top: 0.5rem; line-height: 1.25;">
          * The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet of 2,000 calories.
          Source: ${food.data_source}. Missing values are marked 'Not Reported'.
        </div>
      </div>
    `;
  },

  setupModals() {
    // Nutrition Facts Modal Closes
    const nutModal = document.getElementById('nutrition-modal');
    const closeNut = document.getElementById('btn-close-nutrition-modal');
    if (closeNut) closeNut.addEventListener('click', () => nutModal.classList.remove('open'));

    // Serving adjuster buttons
    const btnSub = document.getElementById('btn-serving-sub');
    const btnAdd = document.getElementById('btn-serving-add');
    if (btnSub) {
      btnSub.addEventListener('click', () => {
        if (this.servingMultiplier > 0.5) {
          this.servingMultiplier = Math.max(0.25, Math.round((this.servingMultiplier - 0.25) * 100) / 100);
          this.renderNutritionModalContent();
        }
      });
    }
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        if (this.servingMultiplier < 5.0) {
          this.servingMultiplier = Math.round((this.servingMultiplier + 0.25) * 100) / 100;
          this.renderNutritionModalContent();
        }
      });
    }

    // Modal Add-to-Log button
    const btnLogFromModal = document.getElementById('btn-modal-add-log');
    if (btnLogFromModal) {
      btnLogFromModal.addEventListener('click', () => {
        nutModal.classList.remove('open');
        if (this.currentFood) {
          this.openLogMealModal(this.currentFood.id, this.servingMultiplier);
        }
      });
    }

    // Log Meal Modal
    const logModal = document.getElementById('log-meal-modal');
    const closeLog = document.getElementById('btn-close-log-modal');
    const formLog = document.getElementById('form-log-meal');

    if (closeLog) closeLog.addEventListener('click', () => logModal.classList.remove('open'));

    if (formLog) {
      formLog.addEventListener('submit', async (e) => {
        e.preventDefault();
        const mealType = document.getElementById('log-meal-type').value;
        const foodId = document.getElementById('log-food-id').value;
        const foodName = document.getElementById('log-food-name').value;
        const servings = parseFloat(document.getElementById('log-servings').value) || 1.0;
        const grams = parseFloat(document.getElementById('log-grams').value) || 100.0;
        const calories = parseFloat(document.getElementById('log-calories').value) || 0;
        const protein = parseFloat(document.getElementById('log-protein').value) || 0;
        const carbs = parseFloat(document.getElementById('log-carbs').value) || 0;
        const fat = parseFloat(document.getElementById('log-fat').value) || 0;
        const fiber = parseFloat(document.getElementById('log-fiber').value) || 0;
        const sugar = parseFloat(document.getElementById('log-sugar').value) || 0;
        const sodium = parseFloat(document.getElementById('log-sodium').value) || 0;

        try {
          const res = await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: window.NutriFind.state.currentDate,
              meal_type: mealType,
              food_id: foodId,
              food_name: foodName,
              servings: servings,
              grams: grams,
              calories: calories,
              protein_g: protein,
              carbs_g: carbs,
              fat_g: fat,
              fiber_g: fiber,
              sugar_g: sugar,
              sodium_mg: sodium,
              is_estimate: foodId.includes('ai-') || foodId.includes('detected-')
            })
          });
          const data = await res.json();
          if (data.success) {
            window.NutriFind.showToast(`Logged "${foodName}" to ${mealType.toUpperCase()}!`, 'success');
            logModal.classList.remove('open');
            window.NutriFind.fetchDailySummary();
            if (window.NutriTracker) window.NutriTracker.loadDailyMeals();
          }
        } catch (err) {
          window.NutriFind.showToast('Failed to log meal', 'error');
        }
      });
    }
  },

  async openLogMealModal(foodId, multiplier = 1.0) {
    const modal = document.getElementById('log-meal-modal');
    if (!modal) return;

    try {
      const res = await fetch(`/api/foods/${foodId}`);
      const data = await res.json();
      if (!data.success) return;

      const f = data.food;
      const baseG = f.serving_size_g || 100;
      const totalG = Math.round(baseG * multiplier);

      document.getElementById('log-food-id').value = f.id;
      document.getElementById('log-food-name').value = f.name;
      document.getElementById('log-display-food-name').textContent = f.name;
      document.getElementById('log-servings').value = multiplier;
      document.getElementById('log-grams').value = totalG;
      document.getElementById('log-calories').value = Math.round(f.calories * multiplier);
      document.getElementById('log-protein').value = (f.protein_g * multiplier).toFixed(1);
      document.getElementById('log-carbs').value = (f.carbs_g * multiplier).toFixed(1);
      document.getElementById('log-fat').value = (f.fat_g * multiplier).toFixed(1);
      document.getElementById('log-fiber').value = f.fiber_g ? (f.fiber_g * multiplier).toFixed(1) : 0;
      document.getElementById('log-sugar').value = f.sugar_g ? (f.sugar_g * multiplier).toFixed(1) : 0;
      document.getElementById('log-sodium').value = f.sodium_mg ? Math.round(f.sodium_mg * multiplier) : 0;

      modal.classList.add('open');
    } catch (err) {
      window.NutriFind.showToast('Error opening log dialog', 'error');
    }
  }
};
