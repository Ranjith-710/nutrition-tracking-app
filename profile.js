/**
 * profile.js - User Profile, Mifflin-St Jeor TDEE & Macro Calculator
 */

window.NutriProfile = {
  init() {
    this.setupForm();
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const res = await fetch('/api/profile');
      const data = await res.json();
      if (data.success && data.profile) {
        this.populateForm(data.profile);
        this.calculateAndDisplayStats();
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  },

  populateForm(p) {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('prof-name', p.name || 'Alex Morgan');
    setVal('prof-gender', p.gender || 'female');
    setVal('prof-age', p.age || 28);
    setVal('prof-weight', p.weight_kg || 65);
    setVal('prof-height', p.height_cm || 168);
    setVal('prof-activity', p.activity_level || 'moderate');
    setVal('prof-goal', p.goal || 'maintain');
    setVal('prof-diet', p.diet_type || 'balanced');
  },

  setupForm() {
    const form = document.getElementById('profile-form');
    if (!form) return;

    // Live recalculation on any input change
    form.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('input', () => this.calculateAndDisplayStats());
      input.addEventListener('change', () => this.calculateAndDisplayStats());
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        name: document.getElementById('prof-name').value.trim(),
        gender: document.getElementById('prof-gender').value,
        age: parseInt(document.getElementById('prof-age').value) || 28,
        weight_kg: parseFloat(document.getElementById('prof-weight').value) || 65,
        height_cm: parseFloat(document.getElementById('prof-height').value) || 168,
        activity_level: document.getElementById('prof-activity').value,
        goal: document.getElementById('prof-goal').value,
        diet_type: document.getElementById('prof-diet').value
      };

      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.success) {
          window.NutriFind.showToast('Profile and Calorie targets updated! 🎯', 'success');
          window.NutriFind.state.profile = data.profile;
          window.NutriFind.updateProfileUI();
          window.NutriFind.fetchDailySummary();
        }
      } catch (err) {
        window.NutriFind.showToast('Error saving profile', 'error');
      }
    });
  },

  calculateAndDisplayStats() {
    const gender = document.getElementById('prof-gender').value;
    const age = parseInt(document.getElementById('prof-age').value) || 28;
    const weight = parseFloat(document.getElementById('prof-weight').value) || 65;
    const height = parseFloat(document.getElementById('prof-height').value) || 168;
    const activity = document.getElementById('prof-activity').value;
    const goal = document.getElementById('prof-goal').value;
    const diet = document.getElementById('prof-diet').value;

    // Mifflin-St Jeor Equation
    let bmr;
    if (gender === 'male') {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }

    const activityMults = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      very_active: 1.725,
      athlete: 1.9
    };
    const tdee = bmr * (activityMults[activity] || 1.55);

    let targetCals = tdee;
    if (goal === 'lose') targetCals -= 450;
    else if (goal === 'gain') targetCals += 400;

    targetCals = Math.max(1200, Math.round(targetCals));

    // Macro distribution
    let pPct = 0.25, cPct = 0.50, fPct = 0.25;
    if (diet === 'high_protein') { pPct = 0.35; cPct = 0.40; fPct = 0.25; }
    else if (diet === 'low_carb') { pPct = 0.35; cPct = 0.20; fPct = 0.45; }
    else if (diet === 'keto') { pPct = 0.25; cPct = 0.05; fPct = 0.70; }

    const targetP = Math.round((targetCals * pPct) / 4);
    const targetC = Math.round((targetCals * cPct) / 4);
    const targetF = Math.round((targetCals * fPct) / 9);

    // Update display banner
    const elBmr = document.getElementById('calc-stat-bmr');
    const elTdee = document.getElementById('calc-stat-tdee');
    const elTarget = document.getElementById('calc-stat-target');
    const elMacros = document.getElementById('calc-stat-macros');

    if (elBmr) elBmr.textContent = `${Math.round(bmr)} kcal`;
    if (elTdee) elTdee.textContent = `${Math.round(tdee)} kcal`;
    if (elTarget) elTarget.textContent = `${targetCals} kcal`;
    if (elMacros) elMacros.textContent = `P: ${targetP}g • C: ${targetC}g • F: ${targetF}g`;
  }
};
