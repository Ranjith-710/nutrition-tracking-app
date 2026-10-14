/**
 * vision.js - AI Food Vision Image Recognition & Dynamic Portion Estimation
 */

window.NutriVision = {
  currentAnalysis: null,
  activePortion: 100,

  init() {
    this.setupDropzone();
    this.setupSamplePresets();
    this.setupCamera();
    this.setupPortionSlider();
    this.setupLogButton();
  },

  setupDropzone() {
    const dropzone = document.getElementById('vision-dropzone');
    const fileInput = document.getElementById('vision-file-input');
    const browseBtn = document.getElementById('btn-browse-file');

    if (!dropzone || !fileInput) return;

    if (browseBtn) {
      browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.processUploadedFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.processUploadedFile(e.target.files[0]);
      }
    });

    // Paste support (Ctrl+V)
    window.addEventListener('paste', (e) => {
      if (window.NutriFind.state.activeTab !== 'vision') return;
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          this.processUploadedFile(item.getAsFile());
          break;
        }
      }
    });
  },

  setupSamplePresets() {
    const presetCards = document.querySelectorAll('.preset-card');
    presetCards.forEach(card => {
      card.addEventListener('click', () => {
        const presetId = card.getAttribute('data-preset-id');
        const imgSrc = card.querySelector('img').getAttribute('src');
        this.analyzePreset(presetId, imgSrc);
      });
    });
  },

  setupCamera() {
    const camBtn = document.getElementById('btn-capture-camera');
    const videoModal = document.getElementById('camera-modal');
    const videoElem = document.getElementById('camera-stream');
    const snapBtn = document.getElementById('btn-take-snapshot');
    const closeCamBtn = document.getElementById('btn-close-camera');

    let stream = null;

    if (!camBtn) return;

    camBtn.addEventListener('click', async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        videoElem.srcObject = stream;
        videoModal.classList.add('open');
      } catch (err) {
        window.NutriFind.showToast('Camera access denied or unavailable. Please upload a photo or use a sample.', 'error');
      }
    });

    const stopCamera = () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      videoModal.classList.remove('open');
    };

    if (closeCamBtn) closeCamBtn.addEventListener('click', stopCamera);

    if (snapBtn) {
      snapBtn.addEventListener('click', () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoElem.videoWidth || 640;
        canvas.height = videoElem.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL('image/jpeg', 0.85);

        stopCamera();
        this.analyzeBase64(b64, "camera_capture.jpg");
      });
    }
  },

  setupPortionSlider() {
    const slider = document.getElementById('portion-slider');
    const valueDisplay = document.getElementById('portion-slider-value');

    if (!slider) return;

    slider.addEventListener('input', (e) => {
      const g = parseFloat(e.target.value);
      this.activePortion = g;
      if (valueDisplay) valueDisplay.textContent = `${Math.round(g)}g`;

      if (this.currentAnalysis && this.currentAnalysis.nutrients_per_100g) {
        this.updatePortionCalculations(g);
      }
    });
  },

  async updatePortionCalculations(newGrams) {
    const n100 = this.currentAnalysis.nutrients_per_100g;
    const factor = newGrams / 100.0;

    const recalc = {
      calories: Math.round(n100.calories * factor),
      protein_g: Number((n100.protein_g * factor).toFixed(1)),
      carbs_g: Number((n100.carbs_g * factor).toFixed(1)),
      fat_g: Number((n100.fat_g * factor).toFixed(1)),
      fiber_g: n100.fiber_g !== null ? Number((n100.fiber_g * factor).toFixed(1)) : null,
      sugar_g: n100.sugar_g !== null ? Number((n100.sugar_g * factor).toFixed(1)) : null,
      sodium_mg: n100.sodium_mg !== null ? Math.round(n100.sodium_mg * factor) : null,
    };

    this.currentAnalysis.total_nutrients = recalc;
    this.currentAnalysis.portion_grams = newGrams;

    this.renderNutrientOverview(recalc, newGrams);
  },

  async processUploadedFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      window.NutriFind.showToast('Please select a valid image file (JPG, PNG, WEBP)', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = e.target.result;
      this.startScanningAnimation(previewImg);
      this.sendAnalysisRequest({ image: file, filename: file.name });
    };
    reader.readAsDataURL(file);
  },

  analyzePreset(presetId, imgSrc) {
    this.startScanningAnimation(imgSrc);
    this.sendAnalysisRequest({ preset_id: presetId });
  },

  analyzeBase64(b64, filename) {
    this.startScanningAnimation(b64);
    this.sendAnalysisRequest({ image_b64: b64, filename });
  },

  startScanningAnimation(imgSrc) {
    const dropzone = document.getElementById('vision-dropzone');
    const previewContainer = document.getElementById('vision-scan-preview');
    const resultCard = document.getElementById('vision-results');

    if (resultCard) resultCard.style.display = 'none';

    if (dropzone && previewContainer) {
      dropzone.style.display = 'none';
      previewContainer.style.display = 'block';
      previewContainer.innerHTML = `
        <div style="position: relative; max-width: 480px; margin: 0 auto; border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-lg);">
          <img src="${imgSrc}" style="width: 100%; height: 280px; object-fit: cover; display: block;" alt="Food Scanning Preview" />
          <div class="scan-beam"></div>
          <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(0deg, rgba(15,23,42,0.85) 0%, transparent 100%); color: white; padding: 1rem; text-align: center;">
            <div style="font-weight: 700; font-size: 1rem;" id="scan-step-text">🔬 Analyzing Food Visual Features...</div>
            <div style="font-size: 0.8rem; opacity: 0.8;">Segmenting ingredients and calculating portion volume</div>
          </div>
        </div>
      `;
    }

    // Dynamic steps simulation
    const steps = [
      "Identifying food color spectrum & textures...",
      "Segmenting dish components & volume...",
      "Querying USDA standard nutritional densities...",
      "Synthesizing nutrient breakdown..."
    ];
    let stepIdx = 0;
    this.stepInterval = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length;
      const el = document.getElementById('scan-step-text');
      if (el) el.textContent = `⚡ ${steps[stepIdx]}`;
    }, 450);
  },

  async sendAnalysisRequest(payload) {
    try {
      let res;
      if (payload.image) {
        const formData = new FormData();
        formData.append('image', payload.image);
        res = await fetch('/api/vision/analyze', { method: 'POST', body: formData });
      } else {
        res = await fetch('/api/vision/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      clearInterval(this.stepInterval);

      if (data.success) {
        setTimeout(() => {
          this.displayResults(data);
        }, 600);
      } else {
        window.NutriFind.showToast('Could not analyze food image. Please try another photo.', 'error');
        this.resetDropzone();
      }
    } catch (err) {
      clearInterval(this.stepInterval);
      window.NutriFind.showToast('Error during AI vision analysis', 'error');
      this.resetDropzone();
    }
  },

  resetDropzone() {
    const dropzone = document.getElementById('vision-dropzone');
    const previewContainer = document.getElementById('vision-scan-preview');
    if (dropzone) dropzone.style.display = 'block';
    if (previewContainer) previewContainer.style.display = 'none';
  },

  displayResults(analysis) {
    this.currentAnalysis = analysis;
    this.activePortion = analysis.portion_grams;

    const resultCard = document.getElementById('vision-results');
    if (!resultCard) return;

    // Set title & badges
    document.getElementById('detected-food-title').textContent = analysis.food_name;
    document.getElementById('detected-food-confidence').textContent = `${analysis.confidence}% Visual Match`;
    document.getElementById('detected-food-source').textContent = analysis.data_source;

    // Portion slider sync
    const slider = document.getElementById('portion-slider');
    const sliderVal = document.getElementById('portion-slider-value');
    if (slider) {
      slider.value = analysis.portion_grams;
      if (sliderVal) sliderVal.textContent = `${Math.round(analysis.portion_grams)}g`;
    }

    // Detected ingredients list
    const compContainer = document.getElementById('detected-components-list');
    if (compContainer) {
      if (analysis.components && analysis.components.length > 0) {
        compContainer.innerHTML = analysis.components.map(c => `
          <div class="ingredient-item">
            <span class="ingredient-item-name">${c.item}</span>
            <span class="ingredient-item-weight">${c.grams}g • ${c.calories} kcal • ${c.protein_g}g P</span>
          </div>
        `).join('');
      } else {
        compContainer.innerHTML = `<div class="ingredient-item">Single dish preparation (${analysis.portion_grams}g)</div>`;
      }
    }

    // Render nutrient overview
    this.renderNutrientOverview(analysis.total_nutrients, analysis.portion_grams);

    // Show result card smoothly
    resultCard.style.display = 'flex';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    window.NutriFind.showToast(`Identified "${analysis.food_name}"!`, 'success');
  },

  renderNutrientOverview(nutrients, grams) {
    document.getElementById('vision-cals-val').textContent = nutrients.calories;
    document.getElementById('vision-prot-val').textContent = `${nutrients.protein_g}g`;
    document.getElementById('vision-carb-val').textContent = `${nutrients.carbs_g}g`;
    document.getElementById('vision-fat-val').textContent = `${nutrients.fat_g}g`;

    const fiberVal = nutrients.fiber_g !== null ? `${nutrients.fiber_g}g` : '—';
    const sugarVal = nutrients.sugar_g !== null ? `${nutrients.sugar_g}g` : '—';
    const sodiumVal = nutrients.sodium_mg !== null ? `${nutrients.sodium_mg}mg` : '—';

    document.getElementById('vision-fiber-val').textContent = fiberVal;
    document.getElementById('vision-sugar-val').textContent = sugarVal;
    document.getElementById('vision-sodium-val').textContent = sodiumVal;
  },

  setupLogButton() {
    const btnLog = document.getElementById('btn-vision-log-meal');
    const mealSelect = document.getElementById('vision-log-meal-type');

    if (!btnLog) return;

    btnLog.addEventListener('click', async () => {
      if (!this.currentAnalysis) return;

      const a = this.currentAnalysis;
      const nuts = a.total_nutrients;
      const mealType = mealSelect ? mealSelect.value : 'lunch';

      try {
        const res = await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: window.NutriFind.state.currentDate,
            meal_type: mealType,
            food_id: a.food_id || 'ai-vision-item',
            food_name: a.food_name,
            servings: 1.0,
            grams: this.activePortion,
            calories: nuts.calories,
            protein_g: nuts.protein_g,
            carbs_g: nuts.carbs_g,
            fat_g: nuts.fat_g,
            fiber_g: nuts.fiber_g,
            sugar_g: nuts.sugar_g,
            sodium_mg: nuts.sodium_mg,
            is_estimate: 1
          })
        });

        const data = await res.json();
        if (data.success) {
          window.NutriFind.showToast(`Logged "${a.food_name}" to ${mealType.toUpperCase()}!`, 'success');
          window.NutriFind.fetchDailySummary();
          window.NutriFind.switchTab('tracker');
        }
      } catch (err) {
        window.NutriFind.showToast('Failed to log AI meal', 'error');
      }
    });
  }
};
